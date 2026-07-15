import React, { useEffect, useReducer, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Archive, BookOpen, Briefcase, CheckCircle2, ChevronDown, ClipboardList, Eye, FileSearch, Flag, FolderOpen, Grip, Home, MessageSquare, Minus, PanelRightOpen, Plus, RotateCcw, Save, Send, ShieldAlert, X } from 'lucide-react';
import { loadLocalRun, startContractRun, submitContractCaseRun } from '../api/contractMutations';
import { contractCases } from '../data/contractCases';
import { contractCaseSolutions } from '../data/contractCaseSolutions';
import { handbookSections } from '../data/handbook';
import { createInitialRunState, reduceCaseState } from '../engine/caseReducer';
import { isRulingAllowed, normalizeEvidenceSelection } from '../engine/clientValidation';
import { formatShiftUnits } from '../engine/shiftLogic';
import { useCaseAutosave } from '../hooks/useCaseAutosave';
import { useAuth } from '../../../context/useAuth';
import { CaseRunState, ContractCase, ContractCaseResult, ContractDocument, ContractRuling, DocumentField } from '../types/contracts';
import './contracts.css';

const rulingLabels: Record<ContractRuling, string> = {
  approve: 'Approved',
  deny: 'Denied',
};

const demoResults: Record<string, ContractCaseResult> = {
  'surveyors-satchel': {
    ruling: 'deny',
    correctRuling: true,
    score: 100,
    categories: { rulingAccuracy: 40, criticalEvidence: 15, supportingEvidence: 20, incorrectFlags: 0, optionalDiscoveries: 5, efficiency: 10 },
    foundEvidence: ['Floor Four conflicts with the Floor Five assignment.', 'The request improperly claims personal contents.'],
    missedEvidence: [],
    incorrectEvidence: [],
    resultTitle: 'Correct ruling, complete investigation',
    resultSummary: 'You correctly denied the request. Denying a contract means UnderHaul cannot proceed under the current paperwork. The client may submit a corrected request.',
    consequences: ['The request is returned for corrected floor information and revised property terms.'],
    unlockedClues: [],
  },
  'tallow-steps': {
    ruling: 'approve',
    correctRuling: true,
    score: 100,
    categories: { rulingAccuracy: 40, criticalEvidence: 20, supportingEvidence: 15, incorrectFlags: 0, optionalDiscoveries: 5, efficiency: 10 },
    foundEvidence: ['Emergency authority covers containment and rescue.', 'The request does not claim relic rights.', 'The skitterers are fleeing something deeper.'],
    missedEvidence: [],
    incorrectEvidence: [],
    resultTitle: 'Correct ruling, complete investigation',
    resultSummary: 'You correctly approved the limited emergency containment request while recording the deeper-floor threat.',
    consequences: ['Containment and rescue proceed immediately. Relic recovery remains outside the job.'],
    unlockedClues: ['Deeper-floor pressure noted for a specialist queue.'],
  },
  'quiet-reliquary': {
    ruling: 'deny',
    correctRuling: true,
    score: 100,
    categories: { rulingAccuracy: 40, criticalEvidence: 20, supportingEvidence: 15, incorrectFlags: 0, optionalDiscoveries: 5, efficiency: 10 },
    foundEvidence: ['The collector lacks exclusive rights.', 'The inscription changed from closed to open.', 'The newer copy is certified.'],
    missedEvidence: [],
    incorrectEvidence: [],
    resultTitle: 'Correct ruling, complete investigation',
    resultSummary: 'You correctly denied the reliquary request and escalated the inscription issue as an investigation consequence.',
    consequences: ['Immediate retrieval is denied and an Arcane Surveyor receives the inscription packet.'],
    unlockedClues: ['Vale & Rusk broker records mention Yorren Vale.'],
  },
};

const ContractsOfficePage: React.FC = () => {
  const { slug } = useParams();

  if (slug) {
    const contractCase = contractCases.find(item => item.slug === slug);
    return contractCase ? <ActiveCasePage contractCase={contractCase} /> : <MissingCase />;
  }

  return <ContractsLanding />;
};

