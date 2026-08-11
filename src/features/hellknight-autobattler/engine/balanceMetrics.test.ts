import { describe, expect, it } from 'vitest';
import { units } from '../data/hellknightAutobattler';
import { calculateUnitBalanceMetrics } from './balanceMetrics';
import { getUnitRarity, type UnitRarity } from './shopEngine';

const rarities: UnitRarity[] = [1, 2, 3, 4, 5];

describe('Citadel Tactics unit balance', () => {
  it('keeps every stat-based rarity band tightly grouped by combat value', () => {
    for (const rarity of rarities) {
      const values = units
        .filter(unit => getUnitRarity(unit) === rarity)
        .map(unit => calculateUnitBalanceMetrics(unit).combatValue);
      const average = values.reduce((total, value) => total + value, 0) / values.length;
      const maximumDeviation = Math.max(...values.map(value => Math.abs(value - average) / average));

      expect(values).toHaveLength(4);
      expect(maximumDeviation).toBeLessThanOrEqual(0.08);
    }
  });

  it('keeps each rarity meaningfully stronger than the previous band', () => {
    const averages = rarities.map(rarity => {
      const values = units
        .filter(unit => getUnitRarity(unit) === rarity)
        .map(unit => calculateUnitBalanceMetrics(unit).combatValue);
      return values.reduce((total, value) => total + value, 0) / values.length;
    });

    averages.slice(1).forEach((average, index) => {
      expect(average).toBeGreaterThan(averages[index] * 1.08);
    });
  });

  it('balances Ranger offense against Champion durability in the same rarity', () => {
    const ranger = units.find(unit => unit.id === 'ranger')!;
    const champion = units.find(unit => unit.id === 'champion')!;
    const rangerMetrics = calculateUnitBalanceMetrics(ranger);
    const championMetrics = calculateUnitBalanceMetrics(champion);

    expect(getUnitRarity(ranger)).toBe(getUnitRarity(champion));
    expect(rangerMetrics.rangeAdjustedDps).toBeGreaterThan(championMetrics.rangeAdjustedDps * 3);
    expect(rangerMetrics.effectiveHealth).toBeLessThan(championMetrics.effectiveHealth * 0.5);
    expect(Math.abs(rangerMetrics.combatValue - championMetrics.combatValue)).toBeLessThan(15);
  });

  it('requires clear stat concessions for speed, range, and heavy attacks', () => {
    const fastUnits = units.filter(unit => unit.attackSpeed === 'fast');
    const mobileRangedUnits = units.filter(unit => unit.range >= 3 && unit.attackSpeed !== 'slow');
    const heavyHitters = units.filter(unit => unit.attackDamage >= 70);

    expect(fastUnits.every(unit => unit.attackDamage <= 44 && unit.health <= 540)).toBe(true);
    expect(mobileRangedUnits.every(unit => unit.health <= 420)).toBe(true);
    expect(heavyHitters.every(unit =>
      (unit.attackSpeed === 'slow' && unit.range === 1) || unit.health <= 450
    )).toBe(true);
  });
});
