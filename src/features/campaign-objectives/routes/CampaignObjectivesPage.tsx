import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  BookOpen,
  Edit3,
  GitBranch,
  Loader2,
  MessageSquare,
  Milestone,
  Plus,
  ScrollText,
  Search,
  UserMinus,
  UserPlus,
  Users
} from 'lucide-react';
import { useAuth } from '../../../context/useAuth';
import CampaignService from '../api/campaignService';
import {
  type Campaign,
  type CampaignDetails,
  type CampaignStatus,
  type JournalEntry,
  type Objective,
  type ObjectiveKind,
  type ObjectiveStatus,
  type Party,
  type PartyMember,
  type RunSummary
} from '../data/campaignObjectives';
import './campaignObjectives.css';

const statusOptions: ObjectiveStatus[] = ['unknown', 'unstarted', 'partial', 'complete'];
const statusLabels: Record<ObjectiveStatus, string> = {
  unknown: 'Unknown',
  unstarted: 'Unstarted',
  partial: 'Partially Complete',
  complete: 'Complete'
};
const kindOptions: ObjectiveKind[] = ['main', 'sub', 'special'];

export default function CampaignObjectivesPage() {
  const { campaignSlug, journalId, partyId } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const isAdmin = Boolean(user?.isAdmin || user?.profile?.isAdmin);
  const service = useMemo(() => CampaignService.getInstance(), []);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [details, setDetails] = useState<CampaignDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const response = await service.getCampaigns();
    if (response.success && response.data) {
      setCampaigns(response.data);
    } else {
      setError(response.error || 'Failed to load campaigns.');
    }
    setIsLoading(false);
  }, [service]);

  const loadDetails = useCallback(async (slug: string) => {
    setIsLoading(true);
    setError(null);
    const response = await service.getCampaignBySlug(slug);
    if (response.success && response.data) {
      setDetails(response.data);
    } else {
      setError(response.error || 'Failed to load campaign.');
      setDetails(null);
    }
    setIsLoading(false);
  }, [service]);

  useEffect(() => {
    if (campaignSlug) void loadDetails(campaignSlug);
    else void loadCampaigns();
  }, [campaignSlug, loadCampaigns, loadDetails]);

  async function refreshDetails() {
    if (campaignSlug) await loadDetails(campaignSlug);
  }

  async function createCampaign(input: { name: string; summary: string; status: CampaignStatus }) {
    const response = await service.createCampaign({ ...input, createdBy: user?.id });
    if (response.success && response.data) {
      navigate(`/campaign-objectives/${response.data.slug}`);
    } else {
      setError(response.error || 'Failed to create campaign.');
    }
  }

  if (isLoading) return <LoadingShell />;
  if (error) return <MessageShell title="Campaign tracker" message={error} />;

  if (!campaignSlug) {
    return <CampaignIndex campaigns={campaigns} isAdmin={isAdmin} onCreateCampaign={createCampaign} />;
  }

  if (!details) return <MessageShell title="Campaign not found" message="No campaign exists for this route." />;

  if (journalId) {
    return <JournalPage details={details} journalId={journalId} />;
  }

  if (partyId) {
    return <PartyPage details={details} partyId={partyId} service={service} refresh={refreshDetails} isAdmin={isAdmin} />;
  }

  return (
    <CampaignDashboard
      details={details}
      service={service}
      refresh={refreshDetails}
      isAdmin={isAdmin}
      isAuthenticated={isAuthenticated}
      currentUserId={user?.id}
      currentUserName={user?.username}
    />
  );
}

function CampaignIndex({ campaigns, isAdmin, onCreateCampaign }: { campaigns: Campaign[]; isAdmin: boolean; onCreateCampaign: (input: { name: string; summary: string; status: CampaignStatus }) => void }) {
  const [draft, setDraft] = useState({ name: '', summary: '', status: 'active' as CampaignStatus });
  return (
    <div className="campaign-page">
      <section className="campaign-shell">
        <header className="campaign-header">
          <div>
            <p className="campaign-kicker">Campaign Tracker</p>
            <h1>Campaigns</h1>
          </div>
        </header>
        <div className="campaign-index-grid">
          {campaigns.map(campaign => (
            <Link key={campaign.id} to={`/campaign-objectives/${campaign.slug}`} className="party-card-link">
              <article className="party-card">
                <div>
                  <h3>{campaign.name}</h3>
                  {campaign.summary && <p>{campaign.summary}</p>}
                </div>
                <div className="party-card-stats"><span>{campaign.status}</span></div>
              </article>
            </Link>
          ))}
          {campaigns.length === 0 && <p className="empty-copy">No campaigns have been created yet.</p>}
        </div>
        {isAdmin && (
          <form className="detail-panel campaign-create-panel" onSubmit={event => {
            event.preventDefault();
            if (!draft.name.trim()) return;
            onCreateCampaign(draft);
            setDraft({ name: '', summary: '', status: 'active' });
          }}>
            <SectionTitle icon={<Plus />} title="Create Campaign" compact />
            <label className="field-label">Name<input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
            <label className="field-label">Summary<textarea value={draft.summary} onChange={event => setDraft({ ...draft, summary: event.target.value })} rows={3} /></label>
            <label className="field-label">Status<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as CampaignStatus })}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></label>
            <button type="submit"><Plus className="h-4 w-4" /> Create</button>
          </form>
        )}
      </section>
    </div>
  );
}

