import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, CalendarDays, Clock3, Dice5, Plus, Trash2 } from 'lucide-react';
import { BackLink, dateLabel, Help, RollRecord, type PageProps } from './PlayerPages';
import { formatDuration, overlaps } from './rules';

interface Booking { eventId: string; characterId: string; actionId: string; skill: string; modifier: number; description: string; startsAt: string }
function nextHour() { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return toLocal(d); }
function toLocal(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }

export function SchedulePage({ snapshot, execute, busy }: PageProps) {
  const [search] = useSearchParams();
  const characters = snapshot.characters.filter(c => c.status === 'active');
  const available = snapshot.events.filter(e => e.status === 'active');
  const [characterId, setCharacterId] = useState(characters[0]?.id ?? '');
  const [eventId, setEventId] = useState(search.get('event') ?? available[0]?.id ?? '');
  const event = available.find(e => e.id === eventId);
  const [selectedAction, setSelectedAction] = useState('');
  const action = event?.definition.actions.find(a => a.id === selectedAction) ?? event?.definition.actions[0];
  const [selectedSkill, setSelectedSkill] = useState('');
  const skill = action?.skills.find(s => s === selectedSkill) ?? action?.skills[0] ?? '';
  const [modifier, setModifier] = useState(0);
  const [description, setDescription] = useState('');
  const [starts, setStarts] = useState(nextHour);
  const [drafts, setDrafts] = useState<Booking[]>([]);
  const [error, setError] = useState('');
  const [review, setReview] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [rolledIds, setRolledIds] = useState<string[]>([]);
  const own = snapshot.contributions.filter(c => c.playerId === snapshot.userId);
  const booked = own.filter(c => c.characterId === characterId && c.status !== 'void');
  const endFor = (b: Booking) => {
    const a = snapshot.events.find(e => e.id === b.eventId)?.definition.actions.find(a => a.id === b.actionId);
    return new Date(new Date(b.startsAt).getTime() + (a?.hours ?? 0) * 3600000).toISOString();
  };
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() + i); return day; }), []);
  const addDraft = () => {
    setError('');
    if (!characterId || !event || !action || !skill) return setError('Choose a character, active event, and action first.');
    if (description.trim().length < 10) return setError('Give your action a little context: at least 10 characters.');
    if (!Number.isInteger(modifier) || modifier < -10 || modifier > 60) return setError('Enter a whole-number modifier between −10 and 60.');
    const start = new Date(starts);
    if (!Number.isFinite(start.getTime()) || start.getTime() < Date.now()) return setError('Choose a start time in the future.');
    if (start.getTime() > Date.now() + 7 * 86400000) return setError('Book starts within the next seven days.');
    const draft: Booking = { characterId, eventId, actionId: action.id, skill, modifier, description: description.trim(), startsAt: start.toISOString() };
    const end = endFor(draft);
    if (!event.endsAt || new Date(end) > new Date(event.endsAt)) return setError('This action would finish after the event deadline. Choose an earlier start or shorter action.');
    if (booked.some(c => overlaps(draft.startsAt, end, c.startsAt, c.endsAt)) || drafts.some(d => d.characterId === characterId && overlaps(draft.startsAt, end, d.startsAt, endFor(d)))) return setError('Your character is already committed during part of that time. Choose a free period.');
    setDrafts([...drafts, draft]); setStarts(toLocal(new Date(end))); setDescription(''); setReview(false); setAcknowledged(false);
  };
  return <><BackLink /><header className="wm-page-heading"><p className="wm-kicker">MAKE TIME FOR WHAT MATTERS</p><h1>Your week. Their world.</h1><p className="wm-lede">Plan a little or a lot. Every event shares your character’s time, and every committed action gets one roll.</p></header>
    {!characters.length ? <section className="wm-empty"><CalendarDays size={34} /><h2>First, introduce your character.</h2><p>A name, ancestry, class, and level are all you need to begin.</p><Link to="/westmarch/characters" className="wm-button">Create a character <ArrowRight size={16} /></Link></section> : <>
      <section className="wm-panel"><div className="wm-section-heading"><label className="wm-field">Planning for<select value={characterId} onChange={e => setCharacterId(e.target.value)}>{characters.map(c => <option key={c.id} value={c.id}>{c.name} · Level {c.level}</option>)}</select></label><p className="wm-fine"><Clock3 size={15} /> Your timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}<br />One day = 24 hours. Drafts do not reserve time.</p></div>
      <div className="wm-week">{days.map(day => { const end = new Date(day); end.setDate(end.getDate() + 1); const commitments = booked.filter(c => overlaps(c.startsAt, c.endsAt, day.toISOString(), end.toISOString())); const proposed = drafts.filter(d => d.characterId === characterId && overlaps(d.startsAt, endFor(d), day.toISOString(), end.toISOString())); return <div className="wm-day" key={day.toISOString()}><span>{day.toLocaleDateString(undefined, { weekday: 'short' })}</span><strong>{day.getDate()}</strong>{commitments.map(c => <div className="wm-time-block" key={c.id} title={`${dateLabel(c.startsAt)} – ${dateLabel(c.endsAt)}`}>{snapshot.events.find(e => e.id === c.eventId)?.definition.actions.find(a => a.id === c.actionId)?.name ?? c.skill}<small>{c.status === 'completed' ? 'Completed' : 'Committed'}</small></div>)}{proposed.map((d, i) => <div className="wm-time-block draft" key={`${d.startsAt}-${i}`}>{snapshot.events.find(e => e.id === d.eventId)?.definition.actions.find(a => a.id === d.actionId)?.name}<small>Draft</small></div>)}{!commitments.length && !proposed.length && <span className="wm-day-free">Open</span>}</div>; })}</div>
      <Help title="How the shared schedule works"><p>Book any combination of active events, including a meta event. Times cannot overlap for the same character. The dates above show which days contain work; exact start and finish times determine availability.</p><p>You can commit all your rolls in one sitting. The die result appears immediately, but your contribution takes effect when its scheduled work finishes. Aid earned before then may improve the outcome.</p></Help></section>
      <div className="wm-detail-grid wm-board-section"><section className="wm-panel"><p className="wm-kicker">BUILD YOUR PLAN</p><h2>What will you do next?</h2>{available.length ? <form onSubmit={e => { e.preventDefault(); addDraft(); }}><div className="wm-stack"><label className="wm-field">Event<select value={eventId} onChange={e => { setEventId(e.target.value); setSelectedAction(''); setSelectedSkill(''); }}>{available.map(e => <option value={e.id} key={e.id}>{e.definition.title} · {e.definition.region}</option>)}</select></label><label className="wm-field">Contribution<select value={action?.id ?? ''} onChange={e => { setSelectedAction(e.target.value); setSelectedSkill(''); }}>{event?.definition.actions.map(a => <option key={a.id} value={a.id}>{a.name} · {a.kind} · {formatDuration(a.hours)}</option>)}</select><small>{action?.description}</small></label><div className="wm-form-grid"><label className="wm-field">Check<select value={skill} onChange={e => setSelectedSkill(e.target.value)}>{action?.skills.map(s => <option key={s}>{s}</option>)}</select></label><label className="wm-field">Your modifier<input type="number" required min={-10} max={60} step={1} value={modifier} onChange={e => setModifier(Number(e.target.value))} /><small>Include your complete bonus. The die is rolled separately.</small></label></div><label className="wm-field">Start time<input type="datetime-local" value={starts} required onChange={e => setStarts(e.target.value)} /><small>{action && starts && Number.isFinite(new Date(starts).getTime()) ? `Finishes ${dateLabel(new Date(new Date(starts).getTime() + action.hours * 3600000).toISOString())}` : 'Choose when the character begins.'}</small></label><label className="wm-field">Describe your approach<textarea required minLength={10} maxLength={2000} rows={4} placeholder="I follow the pattern of withered plants back toward the old irrigation channel…" value={description} onChange={e => setDescription(e.target.value)} /><small>Give other players a glimpse of your character helping. Staff can review this and your declared modifier.</small></label>{error && <p className="wm-error" role="alert">{error}</p>}<button type="submit" className="wm-button secondary" disabled={busy || drafts.length >= 30}><Plus size={16} /> Add to plan · no roll yet</button></div></form> : <div className="wm-empty"><p>No events are accepting contributions right now. Your character’s time is ready for the next story.</p></div>}</section>
      <aside className="wm-panel"><p className="wm-kicker">YOUR UNCOMMITTED PLAN</p><h2>{drafts.length ? `${drafts.length} action${drafts.length === 1 ? '' : 's'} ready to review` : 'A little room for possibility.'}</h2>{!drafts.length && <p className="wm-muted">Add actions from any active event. Nothing is booked until you review and commit.</p>}<div className="wm-stack">{drafts.map((d, index) => <div className="wm-draft" key={`${d.characterId}-${d.startsAt}`}><div><strong>{snapshot.events.find(e => e.id === d.eventId)?.definition.actions.find(a => a.id === d.actionId)?.name}</strong><p className="wm-fine">{characters.find(c => c.id === d.characterId)?.name} · {d.skill} {d.modifier >= 0 ? '+' : ''}{d.modifier}</p><p className="wm-fine">{dateLabel(d.startsAt)} → {dateLabel(endFor(d))}</p></div><button className="wm-icon-button" disabled={busy} aria-label={`Remove action ${index + 1} from draft`} onClick={() => { setDrafts(drafts.filter((_, i) => i !== index)); setReview(false); }}><Trash2 size={16} /></button></div>)}</div>{drafts.length > 0 && !review && <button className="wm-button wm-full" onClick={() => setReview(true)}>Review before rolling <ArrowRight size={16} /></button>}
      {review && <div className="wm-booking-confirm"><h3>Ready to make it official?</h3><p>You will receive <strong>{drafts.length} rolls</strong>. Every action reserves its listed time, even if the check fails. After rolling, these actions cannot be moved, cancelled, or rerolled.</p><p>Pending main results may improve through aid. No reputation payout is configured yet.</p><label className="wm-checkbox"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />I have checked the times and modifiers and understand these commitments.</label><button className="wm-button wm-full" disabled={busy || !acknowledged} onClick={async () => { const previous = snapshot.contributions.map(c => c.id); if (await execute({ type: 'book', bookings: drafts })) { setRolledIds(previous); setDrafts([]); setReview(false); setAcknowledged(false); } }}><Dice5 size={18} />{busy ? 'Committing your plan…' : 'Commit time & roll'}</button><p className="wm-fine">Your complete plan is checked together. A conflicting booking prevents the entire batch from being committed.</p></div>}</aside></div>
    </>}
    <section className="wm-panel wm-board-section"><p className="wm-kicker">YOUR CONTRIBUTION HISTORY</p><h2>Every effort leaves a record.</h2>{own.length ? <div className="wm-stack">{own.slice().sort((a, b) => b.endsAt.localeCompare(a.endsAt)).map(c => { const e = snapshot.events.find(e => e.id === c.eventId); return e ? <div key={c.id}>{rolledIds.length > 0 && !rolledIds.includes(c.id) && <span className="wm-badge">Just rolled</span>}<Link className="wm-fine" to={`/westmarch/events/${e.id}`}>{e.definition.title}</Link><RollRecord contribution={c} event={e} contributions={snapshot.contributions} /></div> : null; })}</div> : <p className="wm-muted">Your committed rolls will appear here, including pending results with potential.</p>}</section>
  </>;
}
