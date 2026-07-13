import { DATABASE_TABLES } from '../config/database';
import DatabaseService from './database';

export type LockDifficulty = 'Training' | 'Standard' | 'Expert' | 'Master';
export type LockChallengeStatus = 'Active' | 'Success' | 'Failure' | 'Closed';

export interface LockChallenge {
  id: string;
  gmId: string;
  gmName: string;
  difficulty: LockDifficulty;
  pickCount: number;
  playerToken?: string;
  spectatorToken?: string;
  status: LockChallengeStatus;
  sweetSpot?: number;
  pickAngle: number;
  rotation: number;
  pickHealth: number;
  picksRemaining: number;
  brokenPicks: number;
  lastResult: string;
  isTesting: boolean;
  isUnlocked: boolean;
  noiseLevel: number;
  wasAlerted: boolean;
  timerEnabled: boolean;
  timeLimitSeconds?: number;
  timerStartedAt?: Date;
  showNoiseMeter: boolean;
  showTimer: boolean;
  completedAt?: Date;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LockChallengeStateUpdate {
  pickAngle: number;
  rotation: number;
  pickHealth: number;
  picksRemaining: number;
  brokenPicks: number;
  lastResult: string;
  isTesting: boolean;
  isUnlocked: boolean;
  status: LockChallengeStatus;
  noiseLevel: number;
  wasAlerted: boolean;
  timerStartedAt?: Date;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

const LOCK_MIN_ANGLE = -74;
const LOCK_MAX_ANGLE = 74;

const randomSweetSpot = () =>
  Math.round(LOCK_MIN_ANGLE + Math.random() * (LOCK_MAX_ANGLE - LOCK_MIN_ANGLE));

const createToken = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '');
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
};

class LockChallengeService {
  private static instance: LockChallengeService;
  private dbService: DatabaseService;

  constructor() {
    this.dbService = DatabaseService.getInstance();
  }

  static getInstance(): LockChallengeService {
    if (!LockChallengeService.instance) {
      LockChallengeService.instance = new LockChallengeService();
    }

    return LockChallengeService.instance;
  }

