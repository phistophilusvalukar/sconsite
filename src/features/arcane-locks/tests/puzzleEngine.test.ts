import { describe, expect, it } from 'vitest';
import { buildAccessState, canPerformLockAction, resolveAccess } from '../engine/access';
import {
  applyLockAction,
  destinationForConduit,
  glyphAtSlot,
  glyphSlotForRing,
  normalizeRotation,
  resetRuntimeState,
  traceEnergy,
  validateActionContext,
  validatePuzzle
} from '../engine/puzzleEngine';
import { getPuzzleTemplate } from '../data/puzzleTemplates';
import type { PuzzleDefinition } from '../engine/types';
import { EMPTY_GLYPH_ID } from '../engine/constants';

describe('arcane puzzle engine', () => {
  it('normalizes ring rotations', () => {
    expect(normalizeRotation(7, 6)).toBe(1);
    expect(normalizeRotation(-1, 6)).toBe(5);
  });

  it('maps glyphs to rotated slots and back', () => {
    const puzzle = getPuzzleTemplate('verdant-tutorial');
    const ring = puzzle.rings[0];
    expect(glyphSlotForRing(ring, 'grass', 0)).toBe(0);
    expect(glyphSlotForRing(ring, 'grass', 2)).toBe(2);
    expect(glyphAtSlot(ring, 2, 2)).toBe('grass');
  });

  it('calculates conduit destinations', () => {
    const puzzle = getPuzzleTemplate('verdant-tutorial');
    const state = resetRuntimeState(puzzle);
    const destination = destinationForConduit(puzzle, state, puzzle.rings[0], 'grass');
    expect(destination?.destinationRing?.id).toBe('middle');
    expect(destination?.destinationSlot).toBe(1);
  });

  it('gives decoy glyphs plausible conduit destinations', () => {
    const puzzle = getPuzzleTemplate('verdant-tutorial');
    const state = resetRuntimeState(puzzle);
    const destination = destinationForConduit(puzzle, state, puzzle.rings[0], 'rain');
    expect(destination?.destinationRing?.id).toBe('middle');
    expect(typeof destination?.destinationSlot).toBe('number');
  });

  it('keeps conduit destinations stable when equal-sized rings rotate left together', () => {
    const puzzle = getPuzzleTemplate('verdant-tutorial');
    let state = resetRuntimeState(puzzle);
    state = applyLockAction(puzzle, state, { type: 'power_glyph', ringId: 'middle', glyphId: 'river' });
    const initialTrace = traceEnergy(puzzle, state);

    state = applyLockAction(puzzle, state, { type: 'rotate_ring', ringId: 'middle', direction: -1, steps: 1 });
    state = applyLockAction(puzzle, state, { type: 'rotate_ring', ringId: 'inner', direction: -1, steps: 1 });
    const rotatedTrace = traceEnergy(puzzle, state);

    expect(initialTrace[0]?.toGlyphId).toBe(rotatedTrace[0]?.toGlyphId);
    expect(initialTrace[0]?.toSocketId).toBe(rotatedTrace[0]?.toSocketId);
  });

  it('uses empty slots for alignment without treating them as glyphs', () => {
    const puzzle = getPuzzleTemplate('verdant-tutorial');
    const inner = puzzle.rings.find(ring => ring.id === 'inner');

    expect(puzzle.rings.every(ring => ring.glyphIds.length === puzzle.rings[0].glyphIds.length)).toBe(true);
    expect(inner?.glyphIds).toContain(EMPTY_GLYPH_ID);
    expect(glyphSlotForRing(inner!, EMPTY_GLYPH_ID, 0)).toBe(-1);
    expect(() => applyLockAction(puzzle, resetRuntimeState(puzzle), {
      type: 'power_glyph',
      ringId: 'inner',
      glyphId: EMPTY_GLYPH_ID
    })).toThrow('Empty slots cannot be powered');
  });

  it('preserves an empty destination slot while omitting a false destination glyph', () => {
    const puzzle = getPuzzleTemplate('verdant-tutorial');
    let state = resetRuntimeState(puzzle);

    state = applyLockAction(puzzle, state, { type: 'power_glyph', ringId: 'middle', glyphId: 'river' });
    const segment = traceEnergy(puzzle, state)[0];

    expect(segment.toSlot).toBe(3);
    expect(segment.toGlyphId).toBeNull();
    expect(segment.toSocketId).toBeNull();
    expect(segment.decoy).toBe(true);
  });

  it('enforces one powered glyph per ring', () => {
    const puzzle = getPuzzleTemplate('verdant-tutorial');
    const state = applyLockAction(puzzle, resetRuntimeState(puzzle), { type: 'power_glyph', ringId: 'outer', glyphId: 'grass' });
    const next = applyLockAction(puzzle, state, { type: 'power_glyph', ringId: 'outer', glyphId: 'rain' });
    expect(next.poweredGlyphByRing.outer).toBe('rain');
  });

  it('solves the tutorial lock through semantic and physical validation', () => {
    const puzzle = getPuzzleTemplate('verdant-tutorial');
    let state = resetRuntimeState(puzzle);
    state = applyLockAction(puzzle, state, { type: 'power_glyph', ringId: 'outer', glyphId: 'grass' });
    state = applyLockAction(puzzle, state, { type: 'set_ring_rotation', ringId: 'middle', rotation: 5 });
    state = applyLockAction(puzzle, state, { type: 'power_glyph', ringId: 'middle', glyphId: 'cow' });
    state = applyLockAction(puzzle, state, { type: 'set_ring_rotation', ringId: 'inner', rotation: 0 });
    state = applyLockAction(puzzle, state, { type: 'power_glyph', ringId: 'inner', glyphId: 'lion' });
    expect(traceEnergy(puzzle, state).length).toBeGreaterThan(1);
    expect(validatePuzzle(puzzle, state)).toBe(true);
    expect(applyLockAction(puzzle, state, { type: 'invoke' }).solved).toBe(true);
  });

  it('does not solve with an incorrect semantic chain', () => {
    const puzzle = getPuzzleTemplate('verdant-tutorial');
    let state = resetRuntimeState(puzzle);
    state = applyLockAction(puzzle, state, { type: 'power_glyph', ringId: 'outer', glyphId: 'rain' });
    state = applyLockAction(puzzle, state, { type: 'power_glyph', ringId: 'middle', glyphId: 'cow' });
    state = applyLockAction(puzzle, state, { type: 'power_glyph', ringId: 'inner', glyphId: 'lion' });
    expect(validatePuzzle(puzzle, state)).toBe(false);
    const invoked = applyLockAction(puzzle, state, { type: 'invoke' });
    expect(invoked.solved).toBe(false);
    expect(invoked.lastInvokeFailed).toBe(true);
    const adjusted = applyLockAction(puzzle, invoked, { type: 'rotate_ring', ringId: 'outer', direction: 1, steps: 1 });
    expect(adjusted.lastInvokeFailed).toBe(false);
  });

  it('resets deterministically', () => {
    const puzzle = getPuzzleTemplate('lunar-deciphering');
    const first = resetRuntimeState(puzzle);
    const second = resetRuntimeState(puzzle);
    expect(first).toEqual(second);
    expect(first.solved).toBe(false);
  });

  it('applies linked ring rotation for routing puzzle', () => {
    const puzzle = getPuzzleTemplate('blood-routing');
    const state = applyLockAction(puzzle, resetRuntimeState(puzzle), { type: 'rotate_ring', ringId: 'third', direction: 1, steps: 1 });
    expect(state.ringRotations.inner).toBe(0);
  });

  it('supports independent required chains instead of one continuous outer-to-core line', () => {
    const puzzle = buildComplexPuzzle();
    let state = resetRuntimeState(puzzle);
    state = applyLockAction(puzzle, state, { type: 'power_glyph', ringId: 'outer', glyphId: 'grass' });
    state = applyLockAction(puzzle, state, { type: 'power_glyph', ringId: 'middle', glyphId: 'cow' });
    state = applyLockAction(puzzle, state, { type: 'power_glyph', ringId: 'inner', glyphId: 'moon' });
    state = applyLockAction(puzzle, state, { type: 'power_glyph', ringId: 'deep', glyphId: 'ocean' });
    expect(validatePuzzle(puzzle, state)).toBe(true);
  });

  it('supports skipping rings and sending power back outward', () => {
    const puzzle = buildSkipAndReturnPuzzle();
    let state = resetRuntimeState(puzzle);
    state = applyLockAction(puzzle, state, { type: 'power_glyph', ringId: 'outer', glyphId: 'star' });
    state = applyLockAction(puzzle, state, { type: 'power_glyph', ringId: 'deep', glyphId: 'bone' });
    state = applyLockAction(puzzle, state, { type: 'power_glyph', ringId: 'middle', glyphId: 'river' });
    expect(validatePuzzle(puzzle, state)).toBe(true);
  });

  it('distinguishes duplicate glyph sockets with different conduit paths', () => {
    const puzzle = buildDuplicateSocketPuzzle();
    let state = resetRuntimeState(puzzle);
    state = applyLockAction(puzzle, state, { type: 'power_glyph', ringId: 'outer', glyphId: 'moon', socketId: 'outer-moon-correct' });
    state = applyLockAction(puzzle, state, { type: 'power_glyph', ringId: 'inner', glyphId: 'ocean' });
    expect(validatePuzzle(puzzle, state)).toBe(true);

    let wrong = resetRuntimeState(puzzle);
    wrong = applyLockAction(puzzle, wrong, { type: 'power_glyph', ringId: 'outer', glyphId: 'moon', socketId: 'outer-moon-decoy' });
    wrong = applyLockAction(puzzle, wrong, { type: 'power_glyph', ringId: 'inner', glyphId: 'ocean' });
    expect(validatePuzzle(puzzle, wrong)).toBe(false);
  });

  it('supports branching power where permanent blockers suppress the unwanted branch', () => {
    const puzzle = buildBranchingPuzzle();
    let blocked = resetRuntimeState(puzzle);
    blocked = applyLockAction(puzzle, blocked, { type: 'power_glyph', ringId: 'outer', glyphId: 'fire' });
    blocked = applyLockAction(puzzle, blocked, { type: 'power_glyph', ringId: 'inner', glyphId: 'smoke' });
    expect(traceEnergy(puzzle, blocked).filter(segment => segment.blocked)).toHaveLength(1);
    expect(validatePuzzle(puzzle, blocked)).toBe(true);

    const staleInactiveState = {
      ...blocked,
      obstacleStates: { branchBlock: { active: false } }
    };
    expect(validatePuzzle(puzzle, staleInactiveState)).toBe(true);
  });

  it('does not emit an outgoing conduit when the powered glyph is on a warded slot', () => {
    const puzzle = buildSourceBlockedPuzzle();
    const state = applyLockAction(puzzle, resetRuntimeState(puzzle), { type: 'power_glyph', ringId: 'outer', glyphId: 'fire' });

    expect(traceEnergy(puzzle, state)).toHaveLength(0);
    expect(validatePuzzle(puzzle, state)).toBe(false);
  });

  it('solves the expert Eclipse Labyrinth only with the true moon socket and blocked false branch', () => {
    const puzzle = getPuzzleTemplate('eclipse-labyrinth');
    let state = resetRuntimeState(puzzle);
    state = applyLockAction(puzzle, state, { type: 'power_glyph', ringId: 'outer', glyphId: 'grass' });
    state = applyLockAction(puzzle, state, { type: 'power_glyph', ringId: 'middle', glyphId: 'cow' });
    state = applyLockAction(puzzle, state, { type: 'power_glyph', ringId: 'lunar', glyphId: 'moon', socketId: 'lunar-moon-true' });
    state = applyLockAction(puzzle, state, { type: 'power_glyph', ringId: 'deep', glyphId: 'ocean' });

    const trace = traceEnergy(puzzle, state);
    expect(trace.some(segment => segment.fromGlyphId === 'grass' && segment.toGlyphId === 'wolf' && segment.blocked)).toBe(true);
    expect(validatePuzzle(puzzle, state)).toBe(true);
    expect(applyLockAction(puzzle, state, { type: 'invoke' }).solved).toBe(true);

    let wrongMoon = resetRuntimeState(puzzle);
    wrongMoon = applyLockAction(puzzle, wrongMoon, { type: 'power_glyph', ringId: 'outer', glyphId: 'grass' });
    wrongMoon = applyLockAction(puzzle, wrongMoon, { type: 'power_glyph', ringId: 'middle', glyphId: 'cow' });
    wrongMoon = applyLockAction(puzzle, wrongMoon, { type: 'power_glyph', ringId: 'lunar', glyphId: 'moon', socketId: 'lunar-moon-false' });
    wrongMoon = applyLockAction(puzzle, wrongMoon, { type: 'power_glyph', ringId: 'deep', glyphId: 'ocean' });
    expect(validatePuzzle(puzzle, wrongMoon)).toBe(false);

    const staleInactiveState = {
      ...state,
      obstacleStates: { 'false-hunger-block': { active: false } }
    };
    expect(validatePuzzle(puzzle, staleInactiveState)).toBe(true);
  });
});

