import { parsePuzzleDefinition } from './schema';
import {
  gridDistance,
  isFlanked,
  lineSquares,
  normalizeDirection,
  positionKey,
  reachableSquares,
  samePosition,
  teamsAreOpposed,
  validShoveDestinations
} from './geometry';
import type {
  ActionId,
  AttackDefinition,
  CreatureDefinition,
  DegreeOfSuccess,
  ExecutionResult,
  GameCommand,
  GameEvent,
  GameState,
  GridPosition,
  PuzzleDefinition,
  RuntimeCondition
} from './types';

export interface ActionMetadata {
  id: ActionId;
  name: string;
  cost: 0 | 1 | 2 | 3;
  target: 'none' | 'square' | 'enemy' | 'ally' | 'line';
  description: string;
}

export const ACTION_LIBRARY: ActionMetadata[] = [
  { id: 'stride', name: 'Stride', cost: 1, target: 'square', description: 'Move up to your Speed, accounting for terrain.' },
  { id: 'step', name: 'Step', cost: 1, target: 'square', description: 'Move one square.' },
  { id: 'strike', name: 'Strike', cost: 1, target: 'enemy', description: 'Attack with a weapon. Multiple Attack Penalty applies.' },
  { id: 'feint', name: 'Feint', cost: 1, target: 'enemy', description: 'Deception vs. Perception DC; makes the target off-guard to you.' },
  { id: 'demoralize', name: 'Demoralize', cost: 1, target: 'enemy', description: 'Intimidation vs. Will DC; applies frightened.' },
  { id: 'shove', name: 'Shove', cost: 1, target: 'enemy', description: 'Athletics vs. Fortitude DC; push an adjacent target.' },
  { id: 'trip', name: 'Trip', cost: 1, target: 'enemy', description: 'Athletics vs. Reflex DC; knock an adjacent target prone.' },
  { id: 'grapple', name: 'Grapple', cost: 1, target: 'enemy', description: 'Athletics vs. Fortitude DC; grab an adjacent target.' },
  { id: 'aid', name: 'Aid', cost: 1, target: 'ally', description: 'Grant an ally +1 to its next attack this turn.' },
  { id: 'delay', name: 'Delay', cost: 0, target: 'none', description: 'Leave initiative and resume before a later creature acts.' },
  { id: 'lightning-bolt', name: 'Lightning Bolt', cost: 2, target: 'line', description: 'Choose a direction and resolve a deterministic Reflex save for each target.' }
];

export interface AttackModifierBreakdown {
  base: number;
  multipleAttackPenalty: number;
  aidBonus: number;
  total: number;
}

export function getAttackModifierBreakdown(state: GameState, actorId: string, attack: AttackDefinition): AttackModifierBreakdown {
  const attackCount = state.attackCounts[actorId] ?? 0;
  const multipleAttackPenalty = attackCount === 0 ? 0 : attackCount === 1 ? (attack.agile ? -4 : -5) : (attack.agile ? -8 : -10);
  const aidBonus = state.creatures[actorId]?.conditions.some(condition => condition.type === 'aided') ? 1 : 0;
  return {
    base: attack.attackBonus,
    multipleAttackPenalty,
    aidBonus,
    total: attack.attackBonus + multipleAttackPenalty + aidBonus
  };
}

export function initializeGame(input: PuzzleDefinition): GameState {
  const puzzle = parsePuzzleDefinition(input);
  const initiativeOrder = [...puzzle.creatures]
    .sort((a, b) => b.initiative - a.initiative || a.id.localeCompare(b.id))
    .map(creature => creature.id);
  const activeIndex = Math.max(0, initiativeOrder.findIndex(id => getDefinition(puzzle, id)?.controlled));
  const active = getDefinition(puzzle, initiativeOrder[activeIndex]);
  const opening: GameEvent = {
    id: 1,
    kind: 'system',
    message: `${puzzle.title} begins. ${describeObjective(puzzle)}`
  };

  return {
    puzzle,
    round: 1,
    initiativeOrder,
    activeIndex,
    delayedCreatureIds: [],
    completedTurnIds: [],
    creatures: Object.fromEntries(puzzle.creatures.map(creature => [creature.id, {
      id: creature.id,
      position: { ...creature.position },
      hp: creature.hp,
      conditions: []
    }])),
    actionsRemaining: active?.controlled ? 3 : 0,
    reactions: Object.fromEntries(puzzle.creatures.map(creature => [creature.id, true])),
    attackCounts: Object.fromEntries(puzzle.creatures.map(creature => [creature.id, 0])),
    rollIndex: 0,
    objects: {},
    eventLog: [opening],
    status: 'playing',
    statusReason: null,
    commandCount: 0
  };
}

