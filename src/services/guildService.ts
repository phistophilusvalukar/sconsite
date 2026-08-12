import DatabaseService from './database';
import { z } from 'zod';
import { DATABASE_TABLES } from '../config/database';
import {
  ApiResponse,
  Character,
  CharacterStats,
  Guild,
  GuildApplication,
  GuildCheckin,
  GuildCheckinResult,
  GuildGuestbookEntry,
  GuildMembership,
  JsonValue
} from '../types/database';
import {
  GuildCustomizationInput,
  defaultGuildPalette,
  defaultGuildSectionVisibility,
  defaultGuildRoleLabels,
  guildCustomizationSchema,
  isSafeExternalImageUrl
} from '../features/guilds/guildCustomization';
import { plainTextToRichHtml, richTextToPlainText, sanitizeRichHtml } from '../features/guilds/richText';

const guildCheckinResultSchema = z.object({
  awarded: z.boolean(),
  influencePoints: z.number().int().nonnegative(),
  checkinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
}).strict();

export interface CreateGuildInput {
  name: string;
  subtitle?: string;
  description: string;
  leaderId: string;
  leaderCharacterId: string;
  type?: string;
  region?: string;
  requirements?: string;
}

interface GuildCharacterRow {
  id: string;
  user_id: string;
  name: string;
  class: string;
  class_primary?: string | null;
  class_secondary?: string | null;
  level: number;
  race: string;
  ancestry?: string | null;
  heritage?: string | null;
  background?: string;
  stats?: CharacterStats;
  equipment?: JsonValue[];
  foundry_file_name?: string;
  backstory?: string;
  notes?: string;
  is_active: boolean;
  guild_id?: string;
  created_at: string;
  updated_at: string;
}

interface GuildMembershipRow {
  id: string;
  guild_id: string;
  user_id: string;
  character_id?: string;
  role: GuildMembership['role'];
  role_category?: GuildMembership['roleCategory'];
  role_title?: string;
  membership_status?: GuildMembership['membershipStatus'];
  joined_at: string;
  accepted_at?: string | null;
  invited_by?: string;
  badges?: string[];
  contributions?: number;
  character?: GuildCharacterRow | null;
}

interface GuildApplicationRow {
  id: string;
  guild_id: string;
  user_id: string;
  character_id?: string;
  requested_role_category: GuildApplication['requestedRoleCategory'];
  message?: string;
  status: GuildApplication['status'];
  created_at: string;
  updated_at: string;
  character?: GuildCharacterRow | null;
}

interface GuildRow {
  id: string;
  name: string;
  title_html?: string;
  title_animation?: Guild['titleAnimation'];
  subtitle?: string;
  description: string;
  description_html?: string;
  type?: string;
  leader_id: string;
  created_by?: string;
  leader_character_id?: string;
  leader_character?: { name?: string } | null;
  logo?: string;
  emblem_url?: string;
  region?: string;
  font_family?: Guild['fontFamily'];
  font_color?: string;
  base_color?: string;
  accent_color?: string;
  surface_color?: string;
  layout_style?: Guild['layoutStyle'];
  roster_display?: Guild['rosterDisplay'];
  section_visibility?: Partial<Guild['sectionVisibility']>;
  headquarters_name?: string;
  headquarters_title?: string;
  headquarters_title_html?: string;
  headquarters_description?: string;
  headquarters_description_html?: string;
  headquarters_image_url?: string;
  message_board_html?: string;
  message_board_updated_at?: string | null;
  guestbook_enabled?: boolean;
  influence_points?: number;
  role_labels?: Guild['roleLabels'];
  status?: Guild['status'];
  recruitment_status?: Guild['recruitmentStatus'];
  requirements?: string;
  badges?: string[];
  recent_activity?: string;
  rank?: Guild['rank'];
  member_count?: number;
  max_members?: number;
  founding_required?: number;
  founded_at?: string | null;
  memberships?: GuildMembershipRow[];
  applications?: GuildApplicationRow[];
  created_at: string;
  updated_at: string;
}

interface GuildCheckinRow {
  id: string;
  guild_id: string;
  character_id: string;
  user_id: string;
  checkin_date: string;
  influence_awarded: number;
  created_at: string;
  character?: GuildCharacterRow | null;
}

interface GuildGuestbookRow {
  id: string;
  guild_id: string;
  author_user_id: string;
  character_id?: string;
  message: string;
  hidden_at?: string | null;
  created_at: string;
  updated_at: string;
  character?: GuildCharacterRow | null;
}

