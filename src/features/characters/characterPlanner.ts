import { z } from 'zod';
import { deriveAbilityBoostsFromFoundryJson, getLevelAbilityBoostsFromFoundryJson } from '../../utils/foundryCharacter';

export const proficiencyRanks = ['untrained', 'trained', 'expert', 'master', 'legendary'] as const;
export type ProficiencyRank = typeof proficiencyRanks[number];

export const abilityKeys = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type AbilityKey = typeof abilityKeys[number];
export const abilityLabels: Record<AbilityKey, string> = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma'
};
export const abilityBoostLevels = [5, 10, 15, 20] as const;

export const skillLabels: Record<string, string> = {
  acrobatics: 'Acrobatics', arcana: 'Arcana', athletics: 'Athletics', crafting: 'Crafting',
  deception: 'Deception', diplomacy: 'Diplomacy', intimidation: 'Intimidation', medicine: 'Medicine',
  nature: 'Nature', occultism: 'Occultism', performance: 'Performance', religion: 'Religion',
  society: 'Society', stealth: 'Stealth', survival: 'Survival', thievery: 'Thievery'
};

const plannerSchema = z.object({
  version: z.literal(1),
  featLevels: z.record(z.string(), z.number().int().min(1).max(20)),
  skillUpgrades: z.array(z.object({
    id: z.string(),
    level: z.number().int().min(1).max(20),
    skill: z.string().min(1),
    rank: z.number().int().min(1).max(4)
  })),
  abilityBoosts: z.array(z.object({
    level: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)]),
    ability: z.enum(abilityKeys)
  })).default([]),
  abilityBaseScores: z.object({
    str: z.number().optional(), dex: z.number().optional(), con: z.number().optional(),
    int: z.number().optional(), wis: z.number().optional(), cha: z.number().optional()
  }).default({})
});

export type CharacterPlannerData = z.infer<typeof plannerSchema>;

const optionalFoundryNumber = z.preprocess(value => {
  if (value === null || value === '') return undefined;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return value;
}, z.number().finite().optional());

const requiredFoundryNumber = z.preprocess(value => {
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return value;
}, z.number().finite());

const actorLevelSchema = z.preprocess(value => {
  if (typeof value === 'number' || typeof value === 'string') return { value };
  return value;
}, z.object({ value: requiredFoundryNumber }).passthrough());

const actorSkillSchema = z.preprocess(value => {
  if (value === null || value === undefined) return { rank: 0 };
  if (typeof value === 'number' || typeof value === 'string') return { rank: value };
  return value;
}, z.object({
  rank: z.preprocess(value => {
    const rank = typeof value === 'string' ? Number(value) : value;
    return typeof rank === 'number' && Number.isFinite(rank) ? Math.max(0, Math.min(4, Math.round(rank))) : 0;
  }, z.number().int().min(0).max(4))
}).passthrough());

const actorAbilitySchema = z.preprocess(value => {
  if (value === null || value === undefined) return {};
  if (typeof value === 'number') return { value };
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return { value: Number(value) };
  if (typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}, z.object({
  value: optionalFoundryNumber,
  mod: optionalFoundryNumber
}).passthrough());

const actorAbilitiesSchema = z.preprocess(value => {
  if (!value || typeof value !== 'object') return {};

  const normalized: Record<string, unknown> = {};
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      if (typeof entry === 'number' || (typeof entry === 'string' && Number.isFinite(Number(entry)))) {
        const ability = abilityKeys[index];
        if (ability) normalized[ability] = entry;
        return;
      }
      if (!entry || typeof entry !== 'object') return;
      const record = entry as Record<string, unknown>;
      const key = String(record.slug ?? record.key ?? record.ability ?? record.abbreviation ?? '').toLowerCase();
      if ((abilityKeys as readonly string[]).includes(key)) normalized[key] = record;
    });
    return normalized;
  }

  Object.entries(value as Record<string, unknown>).forEach(([rawKey, ability]) => {
    const key = rawKey.toLowerCase();
    if ((abilityKeys as readonly string[]).includes(key)) normalized[key] = ability;
  });
  return normalized;
}, z.record(z.string(), actorAbilitySchema));