const ContractsLanding: React.FC = () => {
  const completedRuns = getCompletedLocalRuns();

  return (
    <div className="contracts-shell">
      <section className="contracts-landing" aria-labelledby="contracts-title">
        <div>
          <p className="contracts-kicker">UnderHaul desk assignment</p>
          <h1 id="contracts-title">Contracts Office</h1>
          <p>
            Inspect dungeon-service case folders, compare records, question visitors, flag evidence, and issue a final office ruling.
          </p>
          <div className="contracts-actions">
            <a href="#case-inbox" className="contracts-primary-button"><Briefcase aria-hidden /> Open inbox</a>
            <a href="#case-archive" className="contracts-secondary-button"><Archive aria-hidden /> Completed archive</a>
          </div>
        </div>
        <div className="underhaul-mark" aria-hidden>
          <div className="underhaul-arch" />
          <strong>UNDERHAUL</strong>
          <span>Dungeon Services</span>
        </div>
      </section>

      <section id="case-inbox" className="contracts-section" aria-labelledby="inbox-title">
        <div className="contracts-section-heading">
          <div>
            <p className="contracts-kicker">Case selection</p>
            <h2 id="inbox-title">Inbox</h2>
          </div>
          <Link to="/games" className="contracts-link"><Home aria-hidden /> Back to games</Link>
        </div>
        <div className="case-grid">
          {contractCases.map(contractCase => (
            <article key={contractCase.slug} className="case-card">
              <div className="case-card-top">
                <span>{contractCase.jobType}</span>
                <strong>{contractCase.urgency}</strong>
              </div>
              <h3>{contractCase.title}</h3>
              <p>{contractCase.briefing}</p>
              <dl>
                <div><dt>Client</dt><dd>{contractCase.clientName}</dd></div>
                <div><dt>Difficulty</dt><dd>{contractCase.difficulty}/5</dd></div>
                <div><dt>Estimate</dt><dd>{contractCase.estimatedMinutes} min</dd></div>
              </dl>
              <Link to={`/underhaul/contracts/${contractCase.slug}`} className="contracts-primary-button">Start case</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="contracts-section" aria-labelledby="launcher-title">
        <div className="contracts-section-heading">
          <div>
            <p className="contracts-kicker">Developer only</p>
            <h2 id="launcher-title">Case launcher</h2>
          </div>
        </div>
        <div className="dev-launcher">
          {contractCases.map(contractCase => (
            <Link key={contractCase.slug} to={`/underhaul/contracts/${contractCase.slug}?dev=1`}>
              Launch {contractCase.title}
            </Link>
          ))}
        </div>
      </section>

      <section id="case-archive" className="contracts-section" aria-labelledby="archive-title">
        <div className="contracts-section-heading">
          <div>
            <p className="contracts-kicker">Completed-case archive</p>
            <h2 id="archive-title">Reports</h2>
          </div>
        </div>
        {completedRuns.length === 0 ? (
          <p className="empty-note">No completed local reports yet.</p>
        ) : (
          <div className="archive-list">
            {completedRuns.map(run => (
              <div key={run.runId} className="archive-row">
                <strong>{contractCases.find(item => item.slug === run.caseSlug)?.title || run.caseSlug}</strong>
                <span>{run.resultSummary?.score ?? run.resultSummary?.legacySummary?.totalScore ?? 0} points</span>
                <Link to={`/underhaul/contracts/${run.caseSlug}`}>Review</Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const ActiveCasePage: React.FC<{ contractCase: ContractCase }> = ({ contractCase }) => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(
    (current: CaseRunState, action: Parameters<typeof reduceCaseState>[2]) => reduceCaseState(contractCase, current, action),
    undefined,
    () => loadLocalRun(contractCase.slug) || createInitialRunState(contractCase)
  );
  const [notice, setNotice] = useState('');
  const [viewerDocumentId, setViewerDocumentId] = useState<string | undefined>(state.activeDocumentId);
  const [handbookOpen, setHandbookOpen] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [confirmationRuling, setConfirmationRuling] = useState<ContractRuling | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const autosaveStatus = useCaseAutosave(state, user?.id);

  useEffect(() => {
    const liveVisitor = contractCase.visitors.find(visitor => state.visitorState[visitor.id]?.visible);
    if (liveVisitor) setNotice(`${liveVisitor.name} has arrived at the contracts counter.`);
  }, [contractCase.visitors, state.visitorState]);

  const visibleDocuments = contractCase.documents.filter(document => state.discoveredDocumentIds.includes(document.id));
  const activeDocument = contractCase.documents.find(document => document.id === viewerDocumentId);
  const comparedDocuments = state.comparisonDocumentIds
    .map(id => contractCase.documents.find(document => document.id === id))
    .filter((document): document is ContractDocument => Boolean(document));

  const submitDecision = async (ruling: ContractRuling) => {
    if (!isRulingAllowed(ruling)) return;
    setSubmitting(true);
    try {
      let runId = state.runId;
      if (isAuthenticated && state.runId.startsWith('local-')) {
        runId = await startContractRun(contractCase.id, contractCase.version, state, user?.id);
      }
      const cleanFlags = normalizeEvidenceSelection(contractCase, state.selectedFlagIds);
      const result = isAuthenticated && !runId.startsWith('local-')
        ? await submitContractCaseRun(runId, ruling, cleanFlags)
        : buildDemoResult(contractCase.slug, ruling, cleanFlags, state.shiftUnits);
      dispatch({ type: 'markSubmitted', resultSummary: result });
      window.localStorage.setItem(`underhaul-contract-run:${contractCase.slug}`, JSON.stringify({ ...state, ruling, status: 'submitted', resultSummary: result }));
      setNotice(`Contract ${ruling === 'approve' ? 'approved' : 'denied'}. Result loaded. ${result.correctRuling ? 'Correct ruling.' : 'Incorrect ruling.'}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Submission failed. Check Supabase migrations and authentication.');
    } finally {
      setSubmitting(false);
      setConfirmationRuling(null);
    }
  };

  if (state.status === 'submitted' && state.resultSummary) {
    return <CaseResult contractCase={contractCase} result={state.resultSummary} onBack={() => navigate('/underhaul/contracts')} />;
  }

  return (
    <div className="contracts-desk-page">
      <div className="desk-topbar">
        <div>
          <p className="contracts-kicker">{contractCase.clientName}</p>
          <h1>{contractCase.title}</h1>
        </div>
        <div className="desk-meta">
          <span>{contractCase.jobType}</span>
          <span>{contractCase.urgency}</span>
          <span>{formatShiftUnits(state.shiftUnits)}</span>
          <span className={`save-state save-state-${autosaveStatus}`}><Save aria-hidden /> {autosaveStatus}</span>
        </div>
      </div>

      {notice && <div className="sr-status" role="status">{notice}</div>}

      <section className="briefing-strip" aria-labelledby="briefing-title">
        <h2 id="briefing-title">Assignment briefing</h2>
        <p>{contractCase.briefing}</p>
      </section>

      <section className="objective-panel" aria-labelledby="objective-title">
        <p className="contracts-kicker">Current task</p>
        <h2 id="objective-title">Review the submission and determine whether UnderHaul may legally and safely accept it as written.</h2>
        <div className="objective-progress" aria-label="Case progress">
          <span>Documents reviewed: {state.discoveredDocumentIds.length} / {contractCase.documents.length}</span>
          <span>Evidence flagged: {state.selectedFlagIds.length}</span>
          <span>Additional records obtained: {countAdditionalRecords(contractCase, state)}</span>
          <span>Final ruling: {state.ruling ? rulingLabels[state.ruling] : 'Pending'}</span>
        </div>
      </section>

      <div className="desk-layout">
        <aside className="case-folder" aria-label="Case folder">
          <div className="panel-title"><FolderOpen aria-hidden /> Folder</div>
          {visibleDocuments.map(document => (
            <button
              key={document.id}
              type="button"
              className="folder-document"
              onClick={() => {
                dispatch({ type: 'openDocument', documentId: document.id });
                setViewerDocumentId(document.id);
              }}
            >
              <FileSearch aria-hidden />
              <span>{document.title}</span>
            </button>
          ))}
        </aside>

        <main className="wood-desk" aria-label="Active wooden desk">
          {visibleDocuments.map(document => (
            <DocumentCard
              key={document.id}
              document={document}
              state={state}
              onOpen={() => {
                dispatch({ type: 'openDocument', documentId: document.id });
                setViewerDocumentId(document.id);
              }}
              onCompare={() => dispatch({ type: 'compareDocument', documentId: document.id })}
              onReturn={() => dispatch({ type: 'returnToFolder', documentId: document.id })}
              onNudge={(dx, dy) => dispatch({ type: 'nudgeDocument', documentId: document.id, dx, dy })}
            />
          ))}
        </main>

        <aside className="desk-sidebar">
          <button type="button" className="sidebar-toggle" onClick={() => setHandbookOpen(value => !value)}>
            <BookOpen aria-hidden /> Handbook <ChevronDown aria-hidden />
          </button>
          {handbookOpen && <HandbookPanel sectionIds={contractCase.handbookSections} />}

          <EvidencePanel contractCase={contractCase} state={state} dispatch={dispatch} />
          <NotesPanel state={state} dispatch={dispatch} />
          <VisitorPanel contractCase={contractCase} state={state} dispatch={dispatch} />

          <button
            type="button"
            className="decision-button"
            onClick={() => {
              setDecisionOpen(true);
            }}
          >
            <PanelRightOpen aria-hidden /> Open ruling drawer
          </button>
        </aside>
      </div>

      {activeDocument && (
        <DocumentViewer
          document={activeDocument}
          state={state}
          dispatch={dispatch}
          onClose={() => setViewerDocumentId(undefined)}
        />
      )}

      {comparedDocuments.length === 2 && (
        <DocumentComparison documents={comparedDocuments} state={state} dispatch={dispatch} onClose={() => comparedDocuments.forEach(document => dispatch({ type: 'compareDocument', documentId: document.id }))} />
      )}

      {decisionOpen && (
        <DecisionPanel
          contractCase={contractCase}
          state={state}
          dispatch={dispatch}
          onClose={() => setDecisionOpen(false)}
          onConfirm={setConfirmationRuling}
          submitting={submitting}
        />
      )}

      {confirmationRuling && (
        <RulingConfirmation
          ruling={confirmationRuling}
          evidenceCount={state.selectedFlagIds.length}
          submitting={submitting}
          onCancel={() => setConfirmationRuling(null)}
          onSubmit={() => submitDecision(confirmationRuling)}
        />
      )}
    </div>
  );
};

const DocumentCard: React.FC<{
  document: ContractDocument;
  state: CaseRunState;
  onOpen: () => void;
  onCompare: () => void;
  onReturn: () => void;
  onNudge: (dx: number, dy: number) => void;
}> = ({ document, state, onOpen, onCompare, onReturn, onNudge }) => {
  const desk = state.desk[document.id];
  if (desk?.inFolder) return null;

  return (
    <article
      className={`desk-document ${state.comparisonDocumentIds.includes(document.id) ? 'is-compared' : ''}`}
      style={{ left: `${desk.x}%`, top: `${desk.y}%`, zIndex: desk.z }}
      tabIndex={0}
      onKeyDown={event => {
        if (event.key === 'Enter') onOpen();
        if (event.key === 'ArrowUp') onNudge(0, -3);
        if (event.key === 'ArrowDown') onNudge(0, 3);
        if (event.key === 'ArrowLeft') onNudge(-3, 0);
        if (event.key === 'ArrowRight') onNudge(3, 0);
      }}
    >
      <div className="document-grip"><Grip aria-hidden /><span>Use arrow keys to move</span></div>
      <h3>{document.title}</h3>
      <p>{document.documentType}</p>
      <div className="document-actions">
        <button type="button" onClick={onOpen}><Eye aria-hidden /> Open</button>
        <button type="button" onClick={onCompare}><ClipboardList aria-hidden /> Compare</button>
        <button type="button" onClick={onReturn}><RotateCcw aria-hidden /> Folder</button>
      </div>
    </article>
  );
};

const DocumentViewer: React.FC<{
  document: ContractDocument;
  state: CaseRunState;
  dispatch: React.Dispatch<Parameters<typeof reduceCaseState>[2]>;
  onClose: () => void;
}> = ({ document, state, dispatch, onClose }) => {
  const zoom = state.desk[document.id]?.zoom || 1;
  useEscape(onClose);

  return (
    <div className="document-modal" role="dialog" aria-modal="true" aria-labelledby="document-viewer-title">
      <div className="document-sheet" style={{ fontSize: `${zoom}rem` }}>
        <div className="modal-heading">
          <div>
            <p>{document.issuer} | {document.issuedDate}</p>
            <h2 id="document-viewer-title">{document.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close document"><X aria-hidden /></button>
        </div>
        <DocumentBody document={document} state={state} dispatch={dispatch} />
        <div className="viewer-tools">
          <button type="button" onClick={() => dispatch({ type: 'zoomDocument', documentId: document.id, zoom: Math.max(0.85, zoom - 0.1) })}><Minus aria-hidden /> Zoom</button>
          <button type="button" onClick={() => dispatch({ type: 'zoomDocument', documentId: document.id, zoom: Math.min(1.35, zoom + 0.1) })}><Plus aria-hidden /> Zoom</button>
          <button type="button" onClick={() => dispatch({ type: 'compareDocument', documentId: document.id })}><ClipboardList aria-hidden /> Compare</button>
        </div>
      </div>
    </div>
  );
};

const DocumentBody: React.FC<{
  document: ContractDocument;
  state: CaseRunState;
  dispatch: React.Dispatch<Parameters<typeof reduceCaseState>[2]>;
}> = ({ document, state, dispatch }) => {
  const fieldMap = new Map(document.fields.map(field => [field.id, field]));

  return (
    <div className="document-body">
      {document.bodyBlocks.map((block, index) => {
        if (block.kind === 'heading') return <h3 key={index}>{block.text}</h3>;
        if (block.kind === 'paragraph') return <p key={index}>{block.text}</p>;
        if (block.kind === 'rule') return <p key={index} className="rule-block">{block.text}</p>;
        return (
          <dl key={index} className="field-list">
            {block.fieldIds.map(fieldId => {
              const field = fieldMap.get(fieldId);
              if (!field) return null;
              return <DocumentFieldButton key={field.id} field={field} flagged={state.selectedFlagIds.includes(field.id)} onToggle={() => dispatch({ type: 'flagField', fieldId: field.id })} />;
            })}
          </dl>
        );
      })}
      <footer>
        <span>Signatures: {document.signatures.join(', ') || 'None'}</span>
        <span>Seals: {document.seals.join(', ') || 'None'}</span>
      </footer>
    </div>
  );
};

const DocumentFieldButton: React.FC<{ field: DocumentField; flagged: boolean; onToggle: () => void }> = ({ field, flagged, onToggle }) => (
  <div className={`document-field ${field.visuallyEmphasized ? 'field-emphasis' : ''}`}>
    <dt>{field.label}</dt>
    <dd>
      <button type="button" disabled={!field.selectable} onClick={onToggle} aria-pressed={flagged}>
        <Flag aria-hidden />
        <span>{field.displayedValue}</span>
        {flagged && <strong>Flagged</strong>}
      </button>
    </dd>
  </div>
);

const DocumentComparison: React.FC<{
  documents: ContractDocument[];
  state: CaseRunState;
  dispatch: React.Dispatch<Parameters<typeof reduceCaseState>[2]>;
  onClose: () => void;
}> = ({ documents, state, dispatch, onClose }) => {
  useEscape(onClose);
  return (
    <div className="comparison-drawer" role="dialog" aria-modal="true" aria-labelledby="comparison-title">
      <div className="modal-heading">
        <h2 id="comparison-title">Document comparison</h2>
        <button type="button" onClick={onClose} aria-label="Close comparison"><X aria-hidden /></button>
      </div>
      <div className="comparison-grid">
        {documents.map(document => (
          <section key={document.id} className="comparison-sheet">
            <h3>{document.title}</h3>
            <DocumentBody document={document} state={state} dispatch={dispatch} />
          </section>
        ))}
      </div>
    </div>
  );
};

const HandbookPanel: React.FC<{ sectionIds: string[] }> = ({ sectionIds }) => {
  const [query, setQuery] = useState('');
  const sections = handbookSections
    .filter(section => sectionIds.includes(section.id))
    .filter(section => `${section.title} ${section.body}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <section className="side-panel">
      <label className="search-label">
        <span>Search handbook</span>
        <input value={query} onChange={event => setQuery(event.target.value)} />
      </label>
      {sections.map(section => (
        <article key={section.id} className="handbook-entry">
          <h3>{section.title}</h3>
          <p>{section.body}</p>
        </article>
      ))}
    </section>
  );
};

const EvidencePanel: React.FC<{ contractCase: ContractCase; state: CaseRunState; dispatch: React.Dispatch<Parameters<typeof reduceCaseState>[2]> }> = ({ contractCase, state, dispatch }) => {
  const fields = contractCase.documents.flatMap(document => document.fields.map(field => ({ ...field, documentTitle: document.title })));
  const flagged = fields.filter(field => state.selectedFlagIds.includes(field.id));

  return (
    <section className="side-panel">
      <div className="panel-title"><Flag aria-hidden /> Evidence flags</div>
      {flagged.length === 0 ? <p className="muted">No fields flagged yet.</p> : flagged.map(field => (
        <button key={field.id} type="button" className="flag-chip" onClick={() => dispatch({ type: 'flagField', fieldId: field.id })}>
          <span>{field.label}</span>
          <small>{field.documentTitle}</small>
        </button>
      ))}
    </section>
  );
};

const NotesPanel: React.FC<{ state: CaseRunState; dispatch: React.Dispatch<Parameters<typeof reduceCaseState>[2]> }> = ({ state, dispatch }) => (
  <section className="side-panel">
    <div className="panel-title"><MessageSquare aria-hidden /> Notes</div>
    <textarea
      aria-label="Case notes"
      value={state.notes.general || ''}
      onChange={event => dispatch({ type: 'setNote', key: 'general', value: event.target.value })}
      placeholder="Short officer notes"
    />
  </section>
);

const VisitorPanel: React.FC<{ contractCase: ContractCase; state: CaseRunState; dispatch: React.Dispatch<Parameters<typeof reduceCaseState>[2]> }> = ({ contractCase, state, dispatch }) => {
  const visitors = contractCase.visitors.filter(visitor => state.visitorState[visitor.id]?.visible);
  return (
    <section className="visitor-panel" aria-label="Visitors and messages">
      <div className="panel-title"><MessageSquare aria-hidden /> Counter</div>
      {visitors.length === 0 ? <p className="muted">No visitor is waiting.</p> : visitors.map(visitor => {
        const asked = state.visitorState[visitor.id]?.askedQuestionIds || [];
        return (
          <article key={visitor.id}>
            <h3>{visitor.name}</h3>
            <p><strong>{visitor.role}</strong></p>
            <p>{visitor.openingDialogue}</p>
            {visitor.questionOptions.map(question => (
              <button
                key={question.id}
                type="button"
                disabled={asked.includes(question.id)}
                onClick={() => dispatch({ type: 'askVisitorQuestion', visitorId: visitor.id, questionId: question.id, grantsDocumentIds: question.grantsDocumentIds })}
              >
                {asked.includes(question.id) ? question.response : question.label}
              </button>
            ))}
          </article>
        );
      })}
    </section>
  );
};

const DecisionPanel: React.FC<{
  contractCase: ContractCase;
  state: CaseRunState;
  dispatch: React.Dispatch<Parameters<typeof reduceCaseState>[2]>;
  onClose: () => void;
  onConfirm: (ruling: ContractRuling) => void;
  submitting: boolean;
}> = ({ state, dispatch, onClose, onConfirm, submitting }) => {
  useEscape(onClose);
  return (
    <div className="decision-drawer" role="dialog" aria-modal="true" aria-labelledby="decision-title">
      <div className="modal-heading">
        <h2 id="decision-title">Final ruling drawer</h2>
        <button type="button" onClick={onClose} aria-label="Close ruling drawer"><X aria-hidden /></button>
      </div>
      <p className="ruling-question">Can UnderHaul safely and legally perform this job under the documents currently submitted?</p>
      <div className="stamp-grid ruling-grid">
        <button
          type="button"
          className={`stamp-button stamp-approved ${state.ruling === 'approve' ? 'is-selected' : ''}`}
          onClick={() => dispatch({ type: 'selectRuling', ruling: 'approve' })}
          aria-pressed={state.ruling === 'approve'}
        >
          <CheckCircle2 aria-hidden />
          <span>APPROVE CONTRACT</span>
          <small>UnderHaul may proceed exactly as submitted.</small>
        </button>
        <button
          type="button"
          className={`stamp-button stamp-denied ${state.ruling === 'deny' ? 'is-selected' : ''}`}
          onClick={() => dispatch({ type: 'selectRuling', ruling: 'deny' })}
          aria-pressed={state.ruling === 'deny'}
        >
          <X aria-hidden />
          <span>DENY CONTRACT</span>
          <small>The submitted documents cannot currently authorize this job.</small>
        </button>
      </div>
      <button type="button" className="contracts-primary-button" disabled={!isRulingAllowed(state.ruling) || submitting} onClick={() => state.ruling && onConfirm(state.ruling)}>
        <Send aria-hidden /> {submitting ? 'Submitting' : 'Review submission'}
      </button>
    </div>
  );
};

const RulingConfirmation: React.FC<{
  ruling: ContractRuling;
  evidenceCount: number;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}> = ({ ruling, evidenceCount, submitting, onCancel, onSubmit }) => {
  useEscape(onCancel);
  const rulingText = ruling === 'approve' ? 'APPROVE' : 'DENY';

  return (
    <div className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="confirmation-title">
      <div className="confirmation-card">
        <h2 id="confirmation-title">You are about to {rulingText} this contract.</h2>
        <p>You flagged {evidenceCount} {evidenceCount === 1 ? 'piece' : 'pieces'} of evidence. Submit {rulingText}?</p>
        <div className="confirmation-actions">
          <button type="button" className="contracts-secondary-button" onClick={onCancel}>Cancel</button>
          <button type="button" className="contracts-primary-button" onClick={onSubmit} disabled={submitting}>
            <Send aria-hidden /> {submitting ? 'Submitting' : `Submit ${rulingText}`}
          </button>
        </div>
      </div>
    </div>
  );
};

const CaseResult: React.FC<{ contractCase: ContractCase; result: ContractCaseResult; onBack: () => void }> = ({ contractCase, result, onBack }) => (
  <div className="contracts-shell">
    <section className="result-panel">
      <p className="contracts-kicker">Submitted report</p>
      <h1>{contractCase.title}</h1>
      <div className="score-medallion"><CheckCircle2 aria-hidden /> {result.score ?? result.legacySummary?.totalScore ?? 0}</div>
      <p>Ruling: <strong>{rulingLabels[result.ruling] || result.legacyDecision || 'Filed'}</strong> - {result.correctRuling ? 'Correct' : 'Incorrect'}</p>
      <p>{result.resultSummary || result.legacySummary?.professionalNote}</p>
      <div className="result-grid">
        <ResultList title="Critical issues found" items={result.foundEvidence || result.legacySummary?.caughtFacts || []} />
        <ResultList title="Relevant clues missed" items={result.missedEvidence || result.legacySummary?.missedFacts || []} />
        <ResultList title="Incorrectly flagged details" items={result.incorrectEvidence || []} />
        <ResultList title="Consequences" items={result.consequences} />
        <ResultList title="Campaign clues" items={result.unlockedClues || result.legacySummary?.clues || []} />
      </div>
      <div className="score-table">
        {Object.entries(result.categories || {}).map(([key, value]) => (
          <div key={key}><span>{key.replace(/([A-Z])/g, ' $1')}</span><strong>{value}</strong></div>
        ))}
      </div>
      <button type="button" className="contracts-primary-button" onClick={onBack}>Return to office</button>
    </section>
  </div>
);

const ResultList: React.FC<{ title: string; items: string[] }> = ({ title, items }) => (
  <section>
    <h2>{title}</h2>
    {items.length === 0 ? <p className="muted">None recorded.</p> : <ul>{items.map(item => <li key={item}>{item}</li>)}</ul>}
  </section>
);

const MissingCase: React.FC = () => (
  <div className="contracts-shell">
    <section className="contracts-section">
      <ShieldAlert aria-hidden />
      <h1>Case not found</h1>
      <Link to="/underhaul/contracts" className="contracts-primary-button">Return to Contracts Office</Link>
    </section>
  </div>
);

function buildDemoResult(slug: string, ruling: ContractRuling, flags: string[], shiftUnits: number): ContractCaseResult {
  const base = demoResults[slug] || demoResults['surveyors-satchel'];
  const solution = contractCaseSolutions.find(item => item.caseSlug === slug);
  if (!solution) return { ...base, ruling };

  const flagged = new Set(flags);
  const requiredFound = solution.requiredEvidenceIds.filter(id => flagged.has(id));
  const criticalFound = solution.criticalEvidenceIds.filter(id => flagged.has(id));
  const supportingFound = solution.supportingEvidenceIds.filter(id => flagged.has(id));
  const incorrectFound = [...solution.irrelevantEvidenceIds, ...solution.misleadingEvidenceIds].filter(id => flagged.has(id));
  const optionalFound = solution.optionalDiscoveryIds.filter(id => flagged.has(id));
  const missed = [...solution.requiredEvidenceIds, ...solution.criticalEvidenceIds].filter(id => !flagged.has(id));
  const correctRuling = ruling === solution.correctRuling;
  const categories = {
    rulingAccuracy: correctRuling ? 40 : 0,
    criticalEvidence: Math.min(20, criticalFound.length * 10),
    supportingEvidence: Math.min(15, requiredFound.length * 5 + supportingFound.length * 2),
    incorrectFlags: Math.max(-8, incorrectFound.length * -2),
    optionalDiscoveries: Math.min(5, optionalFound.length * 5),
    efficiency: shiftUnits <= 3 ? 10 : 6,
  };
  const score = Math.max(0, Math.min(100, Object.values(categories).reduce((sum, value) => sum + value, 0)));
  const resultTitle = correctRuling
    ? missed.length === 0 ? 'Correct ruling, complete investigation' : 'Correct ruling, partial investigation'
    : flags.length > 0 ? 'Incorrect ruling, important evidence found' : 'Incorrect ruling, major dangers missed';

  return {
    ruling,
    correctRuling,
    score,
    categories,
    foundEvidence: [...requiredFound, ...criticalFound, ...supportingFound],
    missedEvidence: missed,
    incorrectEvidence: incorrectFound,
    resultTitle,
    resultSummary: correctRuling
      ? (missed.length === 0 ? solution.resultText.correctComplete : solution.resultText.correctPartial)
      : solution.resultText.incorrect,
    consequences: [solution.resultText[ruling]],
    unlockedClues: optionalFound.length > 0 ? base.unlockedClues : [],
  };
}

function getCompletedLocalRuns(): CaseRunState[] {
  return Object.keys(window.localStorage)
    .filter(key => key.startsWith('underhaul-contract-run:'))
    .map(key => loadLocalRun(key.replace('underhaul-contract-run:', '')))
    .filter((run): run is CaseRunState => Boolean(run?.status === 'submitted'));
}

function countAdditionalRecords(contractCase: ContractCase, state: CaseRunState): number {
  return contractCase.documents.filter(document =>
    document.initiallyLocked && state.discoveredDocumentIds.includes(document.id)
  ).length;
}

function useEscape(onEscape: () => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onEscape]);
}

export default ContractsOfficePage;
