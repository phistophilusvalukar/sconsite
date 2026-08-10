import type { GameState, GridPosition, PuzzleDefinition, Team } from './types';

const DIRECTIONS: GridPosition[] = [
  { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  { x: -1, y: 0 }, { x: 1, y: 0 },
  { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 }
];

export function positionKey(position: GridPosition) {
  return `${position.x},${position.y}`;
}

export function samePosition(a: GridPosition, b: GridPosition) {
  return a.x === b.x && a.y === b.y;
}

export function gridDistance(a: GridPosition, b: GridPosition) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function isInsideBoard(position: GridPosition, puzzle: PuzzleDefinition) {
  return position.x >= 0 && position.y >= 0 && position.x < puzzle.board.width && position.y < puzzle.board.height;
}

export function isBlocked(position: GridPosition, state: GameState, ignoreCreatureId?: string) {
  if (!isInsideBoard(position, state.puzzle)) return true;
  if (state.puzzle.board.terrain.some(cell => cell.type === 'blocked' && samePosition(cell, position))) return true;
  return Object.values(state.creatures).some(creature => (
    creature.id !== ignoreCreatureId && creature.hp > 0 && samePosition(creature.position, position)
  ));
}

function movementCost(position: GridPosition, puzzle: PuzzleDefinition) {
  return puzzle.board.terrain.some(cell => cell.type === 'difficult' && samePosition(cell, position)) ? 2 : 1;
}

export function reachableSquares(state: GameState, creatureId: string, maximumSquares: number) {
  const creature = state.creatures[creatureId];
  if (!creature) return [];
  const costs = new Map<string, number>([[positionKey(creature.position), 0]]);
  const queue: GridPosition[] = [creature.position];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const currentCost = costs.get(positionKey(current)) ?? 0;
    for (const direction of DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const nextCost = currentCost + movementCost(next, state.puzzle);
      const knownCost = costs.get(positionKey(next));
      if (nextCost > maximumSquares || isBlocked(next, state, creatureId) || (knownCost !== undefined && knownCost <= nextCost)) continue;
      costs.set(positionKey(next), nextCost);
      queue.push(next);
    }
  }

  return [...costs.entries()]
    .filter(([key]) => key !== positionKey(creature.position))
    .map(([key]) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y };
    });
}

export function normalizeDirection(origin: GridPosition, target: GridPosition): GridPosition {
  return {
    x: Math.sign(target.x - origin.x),
    y: Math.sign(target.y - origin.y)
  };
}

export function lineSquares(origin: GridPosition, direction: GridPosition, range: number, puzzle: PuzzleDefinition) {
  const normalized = { x: Math.sign(direction.x), y: Math.sign(direction.y) };
  if (normalized.x === 0 && normalized.y === 0) return [];
  const squares: GridPosition[] = [];
  for (let step = 1; step <= range; step += 1) {
    const square = { x: origin.x + normalized.x * step, y: origin.y + normalized.y * step };
    if (!isInsideBoard(square, puzzle)) break;
    squares.push(square);
    if (puzzle.board.terrain.some(cell => cell.type === 'blocked' && samePosition(cell, square))) break;
  }
  return squares;
}

export function burstSquares(center: GridPosition, radius: number, puzzle: PuzzleDefinition) {
  const squares: GridPosition[] = [];
  for (let y = center.y - radius; y <= center.y + radius; y += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      const position = { x, y };
      if (isInsideBoard(position, puzzle) && gridDistance(center, position) <= radius) squares.push(position);
    }
  }
  return squares;
}

export function emanationSquares(origin: GridPosition, radius: number, puzzle: PuzzleDefinition) {
  return burstSquares(origin, radius, puzzle).filter(square => !samePosition(square, origin));
}

export function coneSquares(origin: GridPosition, direction: GridPosition, range: number, puzzle: PuzzleDefinition) {
  const normalized = normalizeDirection({ x: 0, y: 0 }, direction);
  const squares: GridPosition[] = [];
  for (let y = 0; y < puzzle.board.height; y += 1) {
    for (let x = 0; x < puzzle.board.width; x += 1) {
      const delta = { x: x - origin.x, y: y - origin.y };
      const forward = delta.x * normalized.x + delta.y * normalized.y;
      const sideways = Math.abs(delta.x * normalized.y - delta.y * normalized.x);
      if (forward > 0 && forward <= range && sideways <= forward) squares.push({ x, y });
    }
  }
  return squares;
}

export function teamsAreOpposed(a: Team, b: Team) {
  return (a === 'enemy') !== (b === 'enemy') && a !== 'neutral' && b !== 'neutral';
}

export function isFlanked(state: GameState, targetId: string, attackerId: string) {
  const target = state.creatures[targetId];
  const attacker = state.creatures[attackerId];
  const targetDefinition = state.puzzle.creatures.find(creature => creature.id === targetId);
  const attackerDefinition = state.puzzle.creatures.find(creature => creature.id === attackerId);
  if (!target || !attacker || !targetDefinition || !attackerDefinition || gridDistance(target.position, attacker.position) > 1) return false;

  const attackerVector = {
    x: attacker.position.x - target.position.x,
    y: attacker.position.y - target.position.y
  };
  return Object.values(state.creatures).some(other => {
    if (other.id === attackerId || other.id === targetId || other.hp <= 0 || gridDistance(target.position, other.position) > 1) return false;
    const otherDefinition = state.puzzle.creatures.find(creature => creature.id === other.id);
    if (!otherDefinition || !teamsAreOpposed(otherDefinition.team, targetDefinition.team)) return false;
    const otherVector = { x: other.position.x - target.position.x, y: other.position.y - target.position.y };
    return attackerVector.x * otherVector.x + attackerVector.y * otherVector.y < 0;
  });
}

export function validShoveDestinations(state: GameState, actorId: string, targetId: string) {
  const actor = state.creatures[actorId];
  const target = state.creatures[targetId];
  if (!actor || !target) return [];
  return DIRECTIONS
    .map(direction => ({ x: target.position.x + direction.x, y: target.position.y + direction.y }))
    .filter(position => !isBlocked(position, state, targetId))
    .filter(position => gridDistance(actor.position, position) > gridDistance(actor.position, target.position));
}