function CampaignDashboard({
  details,
  service,
  refresh,
  isAdmin,
  isAuthenticated,
  currentUserId,
  currentUserName
}: {
  details: CampaignDetails;
  service: CampaignService;
  refresh: () => Promise<void>;
  isAdmin: boolean;
  isAuthenticated: boolean;
  currentUserId?: string;
  currentUserName?: string;
}) {
  const { campaign, objectives, parties, runs, journals } = details;
  const [selectedObjectiveId, setSelectedObjectiveId] = useState(objectives.find(objective => objective.status !== 'unknown')?.id || objectives[0]?.id || '');
  const [commentName, setCommentName] = useState(currentUserName || '');
  const [commentText, setCommentText] = useState('');
  const [campaignDraft, setCampaignDraft] = useState({ name: campaign.name, summary: campaign.summary, status: campaign.status });
  const [objectiveDraft, setObjectiveDraft] = useState({ title: '', description: '', kind: 'main' as ObjectiveKind, status: 'unknown' as ObjectiveStatus, parentId: '' });
  const [partyDraft, setPartyDraft] = useState('');
  const [runDraft, setRunDraft] = useState({ partyId: parties[0]?.id || '', title: '', objectiveIds: [] as string[] });
  const [journalDraft, setJournalDraft] = useState({ runId: runs[0]?.id || '', playerName: '', title: '', text: '' });

  const objectivesById = useMemo(() => new Map(objectives.map(objective => [objective.id, objective])), [objectives]);
  const selectedObjective = objectivesById.get(selectedObjectiveId) || null;
  const mainObjectives = objectives.filter(objective => objective.kind === 'main');
  const specialObjectives = objectives.filter(objective => objective.kind === 'special');
  const selectedRun = runs.find(run => run.id === journalDraft.runId);
  const eligiblePlayers = parties.find(party => party.id === selectedRun?.partyId)?.members
    .filter(member => selectedRun?.memberIds.includes(member.id))
    .map(member => member.name) || [];
  const eligibleObjectives = selectedRun ? objectives.filter(objective => selectedRun.objectiveIds.includes(objective.id)) : [];
  const revealedObjectives = objectives.filter(objective => objective.status !== 'unknown');

  async function saveCampaign(event: FormEvent) {
    event.preventDefault();
    const response = await service.updateCampaign(campaign.id, campaignDraft);
    if (response.success) {
      await refresh();
    } else {
      alert(response.error || 'Failed to save campaign.');
    }
  }

  async function saveObjective(event: FormEvent) {
    event.preventDefault();
    if (!objectiveDraft.title.trim()) return;
    const response = await service.createObjective({ campaignId: campaign.id, ...objectiveDraft, parentId: objectiveDraft.parentId || undefined });
    if (response.success) {
      await refresh();
      setObjectiveDraft({ title: '', description: '', kind: 'main', status: 'unknown', parentId: '' });
    } else {
      alert(response.error || 'Failed to save objective.');
    }
  }

  async function updateObjectiveStatus(objectiveId: string, status: ObjectiveStatus) {
    const objective = objectivesById.get(objectiveId);
    if (!objective) return;
    const response = await service.updateObjective(objectiveId, { title: objective.title, description: objective.description, kind: objective.kind, status, parentId: objective.parentId });
    if (response.success) {
      await refresh();
    } else {
      alert(response.error || 'Failed to update objective.');
    }
  }

  async function addComment(event: FormEvent) {
    event.preventDefault();
    if (!selectedObjective || !commentName.trim() || !commentText.trim()) return;
    const response = await service.addObjectiveComment(selectedObjective.id, commentName, commentText, currentUserId);
    if (response.success) {
      setCommentText('');
      await refresh();
    } else {
      alert(response.error || 'Failed to add comment.');
    }
  }

  async function addParty(event: FormEvent) {
    event.preventDefault();
    if (!partyDraft.trim()) return;
    const response = await service.createParty({ campaignId: campaign.id, name: partyDraft });
    if (response.success) {
      await refresh();
      setPartyDraft('');
    } else {
      alert(response.error || 'Failed to add party.');
    }
  }

  async function createRun(event: FormEvent) {
    event.preventDefault();
    const party = parties.find(item => item.id === runDraft.partyId);
    if (!party || !runDraft.title.trim()) return;
    const response = await service.createRun({
      campaignId: campaign.id,
      partyId: party.id,
      title: runDraft.title,
      ranAt: new Date(),
      memberIds: party.members.map(member => member.id),
      objectiveIds: runDraft.objectiveIds
    }, objectives);
    if (response.success) {
      await refresh();
      setRunDraft({ partyId: party.id, title: '', objectiveIds: [] });
    } else {
      alert(response.error || 'Failed to create run.');
    }
  }

  async function createJournal(event: FormEvent) {
    event.preventDefault();
    if (!isAuthenticated || !currentUserId) {
      alert('Log in to publish a journal entry.');
      return;
    }
    const run = runs.find(item => item.id === journalDraft.runId);
    if (!run || !journalDraft.playerName || !journalDraft.title.trim() || !journalDraft.text.trim()) return;
    const response = await service.createJournal({
      campaignId: campaign.id,
      partyId: run.partyId,
      runId: run.id,
      authorId: currentUserId,
      playerName: journalDraft.playerName,
      title: journalDraft.title,
      text: journalDraft.text,
      achievementIds: run.achievements.map(achievement => achievement.id)
    });
    if (response.success) {
      await refresh();
      setJournalDraft({ runId: run.id, playerName: '', title: '', text: '' });
    } else {
      alert(response.error || 'Failed to create journal entry.');
    }
  }

  return (
    <div className="campaign-page">
      <section className="campaign-shell">
        <header className="campaign-header">
          <div>
            <Link to="/campaign-objectives" className="back-link">All campaigns</Link>
            <p className="campaign-kicker">Campaign Tracker</p>
            <h1>{campaign.name}</h1>
            {campaign.summary && <p className="campaign-summary">{campaign.summary}</p>}
          </div>
          <div className="campaign-header-stats">
            <Stat label="Objectives" value={objectives.length} />
            <Stat label="Parties" value={parties.length} />
            <Stat label="Runs" value={runs.length} />
          </div>
        </header>

        <div className="campaign-layout">
          <main className="objective-column">
            <SectionTitle icon={<Milestone />} title="Main Objectives" />
            <div className="main-objective-grid">
              {mainObjectives.map(objective => (
                <ObjectiveCard key={objective.id} objective={objective} childObjectives={(objective.subObjectiveIds || []).map(id => objectivesById.get(id)).filter(Boolean) as Objective[]} selected={selectedObjective?.id === objective.id} onSelect={setSelectedObjectiveId} />
              ))}
              {mainObjectives.length === 0 && <p className="empty-copy">No main objectives have been added.</p>}
            </div>

            <SectionTitle icon={<Search />} title="Special Objectives" />
            <div className="special-objective-list">
              {specialObjectives.map(objective => <ObjectiveRow key={objective.id} objective={objective} onSelect={setSelectedObjectiveId} />)}
              {specialObjectives.length === 0 && <p className="empty-copy">No special objectives have been added.</p>}
            </div>

            <SectionTitle icon={<Users />} title="Parties" />
            <PartyCards campaignSlug={campaign.slug} parties={parties} runs={runs} journals={journals} />
          </main>

          <aside className="campaign-side">
            {selectedObjective && (
              <ObjectiveDetails objective={selectedObjective} childObjectives={(selectedObjective.subObjectiveIds || []).map(id => objectivesById.get(id)).filter(Boolean) as Objective[]} onSelectObjective={setSelectedObjectiveId} onStatusChange={updateObjectiveStatus} commentName={commentName} commentText={commentText} onCommentNameChange={setCommentName} onCommentTextChange={setCommentText} onAddComment={addComment} canEdit={isAdmin} />
            )}
            {isAdmin && (
              <>
                {selectedObjective && <ObjectiveEditForm key={selectedObjective.id} objective={selectedObjective} objectives={objectives} service={service} refresh={refresh} />}
                <form className="detail-panel" onSubmit={saveCampaign}>
                  <SectionTitle icon={<Edit3 />} title="Edit Campaign" compact />
                  <label className="field-label">Name<input value={campaignDraft.name} onChange={event => setCampaignDraft({ ...campaignDraft, name: event.target.value })} /></label>
                  <label className="field-label">Summary<textarea value={campaignDraft.summary} onChange={event => setCampaignDraft({ ...campaignDraft, summary: event.target.value })} rows={3} /></label>
                  <label className="field-label">Status<select value={campaignDraft.status} onChange={event => setCampaignDraft({ ...campaignDraft, status: event.target.value as CampaignStatus })}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></label>
                  <button type="submit">Save Campaign</button>
                </form>
                <ObjectiveForm objectives={objectives} draft={objectiveDraft} onDraftChange={setObjectiveDraft} onSubmit={saveObjective} />
                <form className="detail-panel" onSubmit={addParty}>
                  <SectionTitle icon={<Users />} title="Add Party" compact />
                  <label className="field-label">Party name<input value={partyDraft} onChange={event => setPartyDraft(event.target.value)} /></label>
                  <button type="submit"><Plus className="h-4 w-4" /> Add Party</button>
                </form>
                <RunSummaryForm parties={parties} objectives={revealedObjectives} draft={runDraft} onDraftChange={setRunDraft} onSubmit={createRun} />
              </>
            )}
            <JournalForm campaignSlug={campaign.slug} journals={journals} runs={runs} parties={parties} eligiblePlayers={eligiblePlayers} eligibleObjectives={eligibleObjectives} draft={journalDraft} onDraftChange={setJournalDraft} onSubmit={createJournal} />
          </aside>
        </div>
      </section>
    </div>
  );
}

