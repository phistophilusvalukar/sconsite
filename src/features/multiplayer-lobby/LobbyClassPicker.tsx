import { useId, type CSSProperties } from 'react';
import { DUNGEON_RELAY_CLASS_DECKS } from '@scon/rules';
import { DUNGEON_CLASS_POWERS, DUNGEON_SPECIAL_CARDS, getDungeonSymbol } from './dungeonRelayGame';
import { getPlayerColor, PLAYER_COLORS, type PlayerColor } from './multiplayerLobby';

export default function LobbyClassPicker({ value, onChange, disabled }: {
  value: PlayerColor;
  onChange: (color: PlayerColor) => void;
  disabled: boolean;
}) {
  const id = useId();
  const selected = getPlayerColor(value);
  const power = DUNGEON_CLASS_POWERS[selected.classId];
  const deck = DUNGEON_RELAY_CLASS_DECKS[selected.classId];
  const special = DUNGEON_SPECIAL_CARDS[deck.special];
  const symbol = getDungeonSymbol(deck.symbol);

  return (
    <div className="ml-class-picker">
      <fieldset className="ml-class-options" disabled={disabled}>
        <legend className="sr-only">Choose your class</legend>
        {PLAYER_COLORS.map(option => {
          const classSymbol = getDungeonSymbol(DUNGEON_RELAY_CLASS_DECKS[option.classId].symbol);
          return (
            <label key={option.id} className={`ml-class-option${value === option.id ? ' is-selected' : ''}`} style={{ '--class-color': option.hex } as CSSProperties}>
              <input type="radio" name={id} value={option.id} checked={value === option.id} onChange={() => onChange(option.id)} />
              <span aria-hidden="true">{classSymbol.glyph}</span>
              <strong>{option.className}</strong>
            </label>
          );
        })}
      </fieldset>
      <section className="ml-class-details" aria-labelledby={`${id}-details`} aria-live="polite" aria-atomic="true" style={{ '--class-color': selected.hex } as CSSProperties}>
        <header><div><p>Selected class</p><h3 id={`${id}-details`}>{selected.className}</h3></div><span>60-card deck</span></header>
        <dl>
          <div><dt>Class power <span>Discard {power.cost} {power.cost === 1 ? 'card' : 'cards'}</span></dt><dd><strong>{power.name}</strong><p>{power.description}</p></dd></div>
          <div><dt>Special cards <span>{deck.copies} {deck.copies === 1 ? 'copy' : 'copies'}</span></dt><dd><strong>{special.name}</strong><p>{special.description}</p></dd></div>
          <div><dt>Triple-symbol cards <span>3 copies</span></dt><dd><strong className="ml-class-triples"><span aria-hidden="true" style={{ color: symbol.color }}>{symbol.glyph} {symbol.glyph} {symbol.glyph}</span>{symbol.label} ×3</strong><p>Each card contributes three {symbol.shortLabel.toLowerCase()} symbols. Your starting deck has triples only in this color.</p></dd></div>
        </dl>
      </section>
    </div>
  );
}