function baseState(rings: PuzzleDefinition['rings']) {
  return {
    ringRotations: Object.fromEntries(rings.map(ring => [ring.id, ring.startingRotation])),
    poweredGlyphByRing: Object.fromEntries(rings.map(ring => [ring.id, null])),
    obstacleStates: {},
    energyTrace: [],
    solved: false,
    lastInvokeFailed: false
  };
}

function buildSkipAndReturnPuzzle(): PuzzleDefinition {
  const rings: PuzzleDefinition['rings'] = [
    { id: 'outer', name: 'Outer', radius: 100, glyphIds: ['star'], startingRotation: 0, conduits: [
      { sourceGlyphId: 'star', destinationRingId: 'deep', destinationOffset: 0 }
    ] },
    { id: 'middle', name: 'Middle', radius: 75, glyphIds: ['stone', 'river'], startingRotation: 0, conduits: [] },
    { id: 'inner', name: 'Inner', radius: 50, glyphIds: ['moon'], startingRotation: 0, conduits: [] },
    { id: 'deep', name: 'Deep', radius: 25, glyphIds: ['bone'], startingRotation: 0, conduits: [
      { sourceGlyphId: 'bone', destinationRingId: 'middle', destinationOffset: 1 }
    ] }
  ];
  return {
    id: 'skip-return',
    name: 'Skip Return',
    version: 1,
    difficulty: 4,
    inscription: '',
    glyphDictionary: [],
    rings,
    powerSources: [],
    obstacles: [],
    solutionRules: [{ id: 'star-bone-river', chain: ['star', 'bone', 'river'] }],
    initialRuntimeState: baseState(rings),
    conduitRevealMode: 'powered'
  };
}