function ObjectiveCard({ objective, childObjectives, selected, onSelect }: { objective: Objective; childObjectives: Objective[]; selected: boolean; onSelect: (id: string) => void }) {
  const isUnknown = objective.status === 'unknown';
  return (
    <article className={`objective-card ${selected ? 'selected' : ''} ${isUnknown ? 'unknown' : ''}`}>
      <button type="button" onClick={() => !isUnknown && onSelect(objective.id)} disabled={isUnknown}>
        <span className={`status-chip ${objective.status}`}>{statusLabels[objective.status]}</span>
        <h2>{objective.title}</h2>
        <p>{objective.description}</p>
      </button>
      <div className="sub-objective-dots">
        {childObjectives.map(child => <button key={child.id} type="button" aria-label={child.title} title={child.title} className={`sub-dot ${child.status}`} disabled={child.status === 'unknown'} onClick={() => onSelect(child.id)} />)}
      </div>
    </article>
  );
}

function ObjectiveRow({ objective, onSelect }: { objective: Objective; onSelect: (id: string) => void }) {
  const isUnknown = objective.status === 'unknown';
  return <button type="button" className={`objective-row ${isUnknown ? 'unknown' : ''}`} onClick={() => !isUnknown && onSelect(objective.id)} disabled={isUnknown}><span className={`status-chip ${objective.status}`}>{statusLabels[objective.status]}</span><span>{objective.title}</span></button>;
}

