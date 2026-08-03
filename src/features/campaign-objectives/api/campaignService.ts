import { DATABASE_TABLES } from '../../../config/database';
import { ApiResponse } from '../../../types/database';
import DatabaseService from '../../../services/database';
import {
  type Achievement,
  type Campaign,
  type CampaignDetails,
  type CampaignStatus,
  type JournalEntry,
  type Objective,
  type ObjectiveComment,
  type ObjectiveKind,
  type ObjectiveStatus,
  type Party,
  type PartyMember,
  type RunComment,
  type RunSummary
} from '../data/campaignObjectives';

export interface SaveCampaignInput {
  name: string;
  summary: string;
  status: CampaignStatus;
  createdBy?: string;
}

export interface SaveObjectiveInput {
  campaignId: string;
  title: string;
  description: string;
  kind: ObjectiveKind;
  status: ObjectiveStatus;
  parentId?: string;
}

export interface SavePartyInput {
  campaignId: string;
  name: string;
}

export interface SavePartyMemberInput {
  partyId: string;
  name: string;
  characterName: string;
  profileHref: string;
  artUrl: string;
  userId?: string;
  characterId?: string;
}

export interface SaveRunInput {
  campaignId: string;
  partyId: string;
  title: string;
  ranAt: Date;
  memberIds: string[];
  objectiveIds: string[];
}

export interface SaveJournalInput {
  campaignId: string;
  partyId: string;
  runId: string;
  authorId: string;
  characterId: string;
  playerName: string;
  title: string;
  text: string;
  achievementIds: string[];
}

export interface SaveRunCommentInput {
  runId: string;
  authorId: string;
  characterId: string;
  characterName: string;
  text: string;
}

class CampaignService {
  private static instance: CampaignService;
  private dbService = DatabaseService.getInstance();

  static getInstance(): CampaignService {
    if (!CampaignService.instance) CampaignService.instance = new CampaignService();
    return CampaignService.instance;
  }

