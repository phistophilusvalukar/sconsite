import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BookOpen, Box, Check, ChevronRight, Eye, GitBranch, KeyRound, LockKeyhole, Plus, ScrollText, Users } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { supabase } from '../../config/database';
import ClueMap from './ClueMap';
import PuzzleMaker from './PuzzleMaker';
import { isLock, newNode, prerequisitesMet, type Blueprint, type Library, type PuzzleSession, type PublicNode } from './model';
import { getLibrary, getSession, joinSession, saveBlueprint, sendCommand, startSession, type SessionCommand } from './service';
import { starter } from './starter';
import './escapeRooms.css';

const PropViewer = lazy(() => import('./PropViewer'));
const errorText = (err: unknown) => err instanceof Error ? err.message : 'Something went wrong. Please try again.';
const emptyLibrary: Library = { blueprints: [], sessions: [] };

export default function EscapeRoomsPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const admin = !!(user?.isAdmin || user?.profile?.isAdmin);
  const [library, setLibrary] = useState<Library>(emptyLibrary);
  const [session, setSession] = useState<PuzzleSession | null>(null);
  const [draft, setDraft] = useState<{ id: string | null; revision: number; definition: Blueprint; key: number } | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [view, setView] = useState<'gm' | 'player'>('gm');
  const [connection, setConnection] = useState('Connecting');
  const openDraft = (next: NonNullable<typeof draft>) => {
    if (busy || (draftDirty && !window.confirm('Discard unsaved changes and open another blueprint?'))) return;
    setDraft(next); setDraftDirty(false);
  };
  const scope = useRef(sessionId);
  scope.current = sessionId;
  const refresh = useCallback(async () => {
    const current = sessionId;
    try {
      if (current) {
        const next = await getSession(current);
        if (scope.current === current) setSession(previous => previous?.id === next.id && previous.revision > next.revision ? previous : next);
      } else {
        const next = await getLibrary();
        if (!scope.current) setLibrary(next);
      }
    } catch (err) { if (scope.current === current) setError(errorText(err)); }
    finally { if (scope.current === current) setLoading(false); }
  }, [sessionId]);
  useEffect(() => { setLoading(true); setSession(null); setError(''); setNotice(''); void refresh(); }, [refresh]);
  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    const channel = supabase.channel(`escape-room:${sessionId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'escape_updates', filter: `session_id=eq.${sessionId}` }, () => { void refresh(); })
      .subscribe(status => {
        if (!active) return;
        setConnection(status === 'SUBSCRIBED' ? 'Live' : 'Reconnecting · periodic refresh active');
        if (status === 'SUBSCRIBED') void refresh();
      });
    // Reconcile missed notifications after background tabs / transient disconnects.
    const interval = window.setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
    const focus = () => { void refresh(); };
    window.addEventListener('focus', focus);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('focus', focus); void supabase.removeChannel(channel); };
  }, [refresh, sessionId]);
  const perform = async (work: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  const command = async (value: SessionCommand) => {
    if (!session) return;
    const current = session.id;
    await perform(async () => {
      try {
        const next = await sendCommand(current, session.revision, value);
        if (scope.current === current) setSession(previous => previous?.id === next.id && previous.revision > next.revision ? previous : next);
      } catch (err) { await refresh(); throw err; }
    });
  };
  return <div className="er-page">
    <header className="er-hero"><div><Link className="er-eyebrow" to="/escape-rooms">THE GAME MASTER’S WORKSHOP</Link><h1>{sessionId ? session?.title ?? 'Escape room' : 'Every clue opens a door.'}</h1><p>{sessionId ? session?.description : 'Build intricate mysteries. Share tangible discoveries. Guide your party from the first hidden note to the final treasure.'}</p></div><div className="er-hero-seal" aria-hidden="true"><KeyRound size={46} /><span>ESCAPE ROOMS</span></div></header>
    {error && <div className="er-error" role="alert">{error}<button onClick={() => { setError(''); void refresh(); }}>Retry loading</button></div>}
    {notice && <p className="er-notice" role="status">{notice}</p>}
    {loading ? <p className="er-empty">Opening the archive…</p> : sessionId ? session && <>
      <div className="er-session-bar"><Link to="/escape-rooms">← All adventures</Link><span><Users size={16} /> {session.memberCount} joined players</span><span className="er-live">{connection}</span><span className="er-badge">{session.status}</span><button disabled={busy} onClick={() => void refresh()}>Refresh</button></div>
      {session.isGm && <div className="er-tabs"><button className={view === 'gm' ? 'active' : ''} onClick={() => setView('gm')}><GitBranch size={16} /> Puzzle master</button><button className={view === 'player' ? 'active' : ''} onClick={() => setView('player')}><Eye size={16} /> Player view</button></div>}
      {session.status === 'completed' && <div className="er-complete"><Check /> Adventure complete. The party has claimed every treasure.</div>}
      {session.status === 'paused' && <p className="er-notice">The room is paused. You can still inspect your discoveries.</p>}
      {session.isGm && view === 'gm' ? <MasterView session={session} busy={busy} command={command} /> : <PlayerView session={session} busy={busy} command={command} />}
    </> : <>
      <div className="er-lobby-grid"><section className="er-panel er-join"><span className="er-eyebrow">For adventurers</span><h2>Your party’s shared clue stash</h2><p>Find clues in Foundry, then inspect the papers, books, and curious objects your puzzle master reveals here.</p><form onSubmit={e => { e.preventDefault(); void perform(async () => { const next = await joinSession(joinCode); navigate(`/escape-rooms/${next.id}`); }); }}><label>Room invitation code<input required value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="Paste the code from your GM" autoComplete="off" /></label><button className="er-primary" disabled={busy || !joinCode.trim()}>Join adventure <ChevronRight size={16} /></button></form></section>
      <section className="er-panel"><span className="er-eyebrow">Your adventures</span><h2>Return to the mystery</h2>{!library.sessions.length && <p>No rooms yet. Join with an invitation or launch a blueprint.</p>}<div className="er-session-list">{library.sessions.map(s => <Link key={s.id} to={`/escape-rooms/${s.id}`}><span><strong>{s.title}</strong><small>{s.isGm ? 'Puzzle master' : 'Player'} · {s.status}</small></span><ChevronRight size={18} /></Link>)}</div></section></div>
      {admin && <><section className="er-blueprints"><div className="er-section-heading"><div><span className="er-eyebrow">For puzzle masters</span><h2>Your puzzle blueprints</h2><p>Save a design, then launch a fresh session for each party. Running rooms retain their original design.</p></div><div className="er-actions"><button disabled={busy} onClick={() => openDraft({ id: null, revision: 0, definition: { title: 'Untitled adventure', description: '', nodes: [{ ...newNode(), title: 'Final treasure', kind: 'treasure', prop: 'crystal' }] }, key: Date.now() })}><Plus size={16} /> Blank blueprint</button><button disabled={busy} onClick={() => openDraft({ id: null, revision: 0, definition: structuredClone(starter), key: Date.now() })}>New from starter</button></div></div>
        <div className="er-blueprint-grid">{library.blueprints.map(b => <article className="er-panel" key={b.id}><GitBranch className="er-gold" /><h3>{b.definition.title}</h3><p>{b.definition.description}</p><small>{b.definition.nodes.length} discoveries · revision {b.revision}</small><div className="er-actions"><button disabled={busy} onClick={() => openDraft({ ...b, key: Date.now() })}>Edit blueprint</button><button className="er-primary" disabled={busy} onClick={() => void perform(async () => { const next = await startSession(b.id); navigate(`/escape-rooms/${next.id}`); })}>Launch room</button></div></article>)}</div>
        {!library.blueprints.length && <p className="er-empty">Start with the Astronomer’s Last Secret: two parallel trails, a vault, and a hidden treasure.</p>}
      </section>{draft && <PuzzleMaker key={draft.key} initial={draft.definition} busy={busy} onDirty={setDraftDirty} onSave={async definition => {
        setBusy(true); setError('');
        try { const result = await saveBlueprint(draft.id, definition, draft.revision); setDraft({ ...draft, ...result, definition }); setNotice('Blueprint saved. Launch it from your blueprints above.'); await refresh(); }
        catch (err) { setError(errorText(err)); throw err; }
        finally { setBusy(false); }
      }} />}</>}
    </>}
  </div>;
}

function MasterView({ session, busy, command }: { session: PuzzleSession; busy: boolean; command: (value: SessionCommand) => Promise<void> }) {
  const [selected, setSelected] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const definition = session.definition;
  if (!definition) return null;
  const node = definition.nodes.find(n => n.id === selected) ?? definition.nodes[0];
  const states = session.states ?? {};
  const status = states[node.id] ?? 'hidden';
  return <section><div className="er-section-heading"><div><span className="er-eyebrow">The whole story</span><h2>Discovery map</h2><div className="er-legend"><span className="er-hidden">● Hidden</span><span className="er-known">● Known to players</span><span className="er-used">● Used / solved</span></div></div><div className="er-actions"><button disabled={busy || session.status === 'completed'} onClick={() => void command({ type: session.status === 'paused' ? 'resume' : 'pause' })}>{session.status === 'paused' ? 'Resume room' : 'Pause room'}</button></div></div>
    <div className="er-invite"><label>Share this invitation code with your players<input readOnly value={session.joinCode ?? ''} onFocus={e => e.target.select()} /></label><button onClick={async () => { try { await navigator.clipboard.writeText(session.joinCode ?? ''); setCopyMessage('Copied'); } catch { setCopyMessage('Select the code and copy it manually.'); } }}>Copy code</button><span role="status">{copyMessage}</span></div>
    <div className="er-editor-layout"><ClueMap blueprint={definition} states={states} selected={node.id} onSelect={setSelected} /><aside className="er-node-editor"><span className={`er-badge er-${status}`}>{status}</span><h3>{node.title}</h3><p>{node.location}</p><p className="er-handout-text">{node.text}</p>{node.backText && <p className="er-handout-text">Reverse: {node.backText}</p>}<div className="er-gm-notes"><strong>GM notes</strong><p>{node.gmNotes || 'No private notes.'}</p>{node.code && <p>Answer: <code>{node.code}</code></p>}{node.keyIds.length > 0 && <p>Items: {node.keyIds.map(id => definition.nodes.find(n => n.id === id)?.title).join(', ')}</p>}</div><p>Prerequisites: {prerequisitesMet(node, states) ? 'met' : 'waiting'} · {node.gate.toUpperCase()} paths</p><p>Leads to: {definition.nodes.filter(n => n.requires.some(r => r.nodeId === node.id) || n.keyIds.includes(node.id)).map(n => n.title).join(', ') || 'End of this path'}</p><button className="er-primary" disabled={busy || session.status !== 'active' || status !== 'hidden'} onClick={() => void command({ type: 'reveal', nodeId: node.id })}>Reveal to party</button><button disabled={busy || session.status !== 'active' || status !== 'known'} onClick={() => void command({ type: 'mark_used', nodeId: node.id })}>Mark used / solve</button><small>GM actions can bypass prerequisites. Solving a lock may reveal its contents.</small></aside></div>
    <History session={session} />
  </section>;
}

function PlayerView({ session, busy, command }: { session: PuzzleSession; busy: boolean; command: (value: SessionCommand) => Promise<void> }) {
  const [selected, setSelected] = useState('');
  const [mode, setMode] = useState<'3d' | 'text'>(() => { try { return localStorage.getItem('escape-view-mode') === 'text' ? 'text' : '3d'; } catch { return 'text'; } });
  const [filter, setFilter] = useState('');
  const node = session.nodes.find(n => n.id === selected) ?? session.nodes[0];
  const nodes = session.nodes.filter(n => `${n.title} ${n.location}`.toLowerCase().includes(filter.toLowerCase()));
  return <section><div className="er-section-heading"><div><span className="er-eyebrow">Shared discoveries</span><h2>The party’s evidence table</h2><p>Everyone in this room shares these clues and the same progress.</p></div><div className="er-tabs"><button className={mode === '3d' ? 'active' : ''} onClick={() => { setMode('3d'); try { localStorage.setItem('escape-view-mode', '3d'); } catch { /* Optional preference. */ } }}><Box size={16} /> 3D objects</button><button className={mode === 'text' ? 'active' : ''} onClick={() => { setMode('text'); try { localStorage.setItem('escape-view-mode', 'text'); } catch { /* Optional preference. */ } }}><ScrollText size={16} /> Text mode</button></div></div>
    {!session.nodes.length ? <div className="er-empty"><LockKeyhole size={36} /><h3>The mystery is waiting.</h3><p>Search the room in Foundry. Discoveries appear here when your GM reveals them.</p></div> : <div className="er-player-layout"><aside className="er-stash"><label>Find a discovery<input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search your stash…" /></label><div className="er-stash-grid">{nodes.map(n => <button key={n.id} className={`er-stash-card ${n.id === node?.id ? 'selected' : ''}`} onClick={() => setSelected(n.id)} aria-pressed={n.id === node?.id}><span className={`er-prop-icon er-${n.status}`}>{n.prop === 'key' ? <KeyRound /> : n.prop === 'book' ? <BookOpen /> : isLock(n) ? <LockKeyhole /> : <ScrollText />}</span><strong>{n.title}</strong><small>{n.kind} · {n.status === 'used' ? 'used / solved' : 'discovered'}</small></button>)}</div>{!nodes.length && <p>No discoveries match that search.</p>}</aside>
      {node && <article className="er-inspector"><div className="er-inspector-heading"><span className="er-eyebrow">{node.kind} · {node.location}</span><h2>{node.title}</h2></div>{mode === '3d' && <Suspense fallback={<p className="er-empty">Preparing the evidence table…</p>}><PropViewer node={node} /></Suspense>}<div className="er-handout"><h3>Handout</h3><p className="er-handout-text">{node.text || 'There are no visible markings.'}</p>{node.backText && <details><summary>Inspect reverse / inside</summary><p className="er-handout-text">{node.backText}</p></details>}</div>{isLock(node) && <UnlockForm key={node.id} node={node} session={session} busy={busy} command={command} />}</article>}
    </div>}<History session={session} /></section>;
}

function UnlockForm({ node, session, busy, command }: { node: PublicNode; session: PuzzleSession; busy: boolean; command: (value: SessionCommand) => Promise<void> }) {
  const [code, setCode] = useState('');
  const [items, setItems] = useState<string[]>([]);
  if (node.status === 'used') return <p className="er-complete"><Check size={18} /> {node.kind === 'treasure' ? 'Treasure claimed' : 'Solved / opened by the party'}</p>;
  return <form className="er-unlock" onSubmit={e => { e.preventDefault(); void command({ type: 'unlock', nodeId: node.id, code, itemIds: items }); }}><h3>{node.kind === 'treasure' ? 'Claim the discovery' : 'Try the lock'}</h3>{node.needsCode && <label>Answer or code<input maxLength={120} value={code} autoComplete="off" onChange={e => setCode(e.target.value)} placeholder="Enter your answer" /></label>}{node.needsItems && <fieldset><legend>Apply items from the shared stash</legend>{session.nodes.filter(n => n.kind === 'item').map(n => <label className="er-checkbox" key={n.id}><input type="checkbox" checked={items.includes(n.id)} onChange={e => setItems(e.target.checked ? [...items, n.id] : items.filter(id => id !== n.id))} />{n.title}</label>)}{!session.nodes.some(n => n.kind === 'item') && <p>No items discovered yet.</p>}</fieldset>}<button className="er-primary" disabled={busy || session.status !== 'active'}>{busy ? 'Checking…' : node.kind === 'treasure' ? 'Claim treasure' : 'Open / solve'}</button></form>;
}
function History({ session }: { session: PuzzleSession }) {
  return <details className="er-history"><summary>Party activity · {session.history.length} recent actions</summary><ol>{[...session.history].reverse().map((entry, index) => <li key={`${entry.at}-${index}`}><span>{entry.title}</span><span>{entry.action.replace('_', ' ')} · {new Date(entry.at).toLocaleTimeString()}</span></li>)}</ol></details>;
}
