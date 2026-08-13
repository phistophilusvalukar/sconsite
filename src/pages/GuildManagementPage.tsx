import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Crown, Loader2, Save, ShieldCheck, Trash2, UserCheck, UserCog, Users } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { DATABASE_TABLES } from '../config/database';
import { useAuth } from '../context/useAuth';
import DynamicCharacterPortrait from '../features/characters/DynamicCharacterPortrait';
import { defaultGuildManagementPermissions } from '../features/guilds/guildCustomization';
import RichTextEditor from '../features/guilds/RichTextEditor';
import { sanitizeRichHtml } from '../features/guilds/richText';
import { useSupabaseRealtime } from '../hooks/useSupabaseRealtime';
import GuildService from '../services/guildService';
import type { Guild, GuildManagementPermissions, GuildMembership } from '../types/database';
import { DEFAULT_NPC_PLACEHOLDER, normalizeFoundryAvatar } from '../utils/foundryCharacter';
import './guildManagement.css';

type EditableRank = Exclude<GuildMembership['roleCategory'], 'Leader'>;
type MemberDraft = { roleCategory: EditableRank; roleTitle: string; permissions: GuildManagementPermissions };

const PERMISSIONS: Array<{ key: keyof GuildManagementPermissions; label: string }> = [
  { key: 'kickMembers', label: 'Kick lower-ranked members' },
  { key: 'setMessageBoard', label: 'Set the message board' },
  { key: 'acceptApplications', label: 'Accept applications & invitations' },
  { key: 'customizeGuild', label: 'Customize the guild page' }
];
const RANK_PRIORITY: Record<GuildMembership['roleCategory'], number> = {
  Leader: 0,
  Subleader: 1,
  Officer: 2,
  Member: 3,
  Ally: 4
};

const portrait = (membership?: GuildMembership) =>
  normalizeFoundryAvatar(membership?.character?.stats?.avatar) || DEFAULT_NPC_PLACEHOLDER;

const hasAnyPermission = (permissions: GuildManagementPermissions) => Object.values(permissions).some(Boolean);

