import DatabaseService from './database';
import { DATABASE_TABLES } from '../config/database';
import { ApiResponse, Character, Guild, GuildApplication, GuildMembership } from '../types/database';

export interface CreateGuildInput {
  name: string;
  description: string;
  leaderId: string;
  leaderCharacterId: string;
  type?: string;
  region?: string;
  requirements?: string;
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
          memberships:guild_memberships(*),
          applications:guild_applications(*)
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

      const existingLeadership = await this.userHasActiveLeadership(input.leaderId);
      if (existingLeadership) {
        return { success: false, error: 'A user can only lead one active or recruiting guild.' };
      }

      const coreMembership = await this.userHasCoreMembership(input.leaderId);
      if (coreMembership) {
        return { success: false, error: 'A user can only be a leader, officer, or member of one guild.' };
      }

      const now = new Date().toISOString();
      const { data: guild, error: guildError } = await supabase
        .from(DATABASE_TABLES.GUILDS)
        .insert({
          name: input.name,
          description: input.description,
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
          rank: 'bronze',
          badges: [],
          recent_activity: 'Guild charter created.',
          founding_required: 4,
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

  async addFoundingMember(guildId: string, leaderId: string, userId: string, roleTitle = 'Founding Member'): Promise<ApiResponse<GuildMembership>> {
    try {
      const supabase = this.dbService.getClient();
      const guild = await this.getGuildById(guildId);
      if (!guild || guild.leaderId !== leaderId) {
        return { success: false, error: 'Only the guild leader can add founding members.' };
      }

      const coreMembership = await this.userHasCoreMembership(userId);
      if (coreMembership) {
        return { success: false, error: 'That user is already a leader, officer, or member of another guild.' };
      }

      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('guild_memberships')
        .insert({
          guild_id: guildId,
          user_id: userId,
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
      if (requestedRoleCategory !== 'Ally') {
        const coreMembership = await this.userHasCoreMembership(userId);
        if (coreMembership) {
          return { success: false, error: 'You can only be a leader, officer, or member of one guild.' };
        }
      }

      const supabase = this.dbService.getClient();
      const { data, error } = await supabase
        .from('guild_applications')
        .insert({
          guild_id: guildId,
          user_id: userId,
          character_id: characterId || null,
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

  async updateMemberRole(guildId: string, leaderId: string, membershipId: string, roleCategory: 'Officer' | 'Member' | 'Ally', roleTitle: string): Promise<ApiResponse<GuildMembership>> {
    try {
      const guild = await this.getGuildById(guildId);
      if (!guild || guild.leaderId !== leaderId) {
        return { success: false, error: 'Only the guild leader can update roles.' };
      }

      const supabase = this.dbService.getClient();
      const role = roleCategory === 'Officer' ? 'officer' : 'member';
      const { data, error } = await supabase
        .from('guild_memberships')
        .update({
          role,
          role_category: roleCategory,
          role_title: roleTitle
        })
        .eq('id', membershipId)
        .eq('guild_id', guildId)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: this.transformMembershipFromDb(data) };
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
        const coreMembership = await this.userHasCoreMembership(application.user_id);
        if (coreMembership) {
          return { success: false, error: 'That user is already a leader, officer, or member of another guild.' };
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

    return {
      _id: data.id,
      userId: data.user_id,
      name: data.name,
      class: data.class,
      level: data.level,
      race: data.race,
      ancestry: data.ancestry,
      heritage: data.heritage,
      background: data.background,
      stats: data.stats,
      equipment: data.equipment,
      foundryJson: data.foundry_json,
      foundryFileName: data.foundry_file_name,
      backstory: data.backstory,
      notes: data.notes,
      isActive: data.is_active,
      guildId: data.guild_id,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    };
  }

  private async userHasActiveLeadership(userId: string): Promise<boolean> {
    const supabase = this.dbService.getClient();
    const { count } = await supabase
      .from(DATABASE_TABLES.GUILDS)
      .select('*', { count: 'exact', head: true })
      .eq('leader_id', userId)
      .neq('status', 'Inactive');

    return Boolean(count && count > 0);
  }

  private async userHasCoreMembership(userId: string): Promise<boolean> {
    const supabase = this.dbService.getClient();
    const { count } = await supabase
      .from('guild_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('membership_status', 'Active')
      .in('role_category', ['Leader', 'Officer', 'Member']);

    return Boolean(count && count > 0);
  }

  private async recalculateGuildStatus(guildId: string): Promise<void> {
    const supabase = this.dbService.getClient();
    const { count } = await supabase
      .from('guild_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .eq('membership_status', 'Active')
      .in('role_category', ['Leader', 'Officer', 'Member']);

    const activeCount = count || 0;
    await supabase
      .from(DATABASE_TABLES.GUILDS)
      .update({
        member_count: activeCount,
        status: activeCount >= 4 ? 'Active' : 'Recruiting',
        founded_at: activeCount >= 4 ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', guildId);
  }

  private transformGuildFromDb(dbGuild: any): Guild {
    const memberships = (dbGuild.memberships || []).map((membership: any) => this.transformMembershipFromDb(membership));
    const applications = (dbGuild.applications || []).map((application: any) => this.transformApplicationFromDb(application));

    return {
      _id: dbGuild.id,
      name: dbGuild.name,
      description: dbGuild.description,
      type: dbGuild.type || 'Adventuring',
      leaderId: dbGuild.leader_id,
      createdBy: dbGuild.created_by,
      leaderCharacterId: dbGuild.leader_character_id,
      leaderCharacterName: dbGuild.leader_character?.name,
      logo: dbGuild.logo,
      region: dbGuild.region || '',
      established: new Date(dbGuild.created_at),
      status: dbGuild.status || 'Recruiting',
      recruitmentStatus: dbGuild.recruitment_status || 'open',
      requirements: dbGuild.requirements || '',
      badges: dbGuild.badges || [],
      recentActivity: dbGuild.recent_activity || '',
      rank: dbGuild.rank || 'bronze',
      memberCount: dbGuild.member_count || memberships.filter((membership: GuildMembership) => membership.membershipStatus === 'Active').length,
      maxMembers: dbGuild.max_members || 50,
      foundingRequired: dbGuild.founding_required || 4,
      foundedAt: dbGuild.founded_at ? new Date(dbGuild.founded_at) : undefined,
      memberships,
      applications,
      createdAt: new Date(dbGuild.created_at),
      updatedAt: new Date(dbGuild.updated_at)
    };
  }

  private transformMembershipFromDb(dbMembership: any): GuildMembership {
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
      contributions: dbMembership.contributions || 0
    };
  }

  private transformApplicationFromDb(dbApplication: any): GuildApplication {
    return {
      _id: dbApplication.id,
      guildId: dbApplication.guild_id,
      userId: dbApplication.user_id,
      characterId: dbApplication.character_id,
      requestedRoleCategory: dbApplication.requested_role_category,
      message: dbApplication.message || '',
      status: dbApplication.status,
      createdAt: new Date(dbApplication.created_at),
      updatedAt: new Date(dbApplication.updated_at)
    };
  }
}

export default GuildService;