export function executeCommand(state: GameState, command: GameCommand): ExecutionResult {
  if (state.status !== 'playing') return rejected(state, 'The puzzle has ended. Undo or reset to continue.');
  if (command.type === 'END_TURN') return endTurn(state, command.actorId);
  if (command.type === 'RESUME_DELAYED') return resumeDelayed(state, command.actorId);
  return resolveAction(state, command);
}

export function getActiveCreatureId(state: GameState) {
  return state.initiativeOrder[state.activeIndex] ?? null;
}

export function getCreatureDefinition(state: GameState, creatureId: string) {
  return getDefinition(state.puzzle, creatureId);
}

export function getActionMetadata(actionId: ActionId) {
  return ACTION_LIBRARY.find(action => action.id === actionId);
}

export function legalTargets(state: GameState, actorId: string, actionId: ActionId) {
  const actor = state.creatures[actorId];
  const actorDefinition = getDefinition(state.puzzle, actorId);
  if (!actor || !actorDefinition) return [];
  return Object.values(state.creatures).filter(target => {
    const targetDefinition = getDefinition(state.puzzle, target.id);
    if (!targetDefinition || target.hp <= 0 || target.id === actorId) return false;
    if (actionId === 'aid') return targetDefinition.team === actorDefinition.team || (actorDefinition.team !== 'enemy' && targetDefinition.team !== 'enemy');
    if (!teamsAreOpposed(actorDefinition.team, targetDefinition.team)) return false;
    if (actionId === 'strike') {
      const attack = actorDefinition.attacks[0];
      return Boolean(attack && gridDistance(actor.position, target.position) <= attack.range);
    }
    return gridDistance(actor.position, target.position) <= 1;
  }).map(target => target.id);
}

export function legalDestinations(state: GameState, actorId: string, actionId: 'stride' | 'step') {
  const definition = getDefinition(state.puzzle, actorId);
  if (!definition) return [];
  return reachableSquares(state, actorId, actionId === 'step' ? 1 : Math.floor(definition.speed / 5));
}

export function previewLine(state: GameState, actorId: string, target: GridPosition) {
  const actor = state.creatures[actorId];
  const definition = getDefinition(state.puzzle, actorId);
  const spell = definition?.spells.find(item => item.actionId === 'lightning-bolt');
  if (!actor || !spell) return [];
  return lineSquares(actor.position, normalizeDirection(actor.position, target), spell.range, state.puzzle);
}

export function determineDegree(naturalRoll: number, total: number, dc: number): DegreeOfSuccess {
  const degrees: DegreeOfSuccess[] = ['critical-failure', 'failure', 'success', 'critical-success'];
  let index = total >= dc + 10 ? 3 : total >= dc ? 2 : total <= dc - 10 ? 0 : 1;
  if (naturalRoll === 20) index = Math.min(3, index + 1);
  if (naturalRoll === 1) index = Math.max(0, index - 1);
  return degrees[index];
}

export function effectiveArmorClass(state: GameState, targetId: string, attackerId: string) {
  const target = state.creatures[targetId];
  const definition = getDefinition(state.puzzle, targetId);
  if (!target || !definition) return 0;
  const frightened = target.conditions.find(condition => condition.type === 'frightened')?.value ?? 0;
  const conditionOffGuard = target.conditions.some(condition => (
    ['off-guard', 'prone', 'grabbed'].includes(condition.type) && (!condition.relativeTo || condition.relativeTo === attackerId)
  ));
  return definition.ac - frightened - (conditionOffGuard || isFlanked(state, targetId, attackerId) ? 2 : 0);
}

