import { shuffle } from "./rng.js";
import { RULES_VERSION, RulesError, type CardDefinition, type CardInstance, type Effect, type GameCommand, type GameEvent, type GameState, type ManaCost, type ManaPool, type ManaTradition, type PlayerId, type PlayerState, type StackEntry, type Transition, type Zone } from "./types.js";

const traditions: readonly ManaTradition[] = ["Arcane", "Divine", "Occult", "Primal", "Generic"];
const emptyMana = (): ManaPool => ({ Arcane: 0, Divine: 0, Occult: 0, Primal: 0, Generic: 0 });
const zoneNames: readonly Exclude<Zone, "actionStack">[] = ["deck", "hand", "fontRow", "creatureField", "supportField", "salvageField", "boneyard", "exile"];
const emptyZones = (): Record<Exclude<Zone, "actionStack">, string[]> => ({ deck: [], hand: [], fontRow: [], creatureField: [], supportField: [], salvageField: [], boneyard: [], exile: [] });

export interface CreateGameOptions { readonly seed: number; readonly definitions: readonly CardDefinition[]; readonly players: readonly { id: PlayerId; deck: readonly string[] }[]; readonly startingLife?: number; readonly startingHand?: number; }

export function createGame(options: CreateGameOptions): Transition {
  if (options.players.length !== 2 || options.players[0]!.id === options.players[1]!.id) throw new RulesError("INVALID_PLAYERS", "Exactly two distinct players are required");
  const definitions = Object.fromEntries(options.definitions.map((d) => [d.id, d]));
  let rngState = options.seed;
  let nextId = 1;
  const cards: Record<string, CardInstance> = {};
  const players: Record<string, PlayerState> = {};
  const events: GameEvent[] = [];
  for (const input of options.players) {
    for (const id of input.deck) if (!definitions[id]) throw new RulesError("UNKNOWN_DEFINITION", `Unknown card ${id}`);
    const [deck, next] = shuffle(input.deck, rngState); rngState = next;
    const zones = emptyZones();
    for (const definitionId of deck) {
      const id = `c${nextId++}`;
      cards[id] = { id, definitionId, owner: input.id, controller: input.id, zone: "deck", faceDown: true, exhausted: false, damage: 0, attackedThisTurn: false };
      zones.deck.push(id);
    }
    players[input.id] = { id: input.id, life: options.startingLife ?? 20, mana: emptyMana(), zones, committedFontThisTurn: false };
  }
  let state: GameState = { rulesVersion: RULES_VERSION, seed: options.seed, rngState, nextId, turn: 1, activePlayer: options.players[0]!.id, priorityPlayer: options.players[0]!.id, consecutivePasses: 0, players, cards, definitions, stack: [] };
  for (let n = 0; n < (options.startingHand ?? 5) && !state.result; n++) for (const p of options.players) state = draw(state, p.id, events);
  events.push({ type: "TURN_STARTED", playerId: state.activePlayer, turn: 1 });
  return { state, events };
}

function mutable(state: GameState): { players: Record<string, PlayerState>; cards: Record<string, CardInstance> } {
  const players: Record<string, PlayerState> = {};
  for (const [id, p] of Object.entries(state.players)) players[id] = { ...p, mana: { ...p.mana }, zones: Object.fromEntries(zoneNames.map((z) => [z, [...p.zones[z]]])) as Record<Exclude<Zone, "actionStack">, string[]> };
  return { players, cards: { ...state.cards } };
}
const opponent = (state: GameState, id: PlayerId): PlayerId => Object.keys(state.players).find((p) => p !== id)!;
function requirePlayer(state: GameState, id: PlayerId): PlayerState { const p = state.players[id]; if (!p) throw new RulesError("UNKNOWN_PLAYER", "Unknown player"); return p; }
function requireCard(state: GameState, id: string): CardInstance { const c = state.cards[id]; if (!c) throw new RulesError("UNKNOWN_CARD", `Unknown card ${id}`); return c; }
function requireDefinition(state: GameState, c: CardInstance): CardDefinition { return state.definitions[c.definitionId]!; }
function assertOpen(state: GameState): void { if (state.result) throw new RulesError("MATCH_ENDED", "The match has ended"); }
function assertPriority(state: GameState, playerId: PlayerId): void { if (state.priorityPlayer !== playerId) throw new RulesError("NO_PRIORITY", "Player does not have priority"); }

