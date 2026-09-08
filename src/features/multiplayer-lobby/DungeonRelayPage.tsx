import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { allocateDungeonRelayMatches, canDungeonRelayClassEliminate, DUNGEON_RELAY_SYMBOLS, isDungeonRelayEventEligible } from '@scon/rules';
import { Check, ChevronLeft, Clock3, Crown, Eye, Flame, Layers3, Loader2, RotateCcw, Skull, Sparkles, Trash2, Trophy, Users, Vote, X, Zap } from 'lucide-react';
import { DATABASE_TABLES } from '../../config/database';
import { useAuth } from '../../context/useAuth';
import { useSupabaseRealtime } from '../../hooks/useSupabaseRealtime';
import { getPlayerColor } from './multiplayerLobby';
import { DUNGEON_CARD_TYPES, DUNGEON_CLASS_POWERS, DUNGEON_EVENTS, getDungeonSymbol, type DungeonRelayHandCard, type DungeonRelayPublicCard, type DungeonRelayState } from './dungeonRelayGame';
import { dungeonRelayService } from './dungeonRelayService';
import './dungeonRelay.css';

export default function DungeonRelayPage() {
  const { matchId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [state, setState] = useState<DungeonRelayState | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [busyEventAction, setBusyEventAction] = useState<string | null>(null);
  const [voteTargetId, setVoteTargetId] = useState('');
  const [powerOpen, setPowerOpen] = useState(false);
  const [powerCardIds, setPowerCardIds] = useState<string[]>([]);
  const [powerTargetId, setPowerTargetId] = useState('');
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [isExpiring, setIsExpiring] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    if (!matchId) return;
    try {
      const snapshot = await dungeonRelayService.getState(matchId);
      setState(snapshot);
      setVoteTargetId(current => snapshot.players.some(player => player.userId === current && player.status === 'active')
        ? current
        : snapshot.players.find(player => player.status === 'active')?.userId ?? '');
      setSelectedIds(current => current.filter(id => snapshot.self.hand.some(card => card.id === id)));
      if (snapshot.match.phase === 'complete') {
        const activeMatchId = await dungeonRelayService.getActiveMatch();
        if (activeMatchId && activeMatchId !== matchId) {
          navigate(`/multiplayer/matches/${activeMatchId}`, { replace: true });
        }
      }
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The match could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }, [matchId, navigate]);

  useEffect(() => { void loadState(); }, [loadState]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useSupabaseRealtime({
    channelName: `dungeon-relay-${matchId}-${user?.id ?? 'anonymous'}`,
    tables: [DATABASE_TABLES.DUNGEON_RELAY_UPDATES],
    onChange: loadState,
    enabled: Boolean(matchId && user?.id),
    debounceMs: 75,
  });

  useEffect(() => {
    if (!state || state.match.phase !== 'resolving') return;
    const resolveAt = state.match.resolveAt ? new Date(state.match.resolveAt).getTime() : Date.now();
    const delay = Math.max(0, resolveAt - Date.now()) + 100;
    const timer = window.setTimeout(() => {
      void dungeonRelayService.advance(matchId).then(() => loadState()).catch(errorValue => {
        setError(errorValue instanceof Error ? errorValue.message : 'The next chamber could not be drawn.');
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [loadState, matchId, state]);

  useEffect(() => {
    if (!state || isExpiring || state.match.status !== 'active' || state.match.timerFrozen || !state.match.timerDeadline) return;
    if (state.dungeon.isBoss && state.match.phase === 'resolving') return;
    if (new Date(state.match.timerDeadline).getTime() > clockNow) return;
    setIsExpiring(true);
    void dungeonRelayService.expireTimer(matchId).then(() => loadState()).catch(errorValue => {
      setError(errorValue instanceof Error ? errorValue.message : 'The run timer could not be resolved.');
    }).finally(() => setIsExpiring(false));
  }, [clockNow, isExpiring, loadState, matchId, state]);

  const allocation = useMemo(() => state ? allocateDungeonRelayMatches(
    state.dungeon.requirements,
    state.playedCards,
  ) : null, [state]);

  const toggleCard = (cardId: string) => {
    if (!state || state.match.phase !== 'active' || state.self.status === 'dead' || isPlaying) return;
    setSelectedIds(current => current.includes(cardId)
      ? current.filter(id => id !== cardId)
      : current.length >= 5 ? current : [...current, cardId]);
  };

  const runEventAction = async (key: string, action: () => Promise<unknown>) => {
    setBusyEventAction(key);
    setError(null);
    try {
      await action();
      await loadState();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The event action could not be completed.');
    } finally {
      setBusyEventAction(null);
    }
  };

  const activatePower = async () => {
    if (!state) return;
    const self = state.players.find(player => player.userId === state.self.userId);
    if (!self) return;
    const power = DUNGEON_CLASS_POWERS[self.classId];
    if (powerCardIds.length !== power.cost) return;
    setBusyEventAction('power');
    setError(null);
    try {
      await dungeonRelayService.usePower(matchId, powerCardIds, power.target === 'player' ? powerTargetId : null);
      setPowerOpen(false);
      setPowerCardIds([]);
      await loadState();
    } catch (powerError) {
      setError(powerError instanceof Error ? powerError.message : 'The class power could not be used.');
    } finally {
      setBusyEventAction(null);
    }
  };

  const playCards = async () => {
    if (selectedIds.length === 0) return;
    setIsPlaying(true);
    setError(null);
    try {
      await dungeonRelayService.play(matchId, selectedIds);
      setSelectedIds([]);
      await loadState();
    } catch (playError) {
      setError(playError instanceof Error ? playError.message : 'Those cards could not be played.');
    } finally {
      setIsPlaying(false);
    }
  };

  const retry = async () => {
    setIsRetrying(true);
    setError(null);
    try {
      const nextMatchId = await dungeonRelayService.startAgain();
      navigate(`/multiplayer/matches/${nextMatchId}`, { replace: true });
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'A new run could not be started.');
    } finally {
      setIsRetrying(false);
    }
  };

  if (isLoading) return <div className="dr-loading"><Loader2 className="dr-spin" /> Preparing the dungeon…</div>;
  if (!state) return <div className="dr-loading"><X /> {error ?? 'Match unavailable.'}</div>;

  const isLeader = state.match.leaderId === user?.id;
  const isResolving = state.match.phase === 'resolving';
  const selfPlayer = state.players.find(player => player.userId === state.self.userId);
  const isEvent = state.dungeon.cardType === 'event' && state.dungeon.eventType !== null;
  const eligibleEventCards = isEvent && !selfPlayer?.eventExcluded
    ? state.self.hand.filter(card => isDungeonRelayEventEligible(card, state.dungeon.eventType!))
    : [];
  const selfPower = selfPlayer ? DUNGEON_CLASS_POWERS[selfPlayer.classId] : null;
  const eliminationReady = selfPlayer ? canDungeonRelayClassEliminate(selfPlayer.classId, state.dungeon.cardType) : false;
  const powerContextReady = Boolean(selfPower && selfPlayer?.status === 'active' && state.match.phase === 'active'
    && state.self.hand.length >= selfPower.cost
    && (eliminationReady
      || (selfPlayer?.classId === 'champion' && isEvent)
      || (selfPlayer?.classId === 'wizard' && !state.match.timerFrozen)
      || !['barbarian', 'ranger', 'rogue', 'witch', 'champion', 'wizard'].includes(selfPlayer?.classId ?? '')));
  const secondsRemaining = state.match.timerFrozen
    ? state.match.timerRemainingSeconds
    : state.match.timerDeadline ? Math.max(0, Math.ceil((new Date(state.match.timerDeadline).getTime() - clockNow) / 1000)) : 0;
  const resumeLockSeconds = state.match.timerResumeLockedUntil ? Math.max(0, Math.ceil((new Date(state.match.timerResumeLockedUntil).getTime() - clockNow) / 1000)) : 0;
  const timerLabel = `${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, '0')}`;

  return (
    <main className={`dr-page${isResolving ? ' is-resolving' : ''}`}>
      <header className="dr-topbar">
        <button type="button" onClick={() => navigate('/multiplayer')}><ChevronLeft /> Lobby</button>
        <div className="dr-title"><span><Sparkles /></span><div><strong>Dungeon Relay</strong><small>Cooperative prototype</small></div></div>
        <div className={`dr-round-label dr-timer${state.match.timerFrozen ? ' is-frozen' : ''}`}><span><Clock3 /> {state.match.timerFrozen ? 'Frozen' : 'Run time'}</span><strong>{timerLabel} · {state.dungeon.position} / 11</strong></div>
      </header>

      <div className="dr-progress" aria-label={`Dungeon progress: ${state.dungeon.position} of 11`}>
        {Array.from({ length: 11 }, (_, index) => (
          <span key={index} className={`${index + 1 < state.dungeon.position ? 'is-complete' : ''}${index + 1 === state.dungeon.position ? ' is-current' : ''}${index === 10 ? ' is-boss' : ''}`}>
            {index + 1 < state.dungeon.position ? <Check /> : index === 10 ? <Crown /> : index + 1}
          </span>
        ))}
      </div>

      {error && <div className="dr-error" role="alert"><X /><span>{error}</span></div>}
      {state.match.timerFrozen && <div className="dr-freeze-notice" role="status" aria-live="assertive"><Clock3 /><div><strong>Time has been frozen!</strong><span>{resumeLockSeconds > 0 ? `Card play unlocks in ${resumeLockSeconds}…` : 'The next card played will restart the clock.'}</span></div></div>}

      <section className="dr-party" aria-label="Party status">
        {state.players.map(player => {
          const tone = getPlayerColor(player.color);
          return (
            <article key={player.userId} className={`dr-player${player.status === 'dead' ? ' is-dead' : ''}`} style={{ '--player-color': tone.hex } as CSSProperties}>
              <div className="dr-avatar"><img src={player.avatar || '/npc-placeholder.png'} alt="" />{player.status === 'dead' && <Skull />}</div>
              <div><strong>{player.username}{player.userId === user?.id ? ' (you)' : ''}</strong><small>{tone.className} · {player.status === 'dead' ? 'Spectating' : isEvent && player.eventExcluded ? 'Excluded from event' : isEvent && player.confirmed ? 'Event confirmed' : `${player.handCount} in hand`}</small></div>
              <div className="dr-player-counts"><span title="Deck"><Layers3 />{player.deckCount}</span><span title="Discard">♻ {player.discardCount}</span><span title="Graveyard"><Skull />{player.graveyardCount}</span></div>
            </article>
          );
        })}
      </section>

      <DiscardPiles state={state} />

      <section className="dr-board">
        <DungeonCard key={state.dungeon.position} state={state} matched={allocation?.matched ?? state.dungeon.requirements} />

        <div className={`dr-play-area${isEvent ? ' is-event' : ''}`}>
          {isEvent && (
            <EventPanel
              state={state}
              voteTargetId={voteTargetId}
              setVoteTargetId={setVoteTargetId}
              eligibleCount={eligibleEventCards.length}
              busy={busyEventAction}
              onVote={() => void runEventAction('vote', () => dungeonRelayService.vote(matchId, voteTargetId))}
              onConfirm={() => void runEventAction('confirm', () => dungeonRelayService.confirmEvent(matchId))}
            />
          )}
          <div className="dr-field-heading"><span>Cards on the field</span><small>{state.playedCards.length === 0 ? 'Play cards together to match the dungeon' : `${state.playedCards.length} cards committed`}</small></div>
          {state.playedCards.length === 0 ? (
            <div className="dr-empty-field"><Zap /><span>The field is waiting</span></div>
          ) : (
            <div className="dr-played-cards">
              {state.playedCards.map(card => (
                <RelayCard key={card.id} card={card} contribution={allocation?.contributionByCardId[card.id] ?? 0} publicCard />
              ))}
            </div>
          )}
          {state.eventDiscardCards.length > 0 && (
            <div className="dr-event-discard-pile">
              <strong><Trash2 /> Discarded to event</strong>
              <div className="dr-played-cards">{state.eventDiscardCards.map(card => <RelayCard key={card.id} card={card} contribution={0} publicCard />)}</div>
            </div>
          )}
        </div>

        {isResolving && <ResolutionBanner isBoss={state.dungeon.isBoss} isEvent={isEvent} />}
      </section>

      <section className="dr-hand-zone">
        <div className="dr-hand-heading">
          <div>
            <p>{state.self.status === 'dead' ? <><Eye /> Spectating</> : <><Layers3 /> Your hand</>}</p>
            <span>{state.self.status === 'dead' ? 'Your deck ran out while drawing. Help your party from the sidelines.' : isEvent ? 'You may still play cards normally. Highlighted cards may also be discarded to the event.' : 'Select one to five cards, then commit them to the field.'}</span>
          </div>
          {state.self.status === 'active' && (
            <div className="dr-hand-actions">
              {selfPower && <button type="button" className={`dr-power-button${eliminationReady ? ' is-ready' : ''}`} onClick={() => { setSelectedIds([]); setPowerCardIds([]); setPowerTargetId(state.players.find(player => player.status === 'active' && !player.eventExcluded)?.userId ?? ''); setPowerOpen(true); }} disabled={!powerContextReady || Boolean(selfPlayer?.confirmed)}><Flame /> {selfPower.name}</button>}
              <button type="button" className="dr-play-button" onClick={() => void playCards()} disabled={selectedIds.length === 0 || isPlaying || isResolving || selfPlayer?.confirmed || resumeLockSeconds > 0}>
                {isPlaying ? <Loader2 className="dr-spin" /> : <Zap />}
                Play {selectedIds.length > 0 ? `${selectedIds.length} card${selectedIds.length === 1 ? '' : 's'}` : 'cards'}
              </button>
            </div>
          )}
        </div>
        <div className="dr-hand">
          {state.self.status === 'active' && state.self.hand.map(card => {
            const eventEligible = isEvent && isDungeonRelayEventEligible(card, state.dungeon.eventType!);
            return (
              <div key={card.id} className={`dr-hand-card-wrap${eventEligible ? ' is-event-eligible' : ''}`}>
                <button type="button" className={selectedIds.includes(card.id) ? 'is-selected' : ''} onClick={() => toggleCard(card.id)} disabled={isPlaying || isResolving || Boolean(selfPlayer?.confirmed)} aria-pressed={selectedIds.includes(card.id)}>
                  <RelayCard card={card} contribution={0} />
                  <span className="dr-select-mark"><Check /></span>
                </button>
                {eventEligible && !selfPlayer?.confirmed && (
                  <button type="button" className="dr-event-discard-button" disabled={Boolean(busyEventAction) || isResolving} onClick={() => void runEventAction(card.id, () => dungeonRelayService.discardForEvent(matchId, [card.id]))}>
                    {busyEventAction === card.id ? <Loader2 className="dr-spin" /> : <Trash2 />} Discard
                  </button>
                )}
              </div>
            );
          })}
          {state.self.status === 'dead' && <div className="dr-spectator-hand"><Skull /><strong>You have fallen</strong><span>The shared board will continue updating live.</span></div>}
        </div>
      </section>

      {state.match.phase === 'complete' && (
        <EndScreen won={state.match.status === 'won'} timedOut={state.match.status === 'lost' && secondsRemaining === 0 && state.players.some(player => player.status === 'active')} isLeader={isLeader} busy={isRetrying} onRetry={() => void retry()} onLobby={() => navigate('/multiplayer')} />
      )}
      {powerOpen && selfPlayer && selfPower && (
        <PowerDialog
          state={state}
          power={selfPower}
          className={getPlayerColor(selfPlayer.color).className}
          selectedIds={powerCardIds}
          targetId={powerTargetId}
          busy={busyEventAction === 'power'}
          onToggle={cardId => setPowerCardIds(current => current.includes(cardId) ? current.filter(id => id !== cardId) : current.length < selfPower.cost ? [...current, cardId] : current)}
          onTarget={setPowerTargetId}
          onClose={() => { setPowerOpen(false); setPowerCardIds([]); }}
          onUse={() => void activatePower()}
        />
      )}
    </main>
  );
}

function DungeonCard({ state, matched }: { state: DungeonRelayState; matched: DungeonRelayState['dungeon']['requirements'] }) {
  const cardType = DUNGEON_CARD_TYPES[state.dungeon.cardType];
  return (
    <article className={`dr-dungeon-card is-${state.dungeon.cardType}`}>
      <div className="dr-dungeon-art"><span>{state.dungeon.isBoss ? <Crown /> : cardType.glyph}</span><div className="dr-door-lines" /></div>
      <div className="dr-dungeon-copy"><p>{state.dungeon.isBoss ? 'Final encounter' : `Depth ${state.dungeon.position}`}</p><h1>{state.dungeon.name}</h1><span>{state.dungeon.cardType === 'event' ? 'The party must resolve this event to advance' : 'Match every required symbol to advance'}</span></div>
      <div className="dr-requirements">
        {DUNGEON_RELAY_SYMBOLS.map(symbol => {
          const requirement = state.dungeon.requirements[symbol];
          if (requirement === 0) return null;
          const meta = getDungeonSymbol(symbol);
          return (
            <div className="dr-requirement" key={symbol} style={{ '--symbol-color': meta.color } as CSSProperties}>
              <small>{meta.shortLabel}</small>
              <div>{Array.from({ length: requirement }, (_, index) => <i key={index} className={index < matched[symbol] ? 'is-matched' : ''}>{meta.glyph}</i>)}</div>
            </div>
          );
        })}
      </div>
      <footer className="dr-card-type"><span>{cardType.glyph}</span>{cardType.label}</footer>
    </article>
  );
}

function DiscardPiles({ state }: { state: DungeonRelayState }) {
  if (state.discardCards.length === 0) return null;
  return (
    <details className="dr-discard-piles">
      <summary><Trash2 /> Personal discard piles <span>{state.discardCards.length} recoverable card{state.discardCards.length === 1 ? '' : 's'}</span></summary>
      <div>
        {state.players.map(player => {
          const cards = state.discardCards.filter(card => card.userId === player.userId);
          if (cards.length === 0) return null;
          return <section key={player.userId}><strong>{player.username} · {cards.length}</strong><div>{cards.map(card => <RelayCard key={card.id} card={card} contribution={0} publicCard />)}</div></section>;
        })}
      </div>
    </details>
  );
}

function PowerDialog({ state, power, className, selectedIds, targetId, busy, onToggle, onTarget, onClose, onUse }: {
  state: DungeonRelayState;
  power: { name: string; description: string; cost: number; target: 'none' | 'player' };
  className: string;
  selectedIds: string[];
  targetId: string;
  busy: boolean;
  onToggle: (cardId: string) => void;
  onTarget: (targetId: string) => void;
  onClose: () => void;
  onUse: () => void;
}) {
  const targets = state.players.filter(player => player.status === 'active' && (className !== 'Champion' || !player.eventExcluded));
  return (
    <div className="dr-power-backdrop" role="presentation">
      <section className="dr-power-dialog" role="dialog" aria-modal="true" aria-labelledby="dr-power-title">
        <button type="button" className="dr-power-close" onClick={onClose} disabled={busy} aria-label="Close power dialog"><X /></button>
        <p>{className} power</p>
        <h2 id="dr-power-title">{power.name}</h2>
        <span>{power.description}</span>
        <div className="dr-power-cost"><strong>Choose {power.cost} card{power.cost === 1 ? '' : 's'} to discard</strong><small>{selectedIds.length} / {power.cost} selected</small></div>
        <div className="dr-power-hand">
          {state.self.hand.map(card => <button key={card.id} type="button" className={selectedIds.includes(card.id) ? 'is-selected' : ''} onClick={() => onToggle(card.id)} disabled={busy}><RelayCard card={card} contribution={0} /><span className="dr-select-mark"><Check /></span></button>)}
        </div>
        {power.target === 'player' && <label className="dr-power-target">Choose a player<select value={targetId} onChange={event => onTarget(event.target.value)} disabled={busy}>{targets.map(player => <option key={player.userId} value={player.userId}>{player.username}{player.userId === state.self.userId ? ' (you)' : ''}</option>)}</select></label>}
        <div className="dr-power-actions"><button type="button" className="dr-secondary-button" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="dr-primary-button" onClick={onUse} disabled={busy || selectedIds.length !== power.cost || (power.target === 'player' && !targetId)}>{busy ? <Loader2 className="dr-spin" /> : <Flame />} Use power</button></div>
      </section>
    </div>
  );
}

function EventPanel({ state, voteTargetId, setVoteTargetId, eligibleCount, busy, onVote, onConfirm }: {
  state: DungeonRelayState;
  voteTargetId: string;
  setVoteTargetId: (value: string) => void;
  eligibleCount: number;
  busy: string | null;
  onVote: () => void;
  onConfirm: () => void;
}) {
  if (!state.dungeon.eventType) return null;
  const event = DUNGEON_EVENTS[state.dungeon.eventType];
  const self = state.players.find(player => player.userId === state.self.userId);
  const selectedTarget = state.players.find(player => player.userId === state.dungeon.selectedTargetId);
  const activePlayers = state.players.filter(player => player.status === 'active' && !player.eventExcluded);
  const votesCast = activePlayers.filter(player => player.voteTargetId).length;
  const confirmations = activePlayers.filter(player => player.confirmed).length;
  const awaitingDiscards = state.dungeon.eventType === 'discard_shields' || state.dungeon.eventType === 'discard_multis';

  if (self?.eventExcluded) {
    return <section className="dr-event-panel"><div className="dr-event-heading"><span>✦</span><div><small>Party event</small><strong>{event.title}</strong></div></div><p>You have been excluded from this event. Its instructions and effects do not apply to you.</p></section>;
  }

  return (
    <section className="dr-event-panel" aria-labelledby="dr-event-title">
      <div className="dr-event-heading"><span>✦</span><div><small>Party event</small><strong id="dr-event-title">{event.title}</strong></div></div>
      <p>{event.instructions}</p>
      {state.dungeon.eventStage === 'voting' ? (
        <div className="dr-event-controls">
          <label htmlFor="dr-vote-target">Choose a player</label>
          <select id="dr-vote-target" value={voteTargetId} onChange={eventValue => setVoteTargetId(eventValue.target.value)} disabled={Boolean(busy)}>
            {activePlayers.map(player => <option key={player.userId} value={player.userId}>{player.username}{player.userId === state.self.userId ? ' (you)' : ''}</option>)}
          </select>
          <button type="button" onClick={onVote} disabled={!voteTargetId || Boolean(busy) || self?.status !== 'active'}>{busy === 'vote' ? <Loader2 className="dr-spin" /> : <Vote />} Cast vote</button>
          <small>{votesCast} / {activePlayers.length} votes cast{self?.voteTargetId ? ' · your vote is recorded' : ''}</small>
        </div>
      ) : (
        <div className="dr-event-controls">
          {selectedTarget && <p className="dr-event-result"><Crown /> All hands will go to <strong>{selectedTarget.username}</strong>.</p>}
          {awaitingDiscards && eligibleCount > 0 && <p className="dr-event-warning"><Trash2 /> You still have {eligibleCount} highlighted card{eligibleCount === 1 ? '' : 's'} to play or discard.</p>}
          <button type="button" onClick={onConfirm} disabled={Boolean(busy) || Boolean(self?.confirmed) || eligibleCount > 0 || self?.status !== 'active'}>
            {busy === 'confirm' ? <Loader2 className="dr-spin" /> : <Check />} {self?.confirmed ? 'Confirmed' : 'Confirm event'}
          </button>
          <small>{confirmations} / {activePlayers.length} players confirmed</small>
        </div>
      )}
    </section>
  );
}

function RelayCard({ card, contribution, publicCard = false }: {
  card: DungeonRelayHandCard | DungeonRelayPublicCard;
  contribution: number;
  publicCard?: boolean;
}) {
  const meta = getDungeonSymbol(card.symbol);
  const owner = 'username' in card ? card.username : undefined;
  return (
    <article className={`dr-card${publicCard ? ' is-public' : ''}`} style={{ '--symbol-color': meta.color } as CSSProperties}>
      <div className="dr-card-corners"><span>{card.symbols}</span><i>{meta.glyph}</i></div>
      <div className="dr-card-symbols">
        {Array.from({ length: card.symbols }, (_, index) => <i key={index} className={publicCard && index >= contribution ? 'is-extra' : ''}>{meta.glyph}</i>)}
      </div>
      <strong>{meta.shortLabel}{card.symbols > 1 ? ` ×${card.symbols}` : ''}</strong>
      {owner && <small>{owner}</small>}
    </article>
  );
}

function ResolutionBanner({ isBoss, isEvent }: { isBoss: boolean; isEvent: boolean }) {
  return (
    <div className="dr-resolution" role="status" aria-live="assertive">
      <span><Check /></span>
      <div><strong>{isBoss ? 'Boss defeated!' : isEvent ? 'Event resolved!' : 'Symbols matched!'}</strong><small>{isBoss ? 'The dungeon is conquered.' : 'Drawing the next card…'}</small></div>
    </div>
  );
}

function EndScreen({ won, timedOut, isLeader, busy, onRetry, onLobby }: { won: boolean; timedOut: boolean; isLeader: boolean; busy: boolean; onRetry: () => void; onLobby: () => void }) {
  return (
    <div className="dr-end-backdrop">
      <section className={`dr-end-screen${won ? ' is-win' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dr-end-title">
        <span className="dr-end-icon">{won ? <Trophy /> : <Skull />}</span>
        <p>{won ? 'Dungeon cleared' : timedOut ? 'Time expired' : 'Party defeated'}</p>
        <h2 id="dr-end-title">{won ? 'The Warden has fallen!' : timedOut ? 'The dungeon closes around you.' : 'No adventurers remain.'}</h2>
        <span>{won ? 'Your party defeated all ten chambers and the boss.' : timedOut ? 'The party did not defeat the boss within five minutes.' : 'Every player ran out of cards while drawing.'}</span>
        <div>
          <button type="button" className="dr-secondary-button" onClick={onLobby}><Users /> Team lobby</button>
          {isLeader ? <button type="button" className="dr-primary-button" onClick={onRetry} disabled={busy}>{busy ? <Loader2 className="dr-spin" /> : <RotateCcw />} Try again</button> : <small>Waiting for the team leader to start another run.</small>}
        </div>
      </section>
    </div>
  );
}
