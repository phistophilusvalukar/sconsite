import { useState } from 'react';
import type { z } from 'zod';
import { leaderboardSchema, type PuzzleSession } from './model';
import { getLeaderboard, type RoomCommand } from './service';

export default function RoomAssistance({ session, busy, command, gmView }: { session: PuzzleSession; busy: boolean; command: RoomCommand; gmView: boolean }) {
  const [nodeId, setNodeId] = useState('');
  const [partyName, setPartyName] = useState(session.partyName);
  const [leaders, setLeaders] = useState<z.infer<typeof leaderboardSchema> | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  return <section className="er-assistance">
    <div className="er-section-heading"><div><span className="er-eyebrow">Help for the whole party</span><h2>Hints & standings</h2><p>{session.hintCount} hints requested · {session.leaderboardEligible ? 'Eligible for the leaderboard (up to 3 hints)' : 'Unranked — more than 3 hints requested'}</p></div></div>
    <p>Ask for as many hints as you like. Requests are counted across the party, including those awaiting a GM response. All answers stay visible here.</p>
    <div className="er-actions"><label>Help with<select value={nodeId} onChange={e => setNodeId(e.target.value)}><option value="">The whole room (ask the GM)</option>{session.nodes.map(n => <option key={n.id} value={n.id}>{n.title}</option>)}</select></label><button disabled={busy || session.status !== 'active'} onClick={() => void command({ type: 'request_hint', ...(nodeId ? { nodeId } : {}) })}>{session.hintCount === 3 ? 'Ask hint #4 — leave leaderboard' : `Ask for hint #${session.hintCount + 1}`}</button></div>
    <div className="er-hint-list">{session.hints.map(h => <article className="er-panel" key={h.id}><h3>Hint {h.number} · {h.title}</h3>{h.text ? <p className="er-handout-text">{h.text}</p> : <><p>Waiting for the puzzle master. No authored hints remain for this request.</p>{gmView && <HintReply id={h.id} command={command} busy={busy} />}</>}</article>)}</div>
    {gmView && <form className="er-actions" onSubmit={e => { e.preventDefault(); void command({ type: 'set_party_name', name: partyName }); }}><label>Party name on the leaderboard<input value={partyName} maxLength={80} onChange={e => setPartyName(e.target.value)} /></label><button disabled={busy || session.status === 'completed' || !partyName.trim()}>Save party name</button></form>}
    <div className="er-section-heading"><div><h3>Adventure leaderboard</h3><p>Completed runs of this exact blueprint, ordered by total time from launch (including pauses), then hint count. More than 3 hints excludes the run.</p></div><button disabled={loading} onClick={async () => { setLoading(true); setError(''); try { setLeaders(await getLeaderboard(session.id)); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load leaderboard.'); } finally { setLoading(false); } }}>{loading ? 'Loading…' : 'Refresh leaderboard'}</button></div>
    {error && <p role="alert" className="er-error">{error}</p>}
    {leaders && (leaders.length ? <div className="er-table-scroll"><table><thead><tr><th>Rank</th><th>Party</th><th>Elapsed time</th><th>Hints</th></tr></thead><tbody>{leaders.map((entry, i) => <tr key={`${entry.completedAt}-${i}`}><td>{i + 1}</td><td>{entry.partyName}</td><td>{Math.floor(entry.seconds / 60)}m {Math.floor(entry.seconds % 60)}s</td><td>{entry.hintCount}</td></tr>)}</tbody></table></div> : <p>No eligible completed runs yet.</p>)}
  </section>;
}
function HintReply({ id, busy, command }: { id: string; busy: boolean; command: RoomCommand }) {
  const [text, setText] = useState('');
  return <form onSubmit={e => { e.preventDefault(); void command({ type: 'answer_hint', hintId: id, text }); }}><label>Reply to this hint<textarea maxLength={2000} value={text} onChange={e => setText(e.target.value)} /></label><button disabled={busy || !text.trim()}>Share hint with the party</button></form>;
}
