export const RULES_VERSION = "0.1.0";

export type PlayerId = string;
export type Zone = "deck" | "hand" | "fontRow" | "creatureField" | "supportField" | "salvageField" | "actionStack" | "boneyard" | "exile";
export type ManaTradition = "Arcane" | "Divine" | "Occult" | "Primal" | "Generic";
export type CardType = "Font" | "Creature" | "Spell" | "Aura" | "MagicItem" | "Consumable";
export type EquipmentSlot = "weapon" | "armor" | "accessory";
export type ManaPool = Record<ManaTradition, number>;
export type ManaCost = Partial<Record<ManaTradition, number>>;

export interface Effect {
  readonly op: "damage" | "heal" | "draw" | "gainMana" | "destroy" | "counter";
  readonly amount?: number;
  readonly tradition?: ManaTradition;
}

export interface CardDefinition {
  readonly id: string;
  readonly name: string;
  readonly type: CardType;
  readonly cost?: ManaCost;
  readonly power?: number;
  readonly health?: number;
  readonly fontMana?: readonly ManaTradition[];
  readonly effects?: readonly Effect[];
  readonly target?: "none" | "player" | "creature" | "any";
  readonly slot?: EquipmentSlot;
  readonly equipCost?: ManaCost;
  readonly modifiers?: Readonly<{ power?: number; health?: number }>;
  readonly charges?: number;
  readonly recoveryCost?: ManaCost;
  readonly exhaustBearer?: boolean;
  readonly keywords?: readonly string[];
}

export interface CardInstance {
  readonly id: string;
  readonly definitionId: string;
  readonly owner: PlayerId;
  readonly controller: PlayerId;
  readonly zone: Zone;
  readonly faceDown: boolean;
  readonly exhausted: boolean;
  readonly damage: number;
  readonly attackedThisTurn: boolean;
  readonly attachedTo?: string;
  readonly charges?: number;
}

export interface PlayerState {
  readonly id: PlayerId;
  readonly life: number;
  readonly mana: ManaPool;
  readonly zones: Readonly<Record<Exclude<Zone, "actionStack">, readonly string[]>>;
  readonly committedFontThisTurn: boolean;
}

export interface StackEntry {
  readonly id: string;
  readonly kind: "card" | "attack" | "ability";
  readonly controller: PlayerId;
  readonly sourceId: string;
  readonly targetId?: string;
  readonly effects: readonly Effect[];
  readonly countered: boolean;
}

export interface MatchResult { readonly winnerId?: PlayerId; readonly loserId: PlayerId; readonly reason: "life" | "deck" | "concession" | "effect"; }
export interface GameState {
  readonly rulesVersion: string;
  readonly seed: number;
  readonly rngState: number;
  readonly nextId: number;
  readonly turn: number;
  readonly activePlayer: PlayerId;
  readonly priorityPlayer: PlayerId;
  readonly consecutivePasses: number;
  readonly players: Readonly<Record<PlayerId, PlayerState>>;
  readonly cards: Readonly<Record<string, CardInstance>>;
  readonly definitions: Readonly<Record<string, CardDefinition>>;
  readonly stack: readonly StackEntry[];
  readonly result?: MatchResult;
}

export type GameCommand =
  | { readonly type: "COMMIT_AS_FONT"; readonly playerId: PlayerId; readonly cardId: string }
  | { readonly type: "ACTIVATE_FONT"; readonly playerId: PlayerId; readonly fontId: string; readonly manaType: ManaTradition }
  | { readonly type: "PLAY_CARD"; readonly playerId: PlayerId; readonly cardId: string; readonly targets?: readonly string[] }
  | { readonly type: "ATTACK"; readonly playerId: PlayerId; readonly attackerId: string; readonly targetId: string }
  | { readonly type: "EQUIP"; readonly playerId: PlayerId; readonly itemId: string; readonly creatureId: string }
  | { readonly type: "ACTIVATE_ABILITY"; readonly playerId: PlayerId; readonly sourceId: string; readonly abilityId: string; readonly targets?: readonly string[] }
  | { readonly type: "PASS_PRIORITY"; readonly playerId: PlayerId }
  | { readonly type: "END_TURN"; readonly playerId: PlayerId }
  | { readonly type: "CONCEDE"; readonly playerId: PlayerId };

export type GameEvent = { readonly type: string; readonly [key: string]: unknown };
export interface Transition { readonly state: GameState; readonly events: readonly GameEvent[]; }
export interface CommandRecord { readonly command: GameCommand; readonly events: readonly GameEvent[]; }
export interface Replay { readonly seed: number; readonly players: readonly { id: PlayerId; deck: readonly string[] }[]; readonly startingLife: number; readonly startingHand?: number; readonly commands: readonly CommandRecord[]; readonly rulesVersion: string; }

export class RulesError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "RulesError"; }
}
