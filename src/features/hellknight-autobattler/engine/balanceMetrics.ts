import type { AttackSpeed, UnitDefinition } from '../data/hellknightAutobattler';

export const BALANCE_WINDOW_SECONDS = 10;
export const DPS_TO_EFFECTIVE_HEALTH = 6;

const attacksPerSecond: Record<AttackSpeed, number> = {
  slow: 1,
  medium: 2,
  fast: 3
};

const rangeUptimeMultiplier: Record<number, number> = {
  1: 0.88,
  2: 0.95,
  3: 1,
  4: 1.06
};

export interface UnitBalanceMetrics {
  attacksPerSecond: number;
  weaponDps: number;
  sustainedDps: number;
  rangeAdjustedDps: number;
  effectiveHealth: number;
  offenseRating: number;
  durabilityRating: number;
  combatValue: number;
}

export function calculateUnitBalanceMetrics(unit: UnitDefinition): UnitBalanceMetrics {
  const attackRate = attacksPerSecond[unit.attackSpeed];
  const weaponDps = unit.attackDamage * attackRate;
  const sustainedDps = estimateSustainedDps(unit, attackRate);
  const uptime = rangeUptimeMultiplier[unit.range] ?? 1 + Math.max(0, unit.range - 3) * 0.06;
  const rangeAdjustedDps = sustainedDps * uptime;
  const effectiveHealth = estimateEffectiveHealth(unit);
  const offenseRating = rangeAdjustedDps * DPS_TO_EFFECTIVE_HEALTH;
  const durabilityRating = effectiveHealth;

  return {
    attacksPerSecond: attackRate,
    weaponDps: roundMetric(weaponDps),
    sustainedDps: roundMetric(sustainedDps),
    rangeAdjustedDps: roundMetric(rangeAdjustedDps),
    effectiveHealth: Math.round(effectiveHealth),
    offenseRating: Math.round(offenseRating),
    durabilityRating: Math.round(durabilityRating),
    combatValue: Math.round((offenseRating + durabilityRating) / 2)
  };
}

function estimateSustainedDps(unit: UnitDefinition, attackRate: number) {
  const weaponDps = unit.attackDamage * attackRate;
  const attackWindowDamage = weaponDps * BALANCE_WINDOW_SECONDS;

  switch (unit.pf2Class) {
    case 'Barbarian':
      return weaponDps * 1.28 * (BALANCE_WINDOW_SECONDS - 1) / BALANCE_WINDOW_SECONDS;
    case 'Fighter':
      return (attackWindowDamage + unit.attackDamage * 0.9) / BALANCE_WINDOW_SECONDS;
    case 'Ranger':
      return estimateRangerDamage(unit.attackDamage, attackRate) / BALANCE_WINDOW_SECONDS;
    case 'Rogue':
      return weaponDps * 1.225;
    case 'Monk':
      return weaponDps * 4 / 3;
    case 'Swashbuckler':
      return (attackWindowDamage + unit.attackDamage * 0.8) / BALANCE_WINDOW_SECONDS;
    case 'Thaumaturge':
      return (unit.attackDamage + 10) * attackRate + 20;
    case 'Inventor': {
      const overdrive = unit.attackDamage * 0.65 + unit.magicDamage * 1.15;
      return (overdrive + weaponDps * (BALANCE_WINDOW_SECONDS - 1)) / BALANCE_WINDOW_SECONDS;
    }
    case 'Kineticist': {
      const impulseDamage = unit.magicDamage * 0.75;
      return (weaponDps * 7 + impulseDamage * 3) / BALANCE_WINDOW_SECONDS;
    }
    case 'Wizard': {
      const ownDamage = weaponDps * (BALANCE_WINDOW_SECONDS - 1);
      const reducedSummonDps = 116 * 0.55;
      return (ownDamage + reducedSummonDps * 8) / BALANCE_WINDOW_SECONDS;
    }
    case 'Cleric':
      return weaponDps;
    case 'Druid':
      return weaponDps * (BALANCE_WINDOW_SECONDS - 1) / BALANCE_WINDOW_SECONDS;
    default:
      return estimateSpellAndWeaponDps(unit, weaponDps);
  }
}

function estimateRangerDamage(attackDamage: number, attackRate: number) {
  const hitCount = attackRate * BALANCE_WINDOW_SECONDS;
  let totalDamage = 0;
  for (let hit = 1; hit <= hitCount; hit += 1) {
    totalDamage += attackDamage * (1 + Math.min(5, hit) * 0.08);
  }
  return totalDamage;
}

function estimateSpellAndWeaponDps(unit: UnitDefinition, weaponDps: number) {
  const casts = Math.min(BALANCE_WINDOW_SECONDS, unit.spellSlots);
  let spellDamage = 0;

  for (let cast = 0; cast < casts; cast += 1) {
    if (unit.pf2Class === 'Magus') {
      spellDamage += unit.attackDamage + unit.magicDamage * 1.2;
      continue;
    }
    let multiplier = unit.pf2Class === 'Sorcerer' ? 1.35 : 1.05;
    if (unit.pf2Class === 'Oracle') multiplier *= 1 + cast * 0.0375;
    if (unit.pf2Class === 'Psychic' && cast >= 2) multiplier *= 1.45;
    spellDamage += unit.magicDamage * multiplier;
    if (unit.pf2Class === 'Witch') spellDamage += 21;
  }

  return (spellDamage + weaponDps * (BALANCE_WINDOW_SECONDS - casts)) / BALANCE_WINDOW_SECONDS;
}

function estimateEffectiveHealth(unit: UnitDefinition) {
  switch (unit.pf2Class) {
    case 'Barbarian':
      return unit.health * 1.12;
    case 'Champion':
      return unit.health + 45;
    case 'Cleric':
      return unit.health + unit.magicDamage * 1.4 * unit.spellSlots;
    case 'Druid':
      return unit.health + unit.magicDamage * 0.9 * 3;
    case 'Oracle':
      return unit.health * (1 - Math.min(BALANCE_WINDOW_SECONDS, unit.spellSlots) * 0.05);
    case 'Summoner':
      return unit.health * 1.25;
    case 'Swashbuckler':
      return unit.health / (1 - 0.25 * 0.7);
    case 'Wizard':
      return unit.health + 760 * 0.55;
    default:
      return unit.health;
  }
}

function roundMetric(value: number) {
  return Math.round(value * 10) / 10;
}
