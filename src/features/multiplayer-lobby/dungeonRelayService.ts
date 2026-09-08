import { supabase } from '../../config/database';
import { dungeonRelayErrorMessage, dungeonRelayStateSchema, type DungeonRelayState } from './dungeonRelayGame';

async function runRpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(dungeonRelayErrorMessage(error.message));
  return data as T;
}

export const dungeonRelayService = {
  async getState(matchId: string): Promise<DungeonRelayState> {
    const data = await runRpc<unknown>('get_dungeon_relay_state', { p_match_id: matchId });
    const result = dungeonRelayStateSchema.safeParse(data);
    if (!result.success) {
      console.error('Invalid Dungeon Relay snapshot:', result.error);
      throw new Error('The game returned an invalid state.');
    }
    return result.data;
  },

  play(matchId: string, cardIds: string[]) {
    return runRpc<boolean>('play_dungeon_relay_cards', { p_match_id: matchId, p_card_ids: cardIds });
  },

  advance(matchId: string) {
    return runRpc<boolean>('advance_dungeon_relay_round', { p_match_id: matchId });
  },

  startAgain() {
    return runRpc<string>('start_dungeon_relay_match');
  },

  getActiveMatch() {
    return runRpc<string | null>('get_active_dungeon_relay_match');
  },
};
