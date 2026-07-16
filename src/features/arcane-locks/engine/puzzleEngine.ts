import type {
  ActionValidationContext,
  ActionValidationResult,
  EnergyTraceSegment,
  GlyphSocketDefinition,
  LockAction,
  LockRuntimeState,
  PuzzleDefinition,
  RingDefinition
} from './types';
import { isEmptyGlyphId } from './constants';

export function normalizeRotation(rotation: number, slots: number): number {
  if (slots <= 0) return 0;
  return ((rotation % slots) + slots) % slots;
}

export function getRing(definition: PuzzleDefinition, ringId: string): RingDefinition {
  const ring = definition.rings.find(item => item.id === ringId);
  if (!ring) throw new Error(`Unknown ring: ${ringId}`);
  return ring;
}

export function glyphSlotForRing(ring: RingDefinition, glyphId: string, rotation: number): number {
  if (isEmptyGlyphId(glyphId)) return -1;
  const baseIndex = ringSockets(ring).findIndex(socket => socket.glyphId === glyphId);
  if (baseIndex < 0) return -1;
  return normalizeRotation(baseIndex + rotation, ringSockets(ring).length);
}

export function glyphAtSlot(ring: RingDefinition, slot: number, rotation: number): string | null {
  const sockets = ringSockets(ring);
  if (!sockets.length) return null;
  const index = normalizeRotation(slot - rotation, sockets.length);
  return sockets[index]?.glyphId ?? null;
}

export function ringSockets(ring: RingDefinition): GlyphSocketDefinition[] {
  return ring.glyphSockets ?? ring.glyphIds.map((glyphId, index) => ({
    id: `${ring.id}:${index}:${glyphId}`,
    glyphId
  }));
}

export function socketSlotForRing(ring: RingDefinition, socketId: string, rotation: number): number {
  const sockets = ringSockets(ring);
  const baseIndex = sockets.findIndex(socket => socket.id === socketId);
  if (baseIndex < 0) return -1;
  return normalizeRotation(baseIndex + rotation, sockets.length);
}

export function socketAtSlot(ring: RingDefinition, slot: number, rotation: number): GlyphSocketDefinition | null {
  const sockets = ringSockets(ring);
  if (!sockets.length) return null;
  const index = normalizeRotation(slot - rotation, sockets.length);
  return sockets[index] ?? null;
}

export function destinationForConduit(
  definition: PuzzleDefinition,
  state: LockRuntimeState,
  ring: RingDefinition,
  sourceGlyphId: string,
  sourceSocketId?: string
) {
  const conduit = firstConduitForSource(ring, sourceGlyphId, sourceSocketId) ?? createDecoyConduit(ring, sourceGlyphId, sourceSocketId);
  const sourceSlot = sourceSocketId
    ? socketSlotForRing(ring, sourceSocketId, state.ringRotations[ring.id] ?? 0)
    : glyphSlotForRing(ring, sourceGlyphId, state.ringRotations[ring.id] ?? 0);
  const nextRing = conduit.destinationRingId
    ? definition.rings.find(item => item.id === conduit.destinationRingId)
    : definition.rings[definition.rings.findIndex(item => item.id === ring.id) + 1];

  if (!nextRing) {
    return {
      sourceSlot,
      destinationRing: null,
      destinationSlot: null,
      destinationGlyphId: null,
      destinationSocketId: null
    };
  }

  const destinationSlot = conduit.destinationSlot ?? destinationSlotForConduit(ring, nextRing, sourceGlyphId, sourceSocketId, state.ringRotations[ring.id] ?? 0, conduit.destinationOffset);
  const destinationSocket = socketAtSlot(nextRing, destinationSlot, state.ringRotations[nextRing.id] ?? 0);
  const destinationGlyphId = destinationSocket?.glyphId ?? null;
  return {
    sourceSlot,
    destinationRing: nextRing,
    destinationSlot,
    destinationGlyphId: isEmptyGlyphId(destinationGlyphId) ? null : destinationGlyphId,
    destinationSocketId: isEmptyGlyphId(destinationGlyphId) ? null : destinationSocket?.id ?? null
  };
}

export function isBlocked(definition: PuzzleDefinition, ringId: string, slot: number): boolean {
  return definition.obstacles.some(obstacle => {
    return obstacle.blocks?.some(block => block.ringId === ringId && block.slot === slot);
  });
}

