import { z } from 'zod';

export const PLAYER_COLORS = [
  { id: 'crimson', label: 'Crimson', classId: 'barbarian', className: 'Barbarian', alignment: 'dark', hex: '#dc2626' },
  { id: 'rose', label: 'Rose', classId: 'swashbuckler', className: 'Swashbuckler', alignment: 'light', hex: '#fb7185' },
  { id: 'emerald', label: 'Emerald', classId: 'ranger', className: 'Ranger', alignment: 'dark', hex: '#15803d' },
  { id: 'mint', label: 'Mint', classId: 'alchemist', className: 'Alchemist', alignment: 'light', hex: '#6ee7b7' },
  { id: 'violet', label: 'Violet', classId: 'rogue', className: 'Rogue', alignment: 'dark', hex: '#7c3aed' },
  { id: 'lavender', label: 'Lavender', classId: 'investigator', className: 'Investigator', alignment: 'light', hex: '#c4b5fd' },
  { id: 'azure', label: 'Azure', classId: 'wizard', className: 'Wizard', alignment: 'dark', hex: '#2563eb' },
  { id: 'cyan', label: 'Cyan', classId: 'witch', className: 'Witch', alignment: 'light', hex: '#67e8f9' },
  { id: 'amber', label: 'Amber', classId: 'champion', className: 'Champion', alignment: 'dark', hex: '#d97706' },
  { id: 'gold', label: 'Gold', classId: 'cleric', className: 'Cleric', alignment: 'light', hex: '#fde047' },
] as const;

export type PlayerColor = (typeof PLAYER_COLORS)[number]['id'];
export type LobbyMode = 'waiting' | 'solo' | 'team';

const playerColorSchema = z.enum(PLAYER_COLORS.map(color => color.id) as [PlayerColor, ...PlayerColor[]]);
const lobbyModeSchema = z.enum(['waiting', 'solo', 'team']);

const lobbyPlayerSchema = z.object({
  userId: z.string().min(1),
  mode: lobbyModeSchema,
  color: playerColorSchema,
  teamId: z.string().uuid().nullable(),
});

const visiblePlayerSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
  avatar: z.string(),
  color: playerColorSchema,
});

const teamMemberSchema = visiblePlayerSchema.extend({
  joinedAt: z.string(),
});

const teamSchema = z.object({
  id: z.string().uuid(),
  leaderId: z.string().min(1),
  members: z.array(teamMemberSchema).max(8),
});

const incomingInvitationSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  inviterId: z.string().min(1),
  inviterName: z.string().min(1),
  inviterAvatar: z.string(),
  status: z.literal('pending'),
  createdAt: z.string(),
});

const invitationUpdateSchema = z.object({
  id: z.string().uuid(),
  inviteeId: z.string().min(1),
  inviteeName: z.string().min(1),
  status: z.enum(['accepted', 'declined']),
  respondedAt: z.string(),
});

export const multiplayerLobbyStateSchema = z.object({
  self: lobbyPlayerSchema.nullable(),
  waitingPlayers: z.array(visiblePlayerSchema),
  team: teamSchema.nullable(),
  incomingInvitations: z.array(incomingInvitationSchema),
  pendingInviteeIds: z.array(z.string().min(1)),
  recentInvitationUpdates: z.array(invitationUpdateSchema),
  activeMatchId: z.string().uuid().nullable(),
});

export type MultiplayerLobbyState = z.infer<typeof multiplayerLobbyStateSchema>;
export type WaitingPlayer = MultiplayerLobbyState['waitingPlayers'][number];
export type TeamInvitation = MultiplayerLobbyState['incomingInvitations'][number];

export function getPlayerColor(colorId: PlayerColor) {
  return PLAYER_COLORS.find(color => color.id === colorId) ?? PLAYER_COLORS[0];
}

export function multiplayerErrorMessage(message: string) {
  const knownErrors: Record<string, string> = {
    authentication_required: 'Sign in before joining the multiplayer lobby.',
    profile_required: 'Your member profile is still being prepared. Please try again.',
    invalid_lobby_mode: 'That lobby option is not available.',
    invalid_player_color: 'Choose one of the available classes.',
    not_in_lobby: 'Join the lobby before changing your color.',
    not_on_team: 'You are not currently on a team.',
    team_full: 'That team already has eight players.',
    player_not_waiting: 'That player is no longer waiting for a team.',
    invitation_not_found: 'That invitation is no longer available.',
    invitation_already_resolved: 'That invitation has already been answered.',
    team_not_found: 'That team is no longer available.',
    team_leader_required: 'Only the team leader can start the game.',
    at_least_two_players: 'Invite at least one other player before starting.',
    too_many_players: 'Dungeon Relay supports no more than eight players.',
  };

  const key = Object.keys(knownErrors).find(error => message.includes(error));
  return key ? knownErrors[key] : 'The lobby could not complete that action. Please try again.';
}
