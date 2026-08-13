import { z } from 'zod';

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

const actorSchema = z.object({
  name: z.string().optional(),
  system: z.object({
    details: z.object({ level: z.object({ value: z.number() }).passthrough() }).passthrough(),
    skills: z.record(z.string(), z.object({ rank: z.number().int().min(0).max(4) }).passthrough()).optional(),
    abilities: z.record(z.string(), z.object({
      value: z.number().optional(),
      mod: z.number().optional()
    }).passthrough()).optional()
  }).passthrough(),
  items: z.array(z.object({
    _id: z.string(),
    name: z.string(),
    type: z.string(),
    system: z.object({
      level: z.object({ value: z.number() }).passthrough().optional(),
      category: z.string().nullable().optional(),
      location: z.string().nullable().optional()
    }).passthrough().optional(),
    flags: z.object({
      pf2e: z.object({ grantedBy: z.object({ id: z.string() }).passthrough().optional() }).passthrough().optional()
    }).passthrough().optional()
  }).passthrough()).optional()
}).passthrough();

export type PlannerActor = z.infer<typeof actorSchema>;
export type PlannerFeat = PlannerActor['items'][number] & { type: 'feat' };

export function parsePlannerActor(value: unknown): PlannerActor {
  return actorSchema.parse(value);
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
    .filter(ability => actor.system.abilities?.[ability])
    .sort((left, right) => (abilityScore(actor, right) ?? -Infinity) - (abilityScore(actor, left) ?? -Infinity))
    .slice(0, 4);
  const abilityBoosts = abilityBoostLevels.flatMap(level => preferredAbilities.map(ability => ({ level, ability })));
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
  if (!data) return undefined;
  return data.value ?? (data.mod === undefined ? undefined : 10 + data.mod * 2);
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
