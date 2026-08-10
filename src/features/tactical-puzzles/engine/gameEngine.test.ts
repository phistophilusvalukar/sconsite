import { describe, expect, it } from 'vitest';
import { bundledPuzzles } from '../data/puzzles';
import { executeCommand, getAttackModifierBreakdown, initializeGame } from './gameEngine';

function puzzle(id: string) {
  const found = bundledPuzzles.find(item => item.id === id);
  if (!found) throw new Error(`Missing test puzzle ${id}`);
  return found;
}

describe('tactical puzzle engine', () => {
  it('resolves the same deterministic Strike every time', () => {
    const definition = puzzle('basic-strike');
    const first = executeCommand(initializeGame(definition), { type: 'USE_ACTION', actorId: 'fighter', actionId: 'strike', targetId: 'guard' });
    const second = executeCommand(initializeGame(definition), { type: 'USE_ACTION', actorId: 'fighter', actionId: 'strike', targetId: 'guard' });

    expect(first.error).toBeUndefined();
    expect(first.state).toEqual(second.state);
    expect(first.state.creatures.guard.hp).toBe(0);
    expect(first.state.status).toBe('victory');
    expect(first.state.rollIndex).toBe(1);
  });

  it('reports the live Strike modifier including MAP and Aid', () => {
    const definition = puzzle('basic-strike');
    const state = initializeGame(definition);
    const attack = definition.creatures.find(creature => creature.id === 'fighter')?.attacks[0];
    if (!attack) throw new Error('Missing fighter attack.');

    expect(getAttackModifierBreakdown(state, 'fighter', attack).total).toBe(attack.attackBonus);
    state.attackCounts.fighter = 1;
    state.creatures.fighter.conditions.push({ type: 'aided', value: 1, expires: 'end-target-turn' });

    const expectedPenalty = attack.agile ? -4 : -5;
    expect(getAttackModifierBreakdown(state, 'fighter', attack)).toEqual(expect.objectContaining({
      multipleAttackPenalty: expectedPenalty, aidBonus: 1, total: attack.attackBonus + expectedPenalty + 1
    }));
  });

  it('restores the intended Feint opening and actor-relative off-guard', () => {
    let state = initializeGame(puzzle('find-the-opening'));
    state = executeCommand(state, { type: 'USE_ACTION', actorId: 'rogue', actionId: 'stride', destination: { x: 1, y: 2 } }).state;
    state = executeCommand(state, { type: 'USE_ACTION', actorId: 'rogue', actionId: 'feint', targetId: 'guard' }).state;

    expect(state.creatures.guard.conditions).toContainEqual(expect.objectContaining({ type: 'off-guard', relativeTo: 'rogue' }));
    state = executeCommand(state, { type: 'USE_ACTION', actorId: 'rogue', actionId: 'strike', targetId: 'guard', attackId: 'rapier' }).state;
    expect(state.status).toBe('victory');
    expect(state.rollIndex).toBe(2);
  });

  it('calculates a flank from opposing positions instead of persisting a condition', () => {
    let state = initializeGame(puzzle('make-the-flank'));
    state = executeCommand(state, { type: 'USE_ACTION', actorId: 'ally', actionId: 'stride', destination: { x: 3, y: 2 } }).state;
    state = executeCommand(state, { type: 'END_TURN', actorId: 'ally' }).state;
    state = executeCommand(state, { type: 'USE_ACTION', actorId: 'fighter', actionId: 'strike', targetId: 'captain' }).state;

    expect(state.creatures.captain.conditions).toHaveLength(0);
    expect(state.status).toBe('victory');
  });

  it('uses Shove and a line spell without puzzle-specific rules', () => {
    let state = initializeGame(puzzle('line-them-up'));
    state = executeCommand(state, { type: 'USE_ACTION', actorId: 'marshal', actionId: 'shove', targetId: 'enemy-a', destination: { x: 2, y: 3 } }).state;
    state = executeCommand(state, { type: 'END_TURN', actorId: 'marshal' }).state;
    state = executeCommand(state, { type: 'USE_ACTION', actorId: 'caster', actionId: 'lightning-bolt', direction: { x: 1, y: 0 } }).state;

    expect(state.creatures['enemy-a'].hp).toBe(0);
    expect(state.creatures['enemy-b'].hp).toBe(0);
    expect(state.status).toBe('victory');
    expect(state.rollIndex).toBe(3);
  });

  it('rejects an action without consuming state or a predetermined roll', () => {
    const state = initializeGame(puzzle('basic-strike'));
    const result = executeCommand(state, { type: 'USE_ACTION', actorId: 'fighter', actionId: 'strike', targetId: 'missing' });
    expect(result.error).toBeTruthy();
    expect(result.state).toBe(state);
    expect(result.state.rollIndex).toBe(0);
  });
});
