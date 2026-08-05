import { describe, expect, it } from 'vitest';
import { units, type BoardSlot, type OwnedUnit } from '../data/hellknightAutobattler';
import { simulateCombat, type CombatantInput } from './combatEngine';

function owned(id: string, instanceId = id): OwnedUnit {
  const definition = units.find(unit => unit.id === id);
  if (!definition) throw new Error(`Unknown unit ${id}`);
  return { ...definition, instanceId, tier: 1, items: [] };
}

function input(id: string, q: number, r: number, instanceId = id): CombatantInput {
  const slot: BoardSlot = { q, r, unitId: instanceId };
  return { unit: owned(id, instanceId), slot };
}

function messages(player: CombatantInput[], enemy: CombatantInput[], seed = 7) {
  return simulateCombat({ player, enemy, seed }).frames.map(frame => frame.message);
}

describe('hellknight combat abilities', () => {
  it.each([
    ['barbarian', 'enters Rage'],
    ['druid', 'raises a primal ward'],
    ['inventor', 'triggers Overdrive'],
    ['kineticist', 'unleashes Impulse Junction'],
    ['monk', 'uses Flurry of Blows']
  ])('resolves the %s advertised ability', (unitId, expectedMessage) => {
    const battleMessages = messages(
      [input(unitId, 0, 2)],
      [input('champion', 0, 0, 'target'), input('champion', 1, 0, 'target-two')]
    );
    expect(battleMessages.some(message => message.includes(expectedMessage))).toBe(true);
  });

  it('resolves Reactive Strike when an enemy acts beside a Fighter', () => {
    const battleMessages = messages(
      [input('wizard', 0, 2)],
      [input('fighter', 0, 0, 'reactive-fighter')]
    );
    expect(battleMessages.some(message => message.includes('uses Reactive Strike'))).toBe(true);
  });

  it('is replay deterministic for the same seed and formation', () => {
    const player = [input('wizard', 0, 2), input('rogue', 1, 2)];
    const enemy = [input('cleric', 0, 0, 'enemy-cleric'), input('fighter', 1, 0, 'enemy-fighter')];
    expect(simulateCombat({ player, enemy, seed: 41 })).toEqual(simulateCombat({ player, enemy, seed: 41 }));
  });
});

describe('hellknight Edicts', () => {
  it('applies Vanguard health only when its threshold is active', () => {
    const inactive = simulateCombat({
      player: [input('fighter', 0, 2)],
      enemy: [input('fighter', 0, 0, 'enemy')],
      seed: 3
    });
    const active = simulateCombat({
      player: [input('fighter', 0, 2), input('barbarian', 1, 2)],
      enemy: [input('fighter', 0, 0, 'enemy')],
      seed: 3
    });
    const inactiveFighter = inactive.frames[0].units.find(unit => unit.id === 'player-fighter');
    const activeFighter = active.frames[0].units.find(unit => unit.id === 'player-fighter');
    expect(activeFighter?.maxHp).toBe((inactiveFighter?.maxHp ?? 0) + 110);
  });

  it('applies the active Artillery range bonus to Artillery units', () => {
    const result = simulateCombat({
      player: [input('ranger', 0, 2), input('gunslinger', 1, 2)],
      enemy: [input('fighter', 0, 0, 'enemy')],
      seed: 5
    });
    const ranger = result.frames[0].units.find(unit => unit.id === 'player-ranger');
    expect(ranger?.range).toBe(4);
  });
});
