import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckSquare, ChevronRight, Copy, Layers, ListChecks, Lock, Moon, Plus, Settings2, Sun, Trash2, Users, X } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { calendarDays, dateKey, formatDate, moveDate, occursOn, type CalendarView, type Command, type Snapshot, type Task } from './model';
import { loadPlanner, sendCommand } from './service';
import './planner.css';

type Modal = 'space' | 'join' | 'task' | 'list' | 'settings' | null;
const repeatLabels = { once: 'One-off', daily: 'Every day', weekly: 'Every week', monthly: 'Every month' };
const empty: Snapshot = { spaces: [], members: [], lists: [], items: [], tasks: [], completions: [] };
function preference(key: string, fallback: string) { try { return localStorage.getItem(`planner-${key}`) || fallback; } catch { return fallback; } }

export default function PlannerPage() {
  const { user, login, logout, error: authError } = useAuth();
  const [theme, setTheme] = useState(() => preference('theme', 'night') === 'day' ? 'day' : 'night');
  const [accent, setAccent] = useState(() => { const value = preference('accent', '#c5f466'); return /^#[0-9a-f]{6}$/i.test(value) ? value : '#c5f466'; });
  const [appearance, setAppearance] = useState(false);
  useEffect(() => { try { localStorage.setItem('planner-theme', theme); localStorage.setItem('planner-accent', accent); } catch { /* Private browsing still supports in-memory preferences. */ } }, [theme, accent]);
  return <div className="planner" data-theme={theme} style={{ '--p-accent': accent } as CSSProperties}>
    <header className="p-topbar">
      <Link to="/planner" className="p-brand"><span className="p-mark" aria-hidden="true">▦</span> GRID<span className="p-brand-sub">/ PERSONAL SYSTEM</span></Link>
      <div className="p-tools">
        <button onClick={() => setTheme(theme === 'night' ? 'day' : 'night')} aria-label={`Switch to ${theme === 'night' ? 'day' : 'night'} mode`}>{theme === 'night' ? <Sun size={16} /> : <Moon size={16} />}<span>{theme === 'night' ? 'Day' : 'Night'}</span></button>
        <button onClick={() => setAppearance(!appearance)} aria-expanded={appearance}><span className="p-swatch" /> Accent</button>
        <Link to="/" className="p-back">SCON ↗</Link>
      </div>
    </header>
    {appearance && <div className="p-appearance"><ColorWheel value={accent} onChange={setAccent} /><button onClick={() => setAppearance(false)}>Done <Check size={14} /></button></div>}
    {user ? <Workspace key={user.id} userId={user.id} username={user.username} logout={logout} /> : <main className="p-welcome">
      <span className="p-eyebrow">LESS NOISE. MORE SPACE.</span><h1>A little order.<br /><span>On your terms.</span></h1>
      <p>Your plans, lists, and everyday rituals.<br />Keep a space to yourself. Or build one together.</p>
      <button className="p-primary" onClick={() => void login('/planner')}>Continue with Discord <ArrowRight size={18} /></button>
      {authError && <p role="alert">{authError}</p>}
      <div className="p-feature-strip"><span><Lock />Private & shared spaces</span><span><ListChecks />Lists that get done</span><span><CalendarDays />Routines in rhythm</span></div>
      <div className="p-welcome-grid" aria-hidden="true">{Array.from({ length: 35 }, (_, i) => <i key={i} className={[9, 10, 17, 24, 25].includes(i) ? 'lit' : ''} />)}</div>
    </main>}
    <footer className="p-footer"><span>GRID / MAKE ROOM FOR YOUR DAY</span><span>ONE THING AT A TIME.</span></footer>
  </div>;
}

function Workspace({ userId, username, logout }: { userId: string; username: string; logout: () => Promise<void> }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(empty);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [synced, setSynced] = useState(false);
  const [tab, setTab] = useState<'calendar' | 'tasks' | 'lists'>('calendar');
  const [view, setView] = useState<CalendarView>('week');
  const [date, setDate] = useState(() => dateKey(new Date()));
  const [modal, setModal] = useState<Modal>(null);
  const [editing, setEditing] = useState<Task | undefined>();
  const [confirm, setConfirm] = useState<{ text: string; command: Command } | null>(null);
  const [copied, setCopied] = useState(false);
  const requestVersion = useRef(0);
  const mutationPending = useRef(false);
  const mounted = useRef(true);
  const today = dateKey(new Date());
  const refresh = useCallback(async () => {
    if (mutationPending.current) return;
    const version = ++requestVersion.current;
    try {
      const result = await loadPlanner();
      if (mounted.current && version === requestVersion.current) { setSnapshot(result); setSynced(true); setError(''); }
    } catch (err) { if (mounted.current && version === requestVersion.current) { setError(err instanceof Error ? err.message : 'Unable to sync'); setSynced(false); } }
    finally { if (mounted.current) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true; void refresh();
    const poll = window.setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
    const focus = () => void refresh(); window.addEventListener('focus', focus);
    return () => { mounted.current = false; window.clearInterval(poll); window.removeEventListener('focus', focus); };
  }, [refresh]);
  const act = async (command: Command): Promise<boolean> => {
    if (mutationPending.current) return false;
    mutationPending.current = true; requestVersion.current++; setBusy(true); setError('');
    try {
      const result = await sendCommand(command, crypto.randomUUID());
      if (!mounted.current) return false;
      setSnapshot(result); setSynced(true);
      if (command.type === 'create_space' || command.type === 'join') {
        const added = result.spaces.find(s => !snapshot.spaces.some(old => old.id === s.id));
        if (added) setSelected(added.id);
      }
      return true;
    } catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : 'Unable to save. Refresh before trying again.'); return false; }
    finally { mutationPending.current = false; if (mounted.current) setBusy(false); }
  };
  const space = snapshot.spaces.find(s => s.id === selected) ?? snapshot.spaces[0];
  const tasks = snapshot.tasks.filter(t => t.space_id === space?.id);
  const lists = snapshot.lists.filter(l => l.space_id === space?.id);
  const members = snapshot.members.filter(m => m.space_id === space?.id);
  const done = (taskId: string, on: string) => snapshot.completions.some(c => c.task_id === taskId && c.occurs_on === on);
  const todayTasks = tasks.filter(t => occursOn(t, today));
  const completed = todayTasks.filter(t => done(t.id, today)).length;
  const open = (next: Modal) => { setError(''); setEditing(undefined); setCopied(false); setModal(next); };
  const submit = async (event: FormEvent<HTMLFormElement>, build: (data: FormData) => Command) => {
    event.preventDefault(); const form = event.currentTarget;
    if (await act(build(new FormData(form)))) setModal(null);
  };
  const checkTask = (task: Task, on: string) => void act({ type: 'check_task', spaceId: task.space_id, id: task.id, date: on, done: !done(task.id, on) });
  const occurrence = (task: Task, on: string) => <button key={task.id} disabled={busy} className={`p-occurrence ${done(task.id, on) ? 'is-done' : ''}`} aria-pressed={done(task.id, on)} aria-label={`${done(task.id, on) ? 'Undo' : 'Complete'} ${task.title} on ${on}`} onClick={() => checkTask(task, on)}><span className="p-check">{done(task.id, on) && <Check size={12} />}</span><span>{task.title}</span></button>;

  return <div className="p-workspace">
    <aside className="p-sidebar">
      <div className="p-sidebar-heading"><span className="p-eyebrow">YOUR SPACES</span><button aria-label="Create space" onClick={() => open('space')} disabled={loading}><Plus size={17} /></button></div>
      <nav aria-label="Planner spaces" className="p-space-nav">{snapshot.spaces.map(s => <button key={s.id} className={space?.id === s.id ? 'active' : ''} onClick={() => { setSelected(s.id); setModal(null); }}>{s.shared ? <Users size={16} /> : <Lock size={16} />}<span>{s.name}</span><ChevronRight size={14} /></button>)}</nav>
      {!snapshot.spaces.length && <p className="p-muted p-small">A fresh start.<br />Create your first space.</p>}
      <button className="p-join" onClick={() => open('join')} disabled={loading}><Plus size={14} /> Join with a code</button>
      <div className="p-sidebar-bottom"><span className="p-avatar">{username.slice(0, 2).toUpperCase()}</span><span className="p-account">{username}<button onClick={() => void logout().catch(() => setError('Unable to sign out. Please try again.'))}>Sign out</button></span></div>
    </aside>
    <main className="p-main">
      <div className="p-status"><span className="p-eyebrow">{formatDate(today, { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase()}</span><button onClick={() => void refresh()} disabled={busy || loading}><span className={`p-dot ${synced ? 'synced' : ''}`} />{busy ? 'Saving…' : loading ? 'Connecting…' : synced ? 'Synced · refresh' : 'Retry sync'}</button></div>
      {error && !modal && <div className="p-error" role="alert">{error}</div>}
      {loading ? <div className="p-empty" role="status">Loading your spaces…</div> : !space ? <section className="p-empty p-first"><Layers size={42} /><span className="p-eyebrow">YOUR NEXT CHAPTER STARTS HERE</span><h1>A space for what matters.</h1><p>Make a private home for your routines, or a shared space<br className="p-desktop-break" /> for the things you do together.</p><button className="p-primary" onClick={() => open('space')}><Plus size={17} /> Create a space</button></section> : <>
        <div className="p-page-heading"><div><div className="p-eyebrow">{space.shared ? `SHARED SPACE / ${members.length} MEMBERS` : 'PRIVATE SPACE / JUST YOU'}</div><h1>{space.name}<span className="p-period">.</span></h1><p className="p-muted">A clear head starts with a little space.</p></div><button className="p-icon-button" aria-label="Space settings" onClick={() => open('settings')}><Settings2 size={19} /></button></div>
        <div className="p-summary"><div><span className="p-eyebrow">TODAY'S RHYTHM</span><strong>{completed}<span> / {todayTasks.length}</span></strong><span className="p-muted p-small">tasks complete</span></div><div className="p-progress" aria-label={`${completed} of ${todayTasks.length} tasks completed today`}><div style={{ width: `${todayTasks.length ? completed / todayTasks.length * 100 : 0}%` }} /></div><span className="p-summary-note">{todayTasks.length === 0 ? 'Room to breathe.' : completed === todayTasks.length ? 'All clear. Enjoy the space.' : 'Small steps. Real progress.'}</span></div>
        <div className="p-navigation"><nav aria-label="Planner sections">{([{ id: 'calendar', label: 'Calendar', icon: CalendarDays }, { id: 'tasks', label: 'Tasks', icon: CheckSquare }, { id: 'lists', label: 'Lists', icon: ListChecks }] as const).map(t => <button key={t.id} className={tab === t.id ? 'active' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}><t.icon size={16} />{t.label}<span>{t.id === 'lists' ? lists.length : t.id === 'tasks' ? tasks.length : ''}</span></button>)}</nav><button className="p-primary" onClick={() => open(tab === 'lists' ? 'list' : 'task')}><Plus size={16} />{tab === 'lists' ? 'New list' : 'New task'}</button></div>
        {tab === 'calendar' && <section aria-label="Task calendar">
          <div className="p-calendar-toolbar"><div className="p-date-navigation"><button aria-label={`Previous ${view}`} onClick={() => setDate(moveDate(date, view, -1))}><ArrowLeft size={16} /></button><h2>{formatDate(date, { month: 'long', year: 'numeric', ...(view === 'day' ? { day: 'numeric' } : {}) })}</h2><button aria-label={`Next ${view}`} onClick={() => setDate(moveDate(date, view, 1))}><ArrowRight size={16} /></button><button className="p-today-button" onClick={() => setDate(today)}>Today</button></div><div className="p-segment" aria-label="Calendar view">{(['day', 'week', 'month'] as const).map(v => <button key={v} aria-pressed={view === v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>{v}</button>)}</div></div>
          <div className={`p-calendar p-calendar-${view}`}>{calendarDays(date, view).map(day => {
            const due = tasks.filter(t => occursOn(t, day));
            return <article key={day} className={`p-day ${day === today ? 'is-today' : ''} ${day.slice(0, 7) !== date.slice(0, 7) ? 'outside-month' : ''}`}><button className="p-day-heading" onClick={() => { setDate(day); setView('day'); }} aria-label={`View ${day}`}><span>{formatDate(day, { weekday: 'short' })}</span><strong>{day.slice(-2)}</strong>{day === today && <i />}</button><div className="p-day-tasks">{due.map(t => occurrence(t, day))}{due.length === 0 && <span className="p-no-tasks">{view === 'day' ? 'Nothing scheduled. Make room for something good.' : '—'}</span>}</div>{view === 'day' && <button className="p-inline-add" onClick={() => open('task')}><Plus size={15} /> Add a task for this day</button>}</article>;
          })}</div>
          <div className="p-calendar-caption"><span><span className="p-dot synced" /> Today</span><span>Check off each occurrence independently · Dates follow your local calendar</span></div>
        </section>}
        {tab === 'tasks' && <section className="p-task-library"><div className="p-section-heading"><h2>Your routines & one-offs</h2><span className="p-muted p-small">Check off occurrences in Calendar</span></div>{tasks.length === 0 && <EmptyState icon={<CheckSquare />} title="Give your day some rhythm." text="Add a one-off task or a repeating routine. It will appear on your calendar." />}{tasks.map(task => <article className="p-task-row" key={task.id}><CalendarDays size={20} /><div><h3>{task.title}</h3><p>{repeatLabels[task.recurrence]} <span> / </span> From {formatDate(task.starts_on, { month: 'short', day: 'numeric', year: 'numeric' })}</p></div><button onClick={() => { setEditing(task); setModal('task'); }}>Edit</button><button aria-label={`Delete ${task.title}`} onClick={() => setConfirm({ text: `Delete “${task.title}” and all its completed occurrences?`, command: { type: 'delete_task', spaceId: space.id, id: task.id } })}><Trash2 size={16} /></button></article>)}</section>}
        {tab === 'lists' && <section className="p-list-grid">{lists.length === 0 && <EmptyState icon={<ListChecks />} title="A list for the little things." text="Groceries, packing, projects. Create a list and take it with you." />}{lists.map(list => <Checklist key={list.id} list={list} items={snapshot.items.filter(i => i.list_id === list.id)} busy={busy} act={act} remove={() => setConfirm({ text: `Delete “${list.title}” and all its items?`, command: { type: 'delete_list', spaceId: space.id, id: list.id } })} />)}</section>}
      </>}
    </main>
    {modal && <Dialog title={modal === 'space' ? 'Make some space.' : modal === 'join' ? 'Better, together.' : modal === 'task' ? editing ? 'Edit your task.' : 'One thing at a time.' : modal === 'list' ? 'Start a fresh list.' : 'Space settings.'} close={() => { if (!busy) setModal(null); }}>
      {error && <div className="p-error" role="alert">{error}</div>}
      {modal === 'space' && <form onSubmit={e => void submit(e, data => ({ type: 'create_space', name: String(data.get('name')), shared: data.get('privacy') === 'shared' }))}><label>SPACE NAME<input name="name" placeholder="Everyday life" required maxLength={160} autoFocus /></label><label>WHO IS THIS FOR?<select name="privacy"><option value="private">Just me · private</option><option value="shared">Together · shared</option></select></label><p className="p-help">Shared spaces let everyone add and complete tasks and lists. Only the owner can manage invites and members.</p><button className="p-primary" disabled={busy}>Create space <ArrowRight size={16} /></button></form>}
      {modal === 'join' && <form onSubmit={e => void submit(e, data => ({ type: 'join', code: String(data.get('code')).trim() }))}><p className="p-help">Ask the space owner for their invite code. Anyone with the code can join and edit the space.</p><label>INVITE CODE<input name="code" required placeholder="Paste your invite code" autoFocus /></label><button className="p-primary" disabled={busy}>Join space <ArrowRight size={16} /></button></form>}
      {modal === 'list' && space && <form onSubmit={e => void submit(e, data => ({ type: 'create_list', spaceId: space.id, title: String(data.get('title')) }))}><label>LIST NAME<input name="title" placeholder="Things to pick up" required maxLength={160} autoFocus /></label><button className="p-primary" disabled={busy}>Create list <Plus size={16} /></button></form>}
      {modal === 'task' && space && <form onSubmit={e => void submit(e, data => ({ type: 'save_task', spaceId: space.id, ...(editing ? { id: editing.id } : {}), title: String(data.get('title')), startsOn: String(data.get('startsOn')), recurrence: data.get('recurrence') as Task['recurrence'] }))}><label>TASK<input name="title" defaultValue={editing?.title} placeholder="Take a little time outside" required maxLength={160} autoFocus /></label><div className="p-form-grid"><label>FIRST DATE<input type="date" name="startsOn" min="1900-01-01" max="9999-12-31" defaultValue={editing?.starts_on ?? date} required /></label><label>REPEAT<select name="recurrence" defaultValue={editing?.recurrence ?? 'once'}>{Object.entries(repeatLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><p className="p-help">Monthly tasks use the last day when a month is shorter. Each occurrence has its own checkmark.{editing && ' Completed schedules are protected; create a new task to change their rhythm.'}</p><button className="p-primary" disabled={busy}>{editing ? 'Save changes' : 'Add task'} <Plus size={16} /></button></form>}
      {modal === 'settings' && space && <div className="p-settings"><p className="p-help">{space.shared ? 'Everyone in this space can manage its tasks and lists.' : 'This space is private. Only you can access its contents.'}</p>{space.invite_code && <><label>INVITE CODE<div className="p-invite"><input readOnly value={space.invite_code} aria-label="Invite code" /><button aria-label="Copy invite code" onClick={() => void navigator.clipboard.writeText(space.invite_code ?? '').then(() => setCopied(true)).catch(() => setError('Copy unavailable. Select and copy the code above.'))}><Copy size={16} /></button></div></label><p className="p-help">{copied ? 'Copied. Share this code with someone you trust.' : 'Anyone with this code can join. Replacing it disables the old code.'}</p><button disabled={busy} onClick={() => void act({ type: 'rotate_invite', spaceId: space.id }).then(() => setCopied(false))}>Replace invite code</button></>}
        <div className="p-members">{members.map(member => <div key={member.user_id}><span>{member.name}{member.user_id === userId ? ' (you)' : ''}</span>{member.user_id === space.owner_id ? <small>OWNER</small> : space.owner_id === userId && <button disabled={busy} onClick={() => { setModal(null); setConfirm({ text: `Remove ${member.name}? Replace the invite code as well if they should not rejoin.`, command: { type: 'remove_member', spaceId: space.id, userId: member.user_id } }); }}>Remove</button>}</div>)}</div>
        <button className="p-danger" onClick={() => { setModal(null); setConfirm(space.owner_id === userId ? { text: `Permanently delete “${space.name}”, its lists, tasks, and completion history for everyone?`, command: { type: 'delete_space', spaceId: space.id } } : { text: `Leave “${space.name}”? You will need an invite code to rejoin.`, command: { type: 'remove_member', spaceId: space.id, userId } }); }}>{space.owner_id === userId ? 'Delete space' : 'Leave space'}</button>
      </div>}
    </Dialog>}
    {confirm && <Dialog title="Just checking." close={() => { if (!busy) setConfirm(null); }}><p className="p-help">{confirm.text}</p>{error && <p role="alert">{error}</p>}<div className="p-dialog-actions"><button disabled={busy} onClick={() => setConfirm(null)}>Keep it</button><button className="p-primary" disabled={busy} onClick={() => void act(confirm.command).then(ok => { if (ok) setConfirm(null); })}>Confirm</button></div></Dialog>}
  </div>;
}

function Checklist({ list, items, busy, act, remove }: { list: Snapshot['lists'][number]; items: Snapshot['items']; busy: boolean; act: (command: Command) => Promise<boolean>; remove: () => void }) {
  const [text, setText] = useState('');
  return <article className="p-list"><header><ListChecks size={19} /><h2>{list.title}</h2><button onClick={remove} aria-label={`Delete list ${list.title}`}><Trash2 size={15} /></button></header><p className="p-eyebrow">{items.filter(i => i.done).length} / {items.length} COMPLETE</p><div className="p-list-items">{items.map(item => <div className="p-list-item" key={item.id}><label className={item.done ? 'is-done' : ''}><input type="checkbox" checked={item.done} disabled={busy} onChange={e => void act({ type: 'check_item', spaceId: list.space_id, id: item.id, done: e.target.checked })} /><span>{item.title}</span></label><button disabled={busy} onClick={() => void act({ type: 'delete_item', spaceId: list.space_id, id: item.id })} aria-label={`Remove ${item.title}`}><X size={14} /></button></div>)}{!items.length && <p className="p-help">Your list is a blank canvas.</p>}</div><form className="p-add-item" onSubmit={e => { e.preventDefault(); void act({ type: 'add_item', spaceId: list.space_id, listId: list.id, title: text }).then(ok => { if (ok) setText(''); }); }}><input aria-label={`Add item to ${list.title}`} placeholder="Add an item…" value={text} onChange={e => setText(e.target.value)} required maxLength={160} /><button disabled={busy || !text.trim()} aria-label={`Add item to ${list.title}`}><Plus size={18} /></button></form></article>;
}
function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <div className="p-empty">{icon}<h2>{title}</h2><p>{text}</p></div>; }
function Dialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog className="p-dialog" ref={dialog} onCancel={event => { event.preventDefault(); close(); }} aria-label={title}><header><h2>{title}</h2><button onClick={close} aria-label="Close dialog"><X size={20} /></button></header>{children}</dialog>;
}

function ColorWheel({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const channels = [1, 3, 5].map(offset => parseInt(value.slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels; const high = Math.max(...channels); const low = Math.min(...channels); const delta = high - low;
  const lightness = (high + low) * 50;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(high + low - 1)) * 100;
  const hue = delta === 0 ? 0 : ((high === red ? (green - blue) / delta : high === green ? (blue - red) / delta + 2 : (red - green) / delta + 4) * 60 + 360) % 360;
  const update = (h: number, s: number, l: number) => {
    const a = s / 100 * Math.min(l / 100, 1 - l / 100);
    const channel = (n: number) => { const k = (n + h / 30) % 12; return Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); };
    onChange(`#${channel(0)}${channel(8)}${channel(4)}`);
  };
  return <div className="p-color-controls"><span className="p-eyebrow">YOUR ONE COLOR</span><div className="p-color-wheel" role="img" aria-label="Accent color wheel; keyboard controls below" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); const rect = e.currentTarget.getBoundingClientRect(); const x = e.clientX - rect.left - rect.width / 2; const y = e.clientY - rect.top - rect.height / 2; update((Math.atan2(y, x) * 180 / Math.PI + 90 + 360) % 360, Math.min(100, Math.hypot(x, y) / (rect.width / 2) * 100), lightness); }} onPointerMove={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) return; const rect = e.currentTarget.getBoundingClientRect(); const x = e.clientX - rect.left - rect.width / 2; const y = e.clientY - rect.top - rect.height / 2; update((Math.atan2(y, x) * 180 / Math.PI + 90 + 360) % 360, Math.min(100, Math.hypot(x, y) / (rect.width / 2) * 100), lightness); }} />
    <label>Hue<input type="range" min="0" max="359" value={hue} onChange={e => update(Number(e.target.value), saturation, lightness)} /></label><label>Saturation<input type="range" min="0" max="100" value={saturation} onChange={e => update(hue, Number(e.target.value), lightness)} /></label><label>Lightness<input type="range" min="0" max="100" value={lightness} onChange={e => update(hue, saturation, Number(e.target.value))} /></label><label>Custom color<input type="color" value={value} onChange={e => onChange(e.target.value)} /></label><code>{value.toUpperCase()}</code></div>;
}
