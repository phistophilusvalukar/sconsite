import { describe, expect, it } from 'vitest';
import { AI_ID, HUMAN_ID, command, contentCard, createLocalMatch, resolveAutomaticPriority, takeAiTurn } from './localGame';

describe('local browser match session', () => {
  it('plays a deterministic Font, summon, and combat sequence', () => {
    let match = createLocalMatch();
    const firstCard = match.state.players[HUMAN_ID]!.zones.hand[0]!;
    match = command(match, { type: 'COMMIT_AS_FONT', playerId: HUMAN_ID, cardId: firstCard });
    const firstFont = match.state.players[HUMAN_ID]!.zones.fontRow[0]!;
    match = command(match, { type: 'ACTIVATE_FONT', playerId: HUMAN_ID, fontId: firstFont, manaType: 'Generic' });
    match = takeAiTurn(command(match, { type: 'END_TURN', playerId: HUMAN_ID }));

    const secondCard = match.state.players[HUMAN_ID]!.zones.hand.find((id) => contentCard(id, match.state).type === 'font')
      ?? match.state.players[HUMAN_ID]!.zones.hand[0]!;
    match = command(match, { type: 'COMMIT_AS_FONT', playerId: HUMAN_ID, cardId: secondCard });
    for (const fontId of match.state.players[HUMAN_ID]!.zones.fontRow) {
      match = command(match, { type: 'ACTIVATE_FONT', playerId: HUMAN_ID, fontId, manaType: 'Generic' });
    }
    const creatureId = match.state.players[HUMAN_ID]!.zones.hand.find((id) => {
      const definition = match.state.definitions[match.state.cards[id]!.definitionId]!;
      return definition.type === 'Creature' && (definition.cost?.Generic ?? 0) <= match.state.players[HUMAN_ID]!.mana.Generic;
    });
    expect(creatureId).toBeTruthy();
    match = resolveAutomaticPriority(command(match, { type: 'PLAY_CARD', playerId: HUMAN_ID, cardId: creatureId! }));
    expect(match.state.players[HUMAN_ID]!.zones.creatureField).toContain(creatureId);

    match = takeAiTurn(command(match, { type: 'END_TURN', playerId: HUMAN_ID }));
    const lifeBefore = match.state.players[AI_ID]!.life;
    match = resolveAutomaticPriority(command(match, { type: 'ATTACK', playerId: HUMAN_ID, attackerId: creatureId!, targetId: AI_ID }));
    expect(match.state.players[AI_ID]!.life).toBeLessThan(lifeBefore);
    expect(match.history.some((entry) => entry.command.type === 'ATTACK')).toBe(true);
  });
});
