import type { ManaTradition } from "@scon/cards";
import type { ReactElement } from "react";

export type DisplayManaCost = Partial<Record<ManaTradition, number | undefined>> & { generic: number };
const labels: Record<ManaTradition, string> = { generic: "Generic", arcane: "Arcane", divine: "Divine", occult: "Occult", primal: "Primal" };
const order: ManaTradition[] = ["generic", "arcane", "divine", "occult", "primal"];

export function ManaCost({ cost, compact = false }: { cost: DisplayManaCost; compact?: boolean }): ReactElement {
  const entries = order.flatMap((tradition) => (cost[tradition] ?? 0) > 0 ? [[tradition, cost[tradition] ?? 0] as const] : []);
  const spoken = entries.length ? entries.map(([type, amount]) => `${amount} ${labels[type]}`).join(", ") : "No mana";
  return <span className="scon-mana" aria-label={`Mana cost: ${spoken}`} title={`Mana cost: ${spoken}`}>
    {entries.length ? entries.map(([type, amount]) => <span className={`scon-mana__pip scon-mana__pip--${type}`} aria-hidden="true" key={type}>{compact ? amount : `${amount} ${labels[type][0]}`}</span>) : <span className="scon-mana__free" aria-hidden="true">0</span>}
  </span>;
}