export function describeObjective(puzzle: PuzzleDefinition) {
  const objective = puzzle.objective;
  if (objective.type === 'defeat-all-enemies') return `Defeat all enemies before round ${puzzle.maxRounds} ends.`;
  if (objective.type === 'defeat-specific-enemy') return `Defeat ${getDefinition(puzzle, objective.creatureId)?.name ?? objective.creatureId}.`;
  if (objective.type === 'reach-square') return `Move ${getDefinition(puzzle, objective.creatureId)?.name ?? objective.creatureId} to (${objective.position.x + 1}, ${objective.position.y + 1}).`;
  if (objective.type === 'apply-condition') return `Apply ${objective.condition} to ${getDefinition(puzzle, objective.creatureId)?.name ?? objective.creatureId}.`;
  return `Keep ${getDefinition(puzzle, objective.creatureId)?.name ?? objective.creatureId} alive through the encounter.`;
}

function resolveAction(state: GameState, command: Extract<GameCommand, { type: 'USE_ACTION' }>): ExecutionResult {
  const commonError = validateActor(state, command.actorId, command.actionId);
  if (commonError) return rejected(state, commonError);
  if (command.actionId === 'delay') return delayTurn(state, command.actorId);

  const metadata = getActionMetadata(command.actionId);
  if (!metadata) return rejected(state, `Unknown action: ${command.actionId}.`);
  const definition = getDefinition(state.puzzle, command.actorId);
  const spellCost = command.actionId === 'lightning-bolt'
    ? definition?.spells.find(spell => spell.actionId === command.actionId)?.actionCost
    : undefined;
  const cost = spellCost ?? metadata.cost;
  if (state.actionsRemaining < cost) return rejected(state, `${metadata.name} requires ${cost} action${cost === 1 ? '' : 's'}.`);

  if (command.actionId === 'stride' || command.actionId === 'step') return move(state, command, cost);
  if (command.actionId === 'strike') return strike(state, command, cost);
  if (command.actionId === 'lightning-bolt') return lightningBolt(state, command, cost);
  if (command.actionId === 'aid') return aid(state, command, cost);
  return skillAction(state, command, cost);
}

function validateActor(state: GameState, actorId: string, actionId: ActionId) {
  if (getActiveCreatureId(state) !== actorId) return 'Only the active creature can act.';
  const actor = state.creatures[actorId];
  const definition = getDefinition(state.puzzle, actorId);
  if (!actor || !definition || actor.hp <= 0) return 'The acting creature is unavailable.';
  if (!definition.controlled) return 'This creature is not player-controlled.';
  if (!definition.actionIds.includes(actionId)) return `${definition.name} does not have ${getActionMetadata(actionId)?.name ?? actionId}.`;
  if (actor.conditions.some(condition => condition.type === 'immobilized') && (actionId === 'stride' || actionId === 'step')) return `${definition.name} is immobilized.`;
  return null;
}

function move(state: GameState, command: Extract<GameCommand, { type: 'USE_ACTION' }>, cost: number): ExecutionResult {
  if (!command.destination) return rejected(state, 'Choose a destination square.');
  const destinations = legalDestinations(state, command.actorId, command.actionId as 'stride' | 'step');
  if (!destinations.some(position => samePosition(position, command.destination as GridPosition))) return rejected(state, 'That square cannot be reached with this action.');
  const next = cloneState(state);
  next.creatures[command.actorId].position = { ...command.destination };
  next.actionsRemaining -= cost;
  const actorName = getDefinition(next.puzzle, command.actorId)?.name ?? command.actorId;
  return completeCommand(next, [{ kind: 'action', message: `${actorName} ${command.actionId === 'step' ? 'Steps' : 'Strides'} to ${formatSquare(command.destination)}.` }]);
}