export function traceEnergy(definition: PuzzleDefinition, state: LockRuntimeState): EnergyTraceSegment[] {
  const segments: EnergyTraceSegment[] = [];

  for (const ring of definition.rings) {
    const poweredGlyphId = state.poweredGlyphByRing[ring.id];
    if (isEmptyGlyphId(poweredGlyphId)) continue;
    const poweredSocketId = state.poweredSocketByRing?.[ring.id] ?? firstSocketForGlyph(ring, poweredGlyphId)?.id;
    const sourceSlot = poweredSocketId
      ? socketSlotForRing(ring, poweredSocketId, state.ringRotations[ring.id] ?? 0)
      : glyphSlotForRing(ring, poweredGlyphId, state.ringRotations[ring.id] ?? 0);

    if (isBlocked(definition, ring.id, sourceSlot)) continue;

    const conduits = conduitsForSource(ring, poweredGlyphId, poweredSocketId);
    const sourceConduits = conduits.length ? conduits : [createDecoyConduit(ring, poweredGlyphId, poweredSocketId)];

    for (const conduit of sourceConduits) {
      const destination = destinationForSpecificConduit(definition, state, ring, poweredGlyphId, conduit, poweredSocketId);
      if (!destination) continue;
      const blocked = destination.destinationRing
        ? isBlocked(definition, destination.destinationRing.id, destination.destinationSlot ?? 0)
        : false;
      const valid = isExpectedConnection(definition, poweredGlyphId, poweredSocketId ?? null, destination.destinationGlyphId, destination.destinationSocketId, destination.destinationRing?.id ?? 'core') && !blocked;

      segments.push({
        fromRingId: ring.id,
        fromGlyphId: poweredGlyphId,
        fromSocketId: poweredSocketId ?? `${ring.id}:${poweredGlyphId}`,
        fromSlot: destination.sourceSlot,
        toRingId: destination.destinationRing?.id ?? 'core',
        toSlot: destination.destinationSlot,
        toGlyphId: isEmptyGlyphId(destination.destinationGlyphId) ? null : destination.destinationGlyphId,
        toSocketId: isEmptyGlyphId(destination.destinationGlyphId) ? null : destination.destinationSocketId,
        valid,
        blocked,
        decoy: Boolean(conduit.decoy)
      });
    }
  }

  return segments;
}

export function validateSemanticChain(definition: PuzzleDefinition, state: LockRuntimeState): boolean {
  return requiredSolutionRules(definition).every(rule => rule.chain.every(node => isNodePowered(definition, state, node)));
}

export function validatePuzzle(definition: PuzzleDefinition, state: LockRuntimeState): boolean {
  const trace = traceEnergy(definition, state);
  return validateSemanticChain(definition, state) &&
    requiredSolutionRules(definition).every(rule => chainSegmentsAreSatisfied(rule.chain, trace)) &&
    trace.every(segment => segment.valid || segment.blocked || segment.decoy);
}

export function resetRuntimeState(definition: PuzzleDefinition): LockRuntimeState {
  return {
    ringRotations: { ...definition.initialRuntimeState.ringRotations },
    poweredGlyphByRing: { ...definition.initialRuntimeState.poweredGlyphByRing },
    poweredSocketByRing: definition.initialRuntimeState.poweredSocketByRing ? { ...definition.initialRuntimeState.poweredSocketByRing } : undefined,
    obstacleStates: { ...definition.initialRuntimeState.obstacleStates },
    energyTrace: [],
    solved: false,
    lastInvokeFailed: false
  };
}

export function validateActionContext(context: ActionValidationContext): ActionValidationResult {
  if (context.sessionStatus !== 'active') return { ok: false, reason: 'session_not_active' };
  if (context.role === 'spectator') return { ok: false, reason: 'spectator_denied' };
  if (!context.effectiveCanInteract && context.role !== 'gm') return { ok: false, reason: 'movement_denied' };
  if (context.solved) return { ok: false, reason: 'lock_solved' };
  if (context.currentGeneration !== context.expectedGeneration) return { ok: false, reason: 'old_generation' };
  if (context.currentVersion !== context.expectedVersion) return { ok: false, reason: 'stale_version' };
  if (context.duplicateAction) return { ok: false, reason: 'duplicate_action' };
  return { ok: true };
}

