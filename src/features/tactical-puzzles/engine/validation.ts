import { ACTION_IDS, type PuzzleDefinition, type PuzzleValidationResult } from './types';
import { safeParsePuzzleDefinition } from './schema';
import { isInsideBoard, positionKey } from './geometry';

export function validatePuzzle(value: unknown): PuzzleValidationResult {
  const parsed = safeParsePuzzleDefinition(value);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map(issue => `${issue.path.join('.') || 'puzzle'}: ${issue.message}`),
      warnings: []
    };
  }

  const puzzle = parsed.data as PuzzleDefinition;
  const errors: string[] = [];
  const warnings: string[] = [];
  const primaryPlayers = puzzle.creatures.filter(creature => creature.team === 'player');
  const enemies = puzzle.creatures.filter(creature => creature.team === 'enemy');
  if (primaryPlayers.length !== 1) errors.push(`Exactly one primary Player is required; found ${primaryPlayers.length}.`);
  if ((puzzle.objective.type === 'defeat-all-enemies' || puzzle.objective.type === 'defeat-specific-enemy') && enemies.length === 0) errors.push('This objective requires at least one enemy.');

  const ids = new Set<string>();
  const occupied = new Map<string, string>();
  puzzle.creatures.forEach(creature => {
    if (ids.has(creature.id)) errors.push(`Creature ID "${creature.id}" is duplicated.`);
    ids.add(creature.id);
    if (!isInsideBoard(creature.position, puzzle)) errors.push(`${creature.name} is outside the board.`);
    const key = positionKey(creature.position);
    const occupant = occupied.get(key);
    if (occupant) errors.push(`${creature.name} overlaps ${occupant}.`);
    occupied.set(key, creature.name);
    if (creature.hp > creature.maxHp) errors.push(`${creature.name} has more HP than maximum HP.`);
    if (creature.actionIds.some(actionId => !ACTION_IDS.includes(actionId))) errors.push(`${creature.name} has an unknown action.`);
    if (creature.actionIds.includes('strike') && creature.attacks.length === 0) errors.push(`${creature.name} can Strike but has no attack.`);
    if (creature.actionIds.includes('lightning-bolt') && creature.spells.length === 0) errors.push(`${creature.name} can cast Lightning Bolt but has no spell definition.`);
  });

  const referencedId = 'creatureId' in puzzle.objective ? puzzle.objective.creatureId : null;
  if (referencedId && !ids.has(referencedId)) errors.push(`The objective references missing creature "${referencedId}".`);
  if (puzzle.objective.type === 'reach-square' && !isInsideBoard(puzzle.objective.position, puzzle)) errors.push('The objective square is outside the board.');
  puzzle.board.terrain.forEach(cell => {
    if (!isInsideBoard(cell, puzzle)) errors.push(`Terrain at (${cell.x + 1}, ${cell.y + 1}) is outside the board.`);
    if (cell.type === 'blocked' && occupied.has(positionKey(cell))) errors.push(`Blocked terrain overlaps ${occupied.get(positionKey(cell))}.`);
  });

  const rollActions = puzzle.creatures.flatMap(creature => creature.actionIds).filter(actionId => ['strike', 'feint', 'demoralize', 'shove', 'trip', 'grapple', 'lightning-bolt'].includes(actionId));
  if (rollActions.length > 0 && puzzle.rolls.length === 0) warnings.push('This puzzle has checked actions but no predetermined rolls.');
  if (puzzle.intendedSolution) {
    const estimatedRolls = puzzle.intendedSolution.filter(command => command.actionId && ['strike', 'feint', 'demoralize', 'shove', 'trip', 'grapple', 'lightning-bolt'].includes(command.actionId)).length;
    if (estimatedRolls > puzzle.rolls.length) warnings.push('The roll queue may be too short for the intended solution.');
  }
  if (puzzle.hints.length === 0) warnings.push('No hints are configured.');

  return { valid: errors.length === 0, errors, warnings };
}
