import DatabaseService from './database';
import { DATABASE_TABLES } from '../config/database';
import {
  ApiResponse,
  Character,
  CharacterJournalComment,
  CharacterJournalEntry,
  CharacterRelationship,
  CharacterRelationshipType,
  FoundryJsonEntry
} from '../types/database';

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

  async getPublicCharacters(): Promise<ApiResponse<Character[]>> {
    try {
      const { data, error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.CHARACTERS)
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) {
        return {
          success: false,
          error: error.message
        };
      }

      return {
        success: true,
        data: (data || []).map(character => this.transformCharacterFromDb(character))
      };
    } catch (error) {
      console.error('Error fetching public characters:', error);
      return {
        success: false,
        error: 'Failed to fetch public characters'
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

  async getFoundryFiles(characterId: string): Promise<ApiResponse<FoundryJsonEntry[]>> {
    try {
      const { data, error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.CHARACTER_FOUNDRY_FILES)
        .select('*')
        .eq('character_id', characterId)
        .order('sort_order', { ascending: true });

      if (error) return { success: false, error: error.message };

      return {
        success: true,
        data: (data || []).map(file => this.transformFoundryFileFromDb(file))
      };
    } catch (error) {
      console.error('Error fetching Foundry files:', error);
      return { success: false, error: 'Failed to fetch Foundry files' };
    }
  }

  async addFoundryFile(characterId: string, ownerId: string, name: string, json: unknown, sortOrder: number): Promise<ApiResponse<FoundryJsonEntry>> {
    try {
      const { data, error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.CHARACTER_FOUNDRY_FILES)
        .insert({
          character_id: characterId,
          owner_id: ownerId,
          name,
          json_data: json,
          sort_order: sortOrder
        })
        .select()
        .single();

      if (error) return { success: false, error: error.message };

      return {
        success: true,
        data: this.transformFoundryFileFromDb(data)
      };
    } catch (error) {
      console.error('Error adding Foundry file:', error);
      return { success: false, error: 'Failed to add Foundry file' };
    }
  }

  async updateFoundryFile(fileId: string, updates: { name?: string; sortOrder?: number }): Promise<ApiResponse<FoundryJsonEntry>> {
    try {
      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.sortOrder !== undefined) updateData.sort_order = updates.sortOrder;

      const { data, error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.CHARACTER_FOUNDRY_FILES)
        .update(updateData)
        .eq('id', fileId)
        .select()
        .single();

      if (error) return { success: false, error: error.message };

      return {
        success: true,
        data: this.transformFoundryFileFromDb(data)
      };
    } catch (error) {
      console.error('Error updating Foundry file:', error);
      return { success: false, error: 'Failed to update Foundry file' };
    }
  }

  async deleteFoundryFile(fileId: string): Promise<ApiResponse<boolean>> {
    try {
      const { error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.CHARACTER_FOUNDRY_FILES)
        .delete()
        .eq('id', fileId);

      if (error) return { success: false, error: error.message };

      return { success: true, data: true };
    } catch (error) {
      console.error('Error deleting Foundry file:', error);
      return { success: false, error: 'Failed to delete Foundry file' };
    }
  }

  async getJournalEntries(characterId: string, currentUserId: string): Promise<ApiResponse<CharacterJournalEntry[]>> {
    try {
      const supabase = this.dbService.getClient();
      const { data: entries, error: entryError } = await supabase
        .from(DATABASE_TABLES.CHARACTER_JOURNAL_ENTRIES)
        .select('*')
        .eq('character_id', characterId)
        .order('created_at', { ascending: false });

      if (entryError) return { success: false, error: entryError.message };

      const entryIds = (entries || []).map(entry => entry.id);
      const { data: comments, error: commentError } = entryIds.length > 0
        ? await supabase
            .from(DATABASE_TABLES.CHARACTER_JOURNAL_COMMENTS)
            .select('*')
            .in('entry_id', entryIds)
            .order('created_at', { ascending: true })
        : { data: [], error: null };

      if (commentError) return { success: false, error: commentError.message };

      const { data: likes, error: likeError } = entryIds.length > 0
        ? await supabase
            .from(DATABASE_TABLES.CHARACTER_JOURNAL_LIKES)
            .select('*')
            .in('entry_id', entryIds)
        : { data: [], error: null };

      if (likeError) return { success: false, error: likeError.message };

      return {
        success: true,
        data: (entries || []).map(entry => this.transformJournalEntryFromDb(entry, comments || [], likes || [], currentUserId))
      };
    } catch (error) {
      console.error('Error fetching journal entries:', error);
      return { success: false, error: 'Failed to fetch journal entries' };
    }
  }

  async createJournalEntry(characterId: string, authorId: string, title: string, body: string): Promise<ApiResponse<CharacterJournalEntry>> {
    try {
      const { data, error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.CHARACTER_JOURNAL_ENTRIES)
        .insert({ character_id: characterId, author_id: authorId, title, body })
        .select()
        .single();

      if (error) return { success: false, error: error.message };

      return {
        success: true,
        data: this.transformJournalEntryFromDb(data, [], [], authorId)
      };
    } catch (error) {
      console.error('Error creating journal entry:', error);
      return { success: false, error: 'Failed to create journal entry' };
    }
  }

  async deleteJournalEntry(entryId: string): Promise<ApiResponse<boolean>> {
    try {
      const { error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.CHARACTER_JOURNAL_ENTRIES)
        .delete()
        .eq('id', entryId);

      if (error) return { success: false, error: error.message };

      return { success: true, data: true };
    } catch (error) {
      console.error('Error deleting journal entry:', error);
      return { success: false, error: 'Failed to delete journal entry' };
    }
  }

  async addJournalComment(entryId: string, authorId: string, body: string): Promise<ApiResponse<CharacterJournalComment>> {
    try {
      const { data, error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.CHARACTER_JOURNAL_COMMENTS)
        .insert({ entry_id: entryId, author_id: authorId, body })
        .select()
        .single();

      if (error) return { success: false, error: error.message };

      return {
        success: true,
        data: this.transformJournalCommentFromDb(data)
      };
    } catch (error) {
      console.error('Error adding journal comment:', error);
      return { success: false, error: 'Failed to add comment' };
    }
  }

  async updateJournalComment(commentId: string, body: string): Promise<ApiResponse<CharacterJournalComment>> {
    try {
      const { data, error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.CHARACTER_JOURNAL_COMMENTS)
        .update({
          body,
          updated_at: new Date().toISOString()
        })
        .eq('id', commentId)
        .select()
        .single();

      if (error) return { success: false, error: error.message };

      return {
        success: true,
        data: this.transformJournalCommentFromDb(data)
      };
    } catch (error) {
      console.error('Error updating journal comment:', error);
      return { success: false, error: 'Failed to update comment' };
    }
  }

  async deleteJournalComment(commentId: string): Promise<ApiResponse<boolean>> {
    try {
      const { error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.CHARACTER_JOURNAL_COMMENTS)
        .delete()
        .eq('id', commentId);

      if (error) return { success: false, error: error.message };

      return { success: true, data: true };
    } catch (error) {
      console.error('Error deleting journal comment:', error);
      return { success: false, error: 'Failed to delete comment' };
    }
  }

  async toggleJournalLike(entryId: string, userId: string, isLiked: boolean): Promise<ApiResponse<boolean>> {
    try {
      if (isLiked) {
        const { error } = await this.dbService.getClient()
          .from(DATABASE_TABLES.CHARACTER_JOURNAL_LIKES)
          .delete()
          .eq('entry_id', entryId)
          .eq('user_id', userId);

        if (error) return { success: false, error: error.message };
      } else {
        const { error } = await this.dbService.getClient()
          .from(DATABASE_TABLES.CHARACTER_JOURNAL_LIKES)
          .insert({ entry_id: entryId, user_id: userId });

        if (error) return { success: false, error: error.message };
      }

      return { success: true, data: true };
    } catch (error) {
      console.error('Error toggling journal like:', error);
      return { success: false, error: 'Failed to update like' };
    }
  }

  async getRelationshipsForCharacters(characterIds: string[]): Promise<ApiResponse<CharacterRelationship[]>> {
    try {
      if (characterIds.length === 0) return { success: true, data: [] };

      const supabase = this.dbService.getClient();
      const { data, error } = await supabase
        .from(DATABASE_TABLES.CHARACTER_RELATIONSHIPS)
        .select('*')
        .in('source_character_id', characterIds)
        .order('created_at', { ascending: true });

      if (error) return { success: false, error: error.message };

      const automaticRelationships = await this.getAutomaticGuildRelationships(characterIds);

      return {
        success: true,
        data: [
          ...(data || []).map(relationship => this.transformRelationshipFromDb(relationship)),
          ...automaticRelationships
        ]
      };
    } catch (error) {
      console.error('Error fetching relationships:', error);
      return { success: false, error: 'Failed to fetch relationships' };
    }
  }

  async createRelationship(
    sourceCharacterId: string,
    ownerId: string,
    targetCharacterId: string,
    relationshipTypes: CharacterRelationshipType[],
    subtype: string
  ): Promise<ApiResponse<CharacterRelationship>> {
    try {
      const { data, error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.CHARACTER_RELATIONSHIPS)
        .insert({
          source_character_id: sourceCharacterId,
          target_character_id: targetCharacterId,
          owner_id: ownerId,
          relationship_types: relationshipTypes,
          subtype: subtype || null,
          label: subtype || null
        })
        .select()
        .single();

      if (error) return { success: false, error: error.message };

      return {
        success: true,
        data: this.transformRelationshipFromDb(data)
      };
    } catch (error) {
      console.error('Error creating relationship:', error);
      return { success: false, error: 'Failed to create relationship' };
    }
  }

  async deleteRelationship(relationshipId: string): Promise<ApiResponse<boolean>> {
    try {
      const { error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.CHARACTER_RELATIONSHIPS)
        .delete()
        .eq('id', relationshipId);

      if (error) return { success: false, error: error.message };

      return { success: true, data: true };
    } catch (error) {
      console.error('Error deleting relationship:', error);
      return { success: false, error: 'Failed to delete relationship' };
    }
  }

  private async getAutomaticGuildRelationships(characterIds: string[]): Promise<CharacterRelationship[]> {
    const { data, error } = await this.dbService.getClient()
      .from(DATABASE_TABLES.GUILD_MEMBERSHIPS)
      .select('id,guild_id,character_id,role_category,membership_status')
      .in('character_id', characterIds)
      .eq('membership_status', 'Active');

    if (error || !data) {
      if (error) console.error('Error fetching automatic guild relationships:', error);
      return [];
    }

    const membershipsByGuild = new Map<string, Array<{ character_id: string; role_category: string }>>();
    data
      .filter(membership => membership.character_id)
      .forEach(membership => {
        const guildMemberships = membershipsByGuild.get(membership.guild_id) || [];
        guildMemberships.push({
          character_id: membership.character_id,
          role_category: membership.role_category
        });
        membershipsByGuild.set(membership.guild_id, guildMemberships);
      });

    const relationships: CharacterRelationship[] = [];
    membershipsByGuild.forEach((memberships, guildId) => {
      const coreMembers = memberships.filter(membership => ['Leader', 'Officer', 'Member'].includes(membership.role_category));
      const allies = memberships.filter(membership => membership.role_category === 'Ally');

      coreMembers.forEach(source => {
        coreMembers.forEach(target => {
          if (source.character_id === target.character_id) return;
          relationships.push(this.createAutomaticRelationship(guildId, source.character_id, target.character_id, 'guildmate'));
        });
      });

      allies.forEach(ally => {
        coreMembers.forEach(member => {
          relationships.push(this.createAutomaticRelationship(guildId, ally.character_id, member.character_id, 'ally'));
          relationships.push(this.createAutomaticRelationship(guildId, member.character_id, ally.character_id, 'ally'));
        });
      });
    });

    return relationships;
  }

  private createAutomaticRelationship(guildId: string, sourceCharacterId: string, targetCharacterId: string, type: 'guildmate' | 'ally'): CharacterRelationship {
    return {
      id: `auto-${type}-${guildId}-${sourceCharacterId}-${targetCharacterId}`,
      sourceCharacterId,
      targetCharacterId,
      relationshipTypes: [type],
      subtype: '',
      label: type === 'guildmate' ? 'Guildmate' : 'Ally',
      status: 'automatic',
      isAutomatic: true,
      createdAt: new Date(0),
      updatedAt: new Date(0)
    };
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

  async searchActiveCharactersByName(query: string, limit: number = 10): Promise<ApiResponse<Character[]>> {
    try {
      const trimmedQuery = query.trim();
      if (trimmedQuery.length < 2) {
        return {
          success: true,
          data: []
        };
      }

      const { data, error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.CHARACTERS)
        .select('*')
        .ilike('name', `%${trimmedQuery}%`)
        .eq('is_active', true)
        .order('name', { ascending: true })
        .limit(limit);

      if (error) {
        return {
          success: false,
          error: error.message
        };
      }

      return {
        success: true,
        data: (data || []).map(character => this.transformCharacterFromDb(character))
      };
    } catch (error) {
      console.error('Error searching active characters:', error);
      return {
        success: false,
        error: 'Failed to search characters'
      };
    }
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

  private transformFoundryFileFromDb(dbFile: any): FoundryJsonEntry {
    return {
      id: dbFile.id,
      characterId: dbFile.character_id,
      name: dbFile.name,
      json: dbFile.json_data,
      sortOrder: dbFile.sort_order,
      createdAt: new Date(dbFile.created_at),
      updatedAt: new Date(dbFile.updated_at)
    };
  }

  private transformJournalEntryFromDb(dbEntry: any, dbComments: any[], dbLikes: any[], currentUserId: string): CharacterJournalEntry {
    const entryLikes = dbLikes.filter(like => like.entry_id === dbEntry.id);

    return {
      id: dbEntry.id,
      characterId: dbEntry.character_id,
      authorId: dbEntry.author_id,
      title: dbEntry.title,
      body: dbEntry.body,
      likeCount: entryLikes.length,
      likedByCurrentUser: entryLikes.some(like => like.user_id === currentUserId),
      comments: dbComments
        .filter(comment => comment.entry_id === dbEntry.id)
        .map(comment => this.transformJournalCommentFromDb(comment)),
      createdAt: new Date(dbEntry.created_at),
      updatedAt: new Date(dbEntry.updated_at)
    };
  }

  private transformJournalCommentFromDb(dbComment: any): CharacterJournalComment {
    return {
      id: dbComment.id,
      entryId: dbComment.entry_id,
      authorId: dbComment.author_id,
      body: dbComment.body,
      isEdited: new Date(dbComment.updated_at).getTime() > new Date(dbComment.created_at).getTime() + 1000,
      createdAt: new Date(dbComment.created_at),
      updatedAt: new Date(dbComment.updated_at)
    };
  }

  private transformRelationshipFromDb(dbRelationship: any): CharacterRelationship {
    return {
      id: dbRelationship.id,
      sourceCharacterId: dbRelationship.source_character_id,
      targetCharacterId: dbRelationship.target_character_id,
      relationshipTypes: Array.isArray(dbRelationship.relationship_types) && dbRelationship.relationship_types.length > 0
        ? dbRelationship.relationship_types
        : ['family'],
      subtype: dbRelationship.subtype || dbRelationship.label || '',
      label: dbRelationship.subtype || dbRelationship.label || '',
      createdAt: new Date(dbRelationship.created_at),
      updatedAt: new Date(dbRelationship.updated_at)
    };
  }
}

export default CharacterService;
