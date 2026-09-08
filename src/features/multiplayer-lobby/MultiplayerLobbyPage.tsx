import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  Check,
  ChevronRight,
  Clock3,
  Crown,
  Loader2,
  LogOut,
  ShieldPlus,
  Sparkles,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { DATABASE_TABLES } from '../../config/database';
import { useAuth } from '../../context/useAuth';
import { useSupabaseRealtime } from '../../hooks/useSupabaseRealtime';
import {
  getPlayerColor,
  PLAYER_COLORS,
  type LobbyMode,
  type MultiplayerLobbyState,
  type PlayerColor,
  type TeamInvitation,
} from './multiplayerLobby';
import { multiplayerLobbyService } from './multiplayerLobbyService';
import './multiplayerLobby.css';

const EMPTY_STATE: MultiplayerLobbyState = {
  self: null,
  waitingPlayers: [],
  team: null,
  incomingInvitations: [],
  pendingInviteeIds: [],
  recentInvitationUpdates: [],
};

export default function MultiplayerLobbyPage() {
  const { user } = useAuth();
  const [state, setState] = useState<MultiplayerLobbyState>(EMPTY_STATE);
  const [selectedColor, setSelectedColor] = useState<PlayerColor>('azure');
  const [isLoading, setIsLoading] = useState(true);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const seenUpdates = useRef(new Set<string>());

  const loadState = useCallback(async () => {
    try {
      const nextState = await multiplayerLobbyService.getState();
      setState(nextState);
      if (nextState.self) setSelectedColor(nextState.self.color);

      nextState.recentInvitationUpdates.forEach(update => {
        if (seenUpdates.current.has(update.id)) return;
        seenUpdates.current.add(update.id);
        setNotice(
          update.status === 'declined'
            ? `${update.inviteeName} declined the team invitation.`
            : `${update.inviteeName} joined your team.`,
        );
      });
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The lobby could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  useEffect(() => {
    if (!state.self) return;
    const timer = window.setInterval(() => {
      void multiplayerLobbyService.heartbeat().catch(() => undefined);
    }, 25_000);
    return () => window.clearInterval(timer);
  }, [state.self]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useSupabaseRealtime({
    channelName: `multiplayer-lobby-${user?.id ?? 'anonymous'}`,
    tables: [
      DATABASE_TABLES.MULTIPLAYER_LOBBY_PLAYERS,
      DATABASE_TABLES.MULTIPLAYER_TEAMS,
      DATABASE_TABLES.MULTIPLAYER_TEAM_MEMBERS,
      DATABASE_TABLES.MULTIPLAYER_TEAM_INVITATIONS,
    ],
    onChange: loadState,
    enabled: Boolean(user?.id),
    debounceMs: 100,
  });

  const mutate = async (actionName: string, action: () => Promise<unknown>, successNotice?: string) => {
    setActiveAction(actionName);
    setError(null);
    try {
      await action();
      if (successNotice) setNotice(successNotice);
      await loadState();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The lobby could not complete that action.');
    } finally {
      setActiveAction(null);
    }
  };

  const enter = (mode: LobbyMode) => mutate(`enter-${mode}`, () => multiplayerLobbyService.enter(mode, selectedColor));
  const changeColor = (color: PlayerColor) => {
    setSelectedColor(color);
    if (state.self) void mutate(`color-${color}`, () => multiplayerLobbyService.setColor(color));
  };
  const invitation = state.incomingInvitations[0];

  if (isLoading) {
    return <div className="ml-loading"><Loader2 className="ml-spin" /><span>Opening multiplayer lobby…</span></div>;
  }

  return (
    <main className="ml-page">
      <div className="ml-ambient ml-ambient-one" />
      <div className="ml-ambient ml-ambient-two" />

      <section className="ml-shell">
        <header className="ml-header">
          <div>
            <p className="ml-eyebrow"><Zap /> Live multiplayer staging</p>
            <h1>Gather your party.</h1>
            <p>Choose your banner color, wait for an invitation, or assemble a team of up to eight players.</p>
          </div>
          {state.self && (
            <button className="ml-quiet-button" type="button" onClick={() => void mutate('leave', () => multiplayerLobbyService.leave())} disabled={activeAction !== null}>
              <LogOut /> Leave lobby
            </button>
          )}
        </header>

        {error && <div className="ml-alert ml-alert-error" role="alert"><X /><span>{error}</span></div>}
        {notice && <div className="ml-toast" role="status"><Check /><span>{notice}</span></div>}

        {!state.self && (
          <LobbyEntrance
            color={selectedColor}
            activeAction={activeAction}
            onColorChange={changeColor}
            onEnter={enter}
          />
        )}

        {state.self?.mode === 'waiting' && (
          <WaitingRoom
            state={state}
            color={selectedColor}
            activeAction={activeAction}
            onColorChange={changeColor}
            onEnter={enter}
          />
        )}

        {state.self?.mode === 'solo' && (
          <SoloQueue color={selectedColor} activeAction={activeAction} onColorChange={changeColor} onEnter={enter} />
        )}

        {state.self?.mode === 'team' && state.team && (
          <TeamBuilder
            state={state}
            currentUserId={user?.id ?? ''}
            color={selectedColor}
            activeAction={activeAction}
            onColorChange={changeColor}
            onInvite={playerId => void mutate(`invite-${playerId}`, () => multiplayerLobbyService.invite(playerId), 'Invitation sent.')}
            onLeaveTeam={() => void mutate('leave-team', () => multiplayerLobbyService.enter('waiting', selectedColor))}
          />
        )}
      </section>

      {invitation && (
        <InvitationDialog
          invitation={invitation}
          busy={activeAction === `invitation-${invitation.id}`}
          onRespond={accept => void mutate(
            `invitation-${invitation.id}`,
            () => multiplayerLobbyService.respond(invitation.id, accept),
            accept ? 'Welcome to the team.' : 'Invitation declined.',
          )}
        />
      )}
    </main>
  );
}

function LobbyEntrance({ color, activeAction, onColorChange, onEnter }: {
  color: PlayerColor;
  activeAction: string | null;
  onColorChange: (color: PlayerColor) => void;
  onEnter: (mode: LobbyMode) => void;
}) {
  return (
    <div className="ml-entrance">
      <section className="ml-panel ml-color-panel">
        <div className="ml-step"><span>01</span><div><h2>Choose your color</h2><p>This follows you into your team and can be changed at any time.</p></div></div>
        <ColorPicker value={color} onChange={onColorChange} disabled={activeAction !== null} />
      </section>
      <section className="ml-panel">
        <div className="ml-step"><span>02</span><div><h2>How are you joining?</h2><p>Your lobby status is live and can be changed later.</p></div></div>
        <div className="ml-choice-grid">
          <LobbyChoice icon={<ShieldPlus />} title="Build a team" description="Create a party and invite up to seven waiting players." onClick={() => onEnter('team')} busy={activeAction === 'enter-team'} accent />
          <LobbyChoice icon={<Clock3 />} title="Wait for an invite" description="Stay visible to players who are assembling teams." onClick={() => onEnter('waiting')} busy={activeAction === 'enter-waiting'} />
          <LobbyChoice icon={<Sparkles />} title="Queue solo" description="Mark yourself ready for automatic matchmaking when it arrives." onClick={() => onEnter('solo')} busy={activeAction === 'enter-solo'} />
        </div>
      </section>
    </div>
  );
}

function LobbyChoice({ icon, title, description, onClick, busy, accent = false }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  busy: boolean;
  accent?: boolean;
}) {
  return (
    <button className={`ml-choice${accent ? ' ml-choice-accent' : ''}`} type="button" onClick={onClick} disabled={busy}>
      <span className="ml-choice-icon">{busy ? <Loader2 className="ml-spin" /> : icon}</span>
      <span><strong>{title}</strong><small>{description}</small></span>
      <ChevronRight />
    </button>
  );
}

function WaitingRoom({ state, color, activeAction, onColorChange, onEnter }: {
  state: MultiplayerLobbyState;
  color: PlayerColor;
  activeAction: string | null;
  onColorChange: (color: PlayerColor) => void;
  onEnter: (mode: LobbyMode) => void;
}) {
  return (
    <div className="ml-content-grid">
      <section className="ml-panel ml-waiting-card">
        <span className="ml-pulse-ring"><Bell /></span>
        <p className="ml-eyebrow">Available to team builders</p>
        <h2>You’re waiting for an invite</h2>
        <p>Keep this page open. Team invitations will appear here immediately.</p>
        <div className="ml-inline-actions">
          <button className="ml-primary-button" type="button" onClick={() => onEnter('team')} disabled={activeAction !== null}><ShieldPlus /> Build my own team</button>
          <button className="ml-secondary-button" type="button" onClick={() => onEnter('solo')} disabled={activeAction !== null}>Queue solo</button>
        </div>
      </section>
      <aside className="ml-panel ml-side-panel">
        <h3>Your color</h3>
        <ColorPicker value={color} onChange={onColorChange} disabled={activeAction !== null} compact />
        <div className="ml-lobby-count"><Users /><span><strong>{state.waitingPlayers.length + 1}</strong> players waiting now</span></div>
      </aside>
    </div>
  );
}

function SoloQueue({ color, activeAction, onColorChange, onEnter }: {
  color: PlayerColor;
  activeAction: string | null;
  onColorChange: (color: PlayerColor) => void;
  onEnter: (mode: LobbyMode) => void;
}) {
  return (
    <div className="ml-content-grid">
      <section className="ml-panel ml-waiting-card">
        <span className="ml-pulse-ring"><Sparkles /></span>
        <p className="ml-eyebrow">Solo queue</p>
        <h2>You’re marked ready</h2>
        <p>Your queue choice is saved. Automatic match formation will connect here when the game phase is built.</p>
        <div className="ml-inline-actions">
          <button className="ml-primary-button" type="button" onClick={() => onEnter('team')} disabled={activeAction !== null}><ShieldPlus /> Build a team</button>
          <button className="ml-secondary-button" type="button" onClick={() => onEnter('waiting')} disabled={activeAction !== null}>Wait for invite</button>
        </div>
      </section>
      <aside className="ml-panel ml-side-panel"><h3>Your color</h3><ColorPicker value={color} onChange={onColorChange} disabled={activeAction !== null} compact /></aside>
    </div>
  );
}

function TeamBuilder({ state, currentUserId, color, activeAction, onColorChange, onInvite, onLeaveTeam }: {
  state: MultiplayerLobbyState;
  currentUserId: string;
  color: PlayerColor;
  activeAction: string | null;
  onColorChange: (color: PlayerColor) => void;
  onInvite: (playerId: string) => void;
  onLeaveTeam: () => void;
}) {
  const team = state.team;
  if (!team) return null;
  const isFull = team.members.length >= 8;

  return (
    <div className="ml-team-layout">
      <section className="ml-panel ml-roster-panel">
        <div className="ml-panel-heading">
          <div><p className="ml-eyebrow"><Users /> Your team</p><h2>{team.members.length} / 8 players</h2></div>
          <button className="ml-quiet-button" type="button" onClick={onLeaveTeam} disabled={activeAction !== null}><LogOut /> Leave team</button>
        </div>
        <div className="ml-roster">
          {team.members.map(member => {
            const tone = getPlayerColor(member.color);
            return (
              <article className="ml-member" key={member.userId} style={{ '--player-color': tone.hex } as React.CSSProperties}>
                <img src={member.avatar || '/npc-placeholder.png'} alt="" />
                <span className="ml-player-swatch" />
                <div><strong>{member.username}{member.userId === currentUserId ? ' (you)' : ''}</strong><small>{tone.label}</small></div>
                {member.userId === team.leaderId && <Crown aria-label="Team leader" />}
              </article>
            );
          })}
          {Array.from({ length: 8 - team.members.length }, (_, index) => <div className="ml-empty-slot" key={index}><UserPlus /><span>Open slot</span></div>)}
        </div>
        <div className="ml-team-color"><div><h3>Your team color</h3><p>Everyone sees color changes in real time.</p></div><ColorPicker value={color} onChange={onColorChange} disabled={activeAction !== null} compact /></div>
      </section>

      <aside className="ml-panel ml-invite-panel">
        <div className="ml-panel-heading"><div><p className="ml-eyebrow"><UserPlus /> Recruit</p><h2>Waiting players</h2></div><span className="ml-count-badge">{state.waitingPlayers.length}</span></div>
        {isFull ? (
          <div className="ml-empty-list"><Check /><strong>Your team is full</strong><p>All eight places are filled.</p></div>
        ) : state.waitingPlayers.length === 0 ? (
          <div className="ml-empty-list"><Clock3 /><strong>No one is waiting yet</strong><p>This list updates as players enter the lobby.</p></div>
        ) : (
          <div className="ml-player-list">
            {state.waitingPlayers.map(player => {
              const tone = getPlayerColor(player.color);
              const isPending = state.pendingInviteeIds.includes(player.userId);
              const isBusy = activeAction === `invite-${player.userId}`;
              return (
                <article className="ml-waiting-player" key={player.userId} style={{ '--player-color': tone.hex } as React.CSSProperties}>
                  <img src={player.avatar || '/npc-placeholder.png'} alt="" />
                  <span><strong>{player.username}</strong><small><i />{tone.label}</small></span>
                  <button type="button" onClick={() => onInvite(player.userId)} disabled={activeAction !== null || isPending}>
                    {isBusy ? <Loader2 className="ml-spin" /> : isPending ? <Clock3 /> : <UserPlus />}
                    {isPending ? 'Invited' : 'Invite'}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
}

function ColorPicker({ value, onChange, disabled, compact = false }: {
  value: PlayerColor;
  onChange: (color: PlayerColor) => void;
  disabled: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`ml-colors${compact ? ' ml-colors-compact' : ''}`} role="radiogroup" aria-label="Player color">
      {PLAYER_COLORS.map(color => (
        <button
          key={color.id}
          type="button"
          className={value === color.id ? 'is-selected' : ''}
          style={{ '--swatch': color.hex } as React.CSSProperties}
          role="radio"
          aria-checked={value === color.id}
          aria-label={color.label}
          title={color.label}
          disabled={disabled}
          onClick={() => onChange(color.id)}
        ><span /></button>
      ))}
    </div>
  );
}

function InvitationDialog({ invitation, busy, onRespond }: {
  invitation: TeamInvitation;
  busy: boolean;
  onRespond: (accept: boolean) => void;
}) {
  return (
    <div className="ml-dialog-backdrop" role="presentation">
      <section className="ml-dialog" role="dialog" aria-modal="true" aria-labelledby="team-invitation-title">
        <span className="ml-dialog-icon"><Bell /></span>
        <p className="ml-eyebrow">Team invitation</p>
        <h2 id="team-invitation-title">{invitation.inviterName} wants you on their team</h2>
        <div className="ml-inviter"><img src={invitation.inviterAvatar || '/npc-placeholder.png'} alt="" /><span><strong>{invitation.inviterName}</strong><small>sent an invitation just now</small></span></div>
        <p>Accept to join their Team Building screen immediately. You can still change your color after joining.</p>
        <div className="ml-dialog-actions">
          <button className="ml-secondary-button" type="button" onClick={() => onRespond(false)} disabled={busy}><X /> Decline</button>
          <button className="ml-primary-button" type="button" onClick={() => onRespond(true)} disabled={busy}>{busy ? <Loader2 className="ml-spin" /> : <Check />} Accept invitation</button>
        </div>
      </section>
    </div>
  );
}