function move(state: GameState, cardId: string, to: Exclude<Zone, "actionStack">, events: GameEvent[], extra: Partial<CardInstance> = {}): GameState {
  const card = requireCard(state, cardId); const data = mutable(state);
  const fromList = data.players[card.controller]!.zones[card.zone as Exclude<Zone, "actionStack">] as string[];
  const at = fromList.indexOf(cardId); if (at >= 0) fromList.splice(at, 1);
  (data.players[card.controller]!.zones[to] as string[]).push(cardId);
  data.cards[cardId] = { ...card, ...extra, zone: to };
  events.push({ type: "CARD_MOVED", instanceId: cardId, from: card.zone, to });
  return { ...state, ...data };
}

function draw(state: GameState, playerId: PlayerId, events: GameEvent[]): GameState {
  const p = requirePlayer(state, playerId); const id = p.zones.deck[0];
  if (!id) return endMatch(state, opponent(state, playerId), playerId, "deck", events);
  const next = move(state, id, "hand", events, { faceDown: false });
  events.push({ type: "CARD_DRAWN", playerId, cardId: id }); return next;
}

function canPay(pool: ManaPool, cost: ManaCost = {}): boolean {
  const copy = { ...pool }; for (const t of traditions.slice(0, 4)) { const needed = cost[t] ?? 0; if (copy[t] < needed) return false; copy[t] -= needed; }
  return traditions.reduce((n, t) => n + copy[t], 0) >= (cost.Generic ?? 0);
}
function pay(pool: ManaPool, cost: ManaCost = {}): ManaPool {
  if (!canPay(pool, cost)) throw new RulesError("INSUFFICIENT_MANA", "Not enough mana");
  const result = { ...pool };
  for (const t of traditions.slice(0, 4)) result[t] -= cost[t] ?? 0;
  let generic = cost.Generic ?? 0;
  for (const t of ["Generic", "Arcane", "Divine", "Occult", "Primal"] as const) { const used = Math.min(generic, result[t]); result[t] -= used; generic -= used; }
  return result;
}
function spend(state: GameState, playerId: PlayerId, cost: ManaCost | undefined, events: GameEvent[]): GameState {
  const data = mutable(state); data.players[playerId] = { ...data.players[playerId]!, mana: pay(data.players[playerId]!.mana, cost) };
  events.push({ type: "MANA_SPENT", playerId, cost: cost ?? {} }); return { ...state, ...data };
}

function validateTarget(state: GameState, def: CardDefinition, targetId?: string): void {
  const kind = def.target ?? "none";
  if (kind === "none") { if (targetId) throw new RulesError("ILLEGAL_TARGET", "This card has no target"); return; }
  if (!targetId) throw new RulesError("TARGET_REQUIRED", "A target is required");
  if (kind === "player" && !state.players[targetId]) throw new RulesError("ILLEGAL_TARGET", "Target must be a player");
  if (kind === "creature" && (state.cards[targetId]?.zone !== "creatureField")) throw new RulesError("ILLEGAL_TARGET", "Target must be a creature");
  if (kind === "any" && !state.players[targetId] && state.cards[targetId]?.zone !== "creatureField") throw new RulesError("ILLEGAL_TARGET", "Illegal target");
}

function addStack(state: GameState, entry: Omit<StackEntry, "id" | "countered">, events: GameEvent[]): GameState {
  const item: StackEntry = { ...entry, id: `e${state.nextId}`, countered: false };
  events.push({ type: "EFFECT_ADDED_TO_STACK", effectId: item.id, sourceId: item.sourceId });
  return { ...state, nextId: state.nextId + 1, stack: [...state.stack, item], priorityPlayer: opponent(state, entry.controller), consecutivePasses: 0 };
}

