export type AccessProviderType = 'manual' | 'foundry';

export type PermissionOverride = 'automatic' | 'allow' | 'deny';

export type PuzzleSessionStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';

export type InvitationStatus = 'invited' | 'accepted' | 'declined' | 'removed';

export type SessionRole = 'gm' | 'player' | 'spectator';

export type GlyphVisualState =
  | 'idle'
  | 'hovered'
  | 'selected'
  | 'receiving'
  | 'validated'
  | 'invalid'
  | 'blocked';

export type LockAccessState = {
  lockId: string;
  userId: string;
  providerCanInteract: boolean;
  providerCanReadInstructions: boolean;
  interactOverride: PermissionOverride;
  readOverride: PermissionOverride;
  effectiveCanInteract: boolean;
  effectiveCanReadInstructions: boolean;
  providerType: AccessProviderType;
  providerUpdatedAt: string | null;
  updatedByUserId: string | null;
};

export type GlyphDefinition = {
  id: string;
  label: string;
  symbol: string;
  semanticTags: string[];
  accessibleDescription: string;
};

export type RingDefinition = {
  id: string;
  name: string;
  radius: number;
  glyphIds: string[];
  glyphSockets?: GlyphSocketDefinition[];
  startingRotation: number;
  conduits: {
    sourceGlyphId?: string;
    sourceSocketId?: string;
    destinationOffset: number;
    destinationRingId?: string;
    destinationSlot?: number;
    decoy?: boolean;
  }[];
  linkedRing?: {
    ringId: string;
    ratio: number;
    direction: 1 | -1;
  };
};

export type GlyphSocketDefinition = {
  id: string;
  glyphId: string;
};

export type PowerSourceDefinition = {
  id: string;
  ringId: string;
  slot: number;
};

export type ObstacleDefinition = {
  id: string;
  type: 'ward' | 'blocker' | 'mirror' | 'splitter' | 'filter' | 'amplifier';
  ringId?: string;
  blocks?: {
    ringId: string;
    slot: number;
  }[];
  initialPosition?: number;
};

export type SolutionRule = {
  id: string;
  chain: string[];
  required?: boolean;
};

export type EnergyTraceSegment = {
  fromRingId: string;
  fromGlyphId: string;
  fromSocketId: string;
  fromSlot: number;
  toRingId: string | 'core';
  toSlot: number | null;
  toGlyphId: string | null;
  toSocketId: string | null;
  valid: boolean;
  blocked: boolean;
  decoy?: boolean;
};

export type LockRuntimeState = {
  ringRotations: Record<string, number>;
  poweredGlyphByRing: Record<string, string | null>;
  poweredSocketByRing?: Record<string, string | null>;
  obstacleStates: Record<string, unknown>;
  energyTrace: EnergyTraceSegment[];
  solved: boolean;
  lastInvokeFailed?: boolean;
};

export type PuzzleDefinition = {
  id: string;
  name: string;
  version: number;
  difficulty: number;
  inscription: string;
  obscuredInscription?: string;
  translatedHint?: string;
  glyphDictionary: GlyphDefinition[];
  rings: RingDefinition[];
  powerSources: PowerSourceDefinition[];
  obstacles: ObstacleDefinition[];
  solutionRules: SolutionRule[];
  initialRuntimeState: LockRuntimeState;
  conduitRevealMode: 'always' | 'hover' | 'powered';
};

export type LockAction =
  | {
      type: 'rotate_ring';
      ringId: string;
      direction: 1 | -1;
      steps: number;
    }
  | {
      type: 'set_ring_rotation';
      ringId: string;
      rotation: number;
    }
  | {
      type: 'power_glyph';
      ringId: string;
      glyphId: string;
      socketId?: string;
    }
  | {
      type: 'move_obstacle';
      obstacleId: string;
      targetPosition: number;
    }
  | {
      type: 'invoke';
    };

export type PerformLockActionInput = {
  lockInstanceId: string;
  expectedVersion: number;
  generation: number;
  actionId: string;
  action: LockAction;
};

export type ActionValidationContext = {
  sessionStatus: PuzzleSessionStatus;
  role: SessionRole;
  effectiveCanInteract: boolean;
  solved: boolean;
  expectedVersion: number;
  currentVersion: number;
  expectedGeneration: number;
  currentGeneration: number;
  duplicateAction: boolean;
};

export type ActionValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'session_not_active'
        | 'spectator_denied'
        | 'movement_denied'
        | 'lock_solved'
        | 'stale_version'
        | 'old_generation'
        | 'duplicate_action'
        | 'illegal_action';
    };