function strike(state: GameState, command: Extract<GameCommand, { type: 'USE_ACTION' }>, cost: number): ExecutionResult {
  if (!command.targetId || !legalTargets(state, command.actorId, 'strike').includes(command.targetId)) return rejected(state, 'Choose a legal Strike target.');
  const actorDefinition = getDefinition(state.puzzle, command.actorId);
  const targetDefinition = getDefinition(state.puzzle, command.targetId);
  const attack = actorDefinition?.attacks.find(item => item.id === command.attackId) ?? actorDefinition?.attacks[0];
  if (!actorDefinition || !targetDefinition || !attack) return rejected(state, 'No usable attack is configured.');
  const natural = state.puzzle.rolls[state.rollIndex];
  if (natural === undefined) return rejected(state, 'The predetermined roll queue is empty.');

  const next = cloneState(state);
  const attackCount = next.attackCounts[command.actorId] ?? 0;
  const modifier = getAttackModifierBreakdown(next, command.actorId, attack);
  const total = natural + modifier.total;
  const armorClass = effectiveArmorClass(next, command.targetId, command.actorId);
  const { multipleAttackPenalty: map, aidBonus } = modifier;
  const degree = determineDegree(natural, total, armorClass);
  const hit = degree === 'success' || degree === 'critical-success';
  const damage = hit ? attack.damage * (degree === 'critical-success' ? 2 : 1) : 0;
  next.rollIndex += 1;
  next.attackCounts[command.actorId] = attackCount + 1;
  next.actionsRemaining -= cost;
  next.creatures[command.actorId].conditions = next.creatures[command.actorId].conditions.filter(condition => condition.type !== 'aided');
  next.creatures[command.targetId].hp = Math.max(0, next.creatures[command.targetId].hp - damage);

  const messages: Omit<GameEvent, 'id'>[] = [
    { kind: 'action', message: `${actorDefinition.name} Strikes ${targetDefinition.name} with ${attack.name}.` },
    { kind: 'roll', message: `Predetermined roll ${natural} + ${attack.attackBonus}${map ? ` ${map}` : ''}${aidBonus ? ' + 1 Aid' : ''} = ${total} vs. AC ${armorClass}: ${degreeLabel(degree)}.` }
  ];
  if (damage > 0) messages.push({ kind: 'effect', message: `${targetDefinition.name} takes ${damage} ${attack.damageType} damage (${next.creatures[command.targetId].hp}/${targetDefinition.maxHp} HP).` });
  return completeCommand(next, messages);
}

function skillAction(state: GameState, command: Extract<GameCommand, { type: 'USE_ACTION' }>, cost: number): ExecutionResult {
  if (!command.targetId || !legalTargets(state, command.actorId, command.actionId).includes(command.targetId)) return rejected(state, 'Choose a legal adjacent target.');
  const actorDefinition = getDefinition(state.puzzle, command.actorId);
  const targetDefinition = getDefinition(state.puzzle, command.targetId);
  const natural = state.puzzle.rolls[state.rollIndex];
  if (!actorDefinition || !targetDefinition) return rejected(state, 'The selected creatures are unavailable.');
  if (natural === undefined) return rejected(state, 'The predetermined roll queue is empty.');
  if (command.actionId === 'shove') {
    if (!command.destination || !validShoveDestinations(state, command.actorId, command.targetId).some(position => samePosition(position, command.destination as GridPosition))) {
      return rejected(state, 'Choose a legal square behind the Shove target.');
    }
  }

  const next = cloneState(state);
  const config = skillActionConfig(command.actionId, actorDefinition, targetDefinition);
  const total = natural + config.modifier;
  const degree = determineDegree(natural, total, config.dc);
  next.rollIndex += 1;
  next.actionsRemaining -= cost;
  const messages: Omit<GameEvent, 'id'>[] = [
    { kind: 'action', message: `${actorDefinition.name} uses ${getActionMetadata(command.actionId)?.name} against ${targetDefinition.name}.` },
    { kind: 'roll', message: `Predetermined roll ${natural} + ${config.modifier} = ${total} vs. DC ${config.dc}: ${degreeLabel(degree)}.` }
  ];

  if (degree === 'success' || degree === 'critical-success') {
    if (command.actionId === 'feint') {
      addCondition(next, command.targetId, { type: 'off-guard', value: 1, sourceId: command.actorId, relativeTo: command.actorId, expires: 'end-source-turn' });
      messages.push({ kind: 'effect', message: `${targetDefinition.name} is off-guard against ${actorDefinition.name}.` });
    } else if (command.actionId === 'demoralize') {
      const value = degree === 'critical-success' ? 2 : 1;
      addCondition(next, command.targetId, { type: 'frightened', value, sourceId: command.actorId, expires: 'end-target-turn' });
      messages.push({ kind: 'effect', message: `${targetDefinition.name} is frightened ${value}.` });
    } else if (command.actionId === 'shove' && command.destination) {
      next.creatures[command.targetId].position = { ...command.destination };
      messages.push({ kind: 'effect', message: `${targetDefinition.name} is pushed to ${formatSquare(command.destination)}.` });
    } else if (command.actionId === 'trip') {
      addCondition(next, command.targetId, { type: 'prone', value: 1, sourceId: command.actorId, expires: 'persistent' });
      messages.push({ kind: 'effect', message: `${targetDefinition.name} falls prone.` });
    } else if (command.actionId === 'grapple') {
      addCondition(next, command.targetId, { type: 'grabbed', value: 1, sourceId: command.actorId, expires: 'end-source-turn' });
      messages.push({ kind: 'effect', message: `${targetDefinition.name} is grabbed.` });
    }
  }
  return completeCommand(next, messages);
}