function ObjectiveDetails({ objective, childObjectives, onSelectObjective, onStatusChange, commentName, commentText, onCommentNameChange, onCommentTextChange, onAddComment, canEdit }: { objective: Objective; childObjectives: Objective[]; onSelectObjective: (id: string) => void; onStatusChange: (id: string, status: ObjectiveStatus) => void; commentName: string; commentText: string; onCommentNameChange: (value: string) => void; onCommentTextChange: (value: string) => void; onAddComment: (event: FormEvent) => void; canEdit: boolean }) {
  return (
    <section className="detail-panel">
      <div className="detail-heading"><span className={`status-chip ${objective.status}`}>{statusLabels[objective.status]}</span><h2>{objective.title}</h2>{objective.description && <p>{objective.description}</p>}</div>
      {canEdit && <label className="field-label">Status<select value={objective.status} onChange={event => onStatusChange(objective.id, event.target.value as ObjectiveStatus)}>{statusOptions.map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>}
      {childObjectives.length > 0 && <div className="detail-sub-list">{childObjectives.map(child => <button key={child.id} type="button" onClick={() => child.status !== 'unknown' && onSelectObjective(child.id)} disabled={child.status === 'unknown'}><span className={`status-chip ${child.status}`}>{statusLabels[child.status]}</span><span>{child.title}</span></button>)}</div>}
      <form className="comment-form" onSubmit={onAddComment}>
        <SectionTitle icon={<MessageSquare />} title="Comments" compact />
        <input value={commentName} onChange={event => onCommentNameChange(event.target.value)} placeholder="Name" />
        <textarea value={commentText} onChange={event => onCommentTextChange(event.target.value)} rows={3} placeholder="Add a note or comment" />
        <button type="submit"><Plus className="h-4 w-4" /> Comment</button>
      </form>
      <div className="comment-list">{objective.comments.map(comment => <article key={comment.id}><strong>{comment.authorName}</strong><time>{formatDate(comment.createdAt)}</time><p>{comment.text}</p></article>)}{objective.comments.length === 0 && <p className="empty-copy">No comments yet.</p>}</div>
    </section>
  );
}

function ObjectiveForm({ objectives, draft, onDraftChange, onSubmit }: { objectives: Objective[]; draft: { title: string; description: string; kind: ObjectiveKind; status: ObjectiveStatus; parentId: string }; onDraftChange: (draft: { title: string; description: string; kind: ObjectiveKind; status: ObjectiveStatus; parentId: string }) => void; onSubmit: (event: FormEvent) => void }) {
  const mainObjectives = objectives.filter(objective => objective.kind === 'main');
  return (
    <form className="detail-panel" onSubmit={onSubmit}>
      <SectionTitle icon={<Milestone />} title="Add Objective" compact />
      <label className="field-label">Title<input value={draft.title} onChange={event => onDraftChange({ ...draft, title: event.target.value })} /></label>
      <label className="field-label">Description<textarea value={draft.description} onChange={event => onDraftChange({ ...draft, description: event.target.value })} rows={3} /></label>
      <label className="field-label">Kind<select value={draft.kind} onChange={event => onDraftChange({ ...draft, kind: event.target.value as ObjectiveKind, parentId: '' })}>{kindOptions.map(kind => <option key={kind} value={kind}>{kind}</option>)}</select></label>
      {draft.kind === 'sub' && <label className="field-label">Parent<select value={draft.parentId} onChange={event => onDraftChange({ ...draft, parentId: event.target.value })}><option value="">Choose parent</option>{mainObjectives.map(objective => <option key={objective.id} value={objective.id}>{objective.title}</option>)}</select></label>}
      <label className="field-label">Status<select value={draft.status} onChange={event => onDraftChange({ ...draft, status: event.target.value as ObjectiveStatus })}>{statusOptions.map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
      <button type="submit"><Plus className="h-4 w-4" /> Add Objective</button>
    </form>
  );
}

function ObjectiveEditForm({ objective, objectives, service, refresh }: { objective: Objective; objectives: Objective[]; service: CampaignService; refresh: () => Promise<void> }) {
  const [draft, setDraft] = useState({
    title: objective.title,
    description: objective.description,
    kind: objective.kind,
    status: objective.status,
    parentId: objective.parentId || ''
  });
  const mainObjectives = objectives.filter(item => item.kind === 'main' && item.id !== objective.id);

  async function saveObjective(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) return;
    const response = await service.updateObjective(objective.id, {
      title: draft.title,
      description: draft.description,
      kind: draft.kind,
      status: draft.status,
      parentId: draft.kind === 'sub' ? draft.parentId || undefined : undefined
    });
    if (response.success) {
      await refresh();
    } else {
      alert(response.error || 'Failed to update objective.');
    }
  }

  return (
    <form className="detail-panel" onSubmit={saveObjective}>
      <SectionTitle icon={<Edit3 />} title="Edit Objective" compact />
      <label className="field-label">Title<input value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
      <label className="field-label">Description<textarea value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} rows={3} /></label>
      <label className="field-label">Kind<select value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as ObjectiveKind, parentId: '' })}>{kindOptions.map(kind => <option key={kind} value={kind}>{kind}</option>)}</select></label>
      {draft.kind === 'sub' && <label className="field-label">Parent<select value={draft.parentId} onChange={event => setDraft({ ...draft, parentId: event.target.value })}><option value="">Choose parent</option>{mainObjectives.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
      <label className="field-label">Status<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as ObjectiveStatus })}>{statusOptions.map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
      <button type="submit">Save Objective</button>
    </form>
  );
}

