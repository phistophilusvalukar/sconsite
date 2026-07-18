import { type CardDefinition, cardDefinitionSchema, type DeckDefinition, deckSchema } from "./schema";

export type ValidationIssue = { path: string; message: string };
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };
const issues = (error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> }): ValidationIssue[] =>
  error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));

export function validateCard(input: unknown): ValidationResult<CardDefinition> {
  const result = cardDefinitionSchema.safeParse(input);
  return result.success ? { ok: true, value: result.data } : { ok: false, issues: issues(result.error) };
}

export function validateCardSet(input: readonly unknown[]): ValidationResult<CardDefinition[]> {
  const cards: CardDefinition[] = [];
  const found: ValidationIssue[] = [];
  const identities = new Set<string>();
  input.forEach((entry, index) => {
    const parsed = validateCard(entry);
    if (!parsed.ok) found.push(...parsed.issues.map((issue) => ({ ...issue, path: `${index}.${issue.path}` })));
    else {
      const identity = `${parsed.value.id}@${parsed.value.version}`;
      if (identities.has(identity)) found.push({ path: `${index}.id`, message: `duplicate identity ${identity}` });
      identities.add(identity); cards.push(parsed.value);
    }
  });
  return found.length ? { ok: false, issues: found } : { ok: true, value: cards };
}

export function validateDeck(input: unknown, catalog: readonly CardDefinition[]): ValidationResult<DeckDefinition> {
  const parsed = deckSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: issues(parsed.error) };
  const found: ValidationIssue[] = [];
  const seen = new Set<string>();
  let size = 0;
  for (const [index, entry] of parsed.data.cards.entries()) {
    const key = `${entry.cardId}@${entry.version}`; size += entry.count;
    if (seen.has(key)) found.push({ path: `cards.${index}`, message: `duplicate deck entry ${key}` });
    seen.add(key);
    const card = catalog.find((candidate) => candidate.id === entry.cardId && candidate.version === entry.version);
    if (!card) found.push({ path: `cards.${index}`, message: `unknown card version ${key}` });
    if (entry.count > 3 && card?.type !== "font") found.push({ path: `cards.${index}.count`, message: "maximum 3 copies of a non-Font card" });
  }
  if (size !== 30) found.push({ path: "cards", message: `prototype-30 decks require exactly 30 cards; received ${size}` });
  return found.length ? { ok: false, issues: found } : { ok: true, value: parsed.data };
}

export function findCardVersion(catalog: readonly CardDefinition[], id: string, version: number): CardDefinition | undefined {
  return catalog.find((card) => card.id === id && card.version === version);
}

export function findLatestCardVersion(catalog: readonly CardDefinition[], id: string): CardDefinition | undefined {
  return catalog.filter((card) => card.id === id).reduce<CardDefinition | undefined>((latest, card) => !latest || card.version > latest.version ? card : latest, undefined);
}
