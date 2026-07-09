export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

type AbilityBoostState = Record<AbilityKey, { value: number; partial: boolean; boosts: number; flaws: number }>;

export const abilityLabels: Array<{ key: AbilityKey; label: string }> = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'cha', label: 'CHA' }
];

export const DEFAULT_NPC_PLACEHOLDER = '/npc-placeholder.png';

const DEFAULT_FOUNDRY_CHARACTER_ICON = 'systems/pf2e/icons/default-icons/character.svg';

export function getAvatarFromFoundryJson(jsonData: unknown) {
  const data = jsonData as { img?: string; system?: { details?: { biography?: { appearance?: string } } } } | null;
  return normalizeFoundryAvatar(data?.img || data?.system?.details?.biography?.appearance || '');
}

export function normalizeFoundryAvatar(avatar?: string | null) {
  if (!avatar) return '';
  return isDefaultFoundryCharacterIcon(avatar) ? DEFAULT_NPC_PLACEHOLDER : avatar;
}

function isDefaultFoundryCharacterIcon(avatar: string) {
  const normalized = normalizePathForComparison(avatar);
  return normalized === DEFAULT_FOUNDRY_CHARACTER_ICON || normalized.endsWith(`/${DEFAULT_FOUNDRY_CHARACTER_ICON}`);
}

function normalizePathForComparison(path: string) {
  const trimmed = path.trim().replace(/\\/g, '/');

  try {
    const decoded = decodeURI(trimmed);
    const parsed = new URL(decoded, 'https://foundry.local/');
    return parsed.pathname.replace(/^\/+/, '').toLowerCase();
  } catch {
    return trimmed.split(/[?#]/)[0].replace(/^\/+/, '').toLowerCase();
  }
}

export function getAbilityScoresFromFoundryJson(jsonData: unknown): Record<AbilityKey, number | null> {
  const derived = deriveAbilityBoostsFromFoundryJson(jsonData);
  if (derived) return derived.scores;

  const data = jsonData as { system?: { abilities?: Record<string, unknown> } } | null;
  const abilities = data?.system?.abilities || {};

  return abilityLabels.reduce((scores, ability) => {
    const raw = abilities[ability.key] as { value?: unknown; mod?: unknown } | number | undefined;
    scores[ability.key] = normalizeAbilityValue(raw);
    return scores;
  }, {} as Record<AbilityKey, number | null>);
}

export function deriveAbilityBoostsFromFoundryJson(jsonData: unknown) {
  const data = jsonData as {
    system?: {
      build?: {
        attributes?: {
          boosts?: Record<string, unknown>;
          alternateAncestryBoosts?: unknown;
        };
      };
    };
    items?: Array<{
      name?: string;
      type?: string;
      system?: {
        boosts?: Record<string, unknown>;
        flaws?: Record<string, unknown>;
        keyAbility?: unknown;
      };
    }>;
  } | null;

  const items = Array.isArray(data?.items) ? data.items : [];
  const state = createAbilityState();
  const ancestryItem = items.find(item => item.type === 'ancestry');
  const backgroundItem = items.find(item => item.type === 'background');
  const classItem = items.find(item => item.type === 'class');
  let appliedAnyBoost = false;

  for (const ability of extractAbilityChoices(ancestryItem?.system?.flaws)) {
    applyFlaw(state, ability);
  }

  const alternateAncestryBoosts = extractAbilityChoices(data?.system?.build?.attributes?.alternateAncestryBoosts);
  const ancestryBoosts = alternateAncestryBoosts.length > 0
    ? alternateAncestryBoosts
    : extractAbilityChoices(ancestryItem?.system?.boosts);
  for (const ability of ancestryBoosts) {
    appliedAnyBoost = true;
    applyBoost(state, ability);
  }

  for (const ability of extractAbilityChoices(backgroundItem?.system?.boosts)) {
    appliedAnyBoost = true;
    applyBoost(state, ability);
  }

  for (const ability of extractAbilityChoices(classItem?.system?.keyAbility)) {
    appliedAnyBoost = true;
    applyBoost(state, ability);
  }

  for (const ability of extractLevelBoosts(data?.system?.build?.attributes?.boosts)) {
    appliedAnyBoost = true;
    applyBoost(state, ability);
  }

  for (const item of items) {
    const dualClassAbility = parseDualClassBoost(item.name);
    if (dualClassAbility) {
      appliedAnyBoost = true;
      applyBoost(state, dualClassAbility);
    }
  }

  const hasAnyAdjustment = appliedAnyBoost || abilityLabels.some(ability => state[ability.key].flaws > 0);
  if (!hasAnyAdjustment) return null;

  return {
    scores: abilityLabels.reduce((scores, ability) => {
      scores[ability.key] = state[ability.key].value;
      return scores;
    }, {} as Record<AbilityKey, number>),
    details: abilityLabels.reduce((details, ability) => {
      details[ability.key] = { ...state[ability.key] };
      return details;
    }, {} as AbilityBoostState)
  };
}

function createAbilityState(): AbilityBoostState {
  return abilityLabels.reduce((state, ability) => {
    state[ability.key] = { value: 0, partial: false, boosts: 0, flaws: 0 };
    return state;
  }, {} as AbilityBoostState);
}

function applyBoost(state: AbilityBoostState, ability: AbilityKey) {
  const target = state[ability];
  target.boosts += 1;

  if (target.value < 4) {
    target.value += 1;
    return;
  }

  if (target.partial) {
    target.value += 1;
    target.partial = false;
  } else {
    target.partial = true;
  }
}

function applyFlaw(state: AbilityBoostState, ability: AbilityKey) {
  state[ability].value -= 1;
  state[ability].flaws += 1;
}

function extractLevelBoosts(boosts: unknown) {
  const boostMap = boosts as Record<string, unknown> | null | undefined;
  return ['1', '5', '10', '15', '20'].flatMap(level => extractAbilityChoices(boostMap?.[level]));
}

function extractAbilityChoices(value: unknown): AbilityKey[] {
  if (!value) return [];
  const directAbility = normalizeAbilityKey(value);
  if (directAbility) return [directAbility];
  if (Array.isArray(value)) return value.map(normalizeAbilityKey).filter((ability): ability is AbilityKey => Boolean(ability));

  const record = value as Record<string, unknown>;
  const selectedAbility = normalizeAbilityKey(record.selected);
  if (selectedAbility) return [selectedAbility];
  if (Array.isArray(record.value)) {
    return record.value.length === 1
      ? record.value.map(normalizeAbilityKey).filter((ability): ability is AbilityKey => Boolean(ability))
      : [];
  }

  return Object.keys(record)
    .sort((left, right) => Number(left) - Number(right))
    .flatMap(key => extractAbilityChoices(record[key]));
}

function parseDualClassBoost(name?: string): AbilityKey | null {
  const match = name?.match(/^Dual Class Boost - (Str|Dex|Con|Int|Wis|Cha)$/i);
  if (!match) return null;
  return normalizeAbilityKey(match[1]);
}

function normalizeAbilityKey(value: unknown): AbilityKey | null {
  if (typeof value !== 'string') return null;
  const normalized = value.toLowerCase();
  return abilityLabels.some(ability => ability.key === normalized) ? normalized as AbilityKey : null;
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