function PartyCards({ campaignSlug, parties, runs, journals }: { campaignSlug: string; parties: Party[]; runs: RunSummary[]; journals: JournalEntry[] }) {
  return (
    <div className="party-card-grid">
      {parties.map(party => {
        const partyRuns = runs.filter(run => run.partyId === party.id);
        return (
          <Link key={party.id} to={`/campaign-objectives/${campaignSlug}/parties/${party.id}`} className="party-card-link">
            <article className="party-card"><div><h3>{party.name}</h3><p>{party.members.map(member => member.name).join(', ')}</p></div><div className="party-card-stats"><span>{partyRuns.length} runs</span><span>{partyRuns.reduce((total, run) => total + run.achievements.length, 0)} achievements</span><span>{journals.filter(journal => journal.partyId === party.id).length} journals</span></div></article>
          </Link>
        );
      })}
      {parties.length === 0 && <p className="empty-copy">No parties have been added.</p>}
    </div>
  );
}

function RunSummaryForm({ parties, objectives, draft, onDraftChange, onSubmit }: { parties: Party[]; objectives: Objective[]; draft: { partyId: string; title: string; objectiveIds: string[] }; onDraftChange: (draft: { partyId: string; title: string; objectiveIds: string[] }) => void; onSubmit: (event: FormEvent) => void }) {
  return (
    <form className="detail-panel" onSubmit={onSubmit}>
      <SectionTitle icon={<Users />} title="Create Run Summary" compact />
      <label className="field-label">Party<select value={draft.partyId} onChange={event => onDraftChange({ ...draft, partyId: event.target.value })}>{parties.map(party => <option key={party.id} value={party.id}>{party.name}</option>)}</select></label>
      <label className="field-label">Run title<input value={draft.title} onChange={event => onDraftChange({ ...draft, title: event.target.value })} /></label>
      <div className="check-grid">{objectives.map(objective => <label key={objective.id}><input type="checkbox" checked={draft.objectiveIds.includes(objective.id)} onChange={() => onDraftChange({ ...draft, objectiveIds: toggleValue(draft.objectiveIds, objective.id) })} /><span>{objective.title}</span></label>)}</div>
      <button type="submit" disabled={!draft.partyId || !draft.title.trim()}><Plus className="h-4 w-4" /> Add Run</button>
    </form>
  );
}

