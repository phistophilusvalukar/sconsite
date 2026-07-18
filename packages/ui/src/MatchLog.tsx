import type { ReactElement } from "react";

export interface MatchLogEntry { id: string; message: string; timestamp?: string; tone?: "neutral" | "positive" | "negative" | "warning"; }
export function MatchLog({ entries, label = "Match log", live = true }: { entries: readonly MatchLogEntry[]; label?: string; live?: boolean }): ReactElement {
  return <section className="scon-match-log" aria-label={label}><ol aria-live={live ? "polite" : "off"} aria-relevant="additions text">{entries.map((entry) => <li key={entry.id} className={`is-${entry.tone ?? "neutral"}`}><span>{entry.message}</span>{entry.timestamp && <time dateTime={entry.timestamp}>{entry.timestamp}</time>}</li>)}</ol>{!entries.length && <p>No match events yet.</p>}</section>;
}
