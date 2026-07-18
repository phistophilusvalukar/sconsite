import type { CardDefinition, DeckDefinition } from "@scon/cards";
import type { ReactElement } from "react";
import { ManaCost } from "./ManaCost";

export function DeckList({ deck, catalog, selectedCardId, onSelectCard, emptyMessage = "This deck has no cards." }: { deck: DeckDefinition; catalog: readonly CardDefinition[]; selectedCardId?: string; onSelectCard?: (card: CardDefinition) => void; emptyMessage?: string }): ReactElement {
  const rows = deck.cards.map((entry) => ({ entry, card: catalog.find((card) => card.id === entry.cardId && card.version === entry.version) }));
  const total = deck.cards.reduce((sum, entry) => sum + entry.count, 0);
  return <section className="scon-deck" aria-labelledby={`deck-${deck.id}`}><header><h2 id={`deck-${deck.id}`}>{deck.name}</h2><span aria-label={`${total} cards`}>{total} cards</span></header>
    {!rows.length ? <p>{emptyMessage}</p> : <ul>{rows.map(({ entry, card }) => <li key={`${entry.cardId}@${entry.version}`}>
      {card ? <button type="button" className={selectedCardId === card.id ? "is-selected" : undefined} aria-pressed={selectedCardId === card.id} onClick={() => onSelectCard?.(card)} disabled={!onSelectCard}><span>{entry.count}× {card.name}</span><ManaCost cost={card.cost} compact /></button> : <span role="alert">{entry.count}× Unknown card {entry.cardId}@{entry.version}</span>}
    </li>)}</ul>}
  </section>;
}