function JournalForm({ campaignSlug, journals, runs, parties, eligiblePlayers, eligibleObjectives, draft, onDraftChange, onSubmit }: { campaignSlug: string; journals: JournalEntry[]; runs: RunSummary[]; parties: Party[]; eligiblePlayers: string[]; eligibleObjectives: Objective[]; draft: { title: string; playerName: string; runId: string; text: string }; onDraftChange: (draft: { title: string; playerName: string; runId: string; text: string }) => void; onSubmit: (event: FormEvent) => void }) {
  return (
    <section className="detail-panel">
      <form className="journal-form" onSubmit={onSubmit}>
        <SectionTitle icon={<ScrollText />} title="Journal Entry" compact />
        <label className="field-label">Run<select value={draft.runId} onChange={event => onDraftChange({ ...draft, runId: event.target.value, playerName: '' })}><option value="">Choose run</option>{runs.map(run => <option key={run.id} value={run.id}>{partyName(parties, run.partyId)}: {run.title}</option>)}</select></label>
        <label className="field-label">Player<select value={draft.playerName} onChange={event => onDraftChange({ ...draft, playerName: event.target.value })}><option value="">Choose player</option>{eligiblePlayers.map(player => <option key={player} value={player}>{player}</option>)}</select></label>
        <label className="field-label">Title<input value={draft.title} onChange={event => onDraftChange({ ...draft, title: event.target.value })} /></label>
        <textarea value={draft.text} onChange={event => onDraftChange({ ...draft, text: event.target.value })} rows={5} placeholder={eligibleObjectives.length > 0 ? `Write about ${eligibleObjectives.map(item => item.title).slice(0, 2).join(', ')}` : 'Write a formal account'} />
        <button type="submit"><BookOpen className="h-4 w-4" /> Publish</button>
      </form>
      <div className="journal-links">{journals.map(entry => <Link key={entry.id} to={`/campaign-objectives/${campaignSlug}/journals/${entry.id}`}>{entry.title}</Link>)}</div>
    </section>
  );
}

function PartyPage({ details, partyId, service, refresh, isAdmin }: { details: CampaignDetails; partyId: string; service: CampaignService; refresh: () => Promise<void>; isAdmin: boolean }) {
  const { campaign, parties, runs, journals } = details;
  const party = parties.find(item => item.id === partyId);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [editingPartyName, setEditingPartyName] = useState(party?.name || '');
  const [memberDraft, setMemberDraft] = useState({ name: '', characterName: '', profileHref: '', artUrl: '' });
  if (!party) return <MessageShell title="Party not found" message="No party exists for this route." />;
  const partyRuns = runs.filter(run => run.partyId === party.id).sort((a, b) => a.runNumber - b.runNumber);
  const activeMemberIds = new Set(partyRuns.at(-1)?.memberIds || party.members.map(member => member.id));
  const selectedMember = party.members.find(member => member.id === selectedMemberId) || party.members.find(member => activeMemberIds.has(member.id)) || party.members[0];

  async function savePartyName(event: FormEvent) {
    event.preventDefault();
    const response = await service.updateParty(party.id, editingPartyName);
    if (response.success) {
      await refresh();
    } else {
      alert(response.error || 'Failed to save party.');
    }
  }

  async function addMember(event: FormEvent) {
    event.preventDefault();
    if (!memberDraft.name.trim()) return;
    const response = await service.createPartyMember({ partyId: party.id, ...memberDraft, characterName: memberDraft.characterName || memberDraft.name, profileHref: memberDraft.profileHref || `/characters?search=${encodeURIComponent(memberDraft.characterName || memberDraft.name)}`, artUrl: memberDraft.artUrl || '/npc-placeholder.png' });
    if (response.success) {
      await refresh();
      setMemberDraft({ name: '', characterName: '', profileHref: '', artUrl: '' });
    } else {
      alert(response.error || 'Failed to add member.');
    }
  }

  async function updateRunMembers(runId: string, memberIds: string[]) {
    const response = await service.updateRunMembers(runId, memberIds);
    if (response.success) {
      await refresh();
    } else {
      alert(response.error || 'Failed to update run roster.');
    }
  }

  return (
    <div className="campaign-page">
      <section className="campaign-shell">
        <header className="campaign-header"><div><Link to={`/campaign-objectives/${campaign.slug}`} className="back-link">Back to {campaign.name}</Link><p className="campaign-kicker">Party Record</p><h1>{party.name}</h1></div><div className="campaign-header-stats"><Stat label="Members" value={party.members.length} /><Stat label="Runs" value={partyRuns.length} /><Stat label="Achievements" value={partyRuns.reduce((total, run) => total + run.achievements.length, 0)} /></div></header>
        <div className="party-page-layout">
          <main className="objective-column"><PartyComposition party={party} activeMemberIds={activeMemberIds} selectedMemberId={selectedMember?.id} onSelectMember={setSelectedMemberId} /><PartyTimeline party={party} runs={partyRuns} /><RunList runs={partyRuns} /></main>
          <aside className="campaign-side">
            {isAdmin && <section className="detail-panel"><SectionTitle icon={<Edit3 />} title="Edit Party" compact /><form className="journal-form" onSubmit={savePartyName}><label className="field-label">Party name<input value={editingPartyName} onChange={event => setEditingPartyName(event.target.value)} /></label><button type="submit">Save Party</button></form><form className="journal-form" onSubmit={addMember}><label className="field-label">Player name<input value={memberDraft.name} onChange={event => setMemberDraft({ ...memberDraft, name: event.target.value })} /></label><label className="field-label">Character name<input value={memberDraft.characterName} onChange={event => setMemberDraft({ ...memberDraft, characterName: event.target.value })} /></label><label className="field-label">Profile URL<input value={memberDraft.profileHref} onChange={event => setMemberDraft({ ...memberDraft, profileHref: event.target.value })} /></label><label className="field-label">Art URL<input value={memberDraft.artUrl} onChange={event => setMemberDraft({ ...memberDraft, artUrl: event.target.value })} /></label><button type="submit"><UserPlus className="h-4 w-4" /> Add Member</button></form></section>}
            {isAdmin && <RunRosterEditor party={party} runs={partyRuns} onUpdateRunMembers={updateRunMembers} />}
            {selectedMember && <MemberPanel key={selectedMember.id} campaignSlug={campaign.slug} member={selectedMember} journals={journals.filter(journal => journal.partyId === party.id && journal.playerName === selectedMember.name)} service={service} refresh={refresh} canEdit={isAdmin} />}
          </aside>
        </div>
      </section>
    </div>
  );
}

