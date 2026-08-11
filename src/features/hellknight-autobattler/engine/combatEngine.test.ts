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

  it('publishes active buffs and debuffs in combat frames for the renderer', () => {
    const result = simulateCombat({
      player: [input('barbarian', -1, 2), input('ranger', 0, 2), input('witch', 1, 2)],
      enemy: [input('champion', -1, 0, 'target-one'), input('champion', 0, 0, 'target-two'), input('champion', 1, 0, 'target-three')],
      seed: 17
    });
    const frameUnits = result.frames.flatMap(frame => frame.units);

    expect(frameUnits.some(unit => unit.id === 'player-barbarian' && unit.effects.includes('raging') && unit.effects.includes('warded'))).toBe(true);
    expect(frameUnits.some(unit => unit.team === 'enemy' && unit.effects.includes('hunted'))).toBe(true);
    expect(frameUnits.some(unit => unit.team === 'enemy' && unit.effects.includes('hexed'))).toBe(true);
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
  it('records the target and delivery style for melee, ranged, and magic actions', () => {
    const melee = simulateCombat({
      player: [input('fighter', 0, 1)],
      enemy: [input('champion', 0, 0, 'melee-target')],
      seed: 6
    });
    const ranged = simulateCombat({
      player: [{ ...input('ranger', 0, 2), unit: { ...owned('ranger'), spellSlots: 0 } }],
      enemy: [input('champion', 0, 0, 'ranged-target')],
      seed: 6
    });
    const magic = simulateCombat({
      player: [input('wizard', 0, 2), input('fighter', 1, 2, 'ally')],
      enemy: [input('champion', -3, -3, 'magic-one'), input('champion', 3, -3, 'magic-two')],
      seed: 24
    });

    const meleeAction = melee.frames.flatMap(frame => frame.units)
      .find(unit => unit.id === 'player-fighter' && unit.visualAction)?.visualAction;
    const rangedAction = ranged.frames.flatMap(frame => frame.units)
      .find(unit => unit.id === 'player-ranger' && unit.visualAction)?.visualAction;
    const magicAction = magic.frames.flatMap(frame => frame.units)
      .find(unit => unit.id === 'player-wizard' && unit.visualAction)?.visualAction;

    expect(meleeAction).toEqual({
      kind: 'melee',
      targetIds: ['enemy-melee-target']
    });
    expect(rangedAction).toEqual({
      kind: 'ranged',
      targetIds: ['enemy-ranged-target']
    });
    expect(magicAction).toEqual({
      kind: 'magic',
      targetIds: ['enemy-magic-one', 'enemy-magic-two']
    });
  });

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
describe('dedicated spell paths', () => {
  it('prevents Clerics from spending reserved healing slots on generic damage', () => {
    const battleMessages = messages(
      [input('cleric', 0, 2)],
      [input('champion', 0, 0, 'target')],
      21
    );

    expect(battleMessages.some(message => message.includes('Godclaw Chaplain casts a spell'))).toBe(false);
    expect(battleMessages.some(message => message.includes('uses Divine Font'))).toBe(true);
  });

  it('summons a same-tier Zombie when spell-slot allies are the majority', () => {
    const wizard = { ...owned('wizard'), tier: 2 as const };
    const result = simulateCombat({
      player: [
        { unit: wizard, slot: { q: 0, r: 2, unitId: wizard.instanceId } },
        input('cleric', 1, 2)
      ],
      enemy: [input('champion', 0, 0, 'target')],
      seed: 22
    });
    const zombies = result.frames.flatMap(frame => frame.units).filter(unit => unit.name === 'Zombie');

    expect(result.frames.some(frame => frame.message.includes('summons a tier 2 Zombie'))).toBe(true);
    expect(zombies.length).toBeGreaterThan(0);
    expect(zombies.every(zombie => zombie.tier === 2 && zombie.pf2Class === 'Fighter')).toBe(true);
    expect(result.frames.every(frame => frame.units.filter(unit => unit.alive && unit.name === 'Zombie').length <= 1)).toBe(true);
  });

  it('summons a same-tier Elemental when slotless allies are the majority', () => {
    const result = simulateCombat({
      player: [input('wizard', 0, 2), input('fighter', 1, 2), input('barbarian', -1, 2)],
      enemy: [input('champion', 0, 0, 'target')],
      seed: 23
    });
    const elemental = result.frames.flatMap(frame => frame.units).find(unit => unit.name === 'Elemental');

    expect(result.frames.some(frame => frame.message.includes('summons a tier 1 Elemental'))).toBe(true);
    expect(elemental?.pf2Class).toBe('Kineticist');
    expect(elemental?.tier).toBe(1);
  });

  it('casts infinite-range Force Barrage against every enemy for a balanced roster', () => {
    const result = simulateCombat({
      player: [input('wizard', 0, 2), input('fighter', 1, 2)],
      enemy: [input('champion', -3, -3, 'target-one'), input('champion', 3, -3, 'target-two')],
      seed: 24
    });
    const firstCombatFrame = result.frames.find(frame => frame.timeMs === 1000);
    const openingEnemies = result.frames[0].units.filter(unit => unit.team === 'enemy');
    const hitEnemies = firstCombatFrame?.units.filter(unit => unit.team === 'enemy') ?? [];

    expect(firstCombatFrame?.message).toContain('casts Force Barrage');
    expect(firstCombatFrame?.message).toContain('hitting 2 enemies');
    expect(hitEnemies.every(enemy => enemy.hp < (openingEnemies.find(opening => opening.id === enemy.id)?.hp ?? 0))).toBe(true);
  });
});