function buildComplexPuzzle(): PuzzleDefinition {
  const rings: PuzzleDefinition['rings'] = [
    { id: 'outer', name: 'Outer', radius: 100, glyphIds: ['grass', 'star'], startingRotation: 0, conduits: [
      { sourceGlyphId: 'grass', destinationRingId: 'middle', destinationOffset: 0 },
      { sourceGlyphId: 'star', destinationRingId: 'deep', destinationOffset: 0 }
    ] },
    { id: 'middle', name: 'Middle', radius: 75, glyphIds: ['cow', 'river'], startingRotation: 0, conduits: [] },
    { id: 'inner', name: 'Inner', radius: 50, glyphIds: ['moon', 'stone'], startingRotation: 0, conduits: [
      { sourceGlyphId: 'moon', destinationRingId: 'deep', destinationOffset: 0 }
    ] },
    { id: 'deep', name: 'Deep', radius: 25, glyphIds: ['ocean', 'bone'], startingRotation: 0, conduits: [
      { sourceGlyphId: 'bone', destinationRingId: 'middle', destinationOffset: 1 }
    ] }
  ];
  return {
    id: 'complex',
    name: 'Complex',
    version: 1,
    difficulty: 4,
    inscription: '',
    glyphDictionary: [],
    rings,
    powerSources: [],
    obstacles: [],
    solutionRules: [
      { id: 'grass-cow', chain: ['grass', 'cow'] },
      { id: 'moon-ocean', chain: ['moon', 'ocean'] },
      { id: 'star-bone-river', chain: ['star', 'bone', 'river'], required: false }
    ],
    initialRuntimeState: baseState(rings),
    conduitRevealMode: 'powered'
  };
}

