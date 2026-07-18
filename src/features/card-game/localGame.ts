import {
  RulesError,
  applyCommand,
  createGame,
  type CardDefinition as RulesCardDefinition,
  type GameCommand,
  type GameEvent,
  type GameState,
  type ManaCost as RulesManaCost,
  type Transition,
} from '@scon/rules';
import {
  prototypeCards,
  prototypeCardsById,
  prototypeDecks,
  type CardDefinition as ContentCardDefinition,
  type DeckDefinition,
  type EffectDefinition,
} from '@scon/cards';

export const HUMAN_ID = 'you';
export const AI_ID = 'rival';

export interface LocalMatch {
  state: GameState;
  events: readonly GameEvent[];
  history: readonly { command: GameCommand; events: readonly GameEvent[] }[];
  deckId: string;
}

export const decks = prototypeDecks;
export const collection = prototypeCards;

const typeMap: Record<ContentCardDefinition['type'], RulesCardDefinition['type']> = {
  font: 'Font', creature: 'Creature', spell: 'Spell', aura: 'Aura', magicItem: 'MagicItem', consumable: 'Consumable',
};

function genericCost(card: ContentCardDefinition): RulesManaCost {
  const total = card.cost.generic + (card.cost.arcane ?? 0) + (card.cost.divine ?? 0) + (card.cost.occult ?? 0) + (card.cost.primal ?? 0);
  return total ? { Generic: total } : {};
}

function translateEffect(effect: EffectDefinition | undefined) {
  if (!effect) return undefined;
  if (effect.op === 'dealDamage') return { op: 'damage' as const, amount: effect.amount };
  if (effect.op === 'heal') return { op: 'heal' as const, amount: effect.amount };
  if (effect.op === 'drawCards') return { op: 'draw' as const, amount: effect.count };
  if (effect.op === 'gainMana') return { op: 'gainMana' as const, amount: effect.amount, tradition: 'Generic' as const };
  if (effect.op === 'counterStackEffect') return { op: 'counter' as const };
  return undefined;
}

export function toRulesCard(card: ContentCardDefinition): RulesCardDefinition {
  const primaryEffect = card.effects[0] ?? card.abilities.find((ability) => ability.kind === 'activated')?.effects[0];
  const effect = translateEffect(primaryEffect);
  const target = card.type === 'magicItem' || card.type === 'consumable'
    ? 'creature'
    : primaryEffect?.op === 'dealDamage' || primaryEffect?.op === 'heal'
      ? 'any'
      : card.targets.length ? 'creature' : 'none';
  const modifier = card.abilities.flatMap((ability) => ability.effects).find((candidate) => candidate.op === 'modifyStats');
  return {
    id: card.id,
    name: card.name,
    type: typeMap[card.type],
    cost: genericCost(card),
    ...(card.type === 'creature' ? { power: card.power, health: card.health, keywords: card.keywords } : {}),
    ...(card.type === 'font' ? { fontMana: ['Generic' as const] } : {}),
    ...(effect ? { effects: [effect] } : {}),
    target,
    ...(card.type === 'magicItem' ? {
      slot: card.slot,
      equipCost: genericCost({ ...card, cost: card.equipCost }),
      modifiers: modifier?.op === 'modifyStats' ? { power: modifier.power, health: modifier.health } : {},
    } : {}),
    ...(card.type === 'consumable' ? {
      charges: card.charges,
      recoveryCost: genericCost({ ...card, cost: card.recoveryCost }),
      exhaustBearer: true,
    } : {}),
    ...(card.type === 'aura' && card.id === 'canopy-fury' ? { modifiers: { power: 1 } } : {}),
  };
}

function expandDeck(deck: DeckDefinition): string[] {
  return deck.cards.flatMap((entry) => Array.from({ length: entry.count }, () => entry.cardId));
}

export function createLocalMatch(deckId = prototypeDecks[0]!.id, seed = 734_221): LocalMatch {
  const humanDeck = prototypeDecks.find((deck) => deck.id === deckId) ?? prototypeDecks[0]!;
  const rivalDeck = prototypeDecks.find((deck) => deck.id !== humanDeck.id) ?? prototypeDecks[1]!;
  const initial = createGame({
    seed,
    definitions: prototypeCards.map(toRulesCard),
    players: [{ id: HUMAN_ID, deck: expandDeck(humanDeck) }, { id: AI_ID, deck: expandDeck(rivalDeck) }],
  });
  return { state: initial.state, events: initial.events, history: [], deckId: humanDeck.id };
}

function append(match: LocalMatch, command: GameCommand, transition: Transition): LocalMatch {
  return {
    ...match,
    state: transition.state,
    events: [...match.events, ...transition.events],
    history: [...match.history, { command, events: transition.events }],
  };
}

