import DatabaseService from './database';
import { DATABASE_TABLES } from '../config/database';
import { Character, ApiResponse, PaginatedResponse } from '../types/database';

export interface FoundryCharacterData {
  name: string;
  items?: Array<{
    name?: string;
    type?: string;
    system?: {
      slug?: string;
      level?: {
        value?: number;
      };
    };
  }>;
  system: {
    details: {
      biography: {
        appearance?: string;
        backstory?: string;
      };
      age?: {
        value?: number;
      };
      height?: {
        value?: string;
      };
      weight?: {
        value?: string;
      };
      level?: {
        value?: number;
      };
    };
    attributes: {
      wealth?: {
        value?: number;
      };
    };
  };
  img?: string;
}

export class CharacterService {
  private static instance: CharacterService;
  private dbService: DatabaseService;

  constructor() {
    this.dbService = DatabaseService.getInstance();
  }

  static getInstance(): CharacterService {
    if (!CharacterService.instance) {
      CharacterService.instance = new CharacterService();
    }
    return CharacterService.instance;
  }

  async createCharacter(characterData: Omit<Character, '_id' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<Character>> {
    try {
      const supabase = this.dbService.getClient();

      const now = new Date().toISOString();
      const primaryClass = characterData.classPrimary || characterData.class || 'Unknown';
      const combinedClass = this.formatCombinedClass(primaryClass, characterData.classSecondary);
      const ancestry = characterData.ancestry || characterData.race || 'Unknown';
      const newCharacter = {
        user_id: characterData.userId,
        name: characterData.name,
        class: combinedClass,
        class_primary: primaryClass,
        class_secondary: characterData.classSecondary || null,
        level: characterData.level || 1,
        race: ancestry,
        ancestry,
        heritage: characterData.heritage || null,
        background: characterData.background,
        stats: characterData.stats || {},
        equipment: characterData.equipment || [],
        foundry_json: characterData.foundryJson || null,
        foundry_file_name: characterData.foundryFileName || null,
        backstory: characterData.backstory || '',
        notes: characterData.notes || '',
        is_active: characterData.isActive !== false,
        guild_id: characterData.guildId || null,
        created_at: now,
        updated_at: now
      };

      const { data, error } = await supabase
        .from(DATABASE_TABLES.CHARACTERS)
        .insert(newCharacter)
        .select()
        .single();

      if (error) {
        return {
          success: false,
          error: error.message
        };
      }

      return {
        success: true,
        data: this.transformCharacterFromDb(data),
        message: 'Character created successfully'
      };
    } catch (error) {
      console.error('Error creating character:', error);
      return {
        success: false,
        error: 'Failed to create character'
      };
    }
  }

  async getUserCharacters(userId: string): Promise<ApiResponse<Character[]>> {
    try {
      const supabase = this.dbService.getClient();

      const { data, error } = await supabase
        .from(DATABASE_TABLES.CHARACTERS)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        return {
          success: false,
          error: error.message
        };
      }

      return {
        success: true,
        data: data.map(char => this.transformCharacterFromDb(char))
      };
    } catch (error) {
      console.error('Error fetching user characters:', error);
      return {
        success: false,
        error: 'Failed to fetch characters'
      };
    }
  }

  async getCharacterById(characterId: string): Promise<ApiResponse<Character>> {
    try {
      const supabase = this.dbService.getClient();

      const { data, error } = await supabase
        .from(DATABASE_TABLES.CHARACTERS)
        .select('*')
        .eq('id', characterId)
        .single();

      if (error || !data) {
        return {
          success: false,
          error: 'Character not found'
        };
      }

      return {
        success: true,
        data: this.transformCharacterFromDb(data)
      };
    } catch (error) {
      console.error('Error fetching character:', error);
      return {
        success: false,
        error: 'Failed to fetch character'
      };
    }
  }

