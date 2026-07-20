import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BookOpen,
  Check,
  EyeOff,
  Dices,
  Lock,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Square,
  Settings,
  Users
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useArcaneSession } from '../hooks/useArcaneSession';
import {
  createArcaneSession,
  listArcaneCharacters,
  listArcaneSessions,
  respondToArcaneInvitation,
  searchArcaneInviteCandidates,
  type ArcaneInviteCandidate,
  type ArcaneCharacterOption,
  type ArcaneLockSummary,
  type ArcaneParticipant,
  type ArcaneSessionSummary
} from '../api/arcaneLocksService';
import type { ArcaneKnowledgeState, GlyphDefinition, LockAccessState, LockRuntimeState, PuzzleDefinition, PuzzleSessionStatus, RingDefinition } from '../engine/types';
import { ringSockets, socketSlotForRing } from '../engine/puzzleEngine';
import { isEmptyGlyphId } from '../engine/constants';
import { getPuzzleTemplate } from '../data/puzzleTemplates';
import './arcaneLocks.css';

export default function ArcaneLocksPage() {
  const [params, setParams] = useSearchParams();
  const sessionId = params.get('session');
  const selectedLockId = params.get('lock') ?? undefined;
  if (!sessionId) {
    return <ArcaneSessionHome onOpenSession={(id) => setParams({ session: id })} />;
  }
  return <ArcaneSessionRoom sessionId={sessionId} selectedLockId={selectedLockId} params={params} setParams={setParams} />;
}

