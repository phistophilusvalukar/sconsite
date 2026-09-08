import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { allocateDungeonRelayMatches, DUNGEON_RELAY_SYMBOLS } from '@scon/rules';
import { Check, ChevronLeft, Crown, Eye, Layers3, Loader2, RotateCcw, Skull, Sparkles, Trophy, Users, X, Zap } from 'lucide-react';
import { DATABASE_TABLES } from '../../config/database';
import { useAuth } from '../../context/useAuth';
import { useSupabaseRealtime } from '../../hooks/useSupabaseRealtime';
import { getPlayerColor } from './multiplayerLobby';
import { getDungeonSymbol, type DungeonRelayHandCard, type DungeonRelayPublicCard, type DungeonRelayState } from './dungeonRelayGame';
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
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    if (!matchId) return;
    try {
      const snapshot = await dungeonRelayService.getState(matchId);
      setState(snapshot);
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

  const allocation = useMemo(() => state ? allocateDungeonRelayMatches(
    state.dungeon.requirements,
    state.playedCards,
  ) : null, [state]);

  const toggleCard = (cardId: string) => {
    if (!state || state.match.phase !== 'active' || state.self.status === 'dead' || isPlaying) return;
    setSelectedIds(current => current.includes(cardId)
      ? current.filter(id => id !== cardId)
      : [...current, cardId]);
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

  return (
    <main className={`dr-page${isResolving ? ' is-resolving' : ''}`}>
      <header className="dr-topbar">
        <button type="button" onClick={() => navigate('/multiplayer')}><ChevronLeft /> Lobby</button>
        <div className="dr-title"><span><Sparkles /></span><div><strong>Dungeon Relay</strong><small>Cooperative prototype</small></div></div>
        <div className="dr-round-label"><span>{state.dungeon.isBoss ? 'Boss' : 'Chamber'}</span><strong>{state.dungeon.position} / 11</strong></div>
      </header>

      <div className="dr-progress" aria-label={`Dungeon progress: ${state.dungeon.position} of 11`}>
        {Array.from({ length: 11 }, (_, index) => (
          <span key={index} className={`${index + 1 < state.dungeon.position ? 'is-complete' : ''}${index + 1 === state.dungeon.position ? ' is-current' : ''}${index === 10 ? ' is-boss' : ''}`}>
            {index + 1 < state.dungeon.position ? <Check /> : index === 10 ? <Crown /> : index + 1}
          </span>
        ))}
      </div>

      {error && <div className="dr-error" role="alert"><X /><span>{error}</span></div>}

      <section className="dr-party" aria-label="Party status">
        {state.players.map(player => {
          const tone = getPlayerColor(player.color);
          return (
            <article key={player.userId} className={`dr-player${player.status === 'dead' ? ' is-dead' : ''}`} style={{ '--player-color': tone.hex } as CSSProperties}>
              <div className="dr-avatar"><img src={player.avatar || '/npc-placeholder.png'} alt="" />{player.status === 'dead' && <Skull />}</div>
              <div><strong>{player.username}{player.userId === user?.id ? ' (you)' : ''}</strong><small>{player.status === 'dead' ? 'Spectating' : `${player.handCount} in hand`}</small></div>
              <div className="dr-player-counts"><span title="Deck"><Layers3 />{player.deckCount}</span><span title="Discard">♻ {player.discardCount}</span></div>
            </article>
          );
        })}
      </section>

      <section className="dr-board">
        <DungeonCard key={state.dungeon.position} state={state} matched={allocation?.matched ?? state.dungeon.requirements} />

        <div className="dr-play-area">
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
        </div>

        {isResolving && <ResolutionBanner isBoss={state.dungeon.isBoss} />}
      </section>

      <section className="dr-hand-zone">
        <div className="dr-hand-heading">
          <div>
            <p>{state.self.status === 'dead' ? <><Eye /> Spectating</> : <><Layers3 /> Your hand</>}</p>
            <span>{state.self.status === 'dead' ? 'Your deck ran out while drawing. Help your party from the sidelines.' : 'Select one or more cards, then commit them to the field.'}</span>
          </div>
          {state.self.status === 'active' && (
            <button type="button" className="dr-play-button" onClick={() => void playCards()} disabled={selectedIds.length === 0 || isPlaying || isResolving}>
              {isPlaying ? <Loader2 className="dr-spin" /> : <Zap />}
              Play {selectedIds.length > 0 ? `${selectedIds.length} card${selectedIds.length === 1 ? '' : 's'}` : 'cards'}
            </button>
          )}
        </div>
        <div className="dr-hand">
          {state.self.status === 'active' && state.self.hand.map(card => (
            <button key={card.id} type="button" className={selectedIds.includes(card.id) ? 'is-selected' : ''} onClick={() => toggleCard(card.id)} disabled={isPlaying || isResolving} aria-pressed={selectedIds.includes(card.id)}>
              <RelayCard card={card} contribution={0} />
              <span className="dr-select-mark"><Check /></span>
            </button>
          ))}
          {state.self.status === 'dead' && <div className="dr-spectator-hand"><Skull /><strong>You have fallen</strong><span>The shared board will continue updating live.</span></div>}
        </div>
      </section>

      {state.match.phase === 'complete' && (
        <EndScreen won={state.match.status === 'won'} isLeader={isLeader} busy={isRetrying} onRetry={() => void retry()} onLobby={() => navigate('/multiplayer')} />
      )}
    </main>
  );
}

function DungeonCard({ state, matched }: { state: DungeonRelayState; matched: DungeonRelayState['dungeon']['requirements'] }) {
  return (
    <article className={`dr-dungeon-card${state.dungeon.isBoss ? ' is-boss' : ''}`}>
      <div className="dr-dungeon-art"><span>{state.dungeon.isBoss ? <Crown /> : state.dungeon.position}</span><div className="dr-door-lines" /></div>
      <div className="dr-dungeon-copy"><p>{state.dungeon.isBoss ? 'Final encounter' : `Depth ${state.dungeon.position}`}</p><h1>{state.dungeon.name}</h1><span>Match every required symbol to advance</span></div>
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
    </article>
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

function ResolutionBanner({ isBoss }: { isBoss: boolean }) {
  return (
    <div className="dr-resolution" role="status" aria-live="assertive">
      <span><Check /></span>
      <div><strong>{isBoss ? 'Boss defeated!' : 'Symbols matched!'}</strong><small>{isBoss ? 'The dungeon is conquered.' : 'Drawing the next chamber…'}</small></div>
    </div>
  );
}

function EndScreen({ won, isLeader, busy, onRetry, onLobby }: { won: boolean; isLeader: boolean; busy: boolean; onRetry: () => void; onLobby: () => void }) {
  return (
    <div className="dr-end-backdrop">
      <section className={`dr-end-screen${won ? ' is-win' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dr-end-title">
        <span className="dr-end-icon">{won ? <Trophy /> : <Skull />}</span>
        <p>{won ? 'Dungeon cleared' : 'Party defeated'}</p>
        <h2 id="dr-end-title">{won ? 'The Warden has fallen!' : 'No adventurers remain.'}</h2>
        <span>{won ? 'Your party defeated all ten chambers and the boss.' : 'Every player ran out of cards while drawing.'}</span>
        <div>
          <button type="button" className="dr-secondary-button" onClick={onLobby}><Users /> Team lobby</button>
          {isLeader ? <button type="button" className="dr-primary-button" onClick={onRetry} disabled={busy}>{busy ? <Loader2 className="dr-spin" /> : <RotateCcw />} Try again</button> : <small>Waiting for the team leader to start another run.</small>}
        </div>
      </section>
    </div>
  );
}