function PartyComposition({ party, activeMemberIds, selectedMemberId, onSelectMember }: { party: Party; activeMemberIds: Set<string>; selectedMemberId?: string; onSelectMember: (id: string) => void }) {
  const visibleMembers = party.members.filter(member => activeMemberIds.has(member.id));
  return <section className="party-composition"><div><p className="campaign-kicker">Current Composition</p><h2>{party.name}</h2></div><div className="character-stage">{visibleMembers.map((member, index) => <button key={member.id} type="button" className={`character-standee ${selectedMemberId === member.id ? 'selected' : ''}`} style={{ '--member-index': index, '--member-count': visibleMembers.length } as React.CSSProperties} onClick={() => onSelectMember(member.id)}><img src={member.artUrl || '/npc-placeholder.png'} alt={member.characterName} /><span>{member.characterName || member.name}</span></button>)}</div></section>;
}

function PartyTimeline({ party, runs }: { party: Party; runs: RunSummary[] }) {
  return <section className="detail-panel"><SectionTitle icon={<GitBranch />} title="Run Timeline" compact /><div className="party-detail-timeline">{runs.map((run, index) => { const previous = index > 0 ? new Set(runs[index - 1].memberIds) : new Set<string>(); const current = new Set(run.memberIds); const joined = run.memberIds.filter(memberId => !previous.has(memberId)); const left = index === 0 ? [] : runs[index - 1].memberIds.filter(memberId => !current.has(memberId)); return <article key={run.id} className={`timeline-run run-count-${Math.min(runs.length, 4)}`}><div className="timeline-rail"><span /></div><div className="timeline-run-body"><header><span>Run {run.runNumber}</span><h3>{run.title}</h3><time>{formatDate(run.ranAt)}</time></header><div className="timeline-members">{run.memberIds.map(memberId => <span key={memberId}>{memberName(party, memberId)}</span>)}</div><div className="membership-events">{joined.map(memberId => <span key={`join-${memberId}`} className="joined"><UserPlus className="h-3.5 w-3.5" /> {memberName(party, memberId)} joined</span>)}{left.map(memberId => <span key={`left-${memberId}`} className="left"><UserMinus className="h-3.5 w-3.5" /> {memberName(party, memberId)} left</span>)}</div><div className="timeline-achievements">{run.achievements.map(achievement => <span key={achievement.id} className={`achievement-badge ${achievement.status} ${achievement.objectiveKind}`} title={`${statusLabels[achievement.status]}: ${achievement.objectiveTitle}`}>{achievement.objectiveTitle}</span>)}</div></div></article>; })}{runs.length === 0 && <p className="empty-copy">No runs have been recorded.</p>}</div></section>;
}

function RunList({ runs }: { runs: RunSummary[] }) {
  return <section className="detail-panel"><SectionTitle icon={<Milestone />} title="Runs & Achievements" compact /><div className="run-list">{runs.map(run => <article key={run.id}><header><h3>Run {run.runNumber}: {run.title}</h3><time>{formatDate(run.ranAt)}</time></header><div className="journal-badges">{run.achievements.map(achievement => <span key={achievement.id} className={`achievement-badge ${achievement.status} ${achievement.objectiveKind}`} title={`${statusLabels[achievement.status]}: ${achievement.objectiveTitle}`}>{achievement.objectiveTitle}</span>)}</div></article>)}{runs.length === 0 && <p className="empty-copy">No runs have been recorded.</p>}</div></section>;
}

