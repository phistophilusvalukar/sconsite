export type CampaignStatus = 'draft' | 'active' | 'archived';
export type ObjectiveStatus = 'unknown' | 'unstarted' | 'partial' | 'complete';
export type ObjectiveKind = 'main' | 'sub' | 'special';

export interface Campaign {
  id: string;
  name: string;
  slug: string;
  summary: string;
  status: CampaignStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ObjectiveComment {
  id: string;
  objectiveId: string;
  authorId?: string;
  authorName: string;
  createdAt: Date;
  updatedAt: Date;
  text: string;
}

export interface Objective {
  id: string;
  campaignId: string;
  title: string;
  description: string;
  status: ObjectiveStatus;
  kind: ObjectiveKind;
  sortOrder: number;
  parentId?: string;
  subObjectiveIds?: string[];
  comments: ObjectiveComment[];
}

export interface Party {
  id: string;
  campaignId: string;
  name: string;
  sortOrder: number;
  members: PartyMember[];
}

export interface PartyMember {
  id: string;
  partyId: string;
  name: string;
  characterName: string;
  profileHref: string;
  artUrl: string;
  sortOrder: number;
}

export interface Achievement {
  id: string;
  runId: string;
  objectiveId: string;
  objectiveTitle: string;
  objectiveKind: ObjectiveKind;
  status: Exclude<ObjectiveStatus, 'unknown'>;
  createdAt: Date;
}

export interface RunSummary {
  id: string;
  campaignId: string;
  partyId: string;
  runNumber: number;
  title: string;
  ranAt: Date;
  memberIds: string[];
  objectiveIds: string[];
  achievements: Achievement[];
}

export interface JournalEntry {
  id: string;
  campaignId: string;
  title: string;
  playerName: string;
  partyId: string;
  runId: string;
  authorId?: string;
  createdAt: Date;
  updatedAt: Date;
  text: string;
  achievementIds: string[];
}

export interface CampaignDetails {
  campaign: Campaign;
  objectives: Objective[];
  parties: Party[];
  runs: RunSummary[];
  journals: JournalEntry[];
}