export function applyCommand(state: GameState, command: GameCommand): Transition {
  assertOpen(state); requirePlayer(state, command.playerId); const events: GameEvent[] = [];
  if (command.type === "CONCEDE") return { state: endMatch(state, opponent(state, command.playerId), command.playerId, "concession", events), events };
  assertPriority(state, command.playerId);
  if (command.type === "COMMIT_AS_FONT") {
    if (state.activePlayer !== command.playerId || state.stack.length) throw new RulesError("ILLEGAL_TIMING", "Fonts may only be committed during your main action window");
    const p = state.players[command.playerId]!; if (p.committedFontThisTurn) throw new RulesError("FONT_LIMIT", "A Font was already committed this turn");
    const card = requireCard(state, command.cardId); if (card.controller !== command.playerId || card.zone !== "hand") throw new RulesError("ILLEGAL_CARD", "Card must be in your hand");
    let next = move(state, card.id, "fontRow", events, { faceDown: true, exhausted: false }); const data = mutable(next); data.players[command.playerId] = { ...data.players[command.playerId]!, committedFontThisTurn: true }; next = { ...next, ...data };
    events.push({ type: "FONT_COMMITTED", playerId: command.playerId, instanceId: card.id }); return { state: next, events };
  }
  if (command.type === "ACTIVATE_FONT") {
    const font = requireCard(state, command.fontId); if (font.controller !== command.playerId || font.zone !== "fontRow" || font.exhausted) throw new RulesError("ILLEGAL_FONT", "Font is unavailable");
    const def = requireDefinition(state, font); const options = font.faceDown ? ["Generic"] : (def.fontMana ?? ["Generic"]); if (!options.includes(command.manaType)) throw new RulesError("ILLEGAL_MANA", "Font cannot generate that mana");
    const data = mutable(state); data.cards[font.id] = { ...font, exhausted: true }; const p = data.players[command.playerId]!; data.players[command.playerId] = { ...p, mana: { ...p.mana, [command.manaType]: p.mana[command.manaType] + 1 } };
    events.push({ type: "MANA_GENERATED", playerId: command.playerId, manaType: command.manaType, fontId: font.id }); return { state: { ...state, ...data }, events };
  }
  if (command.type === "PLAY_CARD") {
    if (state.activePlayer !== command.playerId && state.stack.length === 0) throw new RulesError("ILLEGAL_TIMING", "Only the active player may start an action");
    const card = requireCard(state, command.cardId); if (card.controller !== command.playerId || card.zone !== "hand") throw new RulesError("ILLEGAL_CARD", "Card must be in your hand");
    const def = requireDefinition(state, card); const target = command.targets?.[0]; validateTarget(state, def, target);
    if ((def.type === "MagicItem" || def.type === "Consumable") && (!target || state.cards[target]?.controller !== command.playerId)) throw new RulesError("ILLEGAL_TARGET", "Attachments require a friendly creature");
    let next = spend(state, command.playerId, def.cost, events); next = move(next, card.id, "supportField", events);
    events.push({ type: "CARD_PLAYED", playerId: command.playerId, instanceId: card.id });
    const onPlayEffects = def.type === "Consumable" ? [] : (def.effects ?? []);
    return { state: addStack(next, { kind: "card", controller: command.playerId, sourceId: card.id, ...(target ? { targetId: target } : {}), effects: onPlayEffects }, events), events };
  }
  if (command.type === "ATTACK") {
    if (state.activePlayer !== command.playerId || state.stack.length) throw new RulesError("ILLEGAL_TIMING", "Attack is not legal now");
    const attacker = requireCard(state, command.attackerId); const def = requireDefinition(state, attacker);
    if (attacker.controller !== command.playerId || attacker.zone !== "creatureField" || attacker.exhausted || attacker.attackedThisTurn) throw new RulesError("ILLEGAL_ATTACKER", "Attacker is unavailable");
    const targetCreature = state.cards[command.targetId]; if (!state.players[command.targetId] && targetCreature?.zone !== "creatureField") throw new RulesError("ILLEGAL_TARGET", "Attack target is illegal");
    if (targetCreature?.controller === command.playerId || command.targetId === command.playerId) throw new RulesError("ILLEGAL_TARGET", "Attack target must be hostile");
    const data = mutable(state); data.cards[attacker.id] = { ...attacker, exhausted: !def.keywords?.includes("Vigilant"), attackedThisTurn: true };
    events.push({ type: "ATTACK_DECLARED", attackerId: attacker.id, targetId: command.targetId });
    return { state: addStack({ ...state, ...data }, { kind: "attack", controller: command.playerId, sourceId: attacker.id, targetId: command.targetId, effects: [] }, events), events };
  }
  if (command.type === "EQUIP") return equip(state, command.playerId, command.itemId, command.creatureId, events);
  if (command.type === "ACTIVATE_ABILITY") return activateAbility(state, command.playerId, command.sourceId, command.targets?.[0], events);
  if (command.type === "PASS_PRIORITY") {
    if (state.consecutivePasses === 0) { events.push({ type: "PRIORITY_PASSED", playerId: command.playerId }); return { state: { ...state, priorityPlayer: opponent(state, command.playerId), consecutivePasses: 1 }, events }; }
    if (state.stack.length) return { state: resolveTop({ ...state, consecutivePasses: 0 }, events), events };
    events.push({ type: "PRIORITY_PASSED", playerId: command.playerId }); return { state: { ...state, priorityPlayer: state.activePlayer, consecutivePasses: 0 }, events };
  }
  if (command.type === "END_TURN") {
    if (state.activePlayer !== command.playerId || state.stack.length) throw new RulesError("ILLEGAL_TIMING", "Cannot end turn now");
    let next = state; const data = mutable(next);
    for (const c of Object.values(data.cards)) if (c.zone === "creatureField") data.cards[c.id] = { ...c, damage: 0 };
    const newActive = opponent(state, command.playerId); const p = data.players[newActive]!; data.players[newActive] = { ...p, committedFontThisTurn: false, mana: emptyMana() };
    for (const id of [...p.zones.fontRow, ...p.zones.creatureField]) data.cards[id] = { ...data.cards[id]!, exhausted: false, attackedThisTurn: false };
    next = { ...state, ...data, turn: state.turn + 1, activePlayer: newActive, priorityPlayer: newActive, consecutivePasses: 0 }; next = draw(next, newActive, events);
    events.push({ type: "TURN_STARTED", playerId: newActive, turn: next.turn }); return { state: next, events };
  }
  throw new RulesError("UNKNOWN_COMMAND", "Unsupported command");
}

