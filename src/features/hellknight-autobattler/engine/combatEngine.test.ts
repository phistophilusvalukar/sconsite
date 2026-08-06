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
      [input('fighter', 0, 2, 'reactive-fighter')],
      [input('wizard', 0, 0, 'enemy-wizard')]
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

describe('square-grid combat movement', () => {
  it('allows regular units to move one square diagonally', () => {
    const result = simulateCombat({
      player: [input('fighter', 0, 2)],
      enemy: [input('champion', 2, 0, 'enemy')],
      seed: 2
    });
    const movedFighter = result.frames
      .flatMap(frame => frame.units)
      .find(unit => unit.id === 'player-fighter' && unit.q !== 0 && unit.r !== 2);
    expect(movedFighter).toBeDefined();
    expect(Math.abs((movedFighter?.q ?? 0) - 0)).toBe(1);
    expect(Math.abs((movedFighter?.r ?? 2) - 2)).toBe(1);
  });

  it('allows Monks to move two squares at once', () => {
    const result = simulateCombat({
      player: [input('monk', 0, 2)],
      enemy: [input('champion', 2, 0, 'enemy')],
      seed: 2
    });
    const movedMonk = result.frames
      .flatMap(frame => frame.units)
      .find(unit => unit.id === 'player-monk' && (unit.q !== 0 || unit.r !== 2));
    expect(movedMonk).toBeDefined();
    expect(Math.max(Math.abs((movedMonk?.q ?? 0) - 0), Math.abs((movedMonk?.r ?? 2) - 2))).toBe(2);
  });

  it('allows fast units to move past allied blockers', () => {
    const result = simulateCombat({
      player: [input('monk', 0, 2), input('fighter', 0, 1, 'ally-blocker')],
      enemy: [input('champion', 0, -3, 'enemy')],
      seed: 2
    });
    const monkPastAlly = result.frames
      .flatMap(frame => frame.units)
      .find(unit => unit.id === 'player-monk' && unit.r <= 0);
    expect(monkPastAlly).toBeDefined();
  });

  it('makes Gunslingers prioritize the farthest target', () => {
    const battleMessages = messages(
      [input('gunslinger', 0, 2)],
      [input('fighter', 0, -3, 'near-enemy'), input('wizard', 0, -2, 'far-enemy')],
      2
    );
    expect(battleMessages.some(message => message.includes('Chain Pistolero strikes Rack Archivist'))).toBe(true);
  });
});

describe('stable one-second combat ticks', () => {
  it('casts available spells before using an ability', () => {
    const spellcastingBarbarian = { ...owned('barbarian'), magicDamage: 50, spellSlots: 1 };
    const durableTarget = { ...owned('champion', 'target'), health: 5000, attackDamage: 1 };
    const result = simulateCombat({
      player: [{ unit: spellcastingBarbarian, slot: { q: 0, r: 2, unitId: spellcastingBarbarian.instanceId } }],
      enemy: [{ unit: durableTarget, slot: { q: 0, r: 0, unitId: durableTarget.instanceId } }],
      seed: 4
    });
    const battleMessages = result.frames.map(frame => frame.message);
    const spellIndex = battleMessages.findIndex(message => message.includes('casts a spell'));
    const rageIndex = battleMessages.findIndex(message => message.includes('enters Rage'));

    expect(spellIndex).toBeGreaterThan(-1);
    expect(rageIndex).toBeGreaterThan(spellIndex);
  });

  it('produces one action per one-second tick', () => {
    const result = simulateCombat({
      player: [input('wizard', 0, 2)],
      enemy: [input('champion', 0, 0, 'enemy')],
      seed: 9
    });

    expect(result.frames.slice(1).every((frame, index, frames) => index === 0 || frame.timeMs - frames[index - 1].timeMs === 1000)).toBe(true);
    expect(result.frames.flatMap(frame => frame.units).every(unit => !(unit.casting && unit.attacking))).toBe(true);
  });

  it('resolves fast basic attacks as a three-hit set', () => {
    const battleMessages = messages(
      [{ ...input('swashbuckler', 0, 2), unit: { ...owned('swashbuckler'), spellSlots: 0 } }],
      [input('champion', 0, 0, 'durable-target')],
      12
    );

    expect(battleMessages.some(message => message.includes('3 times'))).toBe(true);
  });

  it('raises attack speed by one tier for Boots of Bounding, capped at fast', () => {
    const fastMonk = owned('monk');
    fastMonk.items = ['boots-bounding'];
    const result = simulateCombat({
      player: [{ unit: fastMonk, slot: { q: 0, r: 2, unitId: fastMonk.instanceId } }],
      enemy: [input('champion', 0, 0, 'target')],
      seed: 5
    });

    expect(result.frames.map(frame => frame.message).some(message => message.includes('4 times'))).toBe(false);
  });
});