  async getCampaigns(): Promise<ApiResponse<Campaign[]>> {
    try {
      const { data, error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.CAMPAIGNS)
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) return { success: false, error: error.message };
      return { success: true, data: (data || []).map(row => this.transformCampaign(row)) };
    } catch (error) {
      console.error('Error loading campaigns:', error);
      return { success: false, error: 'Failed to load campaigns' };
    }
  }

  async getCampaignBySlug(slug: string): Promise<ApiResponse<CampaignDetails>> {
    try {
      const { data: campaignRow, error: campaignError } = await this.dbService.getClient()
        .from(DATABASE_TABLES.CAMPAIGNS)
        .select('*')
        .eq('slug', slug)
        .single();

      if (campaignError) return { success: false, error: campaignError.message };
      const campaign = this.transformCampaign(campaignRow);
      const campaignId = campaign.id;

      const [objectivesResult, commentsResult, partiesResult, membersResult, runsResult, runObjectivesResult, achievementsResult, runCommentsResult, journalsResult] = await Promise.all([
        this.dbService.getClient().from(DATABASE_TABLES.CAMPAIGN_OBJECTIVES).select('*').eq('campaign_id', campaignId).order('sort_order'),
        this.dbService.getClient().from(DATABASE_TABLES.CAMPAIGN_OBJECTIVE_COMMENTS).select('*').order('created_at'),
        this.dbService.getClient().from(DATABASE_TABLES.CAMPAIGN_PARTIES).select('*').eq('campaign_id', campaignId).order('sort_order'),
        this.dbService.getClient().from(DATABASE_TABLES.CAMPAIGN_PARTY_MEMBERS).select('*').order('sort_order'),
        this.dbService.getClient().from(DATABASE_TABLES.CAMPAIGN_RUNS).select('*').eq('campaign_id', campaignId).order('run_number'),
        this.dbService.getClient().from(DATABASE_TABLES.CAMPAIGN_RUN_OBJECTIVES).select('*'),
        this.dbService.getClient().from(DATABASE_TABLES.CAMPAIGN_ACHIEVEMENTS).select('*').order('created_at'),
        this.dbService.getClient().from(DATABASE_TABLES.CAMPAIGN_RUN_COMMENTS).select('*').order('created_at'),
        this.dbService.getClient().from(DATABASE_TABLES.CAMPAIGN_JOURNAL_ENTRIES).select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false })
      ]);

      const firstError = [objectivesResult, commentsResult, partiesResult, membersResult, runsResult, runObjectivesResult, achievementsResult, runCommentsResult, journalsResult]
        .find(result => result.error)?.error;
      if (firstError) return { success: false, error: firstError.message };

      const commentsByObjective = groupBy(commentsResult.data || [], row => String(row.objective_id));
      const childIdsByParent = groupBy(objectivesResult.data || [], row => String(row.parent_id || ''));
      const objectives = (objectivesResult.data || []).map(row => this.transformObjective(row, commentsByObjective.get(String(row.id)) || [], childIdsByParent.get(String(row.id)) || []));
      const membersByParty = groupBy(membersResult.data || [], row => String(row.party_id));
      const parties = (partiesResult.data || []).map(row => this.transformParty(row, membersByParty.get(String(row.id)) || []));
      const objectiveIdsByRun = groupBy(runObjectivesResult.data || [], row => String(row.run_id));
      const achievementsByRun = groupBy(achievementsResult.data || [], row => String(row.run_id));
      const commentsByRun = groupBy(runCommentsResult.data || [], row => String(row.run_id));
      const runs = (runsResult.data || []).map(row => this.transformRun(row, objectiveIdsByRun.get(String(row.id)) || [], achievementsByRun.get(String(row.id)) || [], commentsByRun.get(String(row.id)) || []));
      const journals = (journalsResult.data || []).map(row => this.transformJournal(row));

      return { success: true, data: { campaign, objectives, parties, runs, journals } };
    } catch (error) {
      console.error('Error loading campaign details:', error);
      return { success: false, error: 'Failed to load campaign' };
    }
  }

  async createCampaign(input: SaveCampaignInput): Promise<ApiResponse<Campaign>> {
    const slug = await this.createUniqueCampaignSlug(input.name);
    const now = new Date().toISOString();
    const { data, error } = await this.dbService.getClient()
      .from(DATABASE_TABLES.CAMPAIGNS)
      .insert({
        name: input.name.trim(),
        slug,
        summary: input.summary.trim(),
        status: input.status,
        created_by: input.createdBy || null,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: this.transformCampaign(data), message: 'Campaign created.' };
  }

  async updateCampaign(campaignId: string, input: SaveCampaignInput): Promise<ApiResponse<boolean>> {
    const { error } = await this.dbService.getClient()
      .from(DATABASE_TABLES.CAMPAIGNS)
      .update({
        name: input.name.trim(),
        summary: input.summary.trim(),
        status: input.status,
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId);

    if (error) return { success: false, error: error.message };
    return { success: true, data: true };
  }

  async createObjective(input: SaveObjectiveInput): Promise<ApiResponse<boolean>> {
    const maxOrder = await this.getMaxSort(DATABASE_TABLES.CAMPAIGN_OBJECTIVES, input.campaignId);
    const { error } = await this.dbService.getClient()
      .from(DATABASE_TABLES.CAMPAIGN_OBJECTIVES)
      .insert({
        campaign_id: input.campaignId,
        parent_id: input.parentId || null,
        title: input.title.trim(),
        description: input.description.trim(),
        kind: input.kind,
        status: input.status,
        sort_order: maxOrder + 1
      });
    if (error) return { success: false, error: error.message };
    return { success: true, data: true };
  }

  async updateObjective(objectiveId: string, input: Omit<SaveObjectiveInput, 'campaignId'>): Promise<ApiResponse<boolean>> {
    const { error } = await this.dbService.getClient()
      .from(DATABASE_TABLES.CAMPAIGN_OBJECTIVES)
      .update({
        parent_id: input.parentId || null,
        title: input.title.trim(),
        description: input.description.trim(),
        kind: input.kind,
        status: input.status,
        updated_at: new Date().toISOString()
      })
      .eq('id', objectiveId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: true };
  }

  async addObjectiveComment(objectiveId: string, authorName: string, text: string, authorId?: string): Promise<ApiResponse<boolean>> {
    const { error } = await this.dbService.getClient()
      .from(DATABASE_TABLES.CAMPAIGN_OBJECTIVE_COMMENTS)
      .insert({
        objective_id: objectiveId,
        author_id: authorId || null,
        author_name: authorName.trim(),
        body: text.trim()
      });
    if (error) return { success: false, error: error.message };
    return { success: true, data: true };
  }

  async createParty(input: SavePartyInput): Promise<ApiResponse<boolean>> {
    const maxOrder = await this.getMaxSort(DATABASE_TABLES.CAMPAIGN_PARTIES, input.campaignId);
    const { error } = await this.dbService.getClient()
      .from(DATABASE_TABLES.CAMPAIGN_PARTIES)
      .insert({ campaign_id: input.campaignId, name: input.name.trim(), sort_order: maxOrder + 1 });
    if (error) return { success: false, error: error.message };
    return { success: true, data: true };
  }

  async updateParty(partyId: string, name: string): Promise<ApiResponse<boolean>> {
    const { error } = await this.dbService.getClient()
      .from(DATABASE_TABLES.CAMPAIGN_PARTIES)
      .update({ name: name.trim(), updated_at: new Date().toISOString() })
      .eq('id', partyId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: true };
  }

  async createPartyMember(input: SavePartyMemberInput): Promise<ApiResponse<boolean>> {
    const maxOrder = await this.getMaxMemberSort(input.partyId);
    const { error } = await this.dbService.getClient()
      .from(DATABASE_TABLES.CAMPAIGN_PARTY_MEMBERS)
      .insert({
        party_id: input.partyId,
        player_name: input.name.trim(),
        character_name: input.characterName.trim(),
        profile_href: input.profileHref.trim(),
        art_url: input.artUrl.trim(),
        user_id: input.userId || null,
        character_id: input.characterId || null,
        sort_order: maxOrder + 1
      });
    if (error) return { success: false, error: error.message };
    return { success: true, data: true };
  }

  async updatePartyMember(memberId: string, input: Omit<SavePartyMemberInput, 'partyId'>): Promise<ApiResponse<boolean>> {
    const { error } = await this.dbService.getClient()
      .from(DATABASE_TABLES.CAMPAIGN_PARTY_MEMBERS)
      .update({
        player_name: input.name.trim(),
        character_name: input.characterName.trim(),
        profile_href: input.profileHref.trim(),
        art_url: input.artUrl.trim(),
        user_id: input.userId || null,
        character_id: input.characterId || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', memberId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: true };
  }

  async updateRunMembers(runId: string, memberIds: string[]): Promise<ApiResponse<boolean>> {
    const { error } = await this.dbService.getClient()
      .from(DATABASE_TABLES.CAMPAIGN_RUNS)
      .update({ member_ids: memberIds, updated_at: new Date().toISOString() })
      .eq('id', runId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: true };
  }

  async createRun(input: SaveRunInput, objectives: Objective[]): Promise<ApiResponse<boolean>> {
    const supabase = this.dbService.getClient();
    const runNumber = await this.getNextRunNumber(input.partyId);
    const { data: run, error } = await supabase
      .from(DATABASE_TABLES.CAMPAIGN_RUNS)
      .insert({
        campaign_id: input.campaignId,
        party_id: input.partyId,
        run_number: runNumber,
        title: input.title.trim(),
        ran_at: input.ranAt.toISOString(),
        member_ids: input.memberIds
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    const runId = String(run.id);
    if (input.objectiveIds.length > 0) {
      const { error: runObjectiveError } = await supabase
        .from(DATABASE_TABLES.CAMPAIGN_RUN_OBJECTIVES)
        .insert(input.objectiveIds.map(objectiveId => ({ run_id: runId, objective_id: objectiveId })));
      if (runObjectiveError) return { success: false, error: runObjectiveError.message };

      const achievements = input.objectiveIds.flatMap(objectiveId => {
        const objective = objectives.find(item => item.id === objectiveId);
        return objective && objective.status !== 'unknown'
          ? [{
              run_id: runId,
              objective_id: objective.id,
              objective_title: objective.title,
              objective_kind: objective.kind,
              status: objective.status
            }]
          : [];
      });
      if (achievements.length > 0) {
        const { error: achievementError } = await supabase
          .from(DATABASE_TABLES.CAMPAIGN_ACHIEVEMENTS)
          .insert(achievements);
        if (achievementError) return { success: false, error: achievementError.message };
      }
    }
    return { success: true, data: true };
  }

  async createJournal(input: SaveJournalInput): Promise<ApiResponse<boolean>> {
    const { error } = await this.dbService.getClient()
      .from(DATABASE_TABLES.CAMPAIGN_JOURNAL_ENTRIES)
      .insert({
        campaign_id: input.campaignId,
        party_id: input.partyId,
        run_id: input.runId,
        author_id: input.authorId,
        character_id: input.characterId,
        player_name: input.playerName.trim(),
        title: input.title.trim(),
        body: input.text.trim(),
        achievement_ids: input.achievementIds
      });
    if (error) return { success: false, error: error.message };
    return { success: true, data: true };
  }

  async addRunComment(input: SaveRunCommentInput): Promise<ApiResponse<boolean>> {
    const { error } = await this.dbService.getClient()
      .from(DATABASE_TABLES.CAMPAIGN_RUN_COMMENTS)
      .insert({
        run_id: input.runId,
        author_id: input.authorId,
        character_id: input.characterId,
        character_name: input.characterName,
        body: input.text.trim()
      });
    if (error) return { success: false, error: error.message };
    return { success: true, data: true };
  }

  private async createUniqueCampaignSlug(name: string) {
    const baseSlug = slugify(name);
    let slug = baseSlug;
    let index = 2;
    while (await this.campaignSlugExists(slug)) {
      slug = `${baseSlug}-${index}`;
      index += 1;
    }
    return slug;
  }

  private async campaignSlugExists(slug: string) {
    const { data } = await this.dbService.getClient()
      .from(DATABASE_TABLES.CAMPAIGNS)
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    return Boolean(data);
  }

  private async getMaxSort(table: string, campaignId: string) {
    const { data } = await this.dbService.getClient()
      .from(table)
      .select('sort_order')
      .eq('campaign_id', campaignId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    return Number(data?.sort_order || 0);
  }

  private async getMaxMemberSort(partyId: string) {
    const { data } = await this.dbService.getClient()
      .from(DATABASE_TABLES.CAMPAIGN_PARTY_MEMBERS)
      .select('sort_order')
      .eq('party_id', partyId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    return Number(data?.sort_order || 0);
  }

  private async getNextRunNumber(partyId: string) {
    const { data } = await this.dbService.getClient()
      .from(DATABASE_TABLES.CAMPAIGN_RUNS)
      .select('run_number')
      .eq('party_id', partyId)
      .order('run_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    return Number(data?.run_number || 0) + 1;
  }

  private transformCampaign(row: Record<string, unknown>): Campaign {
    return {
      id: String(row.id),
      name: String(row.name || ''),
      slug: String(row.slug || ''),
      summary: String(row.summary || ''),
      status: String(row.status || 'draft') as CampaignStatus,
      createdAt: new Date(String(row.created_at)),
      updatedAt: new Date(String(row.updated_at))
    };
  }

  private transformObjective(row: Record<string, unknown>, commentRows: Record<string, unknown>[], childRows: Record<string, unknown>[]): Objective {
    return {
      id: String(row.id),
      campaignId: String(row.campaign_id),
      parentId: row.parent_id ? String(row.parent_id) : undefined,
      title: String(row.title || ''),
      description: String(row.description || ''),
      status: String(row.status || 'unknown') as ObjectiveStatus,
      kind: String(row.kind || 'special') as ObjectiveKind,
      sortOrder: Number(row.sort_order || 0),
      subObjectiveIds: childRows.map(child => String(child.id)),
      comments: commentRows.map(comment => this.transformComment(comment))
    };
  }

  private transformComment(row: Record<string, unknown>): ObjectiveComment {
    return {
      id: String(row.id),
      objectiveId: String(row.objective_id),
      authorId: row.author_id ? String(row.author_id) : undefined,
      authorName: String(row.author_name || 'Player'),
      text: String(row.body || ''),
      createdAt: new Date(String(row.created_at)),
      updatedAt: new Date(String(row.updated_at))
    };
  }

  private transformParty(row: Record<string, unknown>, memberRows: Record<string, unknown>[]): Party {
    return {
      id: String(row.id),
      campaignId: String(row.campaign_id),
      name: String(row.name || ''),
      sortOrder: Number(row.sort_order || 0),
      members: memberRows.map(member => this.transformMember(member))
    };
  }

  private transformMember(row: Record<string, unknown>): PartyMember {
    const characterName = String(row.character_name || row.player_name || '');
    return {
      id: String(row.id),
      partyId: String(row.party_id),
      userId: row.user_id ? String(row.user_id) : undefined,
      characterId: row.character_id ? String(row.character_id) : undefined,
      name: String(row.player_name || ''),
      characterName,
      profileHref: String(row.profile_href || `/characters?search=${encodeURIComponent(characterName)}`),
      artUrl: String(row.art_url || '/npc-placeholder.png'),
      sortOrder: Number(row.sort_order || 0)
    };
  }

  private transformRun(row: Record<string, unknown>, objectiveRows: Record<string, unknown>[], achievementRows: Record<string, unknown>[], commentRows: Record<string, unknown>[]): RunSummary {
    return {
      id: String(row.id),
      campaignId: String(row.campaign_id),
      partyId: String(row.party_id),
      runNumber: Number(row.run_number || 1),
      title: String(row.title || ''),
      ranAt: new Date(String(row.ran_at)),
      memberIds: Array.isArray(row.member_ids) ? row.member_ids.map(String) : [],
      objectiveIds: objectiveRows.map(item => String(item.objective_id)),
      achievements: achievementRows.map(achievement => this.transformAchievement(achievement)),
      comments: commentRows.map(comment => this.transformRunComment(comment))
    };
  }

  private transformRunComment(row: Record<string, unknown>): RunComment {
    return {
      id: String(row.id),
      runId: String(row.run_id),
      authorId: String(row.author_id),
      characterId: String(row.character_id),
      characterName: String(row.character_name || 'Character'),
      text: String(row.body || ''),
      createdAt: new Date(String(row.created_at)),
      updatedAt: new Date(String(row.updated_at))
    };
  }

  private transformAchievement(row: Record<string, unknown>): Achievement {
    return {
      id: String(row.id),
      runId: String(row.run_id),
      objectiveId: String(row.objective_id),
      objectiveTitle: String(row.objective_title || ''),
      objectiveKind: String(row.objective_kind || 'special') as ObjectiveKind,
      status: String(row.status || 'unstarted') as Exclude<ObjectiveStatus, 'unknown'>,
      createdAt: new Date(String(row.created_at))
    };
  }

  private transformJournal(row: Record<string, unknown>): JournalEntry {
    return {
      id: String(row.id),
      campaignId: String(row.campaign_id),
      partyId: String(row.party_id),
      runId: String(row.run_id),
      authorId: row.author_id ? String(row.author_id) : undefined,
      characterId: row.character_id ? String(row.character_id) : undefined,
      playerName: String(row.player_name || ''),
      title: String(row.title || ''),
      text: String(row.body || ''),
      achievementIds: Array.isArray(row.achievement_ids) ? row.achievement_ids.map(String) : [],
      createdAt: new Date(String(row.created_at)),
      updatedAt: new Date(String(row.updated_at))
    };
  }
}

function groupBy<T>(rows: T[], getKey: (row: T) => string) {
  return rows.reduce((groups, row) => {
    const key = getKey(row);
    const existing = groups.get(key) || [];
    groups.set(key, [...existing, row]);
    return groups;
  }, new Map<string, T[]>());
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/['"]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `campaign-${Date.now()}`;
}

export default CampaignService;
