import type { CardDefinition } from "@scon/cards";
import type { ReactElement } from "react";
import { ManaCost } from "./ManaCost";
import { GlossaryText } from "./GlossaryText";

export interface GameCardProps { card: CardDefinition; selected?: boolean; disabled?: boolean; compact?: boolean; onActivate?: (card: CardDefinition) => void; }
export function GameCard({ card, selected = false, disabled = false, compact = false, onActivate }: GameCardProps): ReactElement {
  const interactive = Boolean(onActivate);
  const activate = () => { if (!disabled) onActivate?.(card); };
  return <article className={`scon-card scon-card--${card.type}${selected ? " is-selected" : ""}${disabled ? " is-disabled" : ""}`} aria-label={`${card.name}, ${card.type}. ${card.rulesText}`} aria-disabled={disabled || undefined} role="group">
    <header className="scon-card__header"><h3>{card.name}</h3><ManaCost cost={card.cost} compact /></header>
    {!compact && <figure className="scon-card__art"><img src={card.art.thumbnail} alt={`Artwork for ${card.name}`} loading="lazy" /><figcaption className="scon-sr-only">{card.art.artist ? `Art by ${card.art.artist}` : "Artwork attribution unavailable"}</figcaption></figure>}
    {card.type === "creature" && <p className="scon-card__stats" aria-label={`${card.power} power, ${card.health} health`}>{card.power} / {card.health}</p>}
    <p className="scon-card__type"><GlossaryText>{card.type === "font" ? "Font" : card.type === "aura" ? "Aura" : card.type}</GlossaryText></p>{!compact && <p className="scon-card__rules"><GlossaryText>{card.rulesText}</GlossaryText></p>}
    {card.keywords.length > 0 && <ul className="scon-card__keywords" aria-label="Keywords">{card.keywords.map((keyword) => <li key={keyword}><GlossaryText>{keyword}</GlossaryText></li>)}</ul>}
    {interactive && <button type="button" className="scon-card__select" aria-pressed={selected} disabled={disabled} onClick={activate}>Select {card.name}</button>}
  </article>;
}