const actorItemSystemSchema = z.preprocess(value => value && typeof value === 'object' ? value : {}, z.object({
  level: actorLevelSchema.optional().nullable().transform(level => level || undefined),
  category: z.preprocess(value => typeof value === 'string' ? value : value == null ? value : String(value), z.string().nullable().optional()),
  location: z.preprocess(value => typeof value === 'string' ? value : value == null ? value : String(value), z.string().nullable().optional())
}).passthrough());

const actorItemFlagsSchema = z.preprocess(value => value && typeof value === 'object' ? value : {}, z.object({
  pf2e: z.preprocess(value => value && typeof value === 'object' ? value : {}, z.object({
    grantedBy: z.preprocess(value => value && typeof value === 'object' ? value : undefined, z.object({
      id: z.preprocess(value => value == null ? '' : String(value), z.string())
    }).passthrough().optional())
  }).passthrough().optional())
}).passthrough());

const actorItemsSchema = z.preprocess(value => {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      ...record,
      _id: String(record._id ?? record.id ?? `planner-item-${index}`),
      name: String(record.name ?? 'Unnamed item'),
      type: String(record.type ?? ''),
      system: record.system ?? record.data ?? {},
      flags: record.flags ?? {}
    };
  });
}, z.array(z.object({
  _id: z.string(),
  name: z.string(),
  type: z.string(),
  system: actorItemSystemSchema.optional(),
  flags: actorItemFlagsSchema.optional()
}).passthrough()));

const actorSchema = z.preprocess(rawValue => {
  let value = rawValue;
  if (typeof value === 'string') {
    try { value = JSON.parse(value) as unknown; }
    catch { return value; }
  }
  if (Array.isArray(value)) {
    value = value.find(entry => entry && typeof entry === 'object' && ('system' in entry || 'data' in entry)) ?? value[0];
  }
  if (!value || typeof value !== 'object') return value;
  let record = value as Record<string, unknown>;
  for (const key of ['actor', 'document', '_source', 'data']) {
    const nested = record[key];
    if (nested && typeof nested === 'object' && 'system' in nested) {
      record = nested as Record<string, unknown>;
      break;
    }
  }
  const legacySystem = record.data && typeof record.data === 'object'
    ? record.data as Record<string, unknown>
    : undefined;
  const system = record.system && typeof record.system === 'object'
    ? record.system as Record<string, unknown>
    : legacySystem?.data && typeof legacySystem.data === 'object'
      ? legacySystem.data as Record<string, unknown>
      : legacySystem?.details
        ? legacySystem
        : undefined;
  if (!system) return record;

  const details = system.details && typeof system.details === 'object'
    ? system.details as Record<string, unknown>
    : {};
  const items = record.items ?? legacySystem?.items ?? [];
  const classItem = Array.isArray(items)
    ? items.find(item => item && typeof item === 'object' && (item as Record<string, unknown>).type === 'class') as Record<string, unknown> | undefined
    : undefined;
  const classSystem = classItem?.system && typeof classItem.system === 'object'
    ? classItem.system as Record<string, unknown>
    : classItem?.data && typeof classItem.data === 'object'
      ? classItem.data as Record<string, unknown>
      : undefined;
  const level = details.level ?? system.level ?? record.level ?? classSystem?.level;

  return {
    ...record,
    system: {
      ...system,
      details: { ...details, ...(level === undefined ? {} : { level }) }
    },
    items
  };
}, z.object({
  name: z.preprocess(value => value == null ? undefined : String(value), z.string().optional()),
  system: z.object({
    details: z.object({ level: actorLevelSchema }).passthrough(),
    skills: z.record(z.string(), actorSkillSchema).optional(),
    abilities: actorAbilitiesSchema.optional(),
    build: z.object({
      attributes: z.object({
        boosts: z.record(z.string(), z.unknown()).optional()
      }).passthrough().optional()
    }).passthrough().optional()
  }).passthrough(),
  items: actorItemsSchema.optional()
}).passthrough());

export type PlannerActor = z.infer<typeof actorSchema>;
export type PlannerFeat = NonNullable<PlannerActor['items']>[number] & { type: 'feat' };

