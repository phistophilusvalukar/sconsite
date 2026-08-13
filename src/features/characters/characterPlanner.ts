import { z } from 'zod';

export const proficiencyRanks = ['untrained', 'trained', 'expert', 'master', 'legendary'] as const;
export type ProficiencyRank = typeof proficiencyRanks[number];

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
  }))
});

export type CharacterPlannerData = z.infer<typeof plannerSchema>;

const actorSchema = z.object({
  name: z.string().optional(),
  system: z.object({
    details: z.object({ level: z.object({ value: z.number() }).passthrough() }).passthrough(),
    skills: z.record(z.string(), z.object({ rank: z.number().int().min(0).max(4) }).passthrough()).optional()
  }).passthrough(),
  items: z.array(z.object({
    _id: z.string(),
    name: z.string(),
    type: z.string(),
    system: z.object({
      level: z.object({ value: z.number() }).passthrough().optional(),
      category: z.string().optional(),
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

const earliestRankLevel = [1, 1, 2, 7, 15];

export function createDefaultPlanner(actor: PlannerActor): CharacterPlannerData {
  const skillUpgrades: CharacterPlannerData['skillUpgrades'] = [];
  Object.entries(actor.system.skills || {}).forEach(([skill, data]) => {
    for (let rank = 1; rank <= data.rank; rank += 1) {
      skillUpgrades.push({ id: `${skill}-${rank}`, skill, rank, level: earliestRankLevel[rank] });
    }
  });
  return { version: 1, featLevels: inferFeatLevels(actor), skillUpgrades };
}

export function rankAtLevel(planner: CharacterPlannerData, skill: string, level: number): number {
  return planner.skillUpgrades
    .filter(upgrade => upgrade.skill === skill && upgrade.level <= level)
    .reduce((rank, upgrade) => Math.max(rank, upgrade.rank), 0);
}

export function exportActorAtLevel(actor: PlannerActor, planner: CharacterPlannerData, targetLevel: number): PlannerActor {
  const level = Math.max(1, Math.min(20, Math.round(targetLevel)));
  const copy = structuredClone(actor);
  copy.system.details.level.value = level;
  Object.entries(copy.system.skills || {}).forEach(([skill, data]) => {
    data.rank = rankAtLevel(planner, skill, level);
  });

  const removed = new Set(
    getPlannerFeats(copy)
      .filter(feat => (planner.featLevels[feat._id] ?? 1) > level)
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

export function validatePlanner(planner: CharacterPlannerData): string[] {
  const issues: string[] = [];
  const grouped = new Map<string, CharacterPlannerData['skillUpgrades']>();
  planner.skillUpgrades.forEach(upgrade => grouped.set(upgrade.skill, [...(grouped.get(upgrade.skill) || []), upgrade]));
  grouped.forEach((upgrades, skill) => {
    const ordered = [...upgrades].sort((a, b) => a.rank - b.rank);
    ordered.forEach((upgrade, index) => {
      if (upgrade.rank !== index + 1) issues.push(`${skillLabels[skill] || skill} is missing a prior proficiency rank.`);
      if (index > 0 && upgrade.level < ordered[index - 1].level) issues.push(`${skillLabels[skill] || skill} ranks are out of level order.`);
      if (upgrade.level < earliestRankLevel[upgrade.rank]) issues.push(`${skillLabels[skill] || skill} reaches ${proficiencyRanks[upgrade.rank]} before level ${earliestRankLevel[upgrade.rank]}.`);
    });
  });
  return [...new Set(issues)];
}