function ArcaneSessionRoom({
  sessionId,
  selectedLockId,
  params,
  setParams
}: {
  sessionId: string;
  selectedLockId?: string;
  params: URLSearchParams;
  setParams: (next: URLSearchParams) => void;
}) {
  const {
    view,
    knowledge,
    lastArcanaResult,
    isLoading,
    message,
    submitAction,
    rollKnowledge,
    setSessionStatus,
    setProvider,
    setPlayerAccess,
    resetActiveLock,
    resetEveryLock,
    inviteUser,
    removeUser
  } = useArcaneSession(sessionId, selectedLockId);
  const [localNotice, setLocalNotice] = useState('');
  const [showGmControls, setShowGmControls] = useState(false);
  const [showGmAnswers, setShowGmAnswers] = useState(false);
  const [characters, setCharacters] = useState<ArcaneCharacterOption[]>([]);

  useEffect(() => {
    let ignore = false;
    listArcaneCharacters().then(items => { if (!ignore) setCharacters(items); }).catch(() => { if (!ignore) setCharacters([]); });
    return () => { ignore = true; };
  }, []);

  if (isLoading && !view) {
    return (
      <div className="arcane-page">
        <div className="arcane-loading">
          <Sparkles className="h-8 w-8 animate-pulse" />
          <p>Opening the seal chamber...</p>
        </div>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="arcane-page">
        <div className="arcane-empty">No arcane session could be loaded.</div>
      </div>
    );
  }

  const currentRole = view.session.currentUserRole ?? 'player';
  const isGm = currentRole === 'gm';
  const canAct = view.canInteract && view.session.status === 'active';
  const activeDefinition = mergePrivateDefinition(view.publicDefinition, view.activeLock.templateId);

  return (
    <div className="arcane-page">
      <section className="arcane-shell">
        <SessionHeader name={view.session.name} status={view.session.status} message={localNotice || message} />
        {isGm && (
          <div className="gm-launch-row">
            <button type="button" className="gm-launch-button" aria-pressed={showGmAnswers} onClick={() => setShowGmAnswers(value => !value)}>
              {showGmAnswers ? <EyeOff className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
              {showGmAnswers ? 'Hide GM answers' : 'Reveal GM answers'}
            </button>
            <button type="button" className="gm-launch-button" onClick={() => setShowGmControls(true)}><Settings className="h-4 w-4" /> GM controls</button>
          </div>
        )}

        <LockTabs
          locks={view.locks}
          activeLockId={view.activeLock.id}
          onSelect={(lockId) => {
            const next = new URLSearchParams(params);
            next.set('session', sessionId);
            next.set('lock', lockId);
            setParams(next);
          }}
        />

        <div className="arcane-layout">
          <main className="arcane-board-column">
            <InscriptionPanel
              canRead={showGmAnswers || Boolean(knowledge?.translationText)}
              inscription={showGmAnswers ? view.inscription : knowledge?.translationText ?? 'The inscription is written in an unknown arcane cipher.'}
              hint={showGmAnswers ? view.translatedHint : null}
              attempted={showGmAnswers || knowledge?.translationAttempted}
            />
            <ArcaneLockBoard
              definition={activeDefinition}
              state={view.activeLock.currentState}
              knownGlyphIds={showGmAnswers ? undefined : knowledge?.revealedGlyphIds ?? []}
              disabled={!canAct}
              onRotate={(ringId, direction) => submitAction({ type: 'rotate_ring', ringId, direction, steps: 1 })}
              onPowerGlyph={(ringId, glyphId, socketId) => submitAction({ type: 'power_glyph', ringId, glyphId, socketId })}
              onInvoke={() => submitAction({ type: 'invoke' })}
              onBlocked={() => setLocalNotice('Your character is not close enough to manipulate this seal.')}
            />
            <div className="below-play-panels">
              <PresencePanel participants={view.participants} activeLockId={view.activeLock.id} />
            </div>
          </main>

          <aside className="arcane-side">
            <ArcanaStudyPanel characters={characters} knowledge={knowledge} lastResult={lastArcanaResult} onRoll={rollKnowledge} />
            <GlyphBook definition={activeDefinition} revealedGlyphIds={showGmAnswers ? undefined : knowledge?.revealedGlyphIds ?? []} />
            <PlayerStatusPanel
              canInteract={view.canInteract}
              canRead={view.canReadInstructions}
              role={currentRole}
              status={view.session.status}
            />
          </aside>
        </div>
        {isGm && showGmControls && (
          <div className="arcane-modal-backdrop" role="presentation" onMouseDown={() => setShowGmControls(false)}>
            <div className="arcane-modal" role="dialog" aria-modal="true" aria-label="GM controls" onMouseDown={event => event.stopPropagation()}>
              <button type="button" className="modal-close" onClick={() => setShowGmControls(false)}>Close</button>
              <GmControlPanel lock={view.activeLock} participants={view.participants} access={view.access} providerType={view.session.accessProviderType} actionHistory={view.actionHistory} onSetStatus={setSessionStatus} onSetProvider={setProvider} onSetPlayerAccess={setPlayerAccess} onResetLock={resetActiveLock} onResetAll={resetEveryLock} onInviteUser={inviteUser} onRemoveUser={removeUser} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ArcaneSessionHome({ onOpenSession }: { onOpenSession: (sessionId: string) => void }) {
  const [sessions, setSessions] = useState<ArcaneSessionSummary[]>([]);
  const [sessionName, setSessionName] = useState('Arcane Lock Session');
  const [message, setMessage] = useState('Choose a session or create a new seal chamber.');

  useEffect(() => {
    listArcaneSessions()
      .then(setSessions)
      .catch(error => setMessage(error instanceof Error ? error.message : 'Could not load arcane sessions.'));
  }, []);

  async function createSession() {
    setMessage('Creating session...');
    const id = await createArcaneSession(sessionName);
    onOpenSession(id);
  }

  async function answerInvite(sessionId: string, status: 'accepted' | 'declined') {
    setMessage(`${status === 'accepted' ? 'Accepting' : 'Declining'} invitation...`);
    await respondToArcaneInvitation(sessionId, status);
    setSessions(await listArcaneSessions());
    setMessage('Invitation updated.');
  }

  return (
    <div className="arcane-page">
      <section className="arcane-shell">
        <header className="arcane-header">
          <div>
            <p className="arcane-kicker">Arcane Lock Sessions</p>
            <h1>Seal Chamber</h1>
          </div>
          <span className="arcane-sync">{message}</span>
        </header>

        <div className="session-home-grid">
          <section className="arcane-panel create-session-panel">
            <h2>Create Session</h2>
            <label>
              Session name
              <input value={sessionName} onChange={(event) => setSessionName(event.target.value)} />
            </label>
            <button type="button" className="primary-action" onClick={createSession}>
              <Sparkles className="h-4 w-4" /> Create with starter locks
            </button>
            <button type="button" onClick={() => onOpenSession('demo-arcane-session')}>
              Open demo chamber
            </button>
          </section>

          <section className="arcane-panel">
            <h2>Your Sessions</h2>
            <div className="session-card-list">
              {sessions.map(session => (
                <article className="session-card" key={session.id}>
                  <div>
                    <h3>{session.name}</h3>
                    <p>{session.lockCount} locks · GM {session.gmDisplayName} · {session.status}</p>
                  </div>
                  {session.invitationStatus === 'invited' ? (
                    <div className="session-card-actions">
                      <button type="button" onClick={() => answerInvite(session.id, 'accepted')}><Check className="h-4 w-4" /> Accept</button>
                      <button type="button" onClick={() => answerInvite(session.id, 'declined')}>Decline</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => onOpenSession(session.id)}>Open</button>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function SessionHeader({ name, status, message }: { name: string; status: string; message: string }) {
  return (
    <header className="arcane-header">
      <div>
        <p className="arcane-kicker">Multiplayer Arcane Lock Session</p>
        <h1>{name}</h1>
      </div>
      <div className="arcane-status-cluster">
        <span className="arcane-pill"><Activity className="h-4 w-4" /> {status}</span>
        <span className="arcane-sync">{message}</span>
      </div>
    </header>
  );
}

function LockTabs({ locks, activeLockId, onSelect }: { locks: ArcaneLockSummary[]; activeLockId: string; onSelect: (lockId: string) => void }) {
  return (
    <div className="arcane-tabs" role="tablist" aria-label="Arcane locks">
      {locks.map(lock => (
        <button
          key={lock.id}
          type="button"
          role="tab"
          aria-selected={lock.id === activeLockId}
          className={lock.id === activeLockId ? 'active' : ''}
          onClick={() => onSelect(lock.id)}
        >
          <Lock className="h-4 w-4" />
          <span>{lock.displayName}</span>
          {lock.currentState.solved && <span aria-label="Solved">OK</span>}
          <small><Users className="h-3 w-3" /> {lock.viewerCount}</small>
        </button>
      ))}
    </div>
  );
}

function InscriptionPanel({ canRead, inscription, hint, attempted }: { canRead: boolean; inscription: string; hint: string | null; attempted?: boolean }) {
  return (
    <section className="inscription-panel" aria-live="polite">
      <div className="panel-title">
        {canRead ? <BookOpen className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
        <h2>Inscription</h2>
      </div>
      <p className={canRead ? 'inscription-text' : 'inscription-redacted'}>{inscription}</p>
      {!canRead && attempted && <p className="warn-text">Your single translation attempt revealed nothing.</p>}
      {hint && <p className="inscription-hint">{hint}</p>}
    </section>
  );
}

function ArcaneLockBoard({
  definition,
  state,
  knownGlyphIds,
  disabled,
  onRotate,
  onPowerGlyph,
  onInvoke,
  onBlocked
}: {
  definition: PuzzleDefinition;
  state: LockRuntimeState;
  knownGlyphIds?: string[];
  disabled: boolean;
  onRotate: (ringId: string, direction: 1 | -1) => void;
  onPowerGlyph: (ringId: string, glyphId: string, socketId?: string) => void;
  onInvoke: () => void;
  onBlocked: () => void;
}) {
  const glyphMap = useMemo(() => new Map(definition.glyphDictionary.map(glyph => [glyph.id, glyph])), [definition.glyphDictionary]);
  const [visualRingRotations, setVisualRingRotations] = useState<Record<string, number>>({});

  useEffect(() => {
    setVisualRingRotations(previous => {
      const next: Record<string, number> = {};
      for (const ring of definition.rings) {
        const stepDegrees = 360 / Math.max(1, ringSockets(ring).length);
        const canonicalDegrees = (state.ringRotations[ring.id] ?? 0) * stepDegrees;
        next[ring.id] = unwrapRotation(previous[ring.id], canonicalDegrees);
      }
      return next;
    });
  }, [definition.rings, state.ringRotations]);

  function guard<T extends unknown[]>(fn: (...args: T) => void) {
    return (...args: T) => {
      if (disabled) {
        onBlocked();
        return;
      }
      fn(...args);
    };
  }

  return (
    <section className={`lock-board-frame ${state.solved ? 'solved' : ''}`}>
      <div className="board-toolbar">
        <div className="rotate-controls">
          {definition.rings.map(ring => (
            <div key={ring.id}>
              <span>{ring.name}</span>
              <button type="button" aria-label={`Rotate ${ring.name} counterclockwise`} onClick={guard(() => onRotate(ring.id, -1))}>-</button>
              <button type="button" aria-label={`Rotate ${ring.name} clockwise`} onClick={guard(() => onRotate(ring.id, 1))}>+</button>
            </div>
          ))}
        </div>
        <button type="button" className="invoke-button" disabled={disabled} onClick={guard(onInvoke)}>
          <Sparkles className="h-4 w-4" /> Invoke
        </button>
      </div>

      <svg className="arcane-svg" viewBox="-220 -220 440 440" role="img" aria-label={`${definition.name} lock board`}>
        <defs>
          <filter id="arcane-glow">
            <feGaussianBlur stdDeviation="2.2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <ConduitLayer definition={definition} state={state} revealValidation={state.solved || Boolean(state.lastInvokeFailed)} />
        <ObstacleLayer definition={definition} />
        {definition.rings.map(ring => (
          <ArcaneRing
            key={ring.id}
            ring={ring}
            state={state}
            glyphMap={glyphMap}
            knownGlyphIds={knownGlyphIds}
            disabled={disabled}
            visualRotationDegrees={visualRingRotations[ring.id] ?? ((state.ringRotations[ring.id] ?? 0) * 360) / Math.max(1, ringSockets(ring).length)}
            onPowerGlyph={guard(onPowerGlyph)}
          />
        ))}
        <circle className={state.solved ? 'core solved' : state.lastInvokeFailed ? 'core failed' : 'core'} r={minRingRadius(definition) < 60 ? 22 : 31} />
        <text className="core-label" textAnchor="middle" y="5">{state.solved ? 'OPEN' : state.lastInvokeFailed ? 'MISALIGN' : 'CORE'}</text>
      </svg>
    </section>
  );
}

function ConduitLayer({ definition, state, revealValidation }: { definition: PuzzleDefinition; state: LockRuntimeState; revealValidation: boolean }) {
  return (
    <g className="conduit-layer">
      {conduitChannelRadii(definition).map(radius => (
        <circle key={radius} className="conduit-channel" r={radius} />
      ))}
      {state.energyTrace.map((segment, index) => {
        return (
          <path
            key={`${segment.fromRingId}-${segment.fromGlyphId}-${index}`}
            className={`conduit ${revealValidation ? segment.valid ? 'valid' : 'invalid' : 'unjudged'} ${revealValidation && segment.blocked ? 'blocked' : ''}`}
            d={routedConduitPath(definition, segment)}
          />
        );
      })}
    </g>
  );
}

function ObstacleLayer({ definition }: { definition: PuzzleDefinition }) {
  return (
    <g className="obstacle-layer" aria-hidden="true">
      {definition.obstacles.flatMap(obstacle => (
        (obstacle.blocks ?? []).map((block, index) => {
          const ring = definition.rings.find(item => item.id === block.ringId);
          if (!ring) return null;
          const point = polar(block.slot, ringSockets(ring).length, ring.radius);
          return (
            <g
              key={`${obstacle.id}-${index}`}
              className="ward-marker active"
              transform={`translate(${point.x} ${point.y})`}
            >
              <circle className="ward-halo" r="30" />
              <circle className="ward-ring" r="22" />
              <title>{`${obstacle.type} ward ${obstacle.id}`}</title>
            </g>
          );
        })
      ))}
    </g>
  );
}

function ArcaneRing({
  ring,
  state,
  glyphMap,
  knownGlyphIds,
  disabled,
  visualRotationDegrees,
  onPowerGlyph
}: {
  ring: RingDefinition;
  state: LockRuntimeState;
  glyphMap: Map<string, GlyphDefinition>;
  knownGlyphIds?: string[];
  disabled: boolean;
  visualRotationDegrees: number;
  onPowerGlyph: (ringId: string, glyphId: string, socketId?: string) => void;
}) {
  const socketRadius = ring.radius < 60 ? 14 : ring.radius < 90 ? 16 : 19;
  const glyphScale = socketRadius / 19;

  return (
    <g
      className="arcane-ring"
      style={{
        transform: `rotate(${visualRotationDegrees}deg)`,
        transformOrigin: '0px 0px'
      }}
    >
      <circle className="ring-track" r={ring.radius} />
      {ringSockets(ring).map(socket => {
        const glyph = glyphMap.get(socket.glyphId);
        const glyphKnown = knownGlyphIds === undefined || knownGlyphIds.includes(socket.glyphId);
        const slot = socketSlotForRing(ring, socket.id, 0);
        const point = polar(slot, ringSockets(ring).length, ring.radius);
        const isEmpty = isEmptyGlyphId(socket.glyphId);
        const isPowered = !isEmpty && (state.poweredSocketByRing?.[ring.id] ? state.poweredSocketByRing[ring.id] === socket.id : state.poweredGlyphByRing[ring.id] === socket.glyphId);
        const isReceiving = !isEmpty && state.energyTrace.some(segment => segment.toRingId === ring.id && (segment.toSocketId === socket.id || segment.toGlyphId === socket.glyphId));
        return (
          <g
            key={socket.id}
            className={`glyph-socket ${isEmpty ? 'empty' : ''} ${isPowered ? 'selected' : ''} ${isReceiving ? 'receiving' : ''}`}
            transform={`translate(${point.x} ${point.y})`}
          >
            <circle r={socketRadius} />
            {!isEmpty && (
              <>
                <path d={glyph?.symbol} transform={`scale(${glyphScale}) translate(-12 -12)`} />
                <title>{glyphKnown ? glyph?.accessibleDescription ?? socket.glyphId : 'Unknown arcane glyph'}</title>
                <foreignObject x="-22" y="-22" width="44" height="44">
                  <button
                    className="glyph-hit"
                    type="button"
                    disabled={disabled}
                    aria-label={`Power ${glyphKnown ? glyph?.label ?? socket.glyphId : 'unknown glyph'} on ${ring.name}`}
                    onClick={() => onPowerGlyph(ring.id, socket.glyphId, socket.id)}
                  />
                </foreignObject>
              </>
            )}
            {isEmpty && <title>Empty slot</title>}
          </g>
        );
      })}
    </g>
  );
}

function PlayerStatusPanel({ canInteract, canRead, role, status }: { canInteract: boolean; canRead: boolean; role: string; status: string }) {
  return (
    <section className="arcane-panel">
      <h2>Status</h2>
      <p className={canInteract ? 'ok-text' : 'warn-text'}>{canInteract ? 'You may manipulate this seal.' : 'Your character is not close enough to manipulate this seal.'}</p>
      <p className={canRead ? 'ok-text' : 'warn-text'}>{canRead ? 'You can read the inscription.' : 'The inscription is too distant to decipher.'}</p>
      <p>Role: <strong>{role}</strong></p>
      <p>Session: <strong>{status}</strong></p>
    </section>
  );
}

function GlyphBook({ definition, revealedGlyphIds }: { definition: PuzzleDefinition; revealedGlyphIds?: string[] }) {
  const usedGlyphIds = useMemo(() => {
    const ids = new Set<string>();
    for (const ring of definition.rings) {
      for (const socket of ringSockets(ring)) {
        if (!isEmptyGlyphId(socket.glyphId)) ids.add(socket.glyphId);
      }
    }
    return ids;
  }, [definition.rings]);
  const glyphs = definition.glyphDictionary.filter(glyph => usedGlyphIds.has(glyph.id));
  const revealed = new Set(revealedGlyphIds);

  return (
    <section className="arcane-panel glyph-book">
      <div className="panel-title">
        <BookOpen className="h-5 w-5" />
        <h2>Glyph Book</h2>
      </div>
      <div className="glyph-book-list">
        {glyphs.map(glyph => {
          const known = revealedGlyphIds === undefined || revealed.has(glyph.id);
          return (
          <article className="glyph-book-row" key={glyph.id}>
            <svg className="glyph-book-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d={glyph.symbol} />
            </svg>
            <div>
              <h3>{known ? glyph.label : 'Unknown glyph'}</h3>
              <p>{known ? glyph.accessibleDescription : 'Its meaning has not been deciphered.'}</p>
            </div>
          </article>
        )})}
      </div>
    </section>
  );
}

function ArcanaStudyPanel({ characters, knowledge, lastResult, onRoll }: {
  characters: ArcaneCharacterOption[];
  knowledge: ArcaneKnowledgeState | null;
  lastResult: { dieRoll: number; total: number; degree: string } | null;
  onRoll: (characterId: string, kind: 'translation' | 'glyphs') => Promise<void>;
}) {
  const [characterId, setCharacterId] = useState('');
  const selectedId = knowledge?.characterId ?? characterId;
  const selected = characters.find(character => character.id === selectedId);
  return (
    <section className="arcane-panel arcana-study">
      <div className="panel-title"><Dices className="h-5 w-5" /><h2>Arcana Study</h2></div>
      <label>Character
        <select value={selectedId} disabled={Boolean(knowledge?.characterId)} onChange={event => setCharacterId(event.target.value)}>
          <option value="">Choose a character</option>
          {characters.map(character => <option key={character.id} value={character.id}>{character.name} (Arcana {character.arcanaModifier >= 0 ? '+' : ''}{character.arcanaModifier})</option>)}
        </select>
      </label>
      <p>DC <strong>{knowledge?.dc ?? '—'}</strong>. Your first roll binds this lock to that character.</p>
      <div className="gm-buttons">
        <button type="button" disabled={!selectedId || Boolean(knowledge?.translationAttempted)} onClick={() => void onRoll(selectedId, 'translation')}>Translate ({knowledge?.translationAttempted ? 'used' : '1 try'})</button>
        <button type="button" disabled={!selectedId || (knowledge?.glyphRollsRemaining ?? 3) <= 0} onClick={() => void onRoll(selectedId, 'glyphs')}>Study glyphs ({knowledge?.glyphRollsRemaining ?? 3} left)</button>
      </div>
      {selected && <p className="arcana-character-note">Rolling as {selected.name} with Arcana {selected.arcanaModifier >= 0 ? '+' : ''}{selected.arcanaModifier}.</p>}
      {lastResult && <p className="arcana-result">Last roll: <strong>{lastResult.total}</strong> ({lastResult.dieRoll} on the die), {lastResult.degree.replace('_', ' ')}.</p>}
    </section>
  );
}

function PresencePanel({ participants, activeLockId }: { participants: ArcaneParticipant[]; activeLockId: string }) {
  return (
    <section className="arcane-panel">
      <h2>Presence</h2>
      {participants.map(participant => (
        <div className="presence-row" key={participant.userId}>
          <span className={participant.online ? 'online-dot' : 'offline-dot'} />
          <span>{participant.displayName}</span>
          <small>{participant.activeLockId === activeLockId ? 'viewing this lock' : participant.role}</small>
        </div>
      ))}
    </section>
  );
}

function GmControlPanel({
  lock,
  participants,
  access,
  providerType,
  actionHistory,
  onSetStatus,
  onSetProvider,
  onSetPlayerAccess,
  onResetLock,
  onResetAll,
  onInviteUser,
  onRemoveUser
}: {
  lock: ArcaneLockSummary;
  participants: ArcaneParticipant[];
  access: LockAccessState[];
  providerType: string;
  actionHistory: Array<{ id: string; actorName: string; actionType: string; createdAt: string; summary: string }>;
  onSetStatus: (status: PuzzleSessionStatus) => Promise<void>;
  onSetProvider: (providerType: 'manual' | 'foundry') => Promise<void>;
  onSetPlayerAccess: (userId: string, values: { providerCanInteract?: boolean; providerCanRead?: boolean; interactOverride?: 'automatic' | 'allow' | 'deny'; readOverride?: 'automatic' | 'allow' | 'deny' }) => Promise<void>;
  onResetLock: () => Promise<void>;
  onResetAll: () => Promise<void>;
  onInviteUser: (userId: string, role: 'player' | 'spectator') => Promise<void>;
  onRemoveUser: (userId: string) => Promise<void>;
}) {
  const [inviteUserId, setInviteUserId] = useState('');
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteRole, setInviteRole] = useState<'player' | 'spectator'>('player');
  const [inviteCandidates, setInviteCandidates] = useState<ArcaneInviteCandidate[]>([]);

  useEffect(() => {
    let ignore = false;
    searchArcaneInviteCandidates(inviteQuery).then(candidates => {
      if (!ignore) setInviteCandidates(candidates);
    });
    return () => {
      ignore = true;
    };
  }, [inviteQuery]);

  return (
    <section className="arcane-panel gm-panel">
      <h2>GM Controls</h2>
      <div className="gm-buttons">
        <button type="button" onClick={() => onSetStatus('active')}><Play className="h-4 w-4" /> Start</button>
        <button type="button" onClick={() => onSetStatus('paused')}><Pause className="h-4 w-4" /> Pause</button>
        <button type="button" onClick={() => onSetStatus('completed')}><Square className="h-4 w-4" /> Complete</button>
        <button type="button" onClick={() => {
          if (window.confirm(`Reset ${lock.displayName}?`)) void onResetLock();
        }}><RotateCcw className="h-4 w-4" /> Reset {lock.displayName}</button>
        <button type="button" onClick={() => {
          if (window.confirm('Reset every lock in this session?')) void onResetAll();
        }}><RotateCcw className="h-4 w-4" /> Reset all</button>
      </div>
      <div className="integration-status">
        <ShieldAlert className="h-4 w-4" />
        <span>Access provider: {providerType}. Foundry can update provider values later without owning puzzle state.</span>
      </div>
      <div className="gm-buttons">
        <button type="button" onClick={() => onSetProvider('manual')}>Manual provider</button>
        <button type="button" onClick={() => onSetProvider('foundry')}>Foundry provider</button>
      </div>
      <h3>Invite</h3>
      <div className="invite-row">
        <input
          value={inviteQuery}
          onChange={(event) => {
            setInviteQuery(event.target.value);
            setInviteUserId('');
          }}
          placeholder="Search username"
          aria-label="Search users by username"
        />
        <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as 'player' | 'spectator')}>
          <option value="player">Player</option>
          <option value="spectator">Spectator</option>
        </select>
        <button
          type="button"
          onClick={() => {
            if (!inviteUserId.trim()) return;
            void onInviteUser(inviteUserId.trim(), inviteRole).then(() => setInviteUserId(''));
          }}
        >
          Invite
        </button>
      </div>
      {inviteCandidates.length > 0 && (
        <div className="invite-results">
          {inviteCandidates.map(candidate => (
            <button
              type="button"
              key={candidate.authUserId}
              className={inviteUserId === candidate.authUserId ? 'selected' : ''}
              onClick={() => {
                setInviteUserId(candidate.authUserId);
                setInviteQuery(candidate.username);
              }}
            >
              <img src={candidate.avatar || '/npc-placeholder.png'} alt="" />
              <span>{candidate.username}</span>
            </button>
          ))}
        </div>
      )}
      <h3>Player Access</h3>
      {participants.map(participant => (
        <PlayerAccessRow
          key={participant.userId}
          participant={participant}
          access={access.find(item => item.lockId === lock.id && item.userId === participant.userId)}
          onSetPlayerAccess={onSetPlayerAccess}
          onRemoveUser={onRemoveUser}
        />
      ))}
      <h3>History</h3>
      {actionHistory.map(action => (
        <p key={action.id} className="history-row"><strong>{action.actorName}</strong> {action.summary}</p>
      ))}
    </section>
  );
}

function PlayerAccessRow({
  participant,
  access,
  onSetPlayerAccess,
  onRemoveUser
}: {
  participant: ArcaneParticipant;
  access?: LockAccessState;
  onSetPlayerAccess: (userId: string, values: { providerCanInteract?: boolean; providerCanRead?: boolean; interactOverride?: 'automatic' | 'allow' | 'deny'; readOverride?: 'automatic' | 'allow' | 'deny' }) => Promise<void>;
  onRemoveUser: (userId: string) => Promise<void>;
}) {
  const canInteract = access?.effectiveCanInteract ?? false;
  const canRead = access?.effectiveCanReadInstructions ?? false;

  return (
    <div className="access-row">
      <span>{participant.displayName}</span>
      <button
        type="button"
        aria-pressed={access?.providerCanInteract ?? false}
        onClick={() => onSetPlayerAccess(participant.userId, { providerCanInteract: !(access?.providerCanInteract ?? false) })}
      >
        {canInteract ? 'Adjacent' : 'Not adjacent'}
      </button>
      <button
        type="button"
        aria-pressed={access?.providerCanReadInstructions ?? false}
        onClick={() => onSetPlayerAccess(participant.userId, { providerCanRead: !(access?.providerCanReadInstructions ?? false) })}
      >
        {canRead ? 'Can read' : 'Cannot read'}
      </button>
      <select
        value={access?.interactOverride ?? 'automatic'}
        onChange={(event) => onSetPlayerAccess(participant.userId, { interactOverride: event.target.value as 'automatic' | 'allow' | 'deny' })}
        aria-label={`Movement override for ${participant.displayName}`}
      >
        <option value="automatic">Movement automatic</option>
        <option value="allow">Force movement allow</option>
        <option value="deny">Force movement deny</option>
      </select>
      <select
        value={access?.readOverride ?? 'automatic'}
        onChange={(event) => onSetPlayerAccess(participant.userId, { readOverride: event.target.value as 'automatic' | 'allow' | 'deny' })}
        aria-label={`Reading override for ${participant.displayName}`}
      >
        <option value="automatic">Reading automatic</option>
        <option value="allow">Force reading allow</option>
        <option value="deny">Force reading deny</option>
      </select>
      {participant.role !== 'gm' && (
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Remove ${participant.displayName} from this session?`)) void onRemoveUser(participant.userId);
          }}
        >
          Remove
        </button>
      )}
    </div>
  );
}

function polar(slot: number, slots: number, radius: number) {
  return pointAtAngle(angleForSlot(slot, slots), radius);
}

function angleForSlot(slot: number, slots: number) {
  return (Math.PI * 2 * slot) / slots - Math.PI / 2;
}

function pointAtAngle(angle: number, radius: number) {
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius
  };
}

function routedConduitPath(definition: PuzzleDefinition, segment: LockRuntimeState['energyTrace'][number]) {
  const fromRing = definition.rings.find(ring => ring.id === segment.fromRingId);
  if (!fromRing) return '';

  const fromAngle = angleForSlot(segment.fromSlot, slotCount(definition, segment.fromRingId));
  const fromPoint = pointAtAngle(fromAngle, fromRing.radius);
  const toRing = segment.toRingId === 'core' ? null : definition.rings.find(ring => ring.id === segment.toRingId);
  const toAngle = segment.toSlot === null || !toRing ? fromAngle : angleForSlot(segment.toSlot, slotCount(definition, segment.toRingId));
  const toPoint = segment.toSlot === null || !toRing ? { x: 0, y: 0 } : pointAtAngle(toAngle, toRing.radius);
  const commands = [`M ${formatPoint(fromPoint)}`];

  if (!toRing || segment.toRingId === 'core') {
    const coreLaneRadius = Math.max(26, (fromRing.radius + 28) / 2);
    lineTo(commands, pointAtAngle(fromAngle, coreLaneRadius));
    lineTo(commands, toPoint);
    return commands.join(' ');
  }

  const orderedRings = [...definition.rings].sort((left, right) => right.radius - left.radius);
  const fromIndex = orderedRings.findIndex(ring => ring.id === fromRing.id);
  const toIndex = orderedRings.findIndex(ring => ring.id === toRing.id);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    lineTo(commands, toPoint);
    return commands.join(' ');
  }

  const direction = toIndex > fromIndex ? 1 : -1;
  let currentAngle = fromAngle;
  let previousLaneRadius = fromRing.radius;
  const preferredCrossingAngle = midpointAngle(fromAngle, toAngle);

  for (let index = fromIndex; index !== toIndex; index += direction) {
    const currentRing = orderedRings[index];
    const nextRing = orderedRings[index + direction];
    const laneRadius = (currentRing.radius + nextRing.radius) / 2;
    const nextIsDestination = nextRing.id === toRing.id;
    const targetAngle = nextIsDestination ? toAngle : safeBetweenGlyphAngle(nextRing, preferredCrossingAngle);

    if (Math.abs(previousLaneRadius - laneRadius) > 0.1) {
      lineTo(commands, pointAtAngle(currentAngle, laneRadius));
    }
    arcTo(commands, laneRadius, currentAngle, targetAngle);

    currentAngle = targetAngle;
    previousLaneRadius = laneRadius;

    if (!nextIsDestination) {
      const nextLaneRadius = (nextRing.radius + orderedRings[index + direction + direction].radius) / 2;
      lineTo(commands, pointAtAngle(currentAngle, nextLaneRadius));
      previousLaneRadius = nextLaneRadius;
    }
  }

  lineTo(commands, toPoint);
  return commands.join(' ');
}

function conduitChannelRadii(definition: PuzzleDefinition) {
  const orderedRings = [...definition.rings].sort((left, right) => right.radius - left.radius);
  const radii: number[] = [];
  for (let index = 0; index < orderedRings.length - 1; index += 1) {
    radii.push((orderedRings[index].radius + orderedRings[index + 1].radius) / 2);
  }
  const innerRing = orderedRings[orderedRings.length - 1];
  if (innerRing) radii.push(Math.max(26, (innerRing.radius + 28) / 2));
  return radii;
}

function safeBetweenGlyphAngle(ring: RingDefinition, preferredAngle: number) {
  const slots = Math.max(1, ringSockets(ring).length);
  const preferredSlot = normalizeSlotForAngle(preferredAngle, slots);
  const crossingSlot = normalizeSlot(Math.round(preferredSlot - 0.5) + 0.5, slots);
  return angleForSlot(crossingSlot, slots);
}

function midpointAngle(fromAngle: number, toAngle: number) {
  return fromAngle + shortestAngleDelta(fromAngle, toAngle) / 2;
}

function arcTo(commands: string[], radius: number, fromAngle: number, toAngle: number) {
  const delta = shortestAngleDelta(fromAngle, toAngle);
  if (Math.abs(delta) < 0.001) return;
  const target = pointAtAngle(fromAngle + delta, radius);
  const largeArc = Math.abs(delta) > Math.PI ? 1 : 0;
  const sweep = delta >= 0 ? 1 : 0;
  commands.push(`A ${round(radius)} ${round(radius)} 0 ${largeArc} ${sweep} ${formatPoint(target)}`);
}

function lineTo(commands: string[], point: { x: number; y: number }) {
  commands.push(`L ${formatPoint(point)}`);
}

function formatPoint(point: { x: number; y: number }) {
  return `${round(point.x)} ${round(point.y)}`;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function shortestAngleDelta(fromAngle: number, toAngle: number) {
  let delta = toAngle - fromAngle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function normalizeSlotForAngle(angle: number, slots: number) {
  return normalizeSlot(((angle + Math.PI / 2) / (Math.PI * 2)) * slots, slots);
}

function normalizeSlot(slot: number, slots: number) {
  return ((slot % slots) + slots) % slots;
}

function unwrapRotation(previousDegrees: number | undefined, canonicalDegrees: number) {
  if (previousDegrees === undefined) return canonicalDegrees;
  const candidates = [canonicalDegrees - 360, canonicalDegrees, canonicalDegrees + 360];
  let best = candidates[0];
  for (const candidate of candidates) {
    if (Math.abs(candidate - previousDegrees) < Math.abs(best - previousDegrees)) {
      best = candidate;
    }
  }
  return best;
}

function minRingRadius(definition: PuzzleDefinition) {
  return Math.min(...definition.rings.map(ring => ring.radius));
}

function slotCount(definition: PuzzleDefinition, ringId: string) {
  if (ringId === 'core') return 1;
  const ring = definition.rings.find(item => item.id === ringId);
  return ring ? ringSockets(ring).length : 1;
}

function mergePrivateDefinition(publicDefinition: PuzzleDefinition, templateId: string): PuzzleDefinition {
  const local = getPuzzleTemplate(templateId);
  return {
    ...publicDefinition,
    glyphDictionary: local.glyphDictionary,
    rings: local.rings,
    obstacles: local.obstacles
  };
}