  async updateCharacter(characterId: string, userId: string, updates: Partial<Character>): Promise<ApiResponse<Character>> {
    try {
      const supabase = this.dbService.getClient();

      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      // Map updates to database columns
      if (updates.name !== undefined) updateData.name = updates.name;
      const nextPrimaryClass = updates.classPrimary || updates.class;
      if (updates.class !== undefined || updates.classPrimary !== undefined || updates.classSecondary !== undefined) {
        updateData.class = this.formatCombinedClass(nextPrimaryClass || updates.class || '', updates.classSecondary);
      }
      if (updates.classPrimary !== undefined) updateData.class_primary = updates.classPrimary;
      if (updates.classSecondary !== undefined) updateData.class_secondary = updates.classSecondary || null;
      if (updates.level !== undefined) updateData.level = updates.level;
      if (updates.race !== undefined || updates.ancestry !== undefined) updateData.race = updates.ancestry || updates.race;
      if (updates.ancestry !== undefined) updateData.ancestry = updates.ancestry;
      if (updates.heritage !== undefined) updateData.heritage = updates.heritage || null;
      if (updates.background !== undefined) updateData.background = updates.background;
      if (updates.stats !== undefined) updateData.stats = updates.stats;
      if (updates.equipment !== undefined) updateData.equipment = updates.equipment;
      if (updates.foundryJson !== undefined) updateData.foundry_json = updates.foundryJson;
      if (updates.foundryFileName !== undefined) updateData.foundry_file_name = updates.foundryFileName || null;
      if (updates.backstory !== undefined) updateData.backstory = updates.backstory;
      if (updates.notes !== undefined) updateData.notes = updates.notes;
      if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
      if (updates.guildId !== undefined) updateData.guild_id = updates.guildId;

      const { data, error } = await supabase
        .from(DATABASE_TABLES.CHARACTERS)
        .update(updateData)
        .eq('id', characterId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error || !data) {
        return {
          success: false,
          error: 'Character not found or unauthorized'
        };
      }

      return {
        success: true,
        data: this.transformCharacterFromDb(data),
        message: 'Character updated successfully'
      };
    } catch (error) {
      console.error('Error updating character:', error);
      return {
        success: false,
        error: 'Failed to update character'
      };
    }
  }

  async deleteCharacter(characterId: string, userId: string): Promise<ApiResponse<boolean>> {
    try {
      const supabase = this.dbService.getClient();

      const { error } = await supabase
        .from(DATABASE_TABLES.CHARACTERS)
        .delete()
        .eq('id', characterId)
        .eq('user_id', userId);

      if (error) {
        return {
          success: false,
          error: error.message
        };
      }

      return {
        success: true,
        data: true,
        message: 'Character deleted successfully'
      };
    } catch (error) {
      console.error('Error deleting character:', error);
      return {
        success: false,
        error: 'Failed to delete character'
      };
    }
  }

  parseFoundryData(jsonData: FoundryCharacterData): Partial<Character> {
    const system = jsonData.system || {};
    const details = system.details || {};
    const biography = details.biography || {};
    const attributes = system.attributes || {};
    const items = jsonData.items || [];
    const classItem = items.find(item => item.type === 'class');
    const ancestryItem = items.find(item => item.type === 'ancestry');
    const heritageItem = items.find(item => item.type === 'heritage');
    const backgroundItem = items.find(item => item.type === 'background');
    const [classPrimary, classSecondary] = this.parseClassNames(classItem?.name || '');
    const ancestry = ancestryItem?.name || '';
    const heritage = heritageItem?.name || '';

    return {
      name: jsonData.name || '',
      class: this.formatCombinedClass(classPrimary, classSecondary),
      classPrimary,
      classSecondary,
      race: ancestry,
      ancestry,
      heritage,
      background: backgroundItem?.name || '',
      level: details.level?.value || 1,
      backstory: biography.backstory || '',
      stats: {
        appearance: biography.appearance || '',
        age: details.age?.value || null,
        height: details.height?.value || '',
        weight: details.weight?.value || '',
        level: details.level?.value || 1,
        wealth: attributes.wealth?.value || 0,
        avatar: jsonData.img || ''
      }
    };
  }

  private parseClassNames(className: string): [string, string] {
    const parts = className
      .split(/\s*(?:-|\/|\+|&)\s*/g)
      .map(part => part.trim())
      .filter(Boolean);

    return [parts[0] || className || '', parts[1] || ''];
  }

  private formatCombinedClass(primaryClass: string, secondaryClass?: string): string {
    return [primaryClass, secondaryClass].filter(Boolean).join(' - ');
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

export default CharacterService;
