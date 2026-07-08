import DatabaseService from './database';
import { DATABASE_TABLES } from '../config/database';
import {
  ApiResponse,
  Character,
  GameApplication,
  GameApplicationStatus,
  GameInvite,
  GameListing,
  GameStatus
} from '../types/database';

export interface CreateGameInput {
  title: string;
  description: string;
  gmId: string;
  gmName: string;
  rewardCharacterId: string;
  schedulePollId?: string;
  startTime: Date;
  durationMinutes: number;
  characterLevel: number;
  partySize: number;
  tags: string[];
  invites: Array<{ userId: string; displayName: string; source: 'Manual' | 'Poll' }>;
}

export interface ApplyToGameInput {
  gameId: string;
  userId: string;
  displayName: string;
  characterIds: string[];
  note: string;
}

class GameService {
  private static instance: GameService;
  private dbService: DatabaseService;

  constructor() {
    this.dbService = DatabaseService.getInstance();
  }

  static getInstance(): GameService {
    if (!GameService.instance) {
      GameService.instance = new GameService();
    }

    return GameService.instance;
  }

  async getGames(): Promise<ApiResponse<GameListing[]>> {
    try {
      const { data, error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.GAMES)
        .select(`
          *,
          reward_character:characters(*),
          invites:game_invites(*),
          applications:game_applications(*)
        `)
        .order('start_time', { ascending: true });

      if (error) {
        return { success: false, error: error.message };
      }

      const games = (data || []).map(game => this.transformGameFromDb(game));
      await this.attachApplicationCharacters(games);

      return { success: true, data: games };
    } catch (error) {
      console.error('Error loading games:', error);
      return { success: false, error: 'Failed to load games' };
    }
  }

  async createGame(input: CreateGameInput): Promise<ApiResponse<GameListing>> {
    try {
      const supabase = this.dbService.getClient();
      const tier = getTierForLevel(input.characterLevel);
      const tags = Array.from(new Set([...input.tags.filter(Boolean), tier]));
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from(DATABASE_TABLES.GAMES)
        .insert({
          title: input.title,
          description: input.description,
          gm_id: input.gmId,
          gm_name: input.gmName,
          reward_character_id: input.rewardCharacterId,
          schedule_poll_id: input.schedulePollId || null,
          start_time: input.startTime.toISOString(),
          duration_minutes: input.durationMinutes,
          character_level: input.characterLevel,
          tier,
          party_size: input.partySize,
          tags,
          created_at: now,
          updated_at: now
        })
        .select(`
          *,
          reward_character:characters(*),
          invites:game_invites(*),
          applications:game_applications(*)
        `)
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      if (input.invites.length > 0) {
        const inviteRows = input.invites.map(invite => ({
          game_id: data.id,
          user_id: invite.userId,
          display_name: invite.displayName,
          source: invite.source
        }));
        const { error: inviteError } = await supabase
          .from(DATABASE_TABLES.GAME_INVITES)
          .upsert(inviteRows, { onConflict: 'game_id,user_id' });

        if (inviteError) {
          return { success: false, error: inviteError.message };
        }
      }

      const created = await this.getGameById(String(data.id));
      return created.success
        ? { ...created, message: 'Game listed.' }
        : { success: true, data: this.transformGameFromDb(data), message: 'Game listed.' };
    } catch (error) {
      console.error('Error creating game:', error);
      return { success: false, error: 'Failed to create game' };
    }
  }

  async getGameById(gameId: string): Promise<ApiResponse<GameListing>> {
    try {
      const { data, error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.GAMES)
        .select(`
          *,
          reward_character:characters(*),
          invites:game_invites(*),
          applications:game_applications(*)
        `)
        .eq('id', gameId)
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      const game = this.transformGameFromDb(data);
      await this.attachApplicationCharacters([game]);

      return { success: true, data: game };
    } catch (error) {
      console.error('Error loading game:', error);
      return { success: false, error: 'Failed to load game' };
    }
  }