function aid(state: GameState, command: Extract<GameCommand, { type: 'USE_ACTION' }>, cost: number): ExecutionResult {
  if (!command.targetId || !legalTargets(state, command.actorId, 'aid').includes(command.targetId)) return rejected(state, 'Choose an adjacent ally to Aid.');
  const next = cloneState(state);
  const actorName = getDefinition(next.puzzle, command.actorId)?.name ?? command.actorId;
  const targetName = getDefinition(next.puzzle, command.targetId)?.name ?? command.targetId;
  addCondition(next, command.targetId, { type: 'aided', value: 1, sourceId: command.actorId, expires: 'end-target-turn' });
  next.actionsRemaining -= cost;
  return completeCommand(next, [{ kind: 'effect', message: `${actorName} Aids ${targetName}; their next attack gains +1.` }]);
}

function lightningBolt(state: GameState, command: Extract<GameCommand, { type: 'USE_ACTION' }>, cost: number): ExecutionResult {
  if (!command.direction) return rejected(state, 'Choose a direction for the line.');
  const actor = state.creatures[command.actorId];
  const actorDefinition = getDefinition(state.puzzle, command.actorId);
  const spell = actorDefinition?.spells.find(item => item.actionId === 'lightning-bolt');
  if (!actor || !actorDefinition || !spell) return rejected(state, 'No line spell is configured.');
  const squares = lineSquares(actor.position, command.direction, spell.range, state.puzzle);
  const squareKeys = new Set(squares.map(positionKey));
  const targets = Object.values(state.creatures).filter(creature => {
    const definition = getDefinition(state.puzzle, creature.id);
    return creature.hp > 0 && Boolean(definition && teamsAreOpposed(actorDefinition.team, definition.team)) && squareKeys.has(positionKey(creature.position));
  });
  if (targets.length === 0) return rejected(state, 'The line does not affect an enemy.');
  if (state.rollIndex + targets.length > state.puzzle.rolls.length) return rejected(state, 'The roll queue does not contain enough saves for every target.');

  const next = cloneState(state);
  const messages: Omit<GameEvent, 'id'>[] = [{ kind: 'action', message: `${actorDefinition.name} casts ${spell.name}.` }];
  targets.sort((a, b) => a.id.localeCompare(b.id)).forEach(target => {
    const targetDefinition = getDefinition(next.puzzle, target.id);
    if (!targetDefinition) return;
    const natural = next.puzzle.rolls[next.rollIndex];
    const total = natural + targetDefinition.reflex;
    const degree = determineDegree(natural, total, spell.dc);
    const multiplier = degree === 'critical-failure' ? 2 : degree === 'failure' ? 1 : degree === 'success' ? 0.5 : 0;
    const damage = Math.floor(spell.damage * multiplier);
    next.rollIndex += 1;
    next.creatures[target.id].hp = Math.max(0, next.creatures[target.id].hp - damage);
    messages.push(
      { kind: 'roll', message: `${targetDefinition.name}: ${natural} + ${targetDefinition.reflex} = ${total} vs. Reflex DC ${spell.dc}: ${degreeLabel(degree)}.` },
      { kind: 'effect', message: `${targetDefinition.name} takes ${damage} ${spell.damageType} damage (${next.creatures[target.id].hp}/${targetDefinition.maxHp} HP).` }
    );
  });
  next.actionsRemaining -= cost;
  return completeCommand(next, messages);
}

