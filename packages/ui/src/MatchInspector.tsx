import type { CardDefinition } from "@scon/cards";
import type { ReactElement, ReactNode } from "react";
import { GameCard } from "./GameCard";
import { MatchLog, type MatchLogEntry } from "./MatchLog";

export function MatchInspector({ card, entries, connection, priority, actions }: { card?: CardDefinition; entries: readonly MatchLogEntry[]; connection: "connected" | "reconnecting" | "offline"; priority?: string; actions?: ReactNode }): ReactElement {
  return <aside className="scon-inspector" aria-label="Match inspector"><div className="scon-inspector__status"><span className={`is-${connection}`} role="status">Connection: {connection}</span>{priority && <span>Priority: {priority}</span>}</div>
    <section aria-label="Inspected card">{card ? <GameCard card={card} /> : <p>Select a card to inspect its complete rules.</p>}</section>
    {actions && <div className="scon-inspector__actions" aria-label="Available actions">{actions}</div>}<MatchLog entries={entries} />
  </aside>;
}
