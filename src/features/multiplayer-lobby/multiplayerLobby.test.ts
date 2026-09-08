import { describe, expect, it } from 'vitest';
import { getPlayerColor, multiplayerErrorMessage, multiplayerLobbyStateSchema, PLAYER_COLORS } from './multiplayerLobby';

describe('multiplayer lobby contracts', () => {
  it('defines eight unique player colors', () => {
    expect(PLAYER_COLORS).toHaveLength(8);
    expect(new Set(PLAYER_COLORS.map(color => color.id)).size).toBe(8);
    expect(new Set(PLAYER_COLORS.map(color => color.hex)).size).toBe(8);
  });

  it('parses a complete team lobby snapshot', () => {
    const state = multiplayerLobbyStateSchema.parse({
      self: { userId: 'player-1', mode: 'team', color: 'azure', teamId: '07608de1-865b-4480-bf35-365c60644e2e' },
      waitingPlayers: [{ userId: 'player-2', username: 'Aster', avatar: '', color: 'rose' }],
      team: {
        id: '07608de1-865b-4480-bf35-365c60644e2e',
        leaderId: 'player-1',
        members: [{ userId: 'player-1', username: 'Rook', avatar: '', color: 'azure', joinedAt: '2026-09-08T00:00:00Z' }],
      },
      incomingInvitations: [],
      pendingInviteeIds: [],
      recentInvitationUpdates: [],
    });

    expect(state.team?.members[0].color).toBe('azure');
    expect(getPlayerColor('azure').label).toBe('Azure');
  });

  it('rejects teams larger than eight players', () => {
    const members = Array.from({ length: 9 }, (_, index) => ({
      userId: `player-${index}`,
      username: `Player ${index}`,
      avatar: '',
      color: 'amber',
      joinedAt: '2026-09-08T00:00:00Z',
    }));
    const result = multiplayerLobbyStateSchema.safeParse({
      self: null,
      waitingPlayers: [],
      team: { id: '07608de1-865b-4480-bf35-365c60644e2e', leaderId: 'player-0', members },
      incomingInvitations: [],
      pendingInviteeIds: [],
      recentInvitationUpdates: [],
    });
    expect(result.success).toBe(false);
  });

  it('turns server rejection codes into player-facing messages', () => {
    expect(multiplayerErrorMessage('new row violates: team_full')).toBe('That team already has eight players.');
    expect(multiplayerErrorMessage('unknown')).toContain('Please try again');
  });
});
