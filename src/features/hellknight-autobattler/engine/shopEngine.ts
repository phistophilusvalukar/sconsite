import { items, units, type ItemDefinition, type OwnedUnit, type UnitDefinition } from '../data/hellknightAutobattler';

export type UnitRarity = 1 | 2 | 3 | 4 | 5;
export type UnitPool = Record<string, number>;

export interface ShopOffer {
  offerId: string;
  unit: UnitDefinition;
  rarity: UnitRarity;
}

export const SHOP_REROLL_COST = 2;

const rarityWeights: Record<UnitRarity, number> = { 1: 55, 2: 25, 3: 12, 4: 6, 5: 2 };

const rankedUnitIds = [...units]
  .sort((a, b) => calculateUnitStatScore(a) - calculateUnitStatScore(b) || a.id.localeCompare(b.id))
  .map(unit => unit.id);

export function calculateUnitStatScore(unit: UnitDefinition) {
  const speedAttacks = unit.attackSpeed === 'slow' ? 1 : unit.attackSpeed === 'medium' ? 2 : 3;
  return Math.round(
    unit.health * 0.26
    + unit.attackDamage * speedAttacks * 4
    + unit.magicDamage * (1 + unit.spellSlots * 0.35)
    + unit.range * 12
  );
}

export function getUnitRarity(unit: UnitDefinition): UnitRarity {
  const rank = Math.max(0, rankedUnitIds.indexOf(unit.id));
  return Math.min(5, Math.floor(rank * 5 / rankedUnitIds.length) + 1) as UnitRarity;
}

export function getUnitPrice(unit: UnitDefinition) {
  return getUnitRarity(unit);
}

export function getMaximumRarityForRound(round: number): UnitRarity {
  if (round <= 2) return 1;
  if (round <= 4) return 2;
  if (round <= 7) return 3;
  if (round <= 9) return 4;
  return 5;
}

export function createUnitPool(copiesPerUnit = 5): UnitPool {
  return Object.fromEntries(units.map(unit => [unit.id, copiesPerUnit]));
}

export function addRoundSupply(pool: UnitPool, copiesPerUnit = 1): UnitPool {
  const copies = Math.max(0, copiesPerUnit);
  return Object.fromEntries(units.map(unit => [unit.id, (pool[unit.id] ?? 0) + copies]));
}

export function getUnitCopiesForTier(tier: OwnedUnit['tier']) {
  return 3 ** (tier - 1);
}

export function getUnitSellValue(unit: OwnedUnit) {
  return getUnitPrice(unit) * getUnitCopiesForTier(unit.tier);
}

export function getBankInterest(gold: number) {
  return Math.floor(Math.max(0, gold) / 10);
}

export function takeUnitFromPool(pool: UnitPool, unitId: string): UnitPool {
  return { ...pool, [unitId]: Math.max(0, (pool[unitId] ?? 0) - 1) };
}

export function returnUnitToPool(pool: UnitPool, unitId: string, copies: number): UnitPool {
  return { ...pool, [unitId]: (pool[unitId] ?? 0) + Math.max(0, copies) };
}

export function removeShopOffer(offers: ShopOffer[], offerId: string): ShopOffer[] {
  return offers.filter(offer => offer.offerId !== offerId);
}

export function getShopRerollCost(offers: ShopOffer[]) {
  return offers.length === 0 ? 0 : SHOP_REROLL_COST;
}

export function rollUnitShop(seed: number, round: number, pool: UnitPool, size = 5): ShopOffer[] {
  const maximumRarity = getMaximumRarityForRound(round);
  const remaining = { ...pool };
  const offers: ShopOffer[] = [];

  for (let slot = 0; slot < size; slot += 1) {
    const candidates = units.filter(unit => getUnitRarity(unit) <= maximumRarity && (remaining[unit.id] ?? 0) > 0);
    if (candidates.length === 0) break;
    const availableRarities = [...new Set(candidates.map(getUnitRarity))];
    const rarity = weightedRarity(seed + round * 101 + slot * 29, availableRarities);
    const rarityUnits = candidates.filter(unit => getUnitRarity(unit) === rarity);
    const unit = rarityUnits[seededNumber(seed + round * 17 + slot * 43, 0, rarityUnits.length - 1)];
    remaining[unit.id] -= 1;
    offers.push({
      offerId: `${seed}-${round}-${slot}-${unit.id}`,
      unit: { ...unit, cost: getUnitPrice(unit) },
      rarity
    });
  }

  return offers;
}

export function rollBattleItemDrop(seed: number, round: number, won: boolean): ItemDefinition | null {
  const dropChance = won ? 60 : 40;
  if (seededNumber(seed + round * 61, 1, 100) > dropChance) return null;
  return items[seededNumber(seed + round * 73, 0, items.length - 1)];
}

function weightedRarity(seed: number, availableRarities: UnitRarity[]) {
  const totalWeight = availableRarities.reduce((total, rarity) => total + rarityWeights[rarity], 0);
  let roll = seededNumber(seed, 1, totalWeight);
  for (const rarity of availableRarities.sort((a, b) => a - b)) {
    roll -= rarityWeights[rarity];
    if (roll <= 0) return rarity;
  }
  return availableRarities[0];
}

function seededNumber(seed: number, min: number, max: number) {
  const x = Math.sin(seed * 999) * 10000;
  const normalized = x - Math.floor(x);
  return Math.floor(normalized * (max - min + 1)) + min;
}