  async createChallenge(input: {
    gmId: string;
    gmName: string;
    difficulty: LockDifficulty;
    pickCount: number;
    timerEnabled: boolean;
    timeLimitSeconds?: number;
    showNoiseMeter: boolean;
    showTimer: boolean;
  }): Promise<ApiResponse<LockChallenge>> {
    try {
      const now = new Date().toISOString();
      const { data, error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.LOCK_CHALLENGES)
        .insert({
          gm_id: input.gmId,
          gm_name: input.gmName,
          difficulty: input.difficulty,
          pick_count: input.pickCount,
          player_token: createToken(),
          spectator_token: createToken(),
          sweet_spot: randomSweetSpot(),
          picks_remaining: input.pickCount,
          timer_enabled: input.timerEnabled,
          time_limit_seconds: input.timerEnabled ? input.timeLimitSeconds : null,
          show_noise_meter: input.showNoiseMeter,
          show_timer: input.showTimer,
          created_at: now,
          updated_at: now
        })
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data: this.transformChallengeFromDb(data), message: 'Lock challenge created.' };
    } catch (error) {
      console.error('Error creating lock challenge:', error);
      return { success: false, error: 'Failed to create lock challenge' };
    }
  }

  async getGmChallenges(gmId: string): Promise<ApiResponse<LockChallenge[]>> {
    try {
      const { data, error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.LOCK_CHALLENGES)
        .select()
        .eq('gm_id', gmId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) return { success: false, error: error.message };
      return { success: true, data: (data || []).map(item => this.transformChallengeFromDb(item)) };
    } catch (error) {
      console.error('Error loading lock challenges:', error);
      return { success: false, error: 'Failed to load lock challenges' };
    }
  }

  async getByPlayerToken(challengeId: string, token: string): Promise<ApiResponse<LockChallenge>> {
    return this.getByRpc('get_lock_challenge_for_player', challengeId, token);
  }

  async getBySpectatorToken(challengeId: string, token: string): Promise<ApiResponse<LockChallenge>> {
    return this.getByRpc('get_lock_challenge_for_spectator', challengeId, token);
  }

  async updatePlayerState(challengeId: string, token: string, update: LockChallengeStateUpdate): Promise<ApiResponse<LockChallenge>> {
    try {
      const { data, error } = await this.dbService.getClient()
        .rpc('update_lock_challenge_player_state', {
          challenge_id: challengeId,
          access_token: token,
          next_pick_angle: update.pickAngle,
          next_rotation: update.rotation,
          next_pick_health: update.pickHealth,
          next_picks_remaining: update.picksRemaining,
          next_broken_picks: update.brokenPicks,
          next_last_result: update.lastResult,
          next_is_testing: update.isTesting,
          next_is_unlocked: update.isUnlocked,
          next_status: update.status,
          next_noise_level: update.noiseLevel,
          next_was_alerted: update.wasAlerted,
          next_timer_started_at: update.timerStartedAt?.toISOString() || null
        });

      if (error) return { success: false, error: error.message };
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return { success: false, error: 'Challenge is no longer active.' };
      return { success: true, data: this.transformChallengeFromDb(row) };
    } catch (error) {
      console.error('Error updating lock challenge:', error);
      return { success: false, error: 'Failed to update lock challenge' };
    }
  }

  async closeChallenge(challengeId: string, gmId: string): Promise<ApiResponse<boolean>> {
    try {
      const { error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.LOCK_CHALLENGES)
        .update({
          status: 'Closed',
          player_token: createToken(),
          spectator_token: createToken(),
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', challengeId)
        .eq('gm_id', gmId);

      if (error) return { success: false, error: error.message };
      return { success: true, data: true, message: 'Challenge closed.' };
    } catch (error) {
      console.error('Error closing lock challenge:', error);
      return { success: false, error: 'Failed to close lock challenge' };
    }
  }

  private async getByRpc(functionName: string, challengeId: string, token: string): Promise<ApiResponse<LockChallenge>> {
    try {
      const { data, error } = await this.dbService.getClient()
        .rpc(functionName, {
          challenge_id: challengeId,
          access_token: token
        });

      if (error) return { success: false, error: error.message };
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return { success: false, error: 'Challenge not found or closed.' };
      return { success: true, data: this.transformChallengeFromDb(row) };
    } catch (error) {
      console.error('Error loading lock challenge:', error);
      return { success: false, error: 'Failed to load lock challenge' };
    }
  }

  private transformChallengeFromDb(dbChallenge: Record<string, unknown>): LockChallenge {
    return {
      id: String(dbChallenge.id),
      gmId: String(dbChallenge.gm_id || ''),
      gmName: String(dbChallenge.gm_name || 'GM'),
      difficulty: String(dbChallenge.difficulty || 'Standard') as LockDifficulty,
      pickCount: Number(dbChallenge.pick_count || 3),
      playerToken: dbChallenge.player_token ? String(dbChallenge.player_token) : undefined,
      spectatorToken: dbChallenge.spectator_token ? String(dbChallenge.spectator_token) : undefined,
      status: String(dbChallenge.status || 'Active') as LockChallengeStatus,
      sweetSpot: dbChallenge.sweet_spot === undefined ? undefined : Number(dbChallenge.sweet_spot),
      pickAngle: Number(dbChallenge.pick_angle || 0),
      rotation: Number(dbChallenge.rotation || 0),
      pickHealth: Number(dbChallenge.pick_health || 100),
      picksRemaining: Number(dbChallenge.picks_remaining || 0),
      brokenPicks: Number(dbChallenge.broken_picks || 0),
      lastResult: String(dbChallenge.last_result || 'Awaiting thievery check'),
      isTesting: Boolean(dbChallenge.is_testing),
      isUnlocked: Boolean(dbChallenge.is_unlocked),
      noiseLevel: Number(dbChallenge.noise_level || 0),
      wasAlerted: Boolean(dbChallenge.was_alerted),
      timerEnabled: Boolean(dbChallenge.timer_enabled),
      timeLimitSeconds: dbChallenge.time_limit_seconds === null || dbChallenge.time_limit_seconds === undefined ? undefined : Number(dbChallenge.time_limit_seconds),
      timerStartedAt: dbChallenge.timer_started_at ? new Date(String(dbChallenge.timer_started_at)) : undefined,
      showNoiseMeter: dbChallenge.show_noise_meter === undefined ? true : Boolean(dbChallenge.show_noise_meter),
      showTimer: dbChallenge.show_timer === undefined ? true : Boolean(dbChallenge.show_timer),
      completedAt: dbChallenge.completed_at ? new Date(String(dbChallenge.completed_at)) : undefined,
      closedAt: dbChallenge.closed_at ? new Date(String(dbChallenge.closed_at)) : undefined,
      createdAt: new Date(String(dbChallenge.created_at)),
      updatedAt: new Date(String(dbChallenge.updated_at))
    };
  }
}

export default LockChallengeService;