function RunRosterEditor({ party, runs, onUpdateRunMembers }: { party: Party; runs: RunSummary[]; onUpdateRunMembers: (runId: string, memberIds: string[]) => void }) {
  return <section className="detail-panel"><SectionTitle icon={<Users />} title="Run Rosters" compact /><div className="run-roster-editor">{runs.map(run => <article key={run.id}><h3>Run {run.runNumber}</h3><div className="check-grid">{party.members.map(member => <label key={`${run.id}-${member.id}`}><input type="checkbox" checked={run.memberIds.includes(member.id)} onChange={() => onUpdateRunMembers(run.id, toggleValue(run.memberIds, member.id))} /><span>{member.name}</span></label>)}</div></article>)}</div></section>;
}

function MemberPanel({ campaignSlug, member, journals, service, refresh, canEdit }: { campaignSlug: string; member: PartyMember; journals: JournalEntry[]; service: CampaignService; refresh: () => Promise<void>; canEdit: boolean }) {
  const [draft, setDraft] = useState({
    name: member.name,
    characterName: member.characterName,
    profileHref: member.profileHref,
    artUrl: member.artUrl
  });

  async function saveMember(event: FormEvent) {
    event.preventDefault();
    const response = await service.updatePartyMember(member.id, draft);
    if (response.success) {
      await refresh();
    } else {
      alert(response.error || 'Failed to update member.');
    }
  }

  return (
    <section className="detail-panel member-panel">
      <img src={member.artUrl || '/npc-placeholder.png'} alt={member.characterName} />
      <h2>{member.characterName || member.name}</h2>
      <p>{member.name}</p>
      <Link to={member.profileHref}>View character profile</Link>
      {canEdit && (
        <form className="journal-form" onSubmit={saveMember}>
          <SectionTitle icon={<Edit3 />} title="Edit Member" compact />
          <label className="field-label">Player name<input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
          <label className="field-label">Character name<input value={draft.characterName} onChange={event => setDraft({ ...draft, characterName: event.target.value })} /></label>
          <label className="field-label">Profile URL<input value={draft.profileHref} onChange={event => setDraft({ ...draft, profileHref: event.target.value })} /></label>
          <label className="field-label">Art URL<input value={draft.artUrl} onChange={event => setDraft({ ...draft, artUrl: event.target.value })} /></label>
          <button type="submit">Save Member</button>
        </form>
      )}
      <div className="journal-links">{journals.map(entry => <Link key={entry.id} to={`/campaign-objectives/${campaignSlug}/journals/${entry.id}`}>{entry.title}</Link>)}{journals.length === 0 && <p className="empty-copy">No journal entries yet.</p>}</div>
    </section>
  );
}

function JournalPage({ details, journalId }: { details: CampaignDetails; journalId: string }) {
  const journal = details.journals.find(entry => entry.id === journalId);
  if (!journal) return <MessageShell title="Journal not found" message="No journal exists for this route." />;
  const run = details.runs.find(item => item.id === journal.runId);
  const party = details.parties.find(item => item.id === journal.partyId);
  const achievements = run?.achievements.filter(achievement => journal.achievementIds.includes(achievement.id)) || [];
  return <div className="campaign-page"><article className="journal-page"><Link to={`/campaign-objectives/${details.campaign.slug}`}>Back to {details.campaign.name}</Link><div className="journal-badges">{achievements.map(achievement => <span key={achievement.id} className={`achievement-badge ${achievement.status} ${achievement.objectiveKind}`} title={`${statusLabels[achievement.status]}: ${achievement.objectiveTitle}`}>{achievement.objectiveTitle}</span>)}</div><h1>{journal.title}</h1><dl><div><dt>Player</dt><dd>{journal.playerName}</dd></div><div><dt>Party</dt><dd>{party?.name || 'Unknown party'}</dd></div><div><dt>Run</dt><dd>{run?.title || 'Unknown run'}</dd></div><div><dt>Date</dt><dd>{formatDate(journal.createdAt)}</dd></div></dl><p>{journal.text}</p></article></div>;
}

function LoadingShell() {
  return <div className="campaign-page"><div className="flex min-h-[45vh] items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-yellow-400" /></div></div>;
}

function MessageShell({ title, message }: { title: string; message: string }) {
  return <div className="campaign-page"><section className="journal-page"><Link to="/campaign-objectives">Campaigns</Link><h1>{title}</h1><p>{message}</p></section></div>;
}

function SectionTitle({ icon, title, compact = false }: { icon: React.ReactNode; title: string; compact?: boolean }) {
  return <div className={`section-title ${compact ? 'compact' : ''}`}>{icon}<h2>{title}</h2></div>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div><strong>{value}</strong><span>{label}</span></div>;
}

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter(item => item !== value) : [...values, value];
}

function partyName(parties: Party[], partyId: string) {
  return parties.find(party => party.id === partyId)?.name || 'Unknown party';
}

function memberName(party: Party, memberId: string) {
  return party.members.find(member => member.id === memberId)?.name || memberId;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(value);
}
