import { DATABASE_TABLES } from '../config/database';
import DatabaseService from './database';
import { ApiResponse } from '../types/database';

export interface HomepageStats {
  activePlayers: number;
  guilds: number;
  adventuresCompleted: number;
}

interface HomepageStatsRow {
  active_players?: number | string | null;
  guilds?: number | string | null;
  adventures_completed?: number | string | null;
}

class HomepageStatsService {
  private static instance: HomepageStatsService;
  private dbService: DatabaseService;

  constructor() {
    this.dbService = DatabaseService.getInstance();
  }

  static getInstance(): HomepageStatsService {
    if (!HomepageStatsService.instance) {
      HomepageStatsService.instance = new HomepageStatsService();
    }

    return HomepageStatsService.instance;
  }

  async getHomepageStats(): Promise<ApiResponse<HomepageStats>> {
    const supabase = this.dbService.getClient();

    const { data, error } = await supabase.rpc('get_homepage_stats').single();
    if (!error && data) {
      return {
        success: true,
        data: this.transformStatsRow(data as HomepageStatsRow)
      };
    }

    return this.getHomepageStatsFromTables();
  }

  private async getHomepageStatsFromTables(): Promise<ApiResponse<HomepageStats>> {
    try {
      const supabase = this.dbService.getClient();
      const [
        activeCharacters,
        guilds,
        completedAdventures
      ] = await Promise.all([
        supabase
          .from(DATABASE_TABLES.CHARACTERS)
          .select('user_id', { count: 'exact', head: false })
          .eq('is_active', true),
        supabase
          .from(DATABASE_TABLES.GUILDS)
          .select('*', { count: 'exact', head: true })
          .neq('status', 'Inactive'),
        supabase
          .from(DATABASE_TABLES.GAMES)
          .select('*', { count: 'exact', head: true })
          .eq('status', 'Completed')
      ]);

      const firstError = activeCharacters.error || guilds.error || completedAdventures.error;
      if (firstError) {
        return { success: false, error: firstError.message };
      }

      const activePlayerIds = new Set((activeCharacters.data || []).map(character => String(character.user_id)));

      return {
        success: true,
        data: {
          activePlayers: activePlayerIds.size,
          guilds: guilds.count || 0,
          adventuresCompleted: completedAdventures.count || 0
        }
      };
    } catch (error) {
      console.error('Error loading homepage stats:', error);
      return { success: false, error: 'Unable to load community stats.' };
    }
  }

  private transformStatsRow(row: HomepageStatsRow): HomepageStats {
    return {
      activePlayers: Number(row.active_players || 0),
      guilds: Number(row.guilds || 0),
      adventuresCompleted: Number(row.adventures_completed || 0)
    };
  }
}

export default HomepageStatsService;