function endTurn(state: GameState, actorId: string): ExecutionResult {
  if (getActiveCreatureId(state) !== actorId) return rejected(state, 'Only the active creature can end its turn.');
  const next = cloneState(state);
  const actorName = getDefinition(next.puzzle, actorId)?.name ?? actorId;
  next.completedTurnIds = [...new Set([...next.completedTurnIds, actorId])];
  expireConditions(next, actorId);
  const events: Omit<GameEvent, 'id'>[] = [{ kind: 'turn', message: `${actorName} ends their turn.` }];
  advanceTurn(next, events);
  next.commandCount += 1;
  return finalize(next, events);
}

function delayTurn(state: GameState, actorId: string): ExecutionResult {
  const next = cloneState(state);
  const actorName = getDefinition(next.puzzle, actorId)?.name ?? actorId;
  next.delayedCreatureIds.push(actorId);
  const events: Omit<GameEvent, 'id'>[] = [{ kind: 'turn', message: `${actorName} Delays and leaves initiative.` }];
  advanceTurn(next, events);
  next.commandCount += 1;
  return finalize(next, events);
}

function resumeDelayed(state: GameState, actorId: string): ExecutionResult {
  if (!state.delayedCreatureIds.includes(actorId)) return rejected(state, 'That creature is not delaying.');
  const currentId = getActiveCreatureId(state);
  const next = cloneState(state);
  const withoutActor = next.initiativeOrder.filter(id => id !== actorId);
  const insertionIndex = currentId ? Math.max(0, withoutActor.indexOf(currentId)) : 0;
  withoutActor.splice(insertionIndex, 0, actorId);
  next.initiativeOrder = withoutActor;
  next.activeIndex = insertionIndex;
  next.delayedCreatureIds = next.delayedCreatureIds.filter(id => id !== actorId);
  next.completedTurnIds = next.completedTurnIds.filter(id => id !== actorId);
  next.actionsRemaining = 3;
  next.attackCounts[actorId] = 0;
  next.reactions[actorId] = true;
  next.commandCount += 1;
  return finalize(next, [{ kind: 'turn', message: `${getDefinition(next.puzzle, actorId)?.name ?? actorId} resumes from Delay.` }]);
}

function advanceTurn(state: GameState, events: Omit<GameEvent, 'id'>[]) {
  const length = state.initiativeOrder.length;
  const startIndex = state.activeIndex;
  for (let step = 1; step <= length; step += 1) {
    const index = (startIndex + step) % length;
    const wrapped = startIndex + step >= length;
    const id = state.initiativeOrder[index];
    const creature = state.creatures[id];
    const definition = getDefinition(state.puzzle, id);
    if (!creature || creature.hp <= 0 || !definition?.controlled || state.delayedCreatureIds.includes(id)) continue;
    const nextRound = state.round + (wrapped ? 1 : 0);
    if (nextRound > state.puzzle.maxRounds) {
      state.status = 'failure';
      state.statusReason = `Round ${state.puzzle.maxRounds} ended before the objective was completed.`;
      events.push({ kind: 'system', message: `ROUND FAILED — ${state.statusReason}` });
      return;
    }
    if (wrapped) {
      state.round = nextRound;
      state.completedTurnIds = [];
      events.push({ kind: 'turn', message: `Round ${state.round} begins.` });
    }
    state.activeIndex = index;
    state.actionsRemaining = 3;
    state.attackCounts[id] = 0;
    state.reactions[id] = true;
    events.push({ kind: 'turn', message: `${definition.name}'s turn begins with 3 actions.` });
    return;
  }
  state.status = 'failure';
  state.statusReason = 'No controllable creatures remain.';
  events.push({ kind: 'system', message: `ROUND FAILED — ${state.statusReason}` });
}

