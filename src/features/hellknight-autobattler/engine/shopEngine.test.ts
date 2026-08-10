import { describe, expect, it } from 'vitest';
import { units } from '../data/hellknightAutobattler';
import {
  createUnitPool,
  getMaximumRarityForRound,
  getUnitPrice,
  getUnitRarity,
  rollBattleItemDrop,
  rollUnitShop,
  takeUnitFromPool
} from './shopEngine';

describe('Citadel Tactics unit shop', () => {
  it('unlocks rarities on the configured round schedule', () => {
    expect([1, 2, 3, 4, 5, 7, 8, 9, 10, 20].map(getMaximumRarityForRound)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it('derives higher prices from higher stat-based rarity', () => {
    const ordered = [...units].sort((a, b) => getUnitRarity(a) - getUnitRarity(b));
    expect(getUnitRarity(ordered[0])).toBe(1);
    expect(getUnitRarity(ordered.at(-1)!)).toBe(5);
    expect(ordered.every(unit => getUnitPrice(unit) === getUnitRarity(unit))).toBe(true);
  });

  it('only rolls rarity-one units in rounds one and two', () => {
    const pool = createUnitPool();
    for (let seed = 1; seed <= 40; seed += 1) {
      expect(rollUnitShop(seed, 2, pool).every(offer => offer.rarity === 1)).toBe(true);
    }
  });

  it('never offers more copies than remain in the finite pool', () => {
    let pool = createUnitPool(0);
    const availableUnit = units.find(unit => getUnitRarity(unit) === 1)!;
    pool = { ...pool, [availableUnit.id]: 2 };
    const offers = rollUnitShop(17, 1, pool);

    expect(offers).toHaveLength(2);
    expect(offers.every(offer => offer.unit.id === availableUnit.id)).toBe(true);
    expect(rollUnitShop(17, 1, takeUnitFromPool(takeUnitFromPool(pool, availableUnit.id), availableUnit.id))).toHaveLength(0);
  });

  it('rolls battle drops deterministically with both drops and no-drop outcomes', () => {
    const outcomes = Array.from({ length: 30 }, (_, seed) => rollBattleItemDrop(seed, 5, false));
    expect(outcomes.some(Boolean)).toBe(true);
    expect(outcomes.some(outcome => outcome === null)).toBe(true);
    expect(rollBattleItemDrop(9, 5, true)).toEqual(rollBattleItemDrop(9, 5, true));
  });
});