export function parsePlannerActor(value: unknown): PlannerActor {
  const result = actorSchema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const path = issue?.path.length ? issue.path.join('.') : 'document root';
  throw new Error(`The planner could not read ${path}: ${issue?.message || 'invalid Foundry data'}.`);
}

export function parsePlannerData(value: unknown): CharacterPlannerData | undefined {
  const result = plannerSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

function slotLevel(location: string | null | undefined): number | undefined {
  const match = location?.match(/(?:^|-)(\d{1,2})$/);
  if (!match) return undefined;
  const level = Number(match[1]);
  return level >= 1 && level <= 20 ? level : undefined;
}

export function getPlannerFeats(actor: PlannerActor): PlannerFeat[] {
  return (actor.items || []).filter((item): item is PlannerFeat => item.type === 'feat');
}

export function isClassFeature(feat: PlannerFeat): boolean {
  return (feat.system?.category || '').replace(/[^a-z]/gi, '').toLowerCase() === 'classfeature';
}

export function getSelectablePlannerFeats(actor: PlannerActor): PlannerFeat[] {
  return getPlannerFeats(actor).filter(feat => !isClassFeature(feat));
}

export function getAutomaticClassFeatures(actor: PlannerActor): PlannerFeat[] {
  return getPlannerFeats(actor).filter(isClassFeature);
}

export function inferFeatLevels(actor: PlannerActor): Record<string, number> {
  const feats = getPlannerFeats(actor);
  const byId = new Map(feats.map(feat => [feat._id, feat]));
  const levels: Record<string, number> = {};
  const resolve = (feat: PlannerFeat, seen = new Set<string>()): number => {
    if (levels[feat._id]) return levels[feat._id];
    if (seen.has(feat._id)) return 1;
    seen.add(feat._id);
    const parentId = feat.flags?.pf2e?.grantedBy?.id;
    const parent = parentId ? byId.get(parentId) : undefined;
    const inferred = slotLevel(feat.system?.location)
      ?? (parent ? resolve(parent, seen) : undefined)
      ?? feat.system?.level?.value
      ?? 1;
    levels[feat._id] = Math.max(1, Math.min(20, Math.round(inferred)));
    return levels[feat._id];
  };
  feats.forEach(feat => resolve(feat));
  return levels;
}

export function automaticClassFeatureLevel(feat: PlannerFeat, inferredLevels: Record<string, number>): number {
  return Math.max(1, Math.min(20, Math.round(feat.system?.level?.value ?? inferredLevels[feat._id] ?? 1)));
}

const earliestRankLevel = [1, 1, 2, 7, 15];

export function createDefaultPlanner(actor: PlannerActor): CharacterPlannerData {
  const skillUpgrades: CharacterPlannerData['skillUpgrades'] = [];
  Object.entries(actor.system.skills || {}).forEach(([skill, data]) => {
    for (let rank = 1; rank <= data.rank; rank += 1) {
      skillUpgrades.push({ id: `${skill}-${rank}`, skill, rank, level: earliestRankLevel[rank] });
    }
  });
  const preferredAbilities = abilityKeys
    .filter(ability => abilityScore(actor, ability) !== undefined)
    .sort((left, right) => (abilityScore(actor, right) ?? -Infinity) - (abilityScore(actor, left) ?? -Infinity))
    .slice(0, 4);
  const importedBoosts = getLevelAbilityBoostsFromFoundryJson(actor);
  const abilityBoosts = abilityBoostLevels.flatMap(level => {
    const imported = importedBoosts[String(level) as '5' | '10' | '15' | '20'];
    const abilities = imported?.length ? [...new Set(imported)].slice(0, 4) : preferredAbilities;
    return abilities.map(ability => ({ level, ability }));
  });
  const abilityBaseScores = inferAbilityBaseScores(actor, abilityBoosts);
  return { version: 1, featLevels: inferFeatLevels(actor), skillUpgrades, abilityBoosts, abilityBaseScores };
}

export function rankAtLevel(planner: CharacterPlannerData, skill: string, level: number): number {
  return Math.min(4, planner.skillUpgrades.filter(upgrade => upgrade.skill === skill && upgrade.level <= level).length);
}

function normalizeSkillRanks(skillUpgrades: CharacterPlannerData['skillUpgrades']): CharacterPlannerData['skillUpgrades'] {
  const grouped = new Map<string, CharacterPlannerData['skillUpgrades']>();
  skillUpgrades.forEach(upgrade => grouped.set(upgrade.skill, [...(grouped.get(upgrade.skill) || []), upgrade]));
  return Array.from(grouped.values()).flatMap(upgrades => [...upgrades]
    .sort((left, right) => left.level - right.level || left.id.localeCompare(right.id))
    .slice(0, 4)
    .map((upgrade, index) => ({ ...upgrade, rank: index + 1 })));
}

export function setSkillBoost(planner: CharacterPlannerData, skill: string, level: number, selected: boolean): CharacterPlannerData {
  const alreadySelected = planner.skillUpgrades.some(upgrade => upgrade.skill === skill && upgrade.level === level);
  if (selected === alreadySelected) return planner;
  const withoutCell = planner.skillUpgrades.filter(upgrade => !(upgrade.skill === skill && upgrade.level === level));
  const skillBoostCount = withoutCell.filter(upgrade => upgrade.skill === skill).length;
  const skillUpgrades = selected && skillBoostCount < 4
    ? [...withoutCell, { id: `${skill}-${level}`, skill, level, rank: skillBoostCount + 1 }]
    : withoutCell;
  return { ...planner, skillUpgrades: normalizeSkillRanks(skillUpgrades) };
}

export function setAbilityBoost(planner: CharacterPlannerData, ability: AbilityKey, level: number, selected: boolean): CharacterPlannerData {
  if (!abilityBoostLevels.some(boostLevel => boostLevel === level)) return planner;
  const typedLevel = level as typeof abilityBoostLevels[number];
  const alreadySelected = planner.abilityBoosts.some(boost => boost.level === typedLevel && boost.ability === ability);
  if (selected === alreadySelected) return planner;
  const withoutAbility = planner.abilityBoosts.filter(boost => !(boost.level === typedLevel && boost.ability === ability));
  if (selected && withoutAbility.filter(boost => boost.level === typedLevel).length >= 4) return planner;
  return {
    ...planner,
    abilityBoosts: selected ? [...withoutAbility, { level: typedLevel, ability }] : withoutAbility
  };
}

function sourceAbilityScore(actor: PlannerActor, ability: AbilityKey): number | undefined {
  const data = actor.system.abilities?.[ability];
  if (data) {
    const legacyScore = data.value ?? (data.mod === undefined ? undefined : 10 + data.mod * 2);
    if (legacyScore !== undefined) return legacyScore;
  }
  const derived = deriveAbilityBoostsFromFoundryJson(actor)?.details[ability];
  return derived ? 10 + derived.value * 2 + (derived.partial ? 1 : 0) : undefined;
}

export function inferAbilityBaseScores(actor: PlannerActor, abilityBoosts: CharacterPlannerData['abilityBoosts']): CharacterPlannerData['abilityBaseScores'] {
  const sourceLevel = Math.max(1, Math.min(20, Math.round(actor.system.details.level.value)));
  const baseScores: CharacterPlannerData['abilityBaseScores'] = {};
  abilityKeys.forEach(ability => {
    let score = sourceAbilityScore(actor, ability);
    if (score === undefined) return;
    abilityBoosts
      .filter(boost => boost.ability === ability && boost.level <= sourceLevel)
      .sort((left, right) => right.level - left.level)
      .forEach(() => { score = score! > 18 ? score! - 1 : score! - 2; });
    baseScores[ability] = score;
  });
  return baseScores;
}

export function abilityScore(actor: PlannerActor, ability: AbilityKey, planner?: CharacterPlannerData, targetLevel?: number): number | undefined {
  let score = sourceAbilityScore(actor, ability);
  if (score === undefined || !planner || targetLevel === undefined) return score;
  const level = Math.max(1, Math.min(20, Math.round(targetLevel)));
  const boosts = planner.abilityBoosts
    .filter(boost => boost.ability === ability)
    .sort((left, right) => left.level - right.level);

  const baseScore = planner.abilityBaseScores[ability];
  if (baseScore !== undefined) {
    score = baseScore;
    boosts.filter(boost => boost.level <= level).forEach(() => {
      score = score! >= 18 ? score! + 1 : score! + 2;
    });
    return score;
  }

  const sourceLevel = Math.max(1, Math.min(20, Math.round(actor.system.details.level.value)));
  if (level < sourceLevel) {
    boosts.filter(boost => boost.level > level && boost.level <= sourceLevel).reverse().forEach(() => {
      score = score! > 18 ? score! - 1 : score! - 2;
    });
  } else if (level > sourceLevel) {
    boosts.filter(boost => boost.level > sourceLevel && boost.level <= level).forEach(() => {
      score = score! >= 18 ? score! + 1 : score! + 2;
    });
  }
  return score;
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function isPartialAbilityBoost(score: number): boolean {
  return score > 18 && score % 2 !== 0;
}

export function exportActorAtLevel(actor: PlannerActor, planner: CharacterPlannerData, targetLevel: number): PlannerActor {
  const level = Math.max(1, Math.min(20, Math.round(targetLevel)));
  const copy = structuredClone(actor);
  copy.system.details.level.value = level;
  Object.entries(copy.system.skills || {}).forEach(([skill, data]) => {
    data.rank = rankAtLevel(planner, skill, level);
  });
  abilityKeys.forEach(ability => {
    const data = copy.system.abilities?.[ability];
    const score = abilityScore(actor, ability, planner, level);
    if (!data || score === undefined) return;
    if (data.value !== undefined) data.value = score;
    if (data.mod !== undefined) data.mod = abilityModifier(score);
  });
  const buildBoosts = copy.system.build?.attributes?.boosts;
  if (buildBoosts) {
    abilityBoostLevels.forEach(boostLevel => {
      buildBoosts[String(boostLevel)] = boostLevel <= level
        ? planner.abilityBoosts.filter(boost => boost.level === boostLevel).map(boost => boost.ability)
        : [];
    });
  }

  const inferredFeatLevels = inferFeatLevels(copy);
  const removed = new Set(
    getPlannerFeats(copy)
      .filter(feat => (isClassFeature(feat)
        ? automaticClassFeatureLevel(feat, inferredFeatLevels)
        : planner.featLevels[feat._id] ?? inferredFeatLevels[feat._id] ?? 1) > level)
      .map(feat => feat._id)
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of copy.items || []) {
      const parentId = item.flags?.pf2e?.grantedBy?.id;
      if (parentId && removed.has(parentId) && !removed.has(item._id)) {
        removed.add(item._id);
        changed = true;
      }
    }
  }
  copy.items = (copy.items || []).filter(item => !removed.has(item._id));
  return copy;
}

export function validatePlanner(planner: CharacterPlannerData, includeAbilityBoosts = true): string[] {
  const issues: string[] = [];
  const grouped = new Map<string, CharacterPlannerData['skillUpgrades']>();
  planner.skillUpgrades.forEach(upgrade => grouped.set(upgrade.skill, [...(grouped.get(upgrade.skill) || []), upgrade]));
  grouped.forEach((upgrades, skill) => {
    const ordered = [...upgrades].sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));
    ordered.forEach((upgrade, index) => {
      const rank = index + 1;
      if (upgrade.level < earliestRankLevel[rank]) issues.push(`${skillLabels[skill] || skill} reaches ${proficiencyRanks[rank]} before level ${earliestRankLevel[rank]}.`);
    });
    if (upgrades.length > 4) issues.push(`${skillLabels[skill] || skill} has more than four proficiency boosts.`);
    if (new Set(upgrades.map(upgrade => upgrade.level)).size !== upgrades.length) issues.push(`${skillLabels[skill] || skill} has more than one boost at the same level.`);
  });
  if (includeAbilityBoosts) abilityBoostLevels.forEach(level => {
    const boosts = planner.abilityBoosts.filter(boost => boost.level === level);
    if (boosts.length !== 4) issues.push(`Level ${level} needs exactly four ability boosts (${boosts.length}/4 selected).`);
    if (new Set(boosts.map(boost => boost.ability)).size !== boosts.length) issues.push(`Level ${level} can boost each ability only once.`);
  });
  return [...new Set(issues)];
}
