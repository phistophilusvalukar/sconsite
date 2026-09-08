import { describe, expect, it } from 'vitest';
import { dungeonRelayStateSchema, getDungeonSymbol } from './dungeonRelayGame';

describe('Dungeon Relay client contract', () => {
  it('maps the five requested symbols to their colors', () => {
    expect(getDungeonSymbol('sword')).toMatchObject({ color: '#ef4444', label: 'Red Swords' });
    expect(getDungeonSymbol('arrow')).toMatchObject({ color: '#22c55e', label: 'Green Arrows' });
    expect(getDungeonSymbol('shield')).toMatchObject({ color: '#eab308', label: 'Yellow Shields' });
    expect(getDungeonSymbol('staff')).toMatchObject({ color: '#3b82f6', label: 'Blue Staves' });
    expect(getDungeonSymbol('dagger')).toMatchObject({ color: '#a855f7', label: 'Purple Daggers' });
  });

  it('accepts the private/public snapshot boundary used by the board', () => {
    const result = dungeonRelayStateSchema.parse({
      match: {
        id: '17608de1-865b-4480-bf35-365c60644e2e', teamId: '27608de1-865b-4480-bf35-365c60644e2e',
        leaderId: 'player-1', status: 'active', phase: 'active', dungeonPosition: 1, totalDungeons: 11, revision: 1, resolveAt: null,
      },
      dungeon: {
        position: 1, isBoss: false, name: 'Dungeon Chamber 1',
        requirements: { sword: 1, arrow: 2, shield: 0, staff: 1, dagger: 0 },
      },
      players: [
        { userId: 'player-1', username: 'One', avatar: '', color: 'azure', status: 'active', seat: 1, handCount: 4, deckCount: 45, discardCount: 0 },
        { userId: 'player-2', username: 'Two', avatar: '', color: 'rose', status: 'active', seat: 2, handCount: 5, deckCount: 45, discardCount: 0 },
      ],
      self: { userId: 'player-1', status: 'active', hand: [{ id: 'd9428888-922b-a1e1-085c-61cd3cbb3210', symbol: 'arrow', symbols: 2 }] },
      playedCards: [{
        id: '37608de1-865b-4480-bf35-365c60644e2e', userId: 'player-1', username: 'One', color: 'azure', symbol: 'sword', symbols: 1, playedOrder: 1,
      }],
    });
    expect(result.self.hand).toHaveLength(1);
    expect(result.players[1]).not.toHaveProperty('hand');
  });

  it('rejects snapshots that expose more than five cards in the private hand', () => {
    const cards = Array.from({ length: 6 }, (_, index) => ({
      id: `07608de1-865b-4480-bf35-365c60644e0${index}`,
      symbol: 'sword',
      symbols: 1,
    }));
    const result = dungeonRelayStateSchema.safeParse({
      match: {
        id: '17608de1-865b-4480-bf35-365c60644e2e',
        teamId: '27608de1-865b-4480-bf35-365c60644e2e',
        leaderId: 'player-1',
        status: 'active',
        phase: 'active',
        dungeonPosition: 1,
        totalDungeons: 11,
        revision: 0,
        resolveAt: null,
      },
      dungeon: {
        position: 1,
        isBoss: false,
        name: 'Dungeon Chamber 1',
        requirements: { sword: 1, arrow: 1, shield: 1, staff: 1, dagger: 0 },
      },
      players: [
        { userId: 'player-1', username: 'One', avatar: '', color: 'azure', status: 'active', seat: 1, handCount: 5, deckCount: 45, discardCount: 0 },
        { userId: 'player-2', username: 'Two', avatar: '', color: 'rose', status: 'active', seat: 2, handCount: 5, deckCount: 45, discardCount: 0 },
      ],
      self: { userId: 'player-1', status: 'active', hand: cards },
      playedCards: [],
    });
    expect(result.success).toBe(false);
  });
});
