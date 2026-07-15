import { DATABASE_TABLES } from '../../config/database';
import DatabaseService from '../../services/database';
import { DisplayMode, ToneId } from './performanceGame.types';

class PerformanceChallengeService {
  private static instance: PerformanceChallengeService;
  private dbService = DatabaseService.getInstance();

  static getInstance(): PerformanceChallengeService {
    if (!PerformanceChallengeService.instance) {
      PerformanceChallengeService.instance = new PerformanceChallengeService();
    }

    return PerformanceChallengeService.instance;
  }

  async saveAttempt(input: {
    challengeId?: string;
    userId?: string;
    submittedSequence: ToneId[];
    displayMode: DisplayMode;
    success: boolean;
    replayCount: number;
    attemptNumber: number;
  }) {
    try {
      const { error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.PERFORMANCE_ATTEMPTS)
        .insert({
          challenge_id: input.challengeId || null,
          user_id: input.userId || null,
          submitted_sequence: input.submittedSequence,
          display_mode: input.displayMode,
          success: input.success,
          replay_count: input.replayCount,
          attempt_number: input.attemptNumber,
        });

      if (error) {
        console.warn('Performance attempt was not saved:', error.message);
      }
    } catch (error) {
      console.warn('Performance attempt persistence is unavailable:', error);
    }
  }
}

export default PerformanceChallengeService;