export class GuildService {
  private static instance: GuildService;
  private dbService: DatabaseService;

  constructor() {
    this.dbService = DatabaseService.getInstance();
  }

  static getInstance(): GuildService {
    if (!GuildService.instance) {
      GuildService.instance = new GuildService();
    }
    return GuildService.instance;
  }

  async getGuilds(): Promise<ApiResponse<Guild[]>> {
    try {
      const supabase = this.dbService.getClient();
      const { data, error } = await supabase
        .from(DATABASE_TABLES.GUILDS)
        .select(`
          *,
          leader_character:characters!guilds_leader_character_id_fkey(id,name,level,class),
          memberships:guild_memberships(*, character:characters!guild_memberships_character_id_fkey(id,user_id,name,class,class_primary,class_secondary,level,race,ancestry,heritage,background,stats,equipment,foundry_file_name,backstory,notes,is_active,guild_id,created_at,updated_at)),
          applications:guild_applications(*, character:characters!guild_applications_character_id_fkey(id,user_id,name,class,class_primary,class_secondary,level,race,ancestry,heritage,background,stats,equipment,foundry_file_name,backstory,notes,is_active,guild_id,created_at,updated_at))
        `)
        .order('created_at', { ascending: false });

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        data: (data || []).map(guild => this.transformGuildFromDb(guild))
      };
    } catch (error) {
      console.error('Error loading guilds:', error);
      return { success: false, error: 'Failed to load guilds' };
    }
  }

  async getGuild(guildId: string): Promise<ApiResponse<Guild>> {
    try {
      const { data, error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.GUILDS)
        .select(`
          *,
          leader_character:characters!guilds_leader_character_id_fkey(id,name,level,class),
          memberships:guild_memberships(*, character:characters!guild_memberships_character_id_fkey(id,user_id,name,class,class_primary,class_secondary,level,race,ancestry,heritage,background,stats,equipment,foundry_file_name,backstory,notes,is_active,guild_id,created_at,updated_at)),
          applications:guild_applications(*, character:characters!guild_applications_character_id_fkey(id,user_id,name,class,class_primary,class_secondary,level,race,ancestry,heritage,background,stats,equipment,foundry_file_name,backstory,notes,is_active,guild_id,created_at,updated_at))
        `)
        .eq('id', guildId)
        .single();

      if (error || !data) {
        return { success: false, error: error?.message || 'Guild not found.' };
      }

      return { success: true, data: this.transformGuildFromDb(data) };
    } catch (error) {
      console.error('Error loading guild:', error);
      return { success: false, error: 'Failed to load guild' };
    }
  }

  async createGuild(input: CreateGuildInput): Promise<ApiResponse<Guild>> {
    try {
      const supabase = this.dbService.getClient();
      const leaderCharacter = await this.getLeaderCharacter(input.leaderId, input.leaderCharacterId);
      if (!leaderCharacter) {
        return { success: false, error: 'Leader character was not found.' };
      }

      if (leaderCharacter.level < 4) {
        return { success: false, error: 'Guild leaders must be at least level 4.' };
      }

      const existingLeadership = await this.characterHasActiveLeadership(input.leaderCharacterId);
      if (existingLeadership) {
        return { success: false, error: 'A character can only lead one active or recruiting guild.' };
      }

      const coreMembership = await this.characterHasCoreMembership(input.leaderCharacterId);
      if (coreMembership) {
        return { success: false, error: 'A character can only be a leader, subleader, officer, or member of one guild.' };
      }

      const now = new Date().toISOString();
      const { data: guild, error: guildError } = await supabase
        .from(DATABASE_TABLES.GUILDS)
        .insert({
          name: input.name,
          title_html: plainTextToRichHtml(input.name),
          title_animation: 'none',
          subtitle: input.subtitle || '',
          description: input.description,
          description_html: plainTextToRichHtml(input.description),
          type: input.type || 'Adventuring',
          leader_id: input.leaderId,
          created_by: input.leaderId,
          leader_character_id: input.leaderCharacterId,
          member_count: 1,
          max_members: 50,
          recruitment_status: 'open',
          status: 'Recruiting',
          requirements: input.requirements || 'Founding members required.',
          region: input.region || '',
          font_color: defaultGuildPalette.fontColor,
          base_color: defaultGuildPalette.baseColor,
          accent_color: defaultGuildPalette.accentColor,
          surface_color: defaultGuildPalette.surfaceColor,
          rank: 'bronze',
          badges: [],
          recent_activity: 'Guild charter created.',
          founding_required: 3,
          created_at: now,
          updated_at: now
        })
        .select()
        .single();

      if (guildError) {
        return { success: false, error: guildError.message };
      }

      const { error: membershipError } = await supabase
        .from('guild_memberships')
        .insert({
          guild_id: guild.id,
          user_id: input.leaderId,
          character_id: input.leaderCharacterId,
          role: 'leader',
          role_category: 'Leader',
          role_title: 'Guild Leader',
          membership_status: 'Active',
          joined_at: now,
          accepted_at: now,
          badges: [],
          contributions: 0
        });

      if (membershipError) {
        return { success: false, error: membershipError.message };
      }

      await supabase
        .from(DATABASE_TABLES.CHARACTERS)
        .update({ guild_id: guild.id, updated_at: now })
        .eq('id', input.leaderCharacterId)
        .eq('user_id', input.leaderId);

      return {
        success: true,
        data: this.transformGuildFromDb(guild),
        message: 'Guild created.'
      };
    } catch (error) {
      console.error('Error creating guild:', error);
      return { success: false, error: 'Failed to create guild' };
    }
  }

  async updateGuildCustomization(
    guildId: string,
    leaderId: string,
    input: GuildCustomizationInput
  ): Promise<ApiResponse<boolean>> {
    try {
      const parsed = guildCustomizationSchema.safeParse(input);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || 'Invalid guild profile.' };
      }

      const guild = await this.getGuildById(guildId);
      if (!guild || guild.leaderId !== leaderId) {
        return { success: false, error: 'Only the guildmaster can customize this page.' };
      }

      const safeProfile: GuildCustomizationInput = {
        ...parsed.data,
        titleHtml: sanitizeRichHtml(parsed.data.titleHtml, 'inline'),
        descriptionHtml: sanitizeRichHtml(parsed.data.descriptionHtml),
        headquartersTitleHtml: sanitizeRichHtml(parsed.data.headquartersTitleHtml, 'inline'),
        headquartersDescriptionHtml: sanitizeRichHtml(parsed.data.headquartersDescriptionHtml)
      };
      safeProfile.messageBoardHtml = sanitizeRichHtml(parsed.data.messageBoardHtml);
      safeProfile.description = richTextToPlainText(safeProfile.descriptionHtml).slice(0, 4000);
      safeProfile.headquartersTitle = richTextToPlainText(safeProfile.headquartersTitleHtml).slice(0, 140);
      safeProfile.headquartersDescription = richTextToPlainText(safeProfile.headquartersDescriptionHtml).slice(0, 3000);

      const { data, error } = await this.dbService.getClient().rpc('update_guild_profile_command', {
        p_guild_id: guildId,
        p_profile: safeProfile
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: Boolean(data), message: 'Guild page updated.' };
    } catch (error) {
      console.error('Error updating guild customization:', error);
      return { success: false, error: 'Failed to update guild page' };
    }
  }

  async getTodayCheckins(guildId: string): Promise<ApiResponse<GuildCheckin[]>> {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.GUILD_CHECKINS)
        .select(`
          *,
          character:characters!guild_checkins_character_id_fkey(id,user_id,name,class,class_primary,class_secondary,level,race,ancestry,heritage,background,stats,equipment,foundry_file_name,backstory,notes,is_active,guild_id,created_at,updated_at)
        `)
        .eq('guild_id', guildId)
        .eq('checkin_date', today)
        .order('created_at', { ascending: false });

      if (error) return { success: false, error: error.message };
      return { success: true, data: (data || []).map(row => this.transformCheckinFromDb(row)) };
    } catch (error) {
      console.error('Error loading guild check-ins:', error);
      return { success: false, error: 'Failed to load guild check-ins' };
    }
  }

  async checkInCharacter(guildId: string, characterId: string): Promise<ApiResponse<GuildCheckinResult>> {
    try {
      const { data, error } = await this.dbService.getClient().rpc('check_in_guild_character_command', {
        p_guild_id: guildId,
        p_character_id: characterId
      });
      if (error) return { success: false, error: error.message };
      const result = guildCheckinResultSchema.safeParse(data);
      if (!result.success) {
        return { success: false, error: 'The guild check-in response was invalid.' };
      }
      return {
        success: true,
        data: result.data,
        message: result.data.awarded ? 'Checked in. The guild gained 1 influence.' : 'That character has already checked in today.'
      };
    } catch (error) {
      console.error('Error checking in guild character:', error);
      return { success: false, error: 'Failed to check in' };
    }
  }

  async getGuestbookEntries(guildId: string): Promise<ApiResponse<GuildGuestbookEntry[]>> {
    try {
      const { data, error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.GUILD_GUESTBOOK_ENTRIES)
        .select(`
          *,
          character:characters!guild_guestbook_entries_character_id_fkey(id,user_id,name,class,class_primary,class_secondary,level,race,ancestry,heritage,background,stats,equipment,foundry_file_name,backstory,notes,is_active,guild_id,created_at,updated_at)
        `)
        .eq('guild_id', guildId)
        .order('created_at', { ascending: false })
        .limit(60);

      if (error) return { success: false, error: error.message };
      return { success: true, data: (data || []).map(row => this.transformGuestbookFromDb(row)) };
    } catch (error) {
      console.error('Error loading guild guestbook:', error);
      return { success: false, error: 'Failed to load the guestbook' };
    }
  }

  async signGuestbook(guildId: string, characterId: string | undefined, message: string): Promise<ApiResponse<boolean>> {
    const normalizedMessage = message.trim();
    if (!normalizedMessage || normalizedMessage.length > 1200) {
      return { success: false, error: 'Guestbook messages must be between 1 and 1,200 characters.' };
    }

    try {
      const { data, error } = await this.dbService.getClient().rpc('sign_guild_guestbook_command', {
        p_guild_id: guildId,
        p_character_id: characterId || null,
        p_message: normalizedMessage
      });
      if (error) return { success: false, error: error.message };
      return { success: true, data: Boolean(data), message: 'Your visit has been recorded.' };
    } catch (error) {
      console.error('Error signing guild guestbook:', error);
      return { success: false, error: 'Failed to sign the guestbook' };
    }
  }

  async moderateGuestbookEntry(guildId: string, entryId: string, hidden: boolean): Promise<ApiResponse<boolean>> {
    try {
      const { data, error } = await this.dbService.getClient().rpc('moderate_guild_guestbook_command', {
        p_guild_id: guildId,
        p_entry_id: entryId,
        p_hidden: hidden
      });
      if (error) return { success: false, error: error.message };
      return { success: true, data: Boolean(data), message: hidden ? 'Guestbook entry hidden.' : 'Guestbook entry restored.' };
    } catch (error) {
      console.error('Error moderating guild guestbook:', error);
      return { success: false, error: 'Failed to moderate the guestbook' };
    }
  }

  async searchEligibleFoundingCharacters(guildId: string, leaderId: string, query: string): Promise<ApiResponse<Character[]>> {
    try {
      const guild = await this.getGuildById(guildId);
      if (!guild || guild.leaderId !== leaderId) {
        return { success: false, error: 'Only the guild leader can search founding members.' };
      }

      const { data, error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.CHARACTERS)
        .select('*')
        .ilike('name', `%${query}%`)
        .eq('is_active', true)
        .limit(12);

      if (error) {
        return { success: false, error: error.message };
      }

      const eligibleCharacters: Character[] = [];
      for (const character of data || []) {
        if (character.user_id === leaderId) continue;
        const hasCoreMembership = await this.characterHasCoreMembership(character.id);
        if (!hasCoreMembership) {
          eligibleCharacters.push(this.transformCharacterFromDb(character));
        }
      }

      return { success: true, data: eligibleCharacters };
    } catch (error) {
      console.error('Error searching founding characters:', error);
      return { success: false, error: 'Failed to search founding characters' };
    }
  }

  async addFoundingMember(guildId: string, leaderId: string, characterId: string, roleTitle = 'Founding Member'): Promise<ApiResponse<GuildMembership>> {
    try {
      const supabase = this.dbService.getClient();
      const guild = await this.getGuildById(guildId);
      if (!guild || guild.leaderId !== leaderId) {
        return { success: false, error: 'Only the guild leader can add founding members.' };
      }

      const foundingCharacter = await this.getCharacterById(characterId);
      if (!foundingCharacter) {
        return { success: false, error: 'Founding character was not found.' };
      }

      const coreMembership = await this.characterHasCoreMembership(characterId);
      if (coreMembership) {
        return { success: false, error: 'That character is already a leader, subleader, officer, or member of another guild.' };
      }

      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('guild_memberships')
        .insert({
          guild_id: guildId,
          user_id: foundingCharacter.userId,
          character_id: characterId,
          role: 'member',
          role_category: 'Member',
          role_title: roleTitle,
          membership_status: 'Active',
          invited_by: leaderId,
          joined_at: now,
          accepted_at: now,
          badges: [],
          contributions: 0
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      await supabase
        .from(DATABASE_TABLES.CHARACTERS)
        .update({ guild_id: guildId, updated_at: now })
        .eq('id', characterId)
        .eq('user_id', foundingCharacter.userId);

      await this.recalculateGuildStatus(guildId);

      return {
        success: true,
        data: this.transformMembershipFromDb(data),
        message: 'Founding member added.'
      };
    } catch (error) {
      console.error('Error adding founding member:', error);
      return { success: false, error: 'Failed to add founding member' };
    }
  }

  async applyToGuild(guildId: string, userId: string, requestedRoleCategory: 'Officer' | 'Member' | 'Ally', characterId?: string, message = ''): Promise<ApiResponse<GuildApplication>> {
    try {
      if (!characterId) {
        return { success: false, error: 'Choose a character before applying.' };
      }

      const character = await this.getLeaderCharacter(userId, characterId);
      if (!character) {
        return { success: false, error: 'That character was not found on your account.' };
      }

      const existingGuildMembership = await this.characterHasGuildMembership(guildId, characterId);
      if (existingGuildMembership) {
        return { success: false, error: 'That character is already in this guild.' };
      }

      if (requestedRoleCategory !== 'Ally') {
        const coreMembership = await this.characterHasCoreMembership(characterId);
        if (coreMembership) {
          return { success: false, error: 'That character can only be a leader, subleader, officer, or member of one guild.' };
        }
      }

      const supabase = this.dbService.getClient();
      const { data, error } = await supabase
        .from('guild_applications')
        .insert({
          guild_id: guildId,
          user_id: userId,
          character_id: characterId,
          requested_role_category: requestedRoleCategory,
          message,
          status: 'Pending'
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        data: this.transformApplicationFromDb(data),
        message: 'Application submitted.'
      };
    } catch (error) {
      console.error('Error applying to guild:', error);
      return { success: false, error: 'Failed to submit application' };
    }
  }

  async updateMemberRole(guildId: string, leaderId: string, membershipId: string, roleCategory: 'Subleader' | 'Officer' | 'Member' | 'Ally', roleTitle: string): Promise<ApiResponse<GuildMembership>> {
    try {
      const guild = await this.getGuildById(guildId);
      if (!guild || guild.leaderId !== leaderId) {
        return { success: false, error: 'Only the guild leader can update roles.' };
      }

      const { data, error } = await this.dbService.getClient().rpc('update_guild_member_role_command', {
        p_guild_id: guildId,
        p_membership_id: membershipId,
        p_role_category: roleCategory,
        p_role_title: roleTitle
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (!data) {
        return { success: false, error: 'Guild membership was not found.' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating member role:', error);
      return { success: false, error: 'Failed to update role' };
    }
  }

  async acceptApplication(guildId: string, leaderId: string, applicationId: string): Promise<ApiResponse<GuildMembership>> {
    try {
      const guild = await this.getGuildById(guildId);
      if (!guild || guild.leaderId !== leaderId) {
        return { success: false, error: 'Only the guild leader can accept applications.' };
      }

      const supabase = this.dbService.getClient();
      const { data: application, error: applicationError } = await supabase
        .from('guild_applications')
        .select('*')
        .eq('id', applicationId)
        .eq('guild_id', guildId)
        .eq('status', 'Pending')
        .single();

      if (applicationError || !application) {
        return { success: false, error: applicationError?.message || 'Application not found.' };
      }

      if (application.requested_role_category !== 'Ally') {
        const coreMembership = application.character_id
          ? await this.characterHasCoreMembership(application.character_id)
          : true;
        if (coreMembership) {
          return { success: false, error: 'That character is already a leader, subleader, officer, or member of another guild.' };
        }
      }

      const now = new Date().toISOString();
      const roleCategory = application.requested_role_category as 'Officer' | 'Member' | 'Ally';
      const role = roleCategory === 'Officer' ? 'officer' : 'member';
      const { data, error } = await supabase
        .from('guild_memberships')
        .insert({
          guild_id: guildId,
          user_id: application.user_id,
          character_id: application.character_id,
          role,
          role_category: roleCategory,
          role_title: roleCategory,
          membership_status: 'Active',
          invited_by: leaderId,
          joined_at: now,
          accepted_at: now,
          badges: [],
          contributions: 0
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      await supabase
        .from('guild_applications')
        .update({ status: 'Accepted', updated_at: now })
        .eq('id', applicationId);

      if (application.character_id) {
        await supabase
          .from(DATABASE_TABLES.CHARACTERS)
          .update({ guild_id: guildId, updated_at: now })
          .eq('id', application.character_id)
          .eq('user_id', application.user_id);
      }

      await this.recalculateGuildStatus(guildId);

      return {
        success: true,
        data: this.transformMembershipFromDb(data),
        message: 'Application accepted.'
      };
    } catch (error) {
      console.error('Error accepting application:', error);
      return { success: false, error: 'Failed to accept application' };
    }
  }

  async rejectApplication(guildId: string, leaderId: string, applicationId: string): Promise<ApiResponse<boolean>> {
    try {
      const guild = await this.getGuildById(guildId);
      if (!guild || guild.leaderId !== leaderId) {
        return { success: false, error: 'Only the guild leader can reject applications.' };
      }

      const { error } = await this.dbService.getClient()
        .from('guild_applications')
        .update({ status: 'Rejected', updated_at: new Date().toISOString() })
        .eq('id', applicationId)
        .eq('guild_id', guildId)
        .eq('status', 'Pending');

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: true, message: 'Application rejected.' };
    } catch (error) {
      console.error('Error rejecting application:', error);
      return { success: false, error: 'Failed to reject application' };
    }
  }

  async leaveGuild(guildId: string, userId: string, membershipId: string): Promise<ApiResponse<boolean>> {
    try {
      const supabase = this.dbService.getClient();
      const { data: membership, error: membershipError } = await supabase
        .from('guild_memberships')
        .select('*')
        .eq('id', membershipId)
        .eq('guild_id', guildId)
        .eq('user_id', userId)
        .single();

      if (membershipError || !membership) {
        return { success: false, error: membershipError?.message || 'Guild membership was not found.' };
      }

      if (membership.role_category === 'Leader') {
        return { success: false, error: 'Guild leaders must transfer leadership before leaving.' };
      }

      const { error } = await supabase
        .from('guild_memberships')
        .delete()
        .eq('id', membershipId)
        .eq('guild_id', guildId)
        .eq('user_id', userId);

      if (error) {
        return { success: false, error: error.message };
      }

      if (membership.character_id) {
        await supabase
          .from(DATABASE_TABLES.CHARACTERS)
          .update({ guild_id: null, updated_at: new Date().toISOString() })
          .eq('id', membership.character_id)
          .eq('user_id', userId);
      }

      await this.recalculateGuildStatus(guildId);

      return { success: true, data: true, message: 'You left the guild.' };
    } catch (error) {
      console.error('Error leaving guild:', error);
      return { success: false, error: 'Failed to leave guild' };
    }
  }

  private async getGuildById(guildId: string): Promise<Guild | null> {
    const supabase = this.dbService.getClient();
    const { data, error } = await supabase
      .from(DATABASE_TABLES.GUILDS)
      .select('*')
      .eq('id', guildId)
      .single();

    if (error || !data) return null;
    return this.transformGuildFromDb(data);
  }

  private async getLeaderCharacter(userId: string, characterId: string): Promise<Character | null> {
    const supabase = this.dbService.getClient();
    const { data, error } = await supabase
      .from(DATABASE_TABLES.CHARACTERS)
      .select('*')
      .eq('id', characterId)
      .eq('user_id', userId)
      .single();

    if (error || !data) return null;

    return this.transformCharacterFromDb(data);
  }

  private async getCharacterById(characterId: string): Promise<Character | null> {
    const supabase = this.dbService.getClient();
    const { data, error } = await supabase
      .from(DATABASE_TABLES.CHARACTERS)
      .select('*')
      .eq('id', characterId)
      .single();

    if (error || !data) return null;
    return this.transformCharacterFromDb(data);
  }

  private async characterHasActiveLeadership(characterId: string): Promise<boolean> {
    const supabase = this.dbService.getClient();
    const { count } = await supabase
      .from(DATABASE_TABLES.GUILDS)
      .select('*', { count: 'exact', head: true })
      .eq('leader_character_id', characterId)
      .neq('status', 'Inactive');

    return Boolean(count && count > 0);
  }

  private async characterHasCoreMembership(characterId: string): Promise<boolean> {
    const supabase = this.dbService.getClient();
    const { count } = await supabase
      .from('guild_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('character_id', characterId)
      .eq('membership_status', 'Active')
      .in('role_category', ['Leader', 'Subleader', 'Officer', 'Member']);

    return Boolean(count && count > 0);
  }

  private async characterHasGuildMembership(guildId: string, characterId: string): Promise<boolean> {
    const supabase = this.dbService.getClient();
    const { count } = await supabase
      .from('guild_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .eq('character_id', characterId)
      .eq('membership_status', 'Active');

    return Boolean(count && count > 0);
  }

  private async recalculateGuildStatus(guildId: string): Promise<void> {
    const supabase = this.dbService.getClient();
    const { count } = await supabase
      .from('guild_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .eq('membership_status', 'Active')
      .in('role_category', ['Leader', 'Subleader', 'Officer', 'Member']);

    const activeCount = count || 0;
    const guild = await this.getGuildById(guildId);
    const requiredFounderCount = guild?.foundingRequired ?? 3;
    await supabase
      .from(DATABASE_TABLES.GUILDS)
      .update({
        member_count: activeCount,
        status: activeCount >= requiredFounderCount + 1 ? 'Active' : 'Recruiting',
        founded_at: activeCount >= requiredFounderCount + 1 ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', guildId);
  }

  private transformGuildFromDb(dbGuild: GuildRow): Guild {
    const memberships = (dbGuild.memberships || []).map((membership) => this.transformMembershipFromDb(membership));
    const applications = (dbGuild.applications || []).map((application) => this.transformApplicationFromDb(application));

    return {
      _id: dbGuild.id,
      name: dbGuild.name,
      titleHtml: dbGuild.title_html || plainTextToRichHtml(dbGuild.name),
      titleAnimation: dbGuild.title_animation || 'none',
      subtitle: dbGuild.subtitle || '',
      description: dbGuild.description,
      descriptionHtml: dbGuild.description_html || plainTextToRichHtml(dbGuild.description),
      type: dbGuild.type || 'Adventuring',
      leaderId: dbGuild.leader_id,
      createdBy: dbGuild.created_by,
      leaderCharacterId: dbGuild.leader_character_id,
      leaderCharacterName: dbGuild.leader_character?.name,
      logo: dbGuild.logo,
      emblemUrl: isSafeExternalImageUrl(dbGuild.emblem_url || dbGuild.logo || '') ? dbGuild.emblem_url || dbGuild.logo : undefined,
      region: dbGuild.region || '',
      fontFamily: dbGuild.font_family || 'cinzel',
      fontColor: dbGuild.font_color || defaultGuildPalette.fontColor,
      baseColor: dbGuild.base_color || defaultGuildPalette.baseColor,
      accentColor: dbGuild.accent_color || defaultGuildPalette.accentColor,
      surfaceColor: dbGuild.surface_color || defaultGuildPalette.surfaceColor,
      layoutStyle: dbGuild.layout_style || 'chronicle',
      rosterDisplay: dbGuild.roster_display || 'ledger',
      sectionVisibility: { ...defaultGuildSectionVisibility, ...(dbGuild.section_visibility || {}) },
      headquartersName: dbGuild.headquarters_name || '',
      headquartersTitle: dbGuild.headquarters_title || '',
      headquartersTitleHtml: dbGuild.headquarters_title_html || plainTextToRichHtml(dbGuild.headquarters_title || ''),
      headquartersDescription: dbGuild.headquarters_description || '',
      headquartersDescriptionHtml: dbGuild.headquarters_description_html || plainTextToRichHtml(dbGuild.headquarters_description || ''),
      headquartersImageUrl: isSafeExternalImageUrl(dbGuild.headquarters_image_url || '') ? dbGuild.headquarters_image_url : undefined,
      messageBoardHtml: dbGuild.message_board_html || '',
      messageBoardUpdatedAt: dbGuild.message_board_updated_at ? new Date(dbGuild.message_board_updated_at) : undefined,
      guestbookEnabled: dbGuild.guestbook_enabled ?? true,
      influencePoints: dbGuild.influence_points || 0,
      roleLabels: { ...defaultGuildRoleLabels, ...(dbGuild.role_labels || {}) },
      established: new Date(dbGuild.created_at),
      status: dbGuild.status || 'Recruiting',
      recruitmentStatus: dbGuild.recruitment_status || 'open',
      requirements: dbGuild.requirements || '',
      badges: dbGuild.badges || [],
      recentActivity: dbGuild.recent_activity || '',
      rank: dbGuild.rank || 'bronze',
      memberCount: dbGuild.member_count || memberships.filter((membership: GuildMembership) => membership.membershipStatus === 'Active').length,
      maxMembers: dbGuild.max_members || 50,
      foundingRequired: dbGuild.founding_required || 3,
      foundedAt: dbGuild.founded_at ? new Date(dbGuild.founded_at) : undefined,
      memberships,
      applications,
      createdAt: new Date(dbGuild.created_at),
      updatedAt: new Date(dbGuild.updated_at)
    };
  }

  private transformMembershipFromDb(dbMembership: GuildMembershipRow): GuildMembership {
    return {
      _id: dbMembership.id,
      guildId: dbMembership.guild_id,
      userId: dbMembership.user_id,
      characterId: dbMembership.character_id,
      role: dbMembership.role,
      roleCategory: dbMembership.role_category || 'Member',
      roleTitle: dbMembership.role_title,
      membershipStatus: dbMembership.membership_status || 'Active',
      joinDate: new Date(dbMembership.joined_at),
      acceptedAt: dbMembership.accepted_at ? new Date(dbMembership.accepted_at) : undefined,
      invitedBy: dbMembership.invited_by,
      badges: dbMembership.badges || [],
      contributions: dbMembership.contributions || 0,
      character: dbMembership.character ? this.transformCharacterFromDb(dbMembership.character) : undefined
    };
  }

  private transformApplicationFromDb(dbApplication: GuildApplicationRow): GuildApplication {
    return {
      _id: dbApplication.id,
      guildId: dbApplication.guild_id,
      userId: dbApplication.user_id,
      characterId: dbApplication.character_id,
      requestedRoleCategory: dbApplication.requested_role_category,
      message: dbApplication.message || '',
      status: dbApplication.status,
      createdAt: new Date(dbApplication.created_at),
      updatedAt: new Date(dbApplication.updated_at),
      character: dbApplication.character ? this.transformCharacterFromDb(dbApplication.character) : undefined
    };
  }

  private transformCheckinFromDb(row: GuildCheckinRow): GuildCheckin {
    return {
      _id: row.id,
      guildId: row.guild_id,
      characterId: row.character_id,
      userId: row.user_id,
      checkinDate: row.checkin_date,
      influenceAwarded: row.influence_awarded,
      createdAt: new Date(row.created_at),
      character: row.character ? this.transformCharacterFromDb(row.character) : undefined
    };
  }

  private transformGuestbookFromDb(row: GuildGuestbookRow): GuildGuestbookEntry {
    return {
      _id: row.id,
      guildId: row.guild_id,
      authorUserId: row.author_user_id,
      characterId: row.character_id,
      message: row.message,
      isHidden: Boolean(row.hidden_at),
      hiddenAt: row.hidden_at ? new Date(row.hidden_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      character: row.character ? this.transformCharacterFromDb(row.character) : undefined
    };
  }

  private transformCharacterFromDb(dbCharacter: GuildCharacterRow): Character {
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
      foundryFileName: dbCharacter.foundry_file_name,
      backstory: dbCharacter.backstory,
      notes: dbCharacter.notes,
      isActive: dbCharacter.is_active,
      guildId: dbCharacter.guild_id,
      profileSubtitle: '',
      profileFontFamily: 'cinzel',
      profileFontColor: '#f4efe6',
      profileBaseColor: '#18201f',
      profileAccentColor: '#c9954a',
      profileSurfaceColor: '#1d2321',
      profileLayoutStyle: 'chronicle',
      profileSectionVisibility: {
        portrait: true,
        details: true,
        abilityMatrix: true,
        backstory: true,
        notes: true,
        journal: true,
        relationships: true
      },
      createdAt: new Date(dbCharacter.created_at),
      updatedAt: new Date(dbCharacter.updated_at)
    };
  }
}

export default GuildService;
