export const ACTION_IDS = [
  'stride',
  'step',
  'strike',
  'feint',
  'demoralize',
  'shove',
  'trip',
  'grapple',
  'aid',
  'delay',
  'lightning-bolt'
] as const;

export type ActionId = (typeof ACTION_IDS)[number];
export type Team = 'player' | 'ally' | 'enemy' | 'neutral';
export type Difficulty = 'tutorial' | 'easy' | 'moderate' | 'hard' | 'expert';
export type ConditionType = 'off-guard' | 'frightened' | 'prone' | 'grabbed' | 'immobilized' | 'aided';
export type DegreeOfSuccess = 'critical-success' | 'success' | 'failure' | 'critical-failure';
export type GameStatus = 'playing' | 'victory' | 'failure';

export interface GridPosition {
  x: number;
  y: number;
}

export interface TerrainCell extends GridPosition {
  type: 'blocked' | 'difficult' | 'hazard';
}

export interface AttackDefinition {
  id: string;
  name: string;
  attackBonus: number;
  damage: number;
  damageType: string;
  agile: boolean;
  range: number;
  traits: string[];
}

export interface SpellDefinition {
  id: string;
  name: string;
  actionId: 'lightning-bolt';
  actionCost: 1 | 2 | 3;
  geometry: 'line';
  range: number;
  save: 'reflex';
  dc: number;
  damage: number;
  damageType: string;
}

export interface CreatureDefinition {
  id: string;
  name: string;
  team: Team;
  controlled: boolean;
  position: GridPosition;
  size: 1;
  hp: number;
  maxHp: number;
  ac: number;
  speed: number;
  reach: number;
  perception: number;
  fortitude: number;
  reflex: number;
  will: number;
  skills: {
    athletics: number;
    deception: number;
    intimidation: number;
  };
  actionIds: ActionId[];
  attacks: AttackDefinition[];
  spells: SpellDefinition[];
  initiative: number;
  traits: string[];
}

export type ObjectiveDefinition =
  | { type: 'defeat-all-enemies' }
  | { type: 'defeat-specific-enemy'; creatureId: string }
  | { type: 'reach-square'; creatureId: string; position: GridPosition }
  | { type: 'apply-condition'; creatureId: string; condition: ConditionType }
  | { type: 'keep-ally-alive'; creatureId: string };

export interface IntendedCommand {
  type: 'USE_ACTION' | 'END_TURN' | 'RESUME_DELAYED';
  actorId: string;
  actionId?: ActionId;
  targetId?: string;
  attackId?: string;
  destination?: GridPosition;
  direction?: GridPosition;
}

export interface PuzzleDefinition {
  schemaVersion: 1;
  id: string;
  title: string;
  summary: string;
  difficulty: Difficulty;
  tags: string[];
  board: {
    width: number;
    height: number;
    terrain: TerrainCell[];
  };
  creatures: CreatureDefinition[];
  rolls: number[];
  objective: ObjectiveDefinition;
  maxRounds: number;
  hints: string[];
  intendedSolution?: IntendedCommand[];
  author?: string;
}

export interface RuntimeCondition {
  type: ConditionType;
  value: number;
  sourceId?: string;
  relativeTo?: string;
  expires: 'end-source-turn' | 'end-target-turn' | 'persistent';
}

export interface CreatureState {
  id: string;
  position: GridPosition;
  hp: number;
  conditions: RuntimeCondition[];
}

export interface GameEvent {
  id: number;
  kind: 'action' | 'roll' | 'effect' | 'turn' | 'system' | 'error';
  message: string;
}

export interface GameState {
  puzzle: PuzzleDefinition;
  round: number;
  initiativeOrder: string[];
  activeIndex: number;
  delayedCreatureIds: string[];
  completedTurnIds: string[];
  creatures: Record<string, CreatureState>;
  actionsRemaining: number;
  reactions: Record<string, boolean>;
  attackCounts: Record<string, number>;
  rollIndex: number;
  objects: Record<string, unknown>;
  eventLog: GameEvent[];
  status: GameStatus;
  statusReason: string | null;
  commandCount: number;
}

export type GameCommand =
  | {
      type: 'USE_ACTION';
      actorId: string;
      actionId: ActionId;
      targetId?: string;
      attackId?: string;
      destination?: GridPosition;
      direction?: GridPosition;
    }
  | { type: 'END_TURN'; actorId: string }
  | { type: 'RESUME_DELAYED'; actorId: string };

export interface ExecutionResult {
  state: GameState;
  events: GameEvent[];
  error?: string;
}

export interface PuzzleValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
