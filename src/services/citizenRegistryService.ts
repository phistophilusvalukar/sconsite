import { DATABASE_TABLES } from '../config/database';
import { ApiResponse, Character, Guild } from '../types/database';
import DatabaseService from './database';
import GuildService from './guildService';

export type RegistryTierKey = 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'tier5' | 'tier6' | 'tier7';

export interface RegistryRow {
  name: string;
  tier1: number;
  tier2: number;
  tier3: number;
  tier4: number;
  tier5: number;
  tier6: number;
  tier7: number;
  total: number;
}

export interface CitizenRegistry {
  classes: RegistryRow[];
  ancestries: RegistryRow[];
  heritages: RegistryRow[];
  guilds: RegistryRow[];
  totalCharacters: number;
  guildedCharacters: number;
}

export class CitizenRegistryService {
  private static instance: CitizenRegistryService;
  private dbService: DatabaseService;
  private guildService: GuildService;

  constructor() {
    this.dbService = DatabaseService.getInstance();
    this.guildService = GuildService.getInstance();
  }

  static getInstance(): CitizenRegistryService {
    if (!CitizenRegistryService.instance) {
      CitizenRegistryService.instance = new CitizenRegistryService();
    }
    return CitizenRegistryService.instance;
  }

  async getRegistry(): Promise<ApiResponse<CitizenRegistry>> {
    try {
      const [charactersResponse, guildsResponse] = await Promise.all([
        this.loadCharacters(),
        this.guildService.getGuilds()
      ]);

      if (!charactersResponse.success || !charactersResponse.data) {
        return { success: false, error: charactersResponse.error || 'Failed to load characters' };
      }

      if (!guildsResponse.success || !guildsResponse.data) {
        return { success: false, error: guildsResponse.error || 'Failed to load guilds' };
      }

      const characters = charactersResponse.data;
      const guilds = guildsResponse.data;

      return {
        success: true,
        data: {
          classes: this.buildRows(characters, character => this.getCharacterClasses(character)),
          ancestries: this.buildRows(characters, character => [character.ancestry || character.race || 'Unknown']),
          heritages: this.buildRows(characters, character => [character.heritage || 'Unlisted']),
          guilds: this.buildGuildRows(guilds),
          totalCharacters: characters.length,
          guildedCharacters: characters.filter(character => Boolean(character.guildId)).length
        }
      };
    } catch (error) {
      console.error('Error loading citizen registry:', error);
      return { success: false, error: 'Failed to load citizen registry' };
    }
  }

  private async loadCharacters(): Promise<ApiResponse<Character[]>> {
    const { data, error } = await this.dbService.getClient()
      .from(DATABASE_TABLES.CHARACTERS)
      .select('*')
      .eq('is_active', true);

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: (data || []).map(character => this.transformCharacterFromDb(character))
    };
  }

  private buildRows(characters: Character[], getNames: (character: Character) => string[]): RegistryRow[] {
    const rows = new Map<string, RegistryRow>();

    characters.forEach(character => {
      const tier = this.getTierKey(character.level);
      getNames(character)
        .map(name => name.trim())
        .filter(Boolean)
        .forEach(name => {
          const row = this.getOrCreateRow(rows, name);
          row[tier] += 1;
          row.total += 1;
        });
    });

    return Array.from(rows.values()).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }

  private buildGuildRows(guilds: Guild[]): RegistryRow[] {
    return guilds
      .map(guild => {
        const row = this.createRow(guild.name);
        (guild.memberships || [])
          .filter(membership => membership.membershipStatus === 'Active' && membership.character)
          .forEach(membership => {
            const tier = this.getTierKey(membership.character?.level || 1);
            row[tier] += 1;
            row.total += 1;
          });
        return row;
      })
      .filter(row => row.total > 0)
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }

  private getCharacterClasses(character: Character): string[] {
    const hasDedicatedClassFields = Boolean(character.classSecondary?.trim())
      || Boolean(character.classPrimary?.trim() && character.classPrimary !== character.class);

    if (hasDedicatedClassFields) {
      return [character.classPrimary, character.classSecondary]
        .filter((name): name is string => Boolean(name?.trim()));
    }

    return (character.class || 'Unknown')
      .split(/\s*(?:-|\/|\+|&)\s*/g)
      .map(name => name.trim())
      .filter(Boolean);
  }

  private getOrCreateRow(rows: Map<string, RegistryRow>, name: string): RegistryRow {
    const existing = rows.get(name);
    if (existing) return existing;

    const row = this.createRow(name);
    rows.set(name, row);
    return row;
  }

  private createRow(name: string): RegistryRow {
    return {
      name,
      tier1: 0,
      tier2: 0,
      tier3: 0,
      tier4: 0,
      tier5: 0,
      tier6: 0,
      tier7: 0,
      total: 0
    };
  }

  private getTierKey(level: number): RegistryTierKey {
    if (level <= 3) return 'tier1';
    if (level <= 6) return 'tier2';
    if (level <= 9) return 'tier3';
    if (level <= 12) return 'tier4';
    if (level <= 15) return 'tier5';
    if (level <= 18) return 'tier6';
    return 'tier7';
  }

  private transformCharacterFromDb(dbCharacter: any): Character {
    return {
      _id: dbCharacter.id,
      userId: dbCharacter.user_id,
      name: dbCharacter.name,
      class: dbCharacter.class,
      classPrimary: dbCharacter.class_primary || dbCharacter.class,
      classSecondary: dbCharacter.class_secondary || '',
      level: dbCharacter.level,
      race: dbCharacter.race,
      ancestry: dbCharacter.ancestry || dbCharacter.race,
      heritage: dbCharacter.heritage || '',
      background: dbCharacter.background,
      stats: dbCharacter.stats,
      equipment: dbCharacter.equipment,
      foundryJson: dbCharacter.foundry_json,
      foundryFileName: dbCharacter.foundry_file_name,
      backstory: dbCharacter.backstory,
      notes: dbCharacter.notes,
      isActive: dbCharacter.is_active,
      guildId: dbCharacter.guild_id,
      createdAt: new Date(dbCharacter.created_at),
      updatedAt: new Date(dbCharacter.updated_at)
    };
  }
}

export default CitizenRegistryService;