function buildDuplicateSocketPuzzle(): PuzzleDefinition {
  const rings: PuzzleDefinition['rings'] = [
    {
      id: 'outer',
      name: 'Outer',
      radius: 100,
      glyphIds: ['moon', 'moon'],
      glyphSockets: [
        { id: 'outer-moon-correct', glyphId: 'moon' },
        { id: 'outer-moon-decoy', glyphId: 'moon' }
      ],
      startingRotation: 0,
      conduits: [
        { sourceSocketId: 'outer-moon-correct', destinationRingId: 'inner', destinationOffset: 0 },
        { sourceSocketId: 'outer-moon-decoy', destinationRingId: 'inner', destinationOffset: 1 }
      ]
    },
    { id: 'inner', name: 'Inner', radius: 50, glyphIds: ['ocean', 'stone'], startingRotation: 0, conduits: [] }
  ];
  return {
    id: 'duplicate',
    name: 'Duplicate',
    version: 1,
    difficulty: 4,
    inscription: '',
    glyphDictionary: [],
    rings,
    powerSources: [],
    obstacles: [],
    solutionRules: [{ id: 'moon-ocean', chain: ['outer-moon-correct', 'ocean'] }],
    initialRuntimeState: { ...baseState(rings), poweredSocketByRing: { outer: null, inner: null } },
    conduitRevealMode: 'powered'
  };
}

