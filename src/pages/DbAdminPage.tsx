import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Ban as BanIcon,
  BookOpen,
  Database,
  KeyRound,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  Users
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  deleteDbAdminContent,
  getDbAdminSnapshot,
  setDbAdminCharacterStatus,
  setDbAdminGuildLeader,
  setDbAdminGuildStatus,
  setDbAdminUserBan,
  setDbAdminUserRoles,
  verifyDbAdminPassword,
  type DbAdminDeletableEntity,
  type DbAdminCharacter,
  type DbAdminGuild,
  type DbAdminSnapshot,
  type DbAdminUser
} from '../services/dbAdminService';

const DbAdminPage = () => {
  const [password, setPassword] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [snapshot, setSnapshot] = useState<DbAdminSnapshot | null>(null);
  const [query, setQuery] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = useMemo(() => {
    if (!snapshot || !normalizedQuery) return snapshot;
    const matches = (...values: Array<string | number>) => values.some(value => String(value).toLocaleLowerCase().includes(normalizedQuery));
    return {
      users: snapshot.users.filter(user => matches(user.username, user.email)),
      characters: snapshot.characters.filter(character => matches(character.name, character.className, character.ownerName, character.level, character.status)),
      guilds: snapshot.guilds.filter(guild => matches(guild.name, guild.leaderName, guild.status)),
      loreEntries: snapshot.loreEntries.filter(entry => matches(entry.title, entry.authorName, entry.status))
    };
  }, [normalizedQuery, snapshot]);

  const loadSnapshot = async () => {
    const nextSnapshot = await getDbAdminSnapshot(password);
    setSnapshot(nextSnapshot);
  };

  const handleUnlock = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || busyKey) return;
    setBusyKey('unlock');
    setError(null);
    setMessage(null);
    try {
      await verifyDbAdminPassword(password);
      await loadSnapshot();
      setIsUnlocked(true);
    } catch (cause) {
      setError(getErrorMessage(cause, 'Unable to unlock database administration.'));
    } finally {
      setBusyKey(null);
    }
  };

  const refresh = async () => {
    setBusyKey('refresh');
    setError(null);
    try {
      await loadSnapshot();
      setMessage('Database snapshot refreshed.');
    } catch (cause) {
      setError(getErrorMessage(cause, 'Unable to refresh the database snapshot.'));
    } finally {
      setBusyKey(null);
    }
  };

  const updateRoles = async (user: DbAdminUser, changes: Partial<Pick<DbAdminUser, 'isAdmin' | 'isLoremaster'>>) => {
    setBusyKey(`roles-${user.userId}`);
    setError(null);
    setMessage(null);
    try {
      await setDbAdminUserRoles(password, user.userId, {
        isAdmin: changes.isAdmin ?? user.isAdmin,
        isLoremaster: changes.isLoremaster ?? user.isLoremaster
      });
      await loadSnapshot();
      setMessage(`${user.username}'s roles were updated.`);
    } catch (cause) {
      setError(getErrorMessage(cause, 'Unable to update user roles.'));
    } finally {
      setBusyKey(null);
    }
  };

  const updateBan = async (user: DbAdminUser) => {
    const verb = user.isBanned ? 'unban' : 'ban';
    if (!window.confirm(`Are you sure you want to ${verb} ${user.username}?`)) return;
    setBusyKey(`ban-${user.userId}`);
    setError(null);
    setMessage(null);
    try {
      await setDbAdminUserBan(password, user.userId, !user.isBanned);
      await loadSnapshot();
      setMessage(`${user.username} was ${user.isBanned ? 'unbanned' : 'banned'}.`);
    } catch (cause) {
      setError(getErrorMessage(cause, `Unable to ${verb} this user.`));
    } finally {
      setBusyKey(null);
    }
  };

  const updateCharacterStatus = async (character: DbAdminCharacter, status: DbAdminCharacter['status']) => {
    if (status !== 'active') {
      const consequence = status === 'dead'
        ? 'This will remove the character from active play and publish a read-only memorial profile.'
        : 'This will remove the character from guild rosters and any game applications.';
      if (!window.confirm(`Set ${character.name} to ${status}? ${consequence}`)) return;
    }
    setBusyKey(`status-${character.id}`);
    setError(null);
    setMessage(null);
    try {
      await setDbAdminCharacterStatus(password, character.id, status);
      await loadSnapshot();
      setMessage(`${character.name} is now ${status}.`);
    } catch (cause) {
      setError(getErrorMessage(cause, `Unable to change ${character.name}'s status.`));
    } finally {
      setBusyKey(null);
    }
  };

  const updateGuildStatus = async (guild: DbAdminGuild, status: DbAdminGuild['status']) => {
    if (status === 'Disbanded' && !window.confirm(`Disband ${guild.name}? The guild will become a locked, display-only record.`)) return;
    setBusyKey(`guild-status-${guild.id}`);
    setError(null);
    setMessage(null);
    try {
      await setDbAdminGuildStatus(password, guild.id, status);
      await loadSnapshot();
      setMessage(`${guild.name} is now ${status.toLowerCase()}.`);
    } catch (cause) {
      setError(getErrorMessage(cause, `Unable to change ${guild.name}'s status.`));
    } finally {
      setBusyKey(null);
    }
  };

  const updateGuildLeader = async (guild: DbAdminGuild, membershipId: string) => {
    if (!membershipId) return;
    const candidate = guild.leaderCandidates.find(item => item.membershipId === membershipId);
    if (!candidate || !window.confirm(`Make ${candidate.characterName} the leader of ${guild.name}?`)) return;
    setBusyKey(`guild-leader-${guild.id}`);
    setError(null);
    setMessage(null);
    try {
      await setDbAdminGuildLeader(password, guild.id, membershipId);
      await loadSnapshot();
      setMessage(`${candidate.characterName} now leads ${guild.name}.`);
    } catch (cause) {
      setError(getErrorMessage(cause, `Unable to change ${guild.name}'s leader.`));
    } finally {
      setBusyKey(null);
    }
  };

  const deleteContent = async (entityType: DbAdminDeletableEntity, id: string, name: string) => {
    if (!window.confirm(`Permanently delete ${name}? This cannot be undone.`)) return;
    setBusyKey(`delete-${entityType}-${id}`);
    setError(null);
    setMessage(null);
    try {
      await deleteDbAdminContent(password, entityType, id);
      await loadSnapshot();
      setMessage(`${name} was deleted.`);
    } catch (cause) {
      setError(getErrorMessage(cause, `Unable to delete ${name}.`));
    } finally {
      setBusyKey(null);
    }
  };

  if (!isUnlocked || !snapshot || !filtered) {
    return (
      <main className="min-h-[70vh] px-4 py-16 sm:px-6">
        <section className="mx-auto max-w-md rounded-2xl border border-fantasy-700/40 bg-midnight-950/90 p-7 shadow-2xl">
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-yellow-400/10 text-yellow-300"><KeyRound className="h-7 w-7" /></div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-yellow-300">Direct access only</p>
          <h1 className="mt-2 font-fantasy text-4xl font-bold text-white">Database Admin</h1>
          <p className="mt-3 text-sm leading-6 text-gray-300">Enter the database administration password. There is no username for this panel.</p>
          <form className="mt-7 grid gap-4" onSubmit={event => void handleUnlock(event)}>
            <label className="grid gap-2 text-sm font-bold text-gray-200">
              Password
              <input
                autoFocus
                autoComplete="current-password"
                className="rounded-lg border border-fantasy-700/50 bg-midnight-900 px-4 py-3 text-white outline-none focus:border-yellow-400"
                onChange={event => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </label>
            <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-yellow-400 px-4 py-3 font-bold text-midnight-950 hover:bg-yellow-300 disabled:opacity-50" disabled={!password || Boolean(busyKey)} type="submit">
              {busyKey === 'unlock' ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
              Unlock panel
            </button>
          </form>
          {error && <p className="mt-4 rounded-lg border border-red-400/30 bg-red-950/40 p-3 text-sm text-red-200">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-2xl border border-fantasy-700/40 bg-midnight-950/80 p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3"><Database className="h-8 w-8 text-yellow-300" /><h1 className="font-fantasy text-4xl font-bold text-white">Database Admin</h1></div>
              <p className="mt-2 text-sm text-gray-300">Manage account roles and bans, or permanently remove site content.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="flex min-w-64 items-center gap-2 rounded-lg border border-fantasy-700/50 bg-midnight-900 px-3"><Search className="h-4 w-4 text-gray-400" /><input className="w-full bg-transparent py-2.5 text-sm text-white outline-none" onChange={event => setQuery(event.target.value)} placeholder="Search all records" value={query} /></label>
              <button className="inline-flex items-center justify-center gap-2 rounded-lg border border-fantasy-700/50 px-4 py-2.5 text-sm font-bold text-gray-200 hover:border-yellow-400 hover:text-yellow-300 disabled:opacity-50" disabled={Boolean(busyKey)} onClick={() => void refresh()} type="button"><RefreshCw className={`h-4 w-4${busyKey === 'refresh' ? ' animate-spin' : ''}`} />Refresh</button>
            </div>
          </div>
        </header>

        {(error || message) && <div className={`mt-5 rounded-lg border p-4 text-sm ${error ? 'border-red-400/30 bg-red-950/40 text-red-200' : 'border-emerald-400/30 bg-emerald-950/40 text-emerald-200'}`}>{error || message}</div>}

        <AdminSection icon={Users} title={`Users (${filtered.users.length})`}>
          {filtered.users.map(user => (
            <article className={`rounded-xl border p-4 ${user.isBanned ? 'border-red-500/40 bg-red-950/20' : 'border-fantasy-700/30 bg-midnight-950/60'}`} key={user.userId}>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 items-center gap-3"><img alt="" className="h-12 w-12 rounded-full object-cover" src={user.avatar || '/npc-placeholder.png'} /><div className="min-w-0"><h3 className="truncate font-bold text-white">{user.username}</h3><p className="truncate text-xs text-gray-400">{user.email}</p>{user.isBanned && <p className="mt-1 text-xs font-bold text-red-300">Banned{user.bannedAt ? ` ${new Date(user.bannedAt).toLocaleDateString()}` : ''}</p>}</div></div>
                <div className="flex flex-wrap gap-2">
                  <RoleButton active={user.isAdmin} disabled={Boolean(busyKey)} label="Admin" onClick={() => void updateRoles(user, { isAdmin: !user.isAdmin })} />
                  <RoleButton active={user.isLoremaster} disabled={Boolean(busyKey)} label="Loremaster" onClick={() => void updateRoles(user, { isLoremaster: !user.isLoremaster })} />
                  <button className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-50 ${user.isBanned ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-red-700 text-white hover:bg-red-600'}`} disabled={Boolean(busyKey)} onClick={() => void updateBan(user)} type="button">{busyKey === `ban-${user.userId}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <BanIcon className="h-4 w-4" />}{user.isBanned ? 'Unban' : 'Ban'}</button>
                </div>
              </div>
            </article>
          ))}
          {filtered.users.length === 0 && <EmptyRecords />}
        </AdminSection>

        <AdminSection icon={UserCog} title={`Characters (${filtered.characters.length})`}>
          {filtered.characters.map(character => (
            <article className="flex flex-col gap-3 rounded-xl border border-fantasy-700/30 bg-midnight-950/60 p-4 lg:flex-row lg:items-center lg:justify-between" key={character.id}>
              <div className="min-w-0"><h3 className="truncate font-bold text-white">{character.name}</h3><p className="mt-1 truncate text-xs text-gray-400">{character.ownerName} · Level {character.level} {character.className}</p></div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400">
                  Status
                  <select className="rounded-lg border border-fantasy-700/50 bg-midnight-900 px-3 py-2 text-sm font-bold capitalize text-white outline-none focus:border-yellow-400 disabled:opacity-50" disabled={Boolean(busyKey)} onChange={event => void updateCharacterStatus(character, event.target.value as DbAdminCharacter['status'])} value={character.status}>
                    <option value="active">Active</option>
                    <option value="retired">Retired</option>
                    <option value="dead">Dead</option>
                  </select>
                </label>
                <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-700 px-3 py-2 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50" disabled={Boolean(busyKey)} onClick={() => void deleteContent('character', character.id, character.name)} type="button">{busyKey === `delete-character-${character.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Delete</button>
              </div>
            </article>
          ))}
          {filtered.characters.length === 0 && <EmptyRecords />}
        </AdminSection>

        <AdminSection icon={ShieldCheck} title={`Guilds (${filtered.guilds.length})`}>
          {filtered.guilds.map(guild => (
            <article className={`rounded-xl border p-4 ${guild.status === 'Disbanded' ? 'border-gray-600/50 bg-gray-950/40' : 'border-fantasy-700/30 bg-midnight-950/60'}`} key={guild.id}>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0"><h3 className="truncate font-bold text-white">{guild.name}</h3><p className="mt-1 truncate text-xs text-gray-400">Led by {guild.leaderName} · {guild.memberCount} members · {guild.status}</p></div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400">Status<select className="rounded-lg border border-fantasy-700/50 bg-midnight-900 px-3 py-2 text-sm font-bold text-white outline-none focus:border-yellow-400 disabled:opacity-50" disabled={Boolean(busyKey)} onChange={event => void updateGuildStatus(guild, event.target.value as DbAdminGuild['status'])} value={guild.status}><option value="Recruiting">Recruiting</option><option value="Active">Active</option><option value="Disbanded">Disbanded</option></select></label>
                  <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400">Leader<select className="max-w-64 rounded-lg border border-fantasy-700/50 bg-midnight-900 px-3 py-2 text-sm font-bold normal-case text-white outline-none focus:border-yellow-400 disabled:opacity-50" disabled={Boolean(busyKey) || guild.status === 'Disbanded'} onChange={event => void updateGuildLeader(guild, event.target.value)} value=""><option value="">{guild.leaderName}</option>{guild.leaderCandidates.map(candidate => <option key={candidate.membershipId} value={candidate.membershipId}>{candidate.characterName} ({candidate.userName})</option>)}</select></label>
                  <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-700 px-3 py-2 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50" disabled={Boolean(busyKey)} onClick={() => void deleteContent('guild', guild.id, guild.name)} type="button">{busyKey === `delete-guild-${guild.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Delete</button>
                </div>
              </div>
            </article>
          ))}
          {filtered.guilds.length === 0 && <EmptyRecords />}
        </AdminSection>

        <AdminSection icon={BookOpen} title={`Lore Posts (${filtered.loreEntries.length})`}>
          {filtered.loreEntries.map(entry => <DeleteRow busy={busyKey === `delete-lore-${entry.id}`} disabled={Boolean(busyKey)} key={entry.id} name={entry.title} onDelete={() => void deleteContent('lore', entry.id, entry.title)} secondary={`${entry.status === 'published' ? 'Published' : 'Draft'} · ${entry.authorName}`} />)}
          {filtered.loreEntries.length === 0 && <EmptyRecords />}
        </AdminSection>
      </div>
    </main>
  );
};

const AdminSection = ({ children, icon: Icon, title }: { children: ReactNode; icon: LucideIcon; title: string }) => (
  <section className="mt-7 rounded-2xl border border-fantasy-700/30 bg-fantasy-900/20 p-5 sm:p-6">
    <div className="mb-5 flex items-center gap-3 border-b border-fantasy-700/30 pb-4"><Icon className="h-6 w-6 text-yellow-300" /><h2 className="font-fantasy text-2xl font-bold text-white">{title}</h2></div>
    <div className="grid gap-3">{children}</div>
  </section>
);

const RoleButton = ({ active, disabled, label, onClick }: { active: boolean; disabled: boolean; label: string; onClick: () => void }) => (
  <button className={`rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-50 ${active ? 'border-yellow-400/50 bg-yellow-400/15 text-yellow-200' : 'border-fantasy-700/50 text-gray-300 hover:border-yellow-400/50'}`} disabled={disabled} onClick={onClick} type="button">{label}: {active ? 'On' : 'Off'}</button>
);

const DeleteRow = ({ busy, disabled, name, onDelete, secondary }: { busy: boolean; disabled: boolean; name: string; onDelete: () => void; secondary: string }) => (
  <article className="flex flex-col gap-3 rounded-xl border border-fantasy-700/30 bg-midnight-950/60 p-4 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0"><h3 className="truncate font-bold text-white">{name}</h3><p className="mt-1 truncate text-xs text-gray-400">{secondary}</p></div>
    <button className="inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-lg bg-red-700 px-3 py-2 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50" disabled={disabled} onClick={onDelete} type="button">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Delete</button>
  </article>
);

const EmptyRecords = () => <p className="py-6 text-center text-sm text-gray-400">No matching records.</p>;

function getErrorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

export default DbAdminPage;