const GuildManagementPage: React.FC = () => {
  const { guildId } = useParams<{ guildId: string }>();
  const { isAuthenticated, user } = useAuth();
  const guildService = useMemo(() => GuildService.getInstance(), []);
  const [guild, setGuild] = useState<Guild | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [memberDrafts, setMemberDrafts] = useState<Record<string, MemberDraft>>({});
  const [busyId, setBusyId] = useState('');
  const [transferMembershipId, setTransferMembershipId] = useState('');
  const [boardHtml, setBoardHtml] = useState('');

  const loadGuild = useCallback(async () => {
    if (!guildId) return;
    const response = await guildService.getGuild(guildId);
    if (response.success && response.data) {
      setGuild(response.data);
      setBoardHtml(response.data.messageBoardHtml);
      setLoadError('');
    } else setLoadError(response.error || 'Guild not found.');
    setIsLoading(false);
  }, [guildId, guildService]);

  useEffect(() => { void loadGuild(); }, [loadGuild]);
  useSupabaseRealtime({
    channelName: `guild-management-${guildId || 'unknown'}-${user?.id || 'anonymous'}`,
    tables: [DATABASE_TABLES.GUILDS, DATABASE_TABLES.GUILD_MEMBERSHIPS, DATABASE_TABLES.GUILD_APPLICATIONS],
    onChange: loadGuild,
    enabled: isAuthenticated && Boolean(guildId && user?.id)
  });

  const roster = useMemo(() => (guild?.memberships || []).filter(member => member.membershipStatus === 'Active'), [guild?.memberships]);
  const isLeader = Boolean(guild && user?.id === guild.leaderId);
  const actorPermissions = useMemo<GuildManagementPermissions>(() => {
    if (isLeader) return { kickMembers: true, setMessageBoard: true, acceptApplications: true, customizeGuild: true };
    return roster.filter(member => member.userId === user?.id).reduce<GuildManagementPermissions>((combined, member) => ({
      kickMembers: combined.kickMembers || member.permissions.kickMembers,
      setMessageBoard: combined.setMessageBoard || member.permissions.setMessageBoard,
      acceptApplications: combined.acceptApplications || member.permissions.acceptApplications,
      customizeGuild: combined.customizeGuild || member.permissions.customizeGuild
    }), { ...defaultGuildManagementPermissions });
  }, [isLeader, roster, user?.id]);
  const canAccess = isLeader || hasAnyPermission(actorPermissions);
  const actorRank = isLeader ? RANK_PRIORITY.Leader : Math.min(
    ...roster.filter(member => member.userId === user?.id).map(member => RANK_PRIORITY[member.roleCategory]),
    Number.POSITIVE_INFINITY
  );
  const pendingApplications = (guild?.applications || []).filter(application => application.status === 'Pending');
  const successor = roster.find(member => member.characterId === guild?.nextLeaderCharacterId);

  const draftFor = (member: GuildMembership): MemberDraft => member._id && memberDrafts[member._id]
    ? memberDrafts[member._id]
    : {
      roleCategory: member.roleCategory === 'Leader' ? 'Subleader' : member.roleCategory,
      roleTitle: member.roleTitle || member.roleCategory,
      permissions: { ...member.permissions }
    };
  const updateMemberDraft = (member: GuildMembership, update: Partial<MemberDraft>) => {
    if (!member._id) return;
    setMemberDrafts(current => ({ ...current, [member._id!]: { ...draftFor(member), ...update } }));
  };

  const saveMember = async (member: GuildMembership) => {
    if (!guild?._id || !member._id) return;
    const draft = draftFor(member);
    setBusyId(member._id);
    const response = await guildService.updateMemberManagement(guild._id, member._id, draft.roleCategory, draft.roleTitle, draft.permissions);
    setBusyId(''); setMessage(response.message || response.error || 'Roster updated.');
    if (response.success) { setMemberDrafts({}); await loadGuild(); }
  };
  const kickMember = async (member: GuildMembership) => {
    if (!guild?._id || !member._id || !window.confirm(`Remove ${member.character?.name || 'this member'} from the guild?`)) return;
    setBusyId(member._id);
    const response = await guildService.kickMember(guild._id, member._id);
    setBusyId(''); setMessage(response.message || response.error || 'Roster updated.');
    if (response.success) await loadGuild();
  };
  const decideApplication = async (applicationId: string | undefined, decision: 'accept' | 'reject') => {
    if (!guild?._id || !applicationId) return;
    setBusyId(applicationId);
    const response = await guildService.decideApplication(guild._id, applicationId, decision);
    setBusyId(''); setMessage(response.message || response.error || 'Applications updated.');
    if (response.success) await loadGuild();
  };
  const toggleAutoLeader = async () => {
    if (!guild?._id) return;
    setBusyId('auto-leader');
    const response = await guildService.setAutoLeader(guild._id, !guild.autoLeaderEnabled);
    setBusyId(''); setMessage(response.message || response.error || 'Leadership settings updated.');
    if (response.success) await loadGuild();
  };
  const transferLeadership = async () => {
    if (!guild?._id || !transferMembershipId || !window.confirm('Transfer guild leadership now? You will become a subleader.')) return;
    setBusyId('transfer');
    const response = await guildService.transferLeadership(guild._id, transferMembershipId);
    setBusyId(''); setMessage(response.message || response.error || 'Leadership updated.');
    if (response.success) await loadGuild();
  };
  const saveBoard = async () => {
    if (!guild?._id) return;
    setBusyId('board');
    const response = await guildService.updateGuildMessageBoard(guild._id, sanitizeRichHtml(boardHtml));
    setBusyId(''); setMessage(response.message || response.error || 'Message board updated.');
    if (response.success) await loadGuild();
  };

  if (!isAuthenticated) return <main className="guild-management-state"><ShieldCheck /><h1>Sign in to manage a guild.</h1></main>;
  if (isLoading) return <main className="guild-management-state"><Loader2 className="guild-spin" /><span>Opening the guild ledger…</span></main>;
  if (!guild || loadError) return <main className="guild-management-state"><ShieldCheck /><h1>{loadError || 'Guild not found.'}</h1></main>;
  if (!canAccess) return <main className="guild-management-state"><ShieldCheck /><h1>You do not have guild management privileges.</h1><Link to={`/guilds/${guild._id}`}>Return to guild page</Link></main>;

  return (
    <main className="guild-management-page">
      <div className="guild-management-shell">
        <nav><Link to={`/guilds/${guild._id}`}><ArrowLeft size={16} /> Public guild page</Link>{actorPermissions.customizeGuild && <Link to={`/guilds/${guild._id}?customize=1`}>Customize appearance</Link>}</nav>
        <header><div><p>Guild administration</p><h1>{guild.name}</h1><span>Private controls for ranks, privileges, applications, and succession.</span></div><ShieldCheck /></header>
        {message && <div className="guild-management-message">{message}</div>}

        {isLeader && <section className="guild-management-section guild-leadership-settings">
          <div className="guild-management-section-heading"><div><p>Continuity</p><h2>Guild leadership</h2></div><Crown /></div>
          <label className="guild-management-switch"><input type="checkbox" checked={guild.autoLeaderEnabled} onChange={() => void toggleAutoLeader()} disabled={busyId === 'auto-leader'} /><span><strong>Automatic leader succession</strong><small>After one month without a leader check-in, leadership follows recent activity through Subleaders, Officers, Members, then Allies.</small></span></label>
          {guild.autoLeaderEnabled && <div className="guild-successor-note"><UserCheck />{guild.autoLeaderAwaitingCheckin ? 'No recent eligible successor. The next guild member to check in becomes leader.' : successor ? `${successor.character?.name || 'An unnamed member'} is currently next in line.` : 'A successor will appear after eligible members check in.'}</div>}
          <div className="guild-transfer-row"><label><span>Pass leadership now</span><select value={transferMembershipId} onChange={event => setTransferMembershipId(event.target.value)}><option value="">Choose an active member</option>{roster.filter(member => member.roleCategory !== 'Leader' && member.characterId).map(member => <option value={member._id} key={member._id}>{member.character?.name || 'Unnamed'} — {member.roleTitle || member.roleCategory}</option>)}</select></label><button type="button" onClick={() => void transferLeadership()} disabled={!transferMembershipId || busyId === 'transfer'}>{busyId === 'transfer' ? <Loader2 className="guild-spin" /> : <Crown />} Transfer</button></div>
        </section>}

        <section className="guild-management-section">
          <div className="guild-management-section-heading"><div><p>Private roster controls</p><h2>Members and ranks</h2></div><Users /></div>
          <div className="guild-management-roster">
            {roster.map(member => {
              const draft = draftFor(member);
              const canDelegate = draft.roleCategory === 'Subleader' || draft.roleCategory === 'Officer';
              const canRemove = actorPermissions.kickMembers && actorRank < RANK_PRIORITY[member.roleCategory];
              return <article key={member._id}>
                <DynamicCharacterPortrait character={member.character} fallbackSrc={portrait(member)} alt="" className="guild-management-portrait" motion="hover" />
                <div className="guild-management-member-copy"><strong>{member.character?.name || 'Unknown character'}</strong><span>{member.roleTitle || guild.roleLabels[member.roleCategory]}</span><small>{member.character ? `Level ${member.character.level} ${member.character.class}` : member.userId}</small></div>
                {member.roleCategory === 'Leader' ? <div className="guild-leader-lock"><Crown /> Full permissions</div> : <>
                  {isLeader && <div className="guild-management-rank-fields"><select value={draft.roleCategory} onChange={event => updateMemberDraft(member, { roleCategory: event.target.value as EditableRank, permissions: ['Subleader','Officer'].includes(event.target.value) ? draft.permissions : { ...defaultGuildManagementPermissions } })}><option value="Subleader">Subleader</option><option value="Officer">Officer</option><option value="Member">Member</option><option value="Ally">Ally</option></select><input value={draft.roleTitle} maxLength={80} onChange={event => updateMemberDraft(member, { roleTitle: event.target.value })} aria-label={`Title for ${member.character?.name || 'member'}`} /></div>}
                  {isLeader && <div className={`guild-management-permissions${canDelegate ? '' : ' is-disabled'}`}>{PERMISSIONS.map(permission => <label key={permission.key}><input type="checkbox" checked={canDelegate && draft.permissions[permission.key]} disabled={!canDelegate} onChange={event => updateMemberDraft(member, { permissions: { ...draft.permissions, [permission.key]: event.target.checked } })} />{permission.label}</label>)}</div>}
                  <div className="guild-management-member-actions">{isLeader && <button type="button" onClick={() => void saveMember(member)} disabled={busyId === member._id}><Save /> Save</button>}{canRemove && <button type="button" className="is-danger" onClick={() => void kickMember(member)} disabled={busyId === member._id}><Trash2 /> Remove</button>}</div>
                </>}
              </article>;
            })}
          </div>
        </section>

        {actorPermissions.acceptApplications && <section className="guild-management-section">
          <div className="guild-management-section-heading"><div><p>Recruitment desk</p><h2>Pending applications</h2></div><UserCog /></div>
          <div className="guild-management-applications">{pendingApplications.map(application => <article key={application._id}><div><strong>{application.character?.name || 'Unknown character'}</strong><span>Requests {application.requestedRoleCategory}</span>{application.message && <p>{application.message}</p>}</div><div><button type="button" onClick={() => void decideApplication(application._id, 'accept')} disabled={busyId === application._id}>Accept</button><button type="button" onClick={() => void decideApplication(application._id, 'reject')} disabled={busyId === application._id}>Decline</button></div></article>)}{pendingApplications.length === 0 && <p className="guild-management-empty">No applications await review.</p>}</div>
        </section>}

        {actorPermissions.setMessageBoard && <section className="guild-management-section">
          <div className="guild-management-section-heading"><div><p>Public announcement</p><h2>Message board</h2></div><Save /></div>
          <RichTextEditor label="Pinned message" value={boardHtml} onChange={setBoardHtml} placeholder="Pin a message for members and visitors…" />
          <button type="button" className="guild-management-primary" onClick={() => void saveBoard()} disabled={busyId === 'board'}>{busyId === 'board' ? <Loader2 className="guild-spin" /> : <Save />} Publish message</button>
        </section>}
      </div>
    </main>
  );
};

export default GuildManagementPage;