export function applyLockAction(definition: PuzzleDefinition, current: LockRuntimeState, action: LockAction): LockRuntimeState {
  const next: LockRuntimeState = {
    ringRotations: { ...current.ringRotations },
    poweredGlyphByRing: { ...current.poweredGlyphByRing },
    poweredSocketByRing: current.poweredSocketByRing ? { ...current.poweredSocketByRing } : undefined,
    obstacleStates: { ...current.obstacleStates },
    energyTrace: [...current.energyTrace],
    solved: current.solved,
    lastInvokeFailed: false
  };

  if (action.type === 'rotate_ring') {
    const ring = getRing(definition, action.ringId);
    const currentRotation = next.ringRotations[action.ringId] ?? 0;
    next.ringRotations[action.ringId] = normalizeRotation(currentRotation + action.direction * action.steps, ringSockets(ring).length);
    applyLinkedRingRotations(definition, next, ring, action.direction * action.steps);
  }

  if (action.type === 'set_ring_rotation') {
    const ring = getRing(definition, action.ringId);
    const previous = next.ringRotations[action.ringId] ?? 0;
    next.ringRotations[action.ringId] = normalizeRotation(action.rotation, ringSockets(ring).length);
    applyLinkedRingRotations(definition, next, ring, next.ringRotations[action.ringId] - previous);
  }

  if (action.type === 'power_glyph') {
    const ring = getRing(definition, action.ringId);
    if (isEmptyGlyphId(action.glyphId)) throw new Error(`Empty slots cannot be powered on ring ${ring.id}`);
    const socket = action.socketId ? ringSockets(ring).find(item => item.id === action.socketId) : firstSocketForGlyph(ring, action.glyphId);
    if (!socket || socket.glyphId !== action.glyphId) throw new Error(`Glyph ${action.glyphId} is not on ring ${ring.id}`);
    next.poweredGlyphByRing[action.ringId] = action.glyphId;
    if (action.socketId || next.poweredSocketByRing) {
      next.poweredSocketByRing = { ...(next.poweredSocketByRing ?? {}) };
      next.poweredSocketByRing[action.ringId] = socket.id;
    }
  }

  if (action.type === 'move_obstacle') {
    next.obstacleStates[action.obstacleId] = {
      ...(typeof next.obstacleStates[action.obstacleId] === 'object' ? next.obstacleStates[action.obstacleId] as Record<string, unknown> : {}),
      position: action.targetPosition
    };
  }

  next.energyTrace = traceEnergy(definition, next);
  if (action.type === 'invoke') {
    const solved = validatePuzzle(definition, next);
    next.solved = solved;
    next.lastInvokeFailed = !solved;
  }

  return next;
}

function firstSocketForGlyph(ring: RingDefinition, glyphId: string) {
  if (isEmptyGlyphId(glyphId)) return null;
  return ringSockets(ring).find(socket => socket.glyphId === glyphId) ?? null;
}

function conduitsForSource(ring: RingDefinition, sourceGlyphId: string, sourceSocketId?: string | null) {
  return ring.conduits.filter(item => {
    if (sourceSocketId && item.sourceSocketId) return item.sourceSocketId === sourceSocketId;
    if (item.sourceSocketId) return false;
    return item.sourceGlyphId === sourceGlyphId;
  });
}

function firstConduitForSource(ring: RingDefinition, sourceGlyphId: string, sourceSocketId?: string | null) {
  return conduitsForSource(ring, sourceGlyphId, sourceSocketId)[0] ?? null;
}

function createDecoyConduit(ring: RingDefinition, sourceGlyphId: string, sourceSocketId?: string | null) {
  const sockets = ringSockets(ring);
  const glyphIndex = Math.max(0, sourceSocketId ? sockets.findIndex(socket => socket.id === sourceSocketId) : sockets.findIndex(socket => socket.glyphId === sourceGlyphId));
  return {
    sourceGlyphId,
    sourceSocketId: sourceSocketId ?? undefined,
    destinationOffset: ((glyphIndex * 2 + ring.id.length) % Math.max(1, sockets.length)) - Math.floor(sockets.length / 2),
    decoy: true
  };
}

