import { useState } from 'react';
import { emptyDungeonRelayRequirements, type DungeonRelaySymbol } from '@scon/rules';
import { Loader2, Sparkles, X } from 'lucide-react';
import { DUNGEON_SPECIAL_CARDS, DUNGEON_SYMBOLS, type DungeonRelayHandCard, type DungeonRelayState } from './dungeonRelayGame';
import { dungeonRelayService } from './dungeonRelayService';

export default function DungeonRelaySpecialDialog({ card, state, onClose, onPlayed }: {
  card: DungeonRelayHandCard;
  state: DungeonRelayState;
  onClose: () => void;
  onPlayed: () => Promise<void>;
}) {
  const [targetId, setTargetId] = useState('');
  const [mode, setMode] = useState<'transfer' | 'draw_all'>('transfer');
  const [symbols, setSymbols] = useState<DungeonRelaySymbol[]>(['sword', 'sword', 'sword']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!card.special) return null;
  const special = card.special;
  const meta = DUNGEON_SPECIAL_CARDS[special];
  const needsTarget = special === 'gift_three' || (special === 'cleric_blessing' && mode === 'transfer');
  const targets = state.players.filter(player => player.userId !== state.self.userId && (special === 'cleric_blessing' || player.status === 'active'));
  const deckCount = state.players.find(player => player.userId === state.self.userId)?.deckCount ?? 0;
  const encounterReady = (special !== 'slay_boss' || ['mini_boss', 'boss'].includes(state.dungeon.cardType))
    && (special !== 'slay_person' || state.dungeon.cardType === 'person')
    && (special !== 'slay_beast' || state.dungeon.cardType === 'beast');
  const self = state.players.find(player => player.userId === state.self.userId);
  const ready = encounterReady && state.match.phase === 'active' && state.match.status === 'active'
    && self?.status === 'active' && !self.confirmed && state.self.hand.some(candidate => candidate.id === card.id)
    && (!needsTarget || targets.some(player => player.userId === targetId))
    && (special !== 'cleric_blessing' || mode !== 'transfer' || deckCount >= 2);

  const play = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const chosen = emptyDungeonRelayRequirements();
    symbols.forEach(symbol => { chosen[symbol] += 1; });
    try {
      await dungeonRelayService.playSpecial(state.match.id, card.id, needsTarget ? targetId : null,
        special === 'cleric_blessing' ? mode : null, special === 'wild_three' ? chosen : null);
      await onPlayed();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The special card could not be played.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dr-power-backdrop">
      <section className="dr-power-dialog dr-special-dialog" role="dialog" aria-modal="true" aria-labelledby="dr-special-title">
        <button className="dr-power-close" type="button" onClick={onClose} disabled={busy} aria-label="Close special card"><X /></button>
        <p>Special card</p><h2 id="dr-special-title">{meta.name}</h2><span>{meta.description}</span>
        {special === 'counter_event' && <p>{state.dungeon.cardType === 'event' ? 'Cancel this event without applying its remaining effects.' : 'Draw 2 cards from your deck.'}</p>}
        {special === 'cleric_blessing' && <>
          <label className="dr-power-target">Choose an effect
            <select value={mode} onChange={event => { setMode(event.target.value === 'transfer' ? 'transfer' : 'draw_all'); setTargetId(''); }} disabled={busy}>
              <option value="transfer">Share {Math.floor(deckCount / 2)} of your {deckCount} deck cards</option>
              <option value="draw_all">Every other surviving player draws 2</option>
            </select>
          </label>
          {mode === 'transfer' && <p>Cards go to the bottom of their deck. A revived player immediately draws up to 5 of the donated cards.</p>}
        </>}
        {needsTarget && <label className="dr-power-target">Choose another player
          <select value={targetId} onChange={event => setTargetId(event.target.value)} disabled={busy}>
            <option value="">Select a player</option>
            {targets.map(player => <option key={player.userId} value={player.userId}>{player.username}{player.status === 'dead' ? ' — revive' : ` — ${player.deckCount} in deck`}</option>)}
          </select>
        </label>}
        {special === 'wild_three' && <div className="dr-wild-choices">{symbols.map((symbol, index) => <label className="dr-power-target" key={index}>Symbol {index + 1}
          <select value={symbol} disabled={busy} onChange={event => {
            const choice = DUNGEON_SYMBOLS.find(candidate => candidate.id === event.target.value);
            if (choice) setSymbols(current => current.map((value, position) => position === index ? choice.id : value));
          }}>{DUNGEON_SYMBOLS.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select>
        </label>)}</div>}
        {!encounterReady && <p role="status">Save this card for a matching encounter.</p>}
        {error && <p role="alert">{error}</p>}
        <div className="dr-power-actions"><button className="dr-secondary-button" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="dr-primary-button" type="button" onClick={() => void play()} disabled={busy || !ready}>{busy ? <Loader2 className="dr-spin" /> : <Sparkles />} Play special</button>
        </div>
      </section>
    </div>
  );
}
