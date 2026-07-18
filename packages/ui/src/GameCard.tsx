import type { CardDefinition } from "@scon/cards";
import type { KeyboardEvent, ReactElement } from "react";
import { ManaCost } from "./ManaCost";

export interface GameCardProps { card: CardDefinition; selected?: boolean; disabled?: boolean; compact?: boolean; onActivate?: (card: CardDefinition) => void; }
export function GameCard({ card, selected = false, disabled = false, compact = false, onActivate }: GameCardProps): ReactElement {
  const interactive = Boolean(onActivate);
  const activate = () => { if (!disabled) onActivate?.(card); };
  const keyDown = (event: KeyboardEvent<HTMLElement>) => { if (interactive && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); activate(); } };
  return <article className={`scon-card scon-card--${card.type}${selected ? " is-selected" : ""}${disabled ? " is-disabled" : ""}`} aria-label={`${card.name}, ${card.type}. ${card.rulesText}`} aria-pressed={interactive ? selected : undefined} aria-disabled={disabled || undefined} role={interactive ? "button" : "group"} tabIndex={interactive && !disabled ? 0 : undefined} onClick={interactive ? activate : undefined} onKeyDown={interactive ? keyDown : undefined}>
    <header className="scon-card__header"><h3>{card.name}</h3><ManaCost cost={card.cost} compact /></header>
    {!compact && <figure className="scon-card__art"><img src={card.art.thumbnail} alt={`Placeholder artwork for ${card.name}`} loading="lazy" /><figcaption className="scon-sr-only">{card.art.artist ? `Art by ${card.art.artist}` : "Artwork attribution unavailable"}</figcaption></figure>}
    {card.type === "creature" && <p className="scon-card__stats" aria-label={`${card.power} power, ${card.health} health`}>{card.power} / {card.health}</p>}
    <p className="scon-card__type">{card.type}</p>{!compact && <p className="scon-card__rules">{card.rulesText}</p>}
  </article>;
}