function destinationForSpecificConduit(
  definition: PuzzleDefinition,
  state: LockRuntimeState,
  ring: RingDefinition,
  sourceGlyphId: string,
  conduit: RingDefinition['conduits'][number],
  sourceSocketId?: string | null
) {
  const sourceSlot = sourceSocketId
    ? socketSlotForRing(ring, sourceSocketId, state.ringRotations[ring.id] ?? 0)
    : glyphSlotForRing(ring, sourceGlyphId, state.ringRotations[ring.id] ?? 0);
  const nextRing = conduit.destinationRingId
    ? definition.rings.find(item => item.id === conduit.destinationRingId)
    : definition.rings[definition.rings.findIndex(item => item.id === ring.id) + 1];

  if (!nextRing) {
    return {
      sourceSlot,
      destinationRing: null,
      destinationSlot: null,
      destinationGlyphId: null,
      destinationSocketId: null
    };
  }

  const destinationSlot = conduit.destinationSlot ?? destinationSlotForConduit(ring, nextRing, sourceGlyphId, sourceSocketId ?? undefined, state.ringRotations[ring.id] ?? 0, conduit.destinationOffset);
  const destinationSocket = socketAtSlot(nextRing, destinationSlot, state.ringRotations[nextRing.id] ?? 0);
  const destinationGlyphId = destinationSocket?.glyphId ?? null;
  return {
    sourceSlot,
    destinationRing: nextRing,
    destinationSlot,
    destinationGlyphId: isEmptyGlyphId(destinationGlyphId) ? null : destinationGlyphId,
    destinationSocketId: isEmptyGlyphId(destinationGlyphId) ? null : destinationSocket?.id ?? null
  };
}

function destinationSlotForConduit(
  sourceRing: RingDefinition,
  destinationRing: RingDefinition,
  sourceGlyphId: string,
  sourceSocketId: string | undefined,
  sourceRotation: number,
  destinationOffset: number
) {
  const sourceSockets = ringSockets(sourceRing);
  const sourceBaseSlot = Math.max(0, sourceSocketId
    ? sourceSockets.findIndex(socket => socket.id === sourceSocketId)
    : sourceSockets.findIndex(socket => socket.glyphId === sourceGlyphId));
  const signedSourceRotation = signedRotation(sourceRotation, sourceSockets.length);
  return normalizeRotation(sourceBaseSlot + signedSourceRotation + destinationOffset, ringSockets(destinationRing).length);
}

function signedRotation(rotation: number, slots: number) {
  const normalized = normalizeRotation(rotation, slots);
  return normalized > slots / 2 ? normalized - slots : normalized;
}

function requiredSolutionRules(definition: PuzzleDefinition) {
  return definition.solutionRules.filter(rule => rule.required !== false);
}

function isNodePowered(definition: PuzzleDefinition, state: LockRuntimeState, node: string) {
  if (isEmptyGlyphId(node)) return false;
  return definition.rings.some(ring => {
    const poweredGlyphId = state.poweredGlyphByRing[ring.id];
    const poweredSocketId = state.poweredSocketByRing?.[ring.id];
    return poweredGlyphId === node || poweredSocketId === node || ringSockets(ring).some(socket => socket.id === poweredSocketId && socket.glyphId === node);
  });
}

function chainSegmentsAreSatisfied(chain: string[], trace: EnergyTraceSegment[]) {
  for (let index = 0; index < chain.length - 1; index += 1) {
    const from = chain[index];
    const to = chain[index + 1];
    const satisfied = trace.some(segment => segment.valid && !segment.blocked && nodeMatches(segment.fromGlyphId, segment.fromSocketId, from) && nodeMatches(segment.toGlyphId, segment.toSocketId, to));
    if (!satisfied) return false;
  }
  return true;
}

function nodeMatches(glyphId: string | null, socketId: string | null, node: string) {
  return glyphId === node || socketId === node;
}

function isExpectedConnection(definition: PuzzleDefinition, fromGlyphId: string, fromSocketId: string | null, toGlyphId: string | null, toSocketId: string | null, toRingId: string | 'core') {
  if (toRingId === 'core') {
    return requiredSolutionRules(definition).some(rule => nodeMatches(fromGlyphId, fromSocketId, rule.chain[rule.chain.length - 1]));
  }

  return requiredSolutionRules(definition).some(rule => rule.chain.some((node, index) => (
    index < rule.chain.length - 1 &&
    nodeMatches(fromGlyphId, fromSocketId, node) &&
    (rule.chain[index + 1] === toGlyphId || rule.chain[index + 1] === toSocketId)
  )));
}

function applyLinkedRingRotations(definition: PuzzleDefinition, state: LockRuntimeState, sourceRing: RingDefinition, delta: number) {
  if (!sourceRing.linkedRing) return;
  const linkedRing = getRing(definition, sourceRing.linkedRing.ringId);
  const linkedDelta = Math.round(delta * sourceRing.linkedRing.ratio) * sourceRing.linkedRing.direction;
  state.ringRotations[linkedRing.id] = normalizeRotation((state.ringRotations[linkedRing.id] ?? 0) + linkedDelta, ringSockets(linkedRing).length);
}