function equip(state: GameState, playerId: PlayerId, itemId: string, creatureId: string, events: GameEvent[]): Transition {
  const item = requireCard(state, itemId), creature = requireCard(state, creatureId), def = requireDefinition(state, item);
  if ((def.type !== "MagicItem" && def.type !== "Consumable") || item.controller !== playerId || item.zone !== "salvageField" || creature.controller !== playerId || creature.zone !== "creatureField") throw new RulesError("ILLEGAL_EQUIP", "Illegal salvage recovery");
  if (def.type === "MagicItem" && occupiedSlot(state, creatureId, def.slot ?? "accessory")) throw new RulesError("SLOT_OCCUPIED", "Equipment slot is occupied");
  let next = spend(state, playerId, def.type === "MagicItem" ? def.equipCost : def.recoveryCost, events); next = move(next, itemId, "supportField", events, { attachedTo: creatureId });
  events.push({ type: "ITEM_EQUIPPED", itemId, creatureId }); return { state: next, events };
}
function occupiedSlot(state: GameState, creatureId: string, slot: string): boolean { return Object.values(state.cards).some((c) => c.attachedTo === creatureId && state.definitions[c.definitionId]?.type === "MagicItem" && (state.definitions[c.definitionId]?.slot ?? "accessory") === slot); }
function activateAbility(state: GameState, playerId: PlayerId, sourceId: string, targetId: string | undefined, events: GameEvent[]): Transition {
  const source = requireCard(state, sourceId), def = requireDefinition(state, source);
  if (def.type !== "Consumable" || source.controller !== playerId || source.zone !== "supportField" || !source.attachedTo || (source.charges ?? def.charges ?? 0) <= 0) throw new RulesError("ILLEGAL_ABILITY", "Consumable is unavailable");
  validateTarget(state, def, targetId); const bearer = requireCard(state, source.attachedTo); if (def.exhaustBearer && bearer.exhausted) throw new RulesError("BEARER_EXHAUSTED", "Bearer must be ready");
  const data = mutable(state); const remaining = (source.charges ?? def.charges ?? 0) - 1; data.cards[source.id] = { ...source, charges: remaining }; if (def.exhaustBearer) data.cards[bearer.id] = { ...bearer, exhausted: true };
  events.push({ type: "CONSUMABLE_USED", consumableId: source.id, chargesRemaining: remaining });
  const next = addStack({ ...state, ...data }, { kind: "ability", controller: playerId, sourceId, ...(targetId ? { targetId } : {}), effects: def.effects ?? [] }, events);
  return { state: next, events };
}

