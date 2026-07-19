import { GAME_GLOSSARY, type GlossaryKey } from "@scon/cards";
import { Fragment, type ReactElement } from "react";
import { KeywordTooltip } from "./KeywordTooltip";

const aliases: ReadonlyArray<readonly [string, GlossaryKey]> = Object.entries(GAME_GLOSSARY)
  .flatMap(([key, entry]) => [[entry.term, key as GlossaryKey] as const])
  .sort(([left], [right]) => right.length - left.length);
const escaped = aliases.map(([term]) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
const terminologyPattern = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");

export function GlossaryText({ children }: { children: string }): ReactElement {
  const keysByTerm = new Map(aliases.map(([term, key]) => [term.toLowerCase(), key]));
  return <>{children.split(terminologyPattern).map((part, index) => {
    const key = keysByTerm.get(part.toLowerCase());
    return <Fragment key={`${index}-${part}`}>{key ? <KeywordTooltip keyword={GAME_GLOSSARY[key].term} description={GAME_GLOSSARY[key].description}>{part}</KeywordTooltip> : part}</Fragment>;
  })}</>;
}
