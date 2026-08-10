import { describe, expect, it } from 'vitest';
import { units } from '../data/hellknightAutobattler';
import {
  addRoundSupply,
  createUnitPool,
  getBankInterest,
  getMaximumRarityForRound,
  getShopRerollCost,
  getUnitCopiesForTier,
  getUnitPrice,
  getUnitRarity,
  getUnitSellValue,
  removeShopOffer,
  returnUnitToPool,
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

  it('fills all five slots when enough units are available', () => {
    expect(rollUnitShop(17, 1, createUnitPool())).toHaveLength(5);
  });

  it('removes only the purchased offer from the current shop', () => {
    const offers = rollUnitShop(17, 1, createUnitPool());
    const purchasedOffer = offers[2];

    expect(removeShopOffer(offers, purchasedOffer.offerId).map(offer => offer.offerId)).toEqual([
      offers[0].offerId,
      offers[1].offerId,
      offers[3].offerId,
      offers[4].offerId
    ]);
    expect(offers).toHaveLength(5);
  });

  it('makes rerolls free only when the current shop is empty', () => {
    const offers = rollUnitShop(17, 1, createUnitPool());

    expect(getShopRerollCost(offers)).toBe(2);
    expect(getShopRerollCost([])).toBe(0);
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

  it('adds one copy of every unit to the remaining pool each round', () => {
    const depletedUnit = units[0];
    const pool = takeUnitFromPool(takeUnitFromPool(createUnitPool(), depletedUnit.id), depletedUnit.id);
    const replenished = addRoundSupply(pool);

    expect(replenished[depletedUnit.id]).toBe(4);
    expect(replenished[units[1].id]).toBe(6);
  });

  it('refunds the combined purchase value of upgraded units', () => {
    const unit = units[0];
    const owned = { ...unit, instanceId: 'test-unit', items: [] };

    expect(getUnitSellValue({ ...owned, tier: 1 })).toBe(getUnitPrice(unit));
    expect(getUnitSellValue({ ...owned, tier: 2 })).toBe(getUnitPrice(unit) * 3);
    expect(getUnitSellValue({ ...owned, tier: 3 })).toBe(getUnitPrice(unit) * 9);
  });

  it('returns every combined copy of a sold unit to the available pool', () => {
    const unit = units[0];
    const depletedPool = { ...createUnitPool(0), [unit.id]: 1 };

    expect(returnUnitToPool(depletedPool, unit.id, getUnitCopiesForTier(1))[unit.id]).toBe(2);
    expect(returnUnitToPool(depletedPool, unit.id, getUnitCopiesForTier(2))[unit.id]).toBe(4);
    expect(returnUnitToPool(depletedPool, unit.id, getUnitCopiesForTier(3))[unit.id]).toBe(10);
  });

  it('awards one bank-interest gold for every ten unspent gold', () => {
    expect([0, 5, 9, 10, 19, 20, 57, 100].map(getBankInterest)).toEqual([0, 0, 0, 1, 1, 2, 5, 10]);
  });

  it('rolls battle drops deterministically with both drops and no-drop outcomes', () => {
    const outcomes = Array.from({ length: 30 }, (_, seed) => rollBattleItemDrop(seed, 5, false));
    expect(outcomes.some(Boolean)).toBe(true);
    expect(outcomes.some(outcome => outcome === null)).toBe(true);
    expect(rollBattleItemDrop(9, 5, true)).toEqual(rollBattleItemDrop(9, 5, true));
  });
});
