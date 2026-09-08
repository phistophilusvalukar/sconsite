import { supabase } from '../../config/database';
import {
  multiplayerErrorMessage,
  multiplayerLobbyStateSchema,
  type LobbyMode,
  type MultiplayerLobbyState,
  type PlayerColor,
} from './multiplayerLobby';

async function runRpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(multiplayerErrorMessage(error.message));
  return data as T;
}

export const multiplayerLobbyService = {
  async getState(): Promise<MultiplayerLobbyState> {
    const data = await runRpc<unknown>('get_multiplayer_lobby_state');
    const result = multiplayerLobbyStateSchema.safeParse(data);
    if (!result.success) {
      console.error('Invalid multiplayer lobby response:', result.error);
      throw new Error('The lobby returned an invalid response.');
    }
    return result.data;
  },

  enter(mode: LobbyMode, color: PlayerColor) {
    return runRpc<{ mode: LobbyMode; teamId: string | null }>('enter_multiplayer_lobby', {
      p_mode: mode,
      p_color: color,
    });
  },

  setColor(color: PlayerColor) {
    return runRpc<null>('set_multiplayer_player_color', { p_color: color });
  },

  invite(inviteeId: string) {
    return runRpc<string>('invite_multiplayer_team_player', { p_invitee_id: inviteeId });
  },

  respond(invitationId: string, accept: boolean) {
    return runRpc<null>('respond_to_multiplayer_team_invitation', {
      p_invitation_id: invitationId,
      p_accept: accept,
    });
  },

  leave() {
    return runRpc<null>('leave_multiplayer_lobby');
  },

  heartbeat() {
    return runRpc<null>('heartbeat_multiplayer_lobby');
  },
};