function completeCommand(state: GameState, events: Omit<GameEvent, 'id'>[]): ExecutionResult {
  state.commandCount += 1;
  return finalize(state, events);
}

function finalize(state: GameState, events: Omit<GameEvent, 'id'>[]): ExecutionResult {
  const failedAlly = state.puzzle.objective.type === 'keep-ally-alive'
    ? state.creatures[state.puzzle.objective.creatureId]?.hp === 0
    : false;
  if (failedAlly) {
    state.status = 'failure';
    state.statusReason = 'The protected ally was defeated.';
    events.push({ kind: 'system', message: `PUZZLE FAILED — ${state.statusReason}` });
  } else if (objectiveSatisfied(state)) {
    state.status = 'victory';
    state.statusReason = 'The objective is complete.';
    events.push({ kind: 'system', message: 'PUZZLE SOLVED' });
  }
  const withIds = events.map((event, index) => ({ ...event, id: state.eventLog.length + index + 1 }));
  state.eventLog.push(...withIds);
  return { state, events: withIds };
}

function objectiveSatisfied(state: GameState) {
  const objective = state.puzzle.objective;
  if (objective.type === 'defeat-all-enemies') {
    return state.puzzle.creatures.filter(creature => creature.team === 'enemy').every(creature => state.creatures[creature.id].hp <= 0);
  }
  if (objective.type === 'defeat-specific-enemy') return (state.creatures[objective.creatureId]?.hp ?? 1) <= 0;
  if (objective.type === 'reach-square') return samePosition(state.creatures[objective.creatureId]?.position ?? { x: -1, y: -1 }, objective.position);
  if (objective.type === 'apply-condition') return state.creatures[objective.creatureId]?.conditions.some(condition => condition.type === objective.condition) ?? false;
  return false;
}

function skillActionConfig(actionId: ActionId, actor: CreatureDefinition, target: CreatureDefinition) {
  if (actionId === 'feint') return { modifier: actor.skills.deception, dc: 10 + target.perception };
  if (actionId === 'demoralize') return { modifier: actor.skills.intimidation, dc: 10 + target.will };
  if (actionId === 'trip') return { modifier: actor.skills.athletics, dc: 10 + target.reflex };
  return { modifier: actor.skills.athletics, dc: 10 + target.fortitude };
}

function addCondition(state: GameState, targetId: string, condition: RuntimeCondition) {
  const target = state.creatures[targetId];
  const existingIndex = target.conditions.findIndex(current => current.type === condition.type && current.relativeTo === condition.relativeTo);
  if (existingIndex >= 0) target.conditions[existingIndex] = condition;
  else target.conditions.push(condition);
}

function expireConditions(state: GameState, actorId: string) {
  Object.values(state.creatures).forEach(creature => {
    creature.conditions = creature.conditions.filter(condition => {
      if (condition.expires === 'end-source-turn' && condition.sourceId === actorId) return false;
      if (condition.expires === 'end-target-turn' && creature.id === actorId) return false;
      return true;
    });
  });
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    initiativeOrder: [...state.initiativeOrder],
    delayedCreatureIds: [...state.delayedCreatureIds],
    completedTurnIds: [...state.completedTurnIds],
    creatures: Object.fromEntries(Object.entries(state.creatures).map(([id, creature]) => [id, {
      ...creature,
      position: { ...creature.position },
      conditions: creature.conditions.map(condition => ({ ...condition }))
    }])),
    reactions: { ...state.reactions },
    attackCounts: { ...state.attackCounts },
    objects: { ...state.objects },
    eventLog: [...state.eventLog]
  };
}

function getDefinition(puzzle: PuzzleDefinition, creatureId: string | null | undefined) {
  return creatureId ? puzzle.creatures.find(creature => creature.id === creatureId) : undefined;
}

function rejected(state: GameState, message: string): ExecutionResult {
  return { state, events: [{ id: state.eventLog.length + 1, kind: 'error', message }], error: message };
}

function degreeLabel(degree: DegreeOfSuccess) {
  return degree.replace('-', ' ').toUpperCase();
}

function formatSquare(position: GridPosition) {
  return `${String.fromCharCode(65 + position.x)}${position.y + 1}`;
}