  async applyToGame(input: ApplyToGameInput): Promise<ApiResponse<GameApplication>> {
    try {
      const now = new Date().toISOString();
      const { data, error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.GAME_APPLICATIONS)
        .upsert({
          game_id: input.gameId,
          user_id: input.userId,
          display_name: input.displayName,
          character_ids: input.characterIds,
          note: input.note,
          status: 'Applied',
          updated_at: now
        }, { onConflict: 'game_id,user_id' })
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        data: this.transformApplicationFromDb(data),
        message: 'Application sent.'
      };
    } catch (error) {
      console.error('Error applying to game:', error);
      return { success: false, error: 'Failed to apply to game' };
    }
  }

  async updateApplicationStatus(
    applicationId: string,
    status: GameApplicationStatus
  ): Promise<ApiResponse<boolean>> {
    try {
      const { error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.GAME_APPLICATIONS)
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', applicationId);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: true, message: 'Application updated.' };
    } catch (error) {
      console.error('Error updating application:', error);
      return { success: false, error: 'Failed to update application' };
    }
  }

  async lockCharacter(
    applicationId: string,
    lockedCharacterId: string
  ): Promise<ApiResponse<boolean>> {
    try {
      const { error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.GAME_APPLICATIONS)
        .update({ locked_character_id: lockedCharacterId, updated_at: new Date().toISOString() })
        .eq('id', applicationId);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: true, message: 'Character locked in.' };
    } catch (error) {
      console.error('Error locking character:', error);
      return { success: false, error: 'Failed to lock character' };
    }
  }

  async updateGameStatus(gameId: string, gmId: string, status: GameStatus): Promise<ApiResponse<boolean>> {
    try {
      const { error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.GAMES)
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', gameId)
        .eq('gm_id', gmId);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: true, message: 'Game updated.' };
    } catch (error) {
      console.error('Error updating game:', error);
      return { success: false, error: 'Failed to update game' };
    }
  }

  private async attachApplicationCharacters(games: GameListing[]) {
    const characterIds = Array.from(new Set(
      games.flatMap(game => game.applications.flatMap(application => application.characterIds))
    ));

    if (characterIds.length === 0) return;

    const { data, error } = await this.dbService.getClient()
      .from(DATABASE_TABLES.CHARACTERS)
      .select('*')
      .in('id', characterIds);

    if (error) {
      console.error('Error loading application characters:', error);
      return;
    }

    const charactersById = new Map((data || []).map(character => [String(character.id), this.transformCharacterFromDb(character)]));
    games.forEach(game => {
      game.applications = game.applications.map(application => ({
        ...application,
        characters: application.characterIds
          .map(characterId => charactersById.get(characterId))
          .filter((character): character is Character => Boolean(character))
      }));
    });
  }

  private transformGameFromDb(dbGame: Record<string, unknown>): GameListing {
    const invites = Array.isArray(dbGame.invites)
      ? dbGame.invites.map(invite => this.transformInviteFromDb(invite as Record<string, unknown>))
      : [];
    const applications = Array.isArray(dbGame.applications)
      ? dbGame.applications.map(application => this.transformApplicationFromDb(application as Record<string, unknown>))
      : [];
    const rewardCharacter = dbGame.reward_character && typeof dbGame.reward_character === 'object'
      ? this.transformCharacterFromDb(dbGame.reward_character as Record<string, unknown>)
      : undefined;

    return {
      _id: String(dbGame.id),
      title: String(dbGame.title || ''),
      description: String(dbGame.description || ''),
      gmId: String(dbGame.gm_id),
      gmName: String(dbGame.gm_name || 'GM'),
      rewardCharacterId: String(dbGame.reward_character_id),
      rewardCharacter,
      schedulePollId: dbGame.schedule_poll_id ? String(dbGame.schedule_poll_id) : undefined,
      startTime: new Date(String(dbGame.start_time)),
      durationMinutes: Number(dbGame.duration_minutes || 240),
      characterLevel: Number(dbGame.character_level || 1),
      tier: String(dbGame.tier || getTierForLevel(Number(dbGame.character_level || 1))),
      partySize: Number(dbGame.party_size || 4),
      tags: Array.isArray(dbGame.tags) ? dbGame.tags.map(String) : [],
      status: String(dbGame.status || 'Open') as GameStatus,
      invites,
      applications,
      createdAt: new Date(String(dbGame.created_at)),
      updatedAt: new Date(String(dbGame.updated_at))
    };
  }

  private transformInviteFromDb(dbInvite: Record<string, unknown>): GameInvite {
    return {
      _id: String(dbInvite.id),
      gameId: String(dbInvite.game_id),
      userId: String(dbInvite.user_id),
      displayName: String(dbInvite.display_name || 'Player'),
      source: String(dbInvite.source || 'Manual') as 'Manual' | 'Poll',
      createdAt: new Date(String(dbInvite.created_at))
    };
  }

  private transformApplicationFromDb(dbApplication: Record<string, unknown>): GameApplication {
    const characterIds = Array.isArray(dbApplication.character_ids)
      ? dbApplication.character_ids.map(String)
      : [];

    return {
      _id: String(dbApplication.id),
      gameId: String(dbApplication.game_id),
      userId: String(dbApplication.user_id),
      displayName: String(dbApplication.display_name || 'Player'),
      characterIds,
      lockedCharacterId: dbApplication.locked_character_id ? String(dbApplication.locked_character_id) : undefined,
      status: String(dbApplication.status || 'Applied') as GameApplicationStatus,
      note: String(dbApplication.note || ''),
      characters: [],
      createdAt: new Date(String(dbApplication.created_at)),
      updatedAt: new Date(String(dbApplication.updated_at))
    };
  }

  private transformCharacterFromDb(dbCharacter: Record<string, unknown>): Character {
    return {
      _id: String(dbCharacter.id),
      userId: String(dbCharacter.user_id),
      name: String(dbCharacter.name || ''),
      class: String(dbCharacter.class || ''),
      classPrimary: String(dbCharacter.class_primary || dbCharacter.class || ''),
      classSecondary: String(dbCharacter.class_secondary || ''),
      level: Number(dbCharacter.level || 1),
      race: String(dbCharacter.race || ''),
      ancestry: String(dbCharacter.ancestry || dbCharacter.race || ''),
      heritage: String(dbCharacter.heritage || ''),
      background: String(dbCharacter.background || ''),
      stats: dbCharacter.stats,
      equipment: Array.isArray(dbCharacter.equipment) ? dbCharacter.equipment : [],
      foundryJson: dbCharacter.foundry_json,
      foundryFileName: dbCharacter.foundry_file_name ? String(dbCharacter.foundry_file_name) : undefined,
      mainRole: dbCharacter.main_role ? String(dbCharacter.main_role) as Character['mainRole'] : undefined,
      roleBadges: Array.isArray(dbCharacter.role_badges) ? dbCharacter.role_badges.map(String) as Character['roleBadges'] : [],
      backstory: String(dbCharacter.backstory || ''),
      notes: String(dbCharacter.notes || ''),
      isActive: Boolean(dbCharacter.is_active),
      guildId: dbCharacter.guild_id ? String(dbCharacter.guild_id) : undefined,
      createdAt: new Date(String(dbCharacter.created_at)),
      updatedAt: new Date(String(dbCharacter.updated_at))
    };
  }
}

export const getTierForLevel = (level: number) => {
  if (level <= 4) return 'Tier 1';
  if (level <= 8) return 'Tier 2';
  if (level <= 12) return 'Tier 3';
  if (level <= 16) return 'Tier 4';
  return 'Tier 5';
};

export default GameService;