function resolveTop(state: GameState, events: GameEvent[]): GameState {
  const entry = state.stack.at(-1)!; let next: GameState = { ...state, stack: state.stack.slice(0, -1) };
  if (!entry.countered) {
    if (entry.kind === "attack") next = resolveAttack(next, entry, events);
    else { for (const effect of entry.effects) next = resolveEffect(next, entry, effect, events); if (!next.result && entry.kind === "card") next = finishCard(next, entry, events); }
  }
  events.push({ type: "EFFECT_RESOLVED", effectId: entry.id, countered: entry.countered });
  return { ...next, priorityPlayer: next.result ? next.priorityPlayer : (next.stack.length ? entry.controller : next.activePlayer), consecutivePasses: 0 };
}
function finishCard(state: GameState, entry: StackEntry, events: GameEvent[]): GameState {
  const card = requireCard(state, entry.sourceId), def = requireDefinition(state, card);
  if (def.type === "Creature") { const next = move(state, card.id, "creatureField", events, { exhausted: true }); events.push({ type: "CREATURE_SUMMONED", instanceId: card.id }); return next; }
  if (def.type === "Aura") { events.push({ type: "AURA_CREATED", auraId: card.id }); return state; }
  if (def.type === "MagicItem" || def.type === "Consumable") {
    if (!entry.targetId || state.cards[entry.targetId]?.zone !== "creatureField") return move(state, card.id, "boneyard", events);
    if (def.type === "MagicItem" && occupiedSlot(state, entry.targetId, def.slot ?? "accessory")) return move(state, card.id, "boneyard", events);
    const data = mutable(state); data.cards[card.id] = { ...card, attachedTo: entry.targetId, ...(def.type === "Consumable" ? { charges: def.charges ?? 1 } : {}) };
    events.push({ type: "ITEM_EQUIPPED", itemId: card.id, creatureId: entry.targetId }); return { ...state, ...data };
  }
  return move(state, card.id, "boneyard", events);
}
function resolveAttack(state: GameState, entry: StackEntry, events: GameEvent[]): GameState {
  const attacker = state.cards[entry.sourceId]; if (!attacker || attacker.zone !== "creatureField" || !entry.targetId) return state;
  const attackPower = stats(state, attacker.id).power;
  if (state.players[entry.targetId]) return dealDamage(state, entry.targetId, attackPower, events);
  const defender = state.cards[entry.targetId]; if (!defender || defender.zone !== "creatureField") return state;
  let next = markCreatureDamage(state, defender.id, attackPower, events); next = markCreatureDamage(next, attacker.id, stats(state, defender.id).power, events); return destroyLethal(next, events);
}
function resolveEffect(state: GameState, entry: StackEntry, effect: Effect, events: GameEvent[]): GameState {
  const target = entry.targetId ?? entry.controller; const amount = effect.amount ?? 0;
  if (effect.op === "damage") return dealDamage(state, target, amount, events);
  if (effect.op === "heal") { const data = mutable(state); if (data.players[target]) data.players[target] = { ...data.players[target]!, life: data.players[target]!.life + amount }; else if (data.cards[target]) data.cards[target] = { ...data.cards[target]!, damage: Math.max(0, data.cards[target]!.damage - amount) }; events.push({ type: "HEALED", targetId: target, amount }); return { ...state, ...data }; }
  if (effect.op === "draw") { let next = state; for (let i = 0; i < amount && !next.result; i++) next = draw(next, target, events); return next; }
  if (effect.op === "gainMana") { const t = effect.tradition ?? "Generic", data = mutable(state), p = data.players[target]!; data.players[target] = { ...p, mana: { ...p.mana, [t]: p.mana[t] + amount } }; return { ...state, ...data }; }
  if (effect.op === "destroy" && state.cards[target]) return destroyCreature(state, target, events);
  if (effect.op === "counter" && state.stack.length) { const top = state.stack.at(-1)!; return { ...state, stack: [...state.stack.slice(0, -1), { ...top, countered: true }] }; }
  return state;
}
function dealDamage(state: GameState, targetId: string, amount: number, events: GameEvent[]): GameState {
  if (state.players[targetId]) { const data = mutable(state), p = data.players[targetId]!; data.players[targetId] = { ...p, life: p.life - amount }; events.push({ type: "DAMAGE_DEALT", targetId, amount }); const next = { ...state, ...data }; return p.life - amount <= 0 ? endMatch(next, opponent(next, targetId), targetId, "life", events) : next; }
  return destroyLethal(markCreatureDamage(state, targetId, amount, events), events);
}
function markCreatureDamage(state: GameState, id: string, amount: number, events: GameEvent[]): GameState { const c = requireCard(state, id), data = mutable(state); data.cards[id] = { ...c, damage: c.damage + amount }; events.push({ type: "DAMAGE_DEALT", targetId: id, amount }); return { ...state, ...data }; }
function stats(state: GameState, id: string): { power: number; health: number } {
  const c = requireCard(state, id), d = requireDefinition(state, c); let power = d.power ?? 0, health = d.health ?? 0;
  for (const a of Object.values(state.cards)) if (a.attachedTo === id && a.zone === "supportField") { const m = state.definitions[a.definitionId]?.modifiers; power += m?.power ?? 0; health += m?.health ?? 0; }
  for (const a of Object.values(state.cards)) if (a.zone === "supportField" && state.definitions[a.definitionId]?.type === "Aura" && a.controller === c.controller) { const m = state.definitions[a.definitionId]?.modifiers; power += m?.power ?? 0; health += m?.health ?? 0; }
  return { power, health };
}
function destroyLethal(state: GameState, events: GameEvent[]): GameState { let next = state; const lethal = Object.values(state.cards).filter((c) => c.zone === "creatureField" && c.damage >= stats(state, c.id).health).map((c) => c.id).sort(); for (const id of lethal) if (next.cards[id]?.zone === "creatureField") next = destroyCreature(next, id, events); return next; }
function destroyCreature(state: GameState, id: string, events: GameEvent[]): GameState {
  let next = state; const attachments = Object.values(next.cards).filter((c) => c.attachedTo === id).map((c) => c.id).sort();
  next = move(next, id, "boneyard", events, { exhausted: false }); events.push({ type: "CREATURE_DESTROYED", instanceId: id });
  for (const attachmentId of attachments) {
    next = move(next, attachmentId, "salvageField", events);
    const data = mutable(next); const attachment = { ...data.cards[attachmentId]! };
    delete attachment.attachedTo;
    data.cards[attachmentId] = attachment;
    next = { ...next, ...data };
    events.push({ type: "ITEM_DROPPED", instanceId: attachmentId });
  }
  return next;
}
function endMatch(state: GameState, winnerId: PlayerId, loserId: PlayerId, reason: "life" | "deck" | "concession" | "effect", events: GameEvent[]): GameState { if (state.result) return state; events.push({ type: "MATCH_ENDED", winnerId, loserId, reason }); return { ...state, result: { winnerId, loserId, reason } }; }

export function legalActions(state: GameState, playerId: PlayerId): readonly string[] {
  if (state.result) return []; const result: string[] = ["CONCEDE"]; if (state.priorityPlayer !== playerId) return result;
  result.push("PASS_PRIORITY"); if (state.activePlayer === playerId && !state.stack.length) result.push("END_TURN", "PLAY_CARD", "ATTACK", "ACTIVATE_FONT", "ACTIVATE_ABILITY", "EQUIP", "COMMIT_AS_FONT"); else result.push("PLAY_CARD", "ACTIVATE_ABILITY"); return result;
}