export function command(match: LocalMatch, gameCommand: GameCommand): LocalMatch {
  return append(match, gameCommand, applyCommand(match.state, gameCommand));
}

export function resolveAutomaticPriority(match: LocalMatch): LocalMatch {
  let next = match;
  let guard = 0;
  while (next.state.stack.length && !next.state.result && guard++ < 20) {
    next = command(next, { type: 'PASS_PRIORITY', playerId: next.state.priorityPlayer });
  }
  return next;
}

function tryCommand(match: LocalMatch, gameCommand: GameCommand): LocalMatch {
  try { return resolveAutomaticPriority(command(match, gameCommand)); } catch (error) {
    if (error instanceof RulesError) return match;
    throw error;
  }
}

function firstAffordableCard(state: GameState, playerId: string): string | undefined {
  const player = state.players[playerId]!;
  return player.zones.hand.find((id) => {
    const card = state.cards[id]!;
    const definition = state.definitions[card.definitionId]!;
    if (definition.type === 'Font' || definition.target !== 'none') return false;
    return (definition.cost?.Generic ?? 0) <= player.mana.Generic;
  });
}

export function takeAiTurn(match: LocalMatch): LocalMatch {
  let next = match;
  if (next.state.result || next.state.activePlayer !== AI_ID) return next;
  const player = next.state.players[AI_ID]!;
  if (!player.committedFontThisTurn && player.zones.hand.length) {
    next = tryCommand(next, { type: 'COMMIT_AS_FONT', playerId: AI_ID, cardId: player.zones.hand[0]! });
  }
  for (const fontId of next.state.players[AI_ID]!.zones.fontRow) {
    if (!next.state.cards[fontId]!.exhausted) next = tryCommand(next, { type: 'ACTIVATE_FONT', playerId: AI_ID, fontId, manaType: 'Generic' });
  }
  for (let attempts = 0; attempts < 4; attempts++) {
    const cardId = firstAffordableCard(next.state, AI_ID);
    if (!cardId) break;
    next = tryCommand(next, { type: 'PLAY_CARD', playerId: AI_ID, cardId });
  }
  for (const attackerId of next.state.players[AI_ID]!.zones.creatureField) {
    const attacker = next.state.cards[attackerId]!;
    if (!attacker.exhausted && !attacker.attackedThisTurn) next = tryCommand(next, { type: 'ATTACK', playerId: AI_ID, attackerId, targetId: HUMAN_ID });
  }
  if (!next.state.result) next = tryCommand(next, { type: 'END_TURN', playerId: AI_ID });
  return next;
}

export function contentCard(instanceId: string, state: GameState): ContentCardDefinition {
  return prototypeCardsById.get(state.cards[instanceId]!.definitionId)!;
}

export function describeEvent(event: GameEvent): string {
  switch (event.type) {
    case 'TURN_STARTED': return `Turn ${String(event.turn)}: ${event.playerId === HUMAN_ID ? 'your' : "rival's"} action window.`;
    case 'CARD_DRAWN': return `${event.playerId === HUMAN_ID ? 'You draw' : 'Rival draws'} a card.`;
    case 'FONT_COMMITTED': return `${event.playerId === HUMAN_ID ? 'You commit' : 'Rival commits'} a basic Font.`;
    case 'MANA_GENERATED': return `${event.playerId === HUMAN_ID ? 'You gain' : 'Rival gains'} ${String(event.manaType)} mana.`;
    case 'CARD_PLAYED': return `${event.playerId === HUMAN_ID ? 'You play a card' : 'Rival plays a card'}.`;
    case 'CREATURE_SUMMONED': return `A creature is summoned.`;
    case 'ATTACK_DECLARED': return `A creature attacks.`;
    case 'DAMAGE_DEALT': return `${String(event.amount)} damage dealt to ${event.targetId === HUMAN_ID ? 'you' : event.targetId === AI_ID ? 'the rival' : 'a creature'}.`;
    case 'CREATURE_DESTROYED': return `A creature is destroyed.`;
    case 'ITEM_DROPPED': return `An attachment falls into salvage.`;
    case 'ITEM_EQUIPPED': return `An item is equipped.`;
    case 'CONSUMABLE_USED': return `A consumable is activated (${String(event.chargesRemaining)} charges left).`;
    case 'AURA_CREATED': return `An Aura settles over the battlefield.`;
    case 'MATCH_ENDED': return `${event.winnerId === HUMAN_ID ? 'Victory' : 'Defeat'} by ${String(event.reason)}.`;
    default: return event.type.replaceAll('_', ' ').toLowerCase();
  }
}