function buildBranchingPuzzle(): PuzzleDefinition {
  const rings: PuzzleDefinition['rings'] = [
    { id: 'outer', name: 'Outer', radius: 100, glyphIds: ['fire'], startingRotation: 0, conduits: [
      { sourceGlyphId: 'fire', destinationRingId: 'inner', destinationSlot: 0, destinationOffset: 0 },
      { sourceGlyphId: 'fire', destinationRingId: 'inner', destinationSlot: 1, destinationOffset: 0 }
    ] },
    { id: 'inner', name: 'Inner', radius: 50, glyphIds: ['smoke', 'bone'], startingRotation: 0, conduits: [] }
  ];
  return {
    id: 'branching',
    name: 'Branching',
    version: 1,
    difficulty: 5,
    inscription: '',
    glyphDictionary: [],
    rings,
    powerSources: [],
    obstacles: [{ id: 'branchBlock', type: 'blocker', blocks: [{ ringId: 'inner', slot: 1 }] }],
    solutionRules: [{ id: 'fire-smoke', chain: ['fire', 'smoke'] }],
    initialRuntimeState: { ...baseState(rings), obstacleStates: { branchBlock: { active: true } } },
    conduitRevealMode: 'powered'
  };
}

function buildSourceBlockedPuzzle(): PuzzleDefinition {
  const rings: PuzzleDefinition['rings'] = [
    { id: 'outer', name: 'Outer', radius: 100, glyphIds: ['fire'], startingRotation: 0, conduits: [
      { sourceGlyphId: 'fire', destinationRingId: 'inner', destinationSlot: 0, destinationOffset: 0 }
    ] },
    { id: 'inner', name: 'Inner', radius: 50, glyphIds: ['smoke'], startingRotation: 0, conduits: [] }
  ];
  return {
    id: 'source-blocked',
    name: 'Source Blocked',
    version: 1,
    difficulty: 3,
    inscription: '',
    glyphDictionary: [],
    rings,
    powerSources: [],
    obstacles: [{ id: 'sourceWard', type: 'ward', blocks: [{ ringId: 'outer', slot: 0 }] }],
    solutionRules: [{ id: 'fire-smoke', chain: ['fire', 'smoke'] }],
    initialRuntimeState: baseState(rings),
    conduitRevealMode: 'powered'
  };
}

describe('arcane permissions', () => {
  it('resolves manual and foundry provider values with overrides', () => {
    expect(resolveAccess(true, 'automatic')).toBe(true);
    expect(resolveAccess(false, 'automatic')).toBe(false);
    expect(resolveAccess(false, 'allow')).toBe(true);
    expect(resolveAccess(true, 'deny')).toBe(false);
  });

  it('denies spectators and allows GMs', () => {
    const access = buildAccessState({
      lockId: 'lock',
      userId: 'player',
      providerCanInteract: true,
      providerCanReadInstructions: false,
      interactOverride: 'automatic',
      readOverride: 'automatic',
      providerType: 'manual',
      providerUpdatedAt: null,
      updatedByUserId: null
    });
    expect(canPerformLockAction('spectator', access)).toBe(false);
    expect(canPerformLockAction('gm', { effectiveCanInteract: false })).toBe(true);
  });
});

describe('arcane concurrency validation', () => {
  it('rejects stale versions, old generations, duplicate actions, paused sessions, and solved locks', () => {
    const base = {
      sessionStatus: 'active' as const,
      role: 'player' as const,
      effectiveCanInteract: true,
      solved: false,
      expectedVersion: 1,
      currentVersion: 1,
      expectedGeneration: 1,
      currentGeneration: 1,
      duplicateAction: false
    };
    expect(validateActionContext(base)).toEqual({ ok: true });
    expect(validateActionContext({ ...base, currentVersion: 2 })).toEqual({ ok: false, reason: 'stale_version' });
    expect(validateActionContext({ ...base, currentGeneration: 2 })).toEqual({ ok: false, reason: 'old_generation' });
    expect(validateActionContext({ ...base, duplicateAction: true })).toEqual({ ok: false, reason: 'duplicate_action' });
    expect(validateActionContext({ ...base, sessionStatus: 'paused' })).toEqual({ ok: false, reason: 'session_not_active' });
    expect(validateActionContext({ ...base, solved: true })).toEqual({ ok: false, reason: 'lock_solved' });
  });
});
