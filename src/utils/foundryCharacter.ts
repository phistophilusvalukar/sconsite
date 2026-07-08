export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export const abilityLabels: Array<{ key: AbilityKey; label: string }> = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'cha', label: 'CHA' }
];

export function getAvatarFromFoundryJson(jsonData: unknown) {
  const data = jsonData as { img?: string; system?: { details?: { biography?: { appearance?: string } } } } | null;
  return data?.img || data?.system?.details?.biography?.appearance || '';
}

export function getAbilityScoresFromFoundryJson(jsonData: unknown): Record<AbilityKey, number | null> {
  const data = jsonData as { system?: { abilities?: Record<string, unknown> } } | null;
  const abilities = data?.system?.abilities || {};

  return abilityLabels.reduce((scores, ability) => {
    const raw = abilities[ability.key] as { value?: unknown; mod?: unknown } | number | undefined;
    scores[ability.key] = normalizeAbilityValue(raw);
    return scores;
  }, {} as Record<AbilityKey, number | null>);
}

function normalizeAbilityValue(raw: { value?: unknown; mod?: unknown } | number | undefined) {
  if (typeof raw === 'number') return raw;

  const value = toNumber(raw?.value);
  if (value !== null) return value;

  const modifier = toNumber(raw?.mod);
  if (modifier !== null) return 10 + modifier * 2;

  return null;
}

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
