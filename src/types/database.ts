export interface UserProfile {
  _id?: string;
  authUserId: string;
  username: string;
  discriminator?: string;
  globalName?: string | null;
  email: string;
  avatar: string;
  bio?: string;
  joinDate: Date;
  lastActive: Date;
  isOnline: boolean;
  primaryGuildId?: string;
  settings: {
    allowWallPosts: boolean;
    showOnlineStatus: boolean;
    profilePrivate: boolean;
    notifications: {
      guildAnnouncements: boolean;
      friendRequests: boolean;
      eventReminders: boolean;
    };
  };
  stats: {
    totalSessions: number;
    totalAchievements: number;
    joinedGuilds: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface WallPost {
  _id?: string;
  authorId: string;
  targetUserId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  likes: string[]; // Array of user IDs who liked the post
  replies: WallPostReply[];
}

export interface WallPostReply {
  _id?: string;
  authorId: string;
  content: string;
  createdAt: Date;
}

export interface Friendship {
  _id?: string;
  requesterId: string;
  addresseeId: string;
  status: 'pending' | 'accepted' | 'blocked';
  createdAt: Date;
  updatedAt: Date;
}

export interface Character {
  _id?: string;
  userId: string;
  name: string;
  class: string;
  classPrimary?: string;
  classSecondary?: string;
  level: number;
  race: string;
  ancestry?: string;
  heritage?: string;
  background?: string;
  stats?: any; // JSON data for character stats, appearance, etc.
  equipment?: any[]; // JSON array for equipment
  foundryJson?: any;
  foundryFileName?: string;
  mainRole?: CharacterRoleCategory;
  roleBadges?: CharacterRoleBadge[];
  backstory?: string;
  notes?: string;
  isActive: boolean;
  guildId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Guild {
  _id?: string;
  name: string;
  description: string;
  type: string;
  leaderId: string;
  createdBy?: string;
  leaderCharacterId?: string;
  leaderCharacterName?: string;
  logo?: string;
  region: string;
  established: Date;
  status: 'Active' | 'Inactive' | 'Recruiting';
  recruitmentStatus: 'open' | 'selective' | 'closed';
  requirements: string;
  badges: string[];
  recentActivity: string;
  rank: 'bronze' | 'silver' | 'gold' | 'platinum';
  memberCount: number;
  maxMembers: number;
  foundingRequired?: number;
  foundedAt?: Date;
  memberships?: GuildMembership[];
  applications?: GuildApplication[];
  createdAt: Date;
  updatedAt: Date;
}

export type CharacterRoleCategory = 'Healer' | 'Tank' | 'DPS' | 'Support';
export type CharacterRoleBadge =
  | 'healer_magical'
  | 'healer_medicine'
  | 'healer_alchemical'
  | 'tank_mitigation'
  | 'tank_hp'
  | 'dps_physical'
  | 'dps_magical'
  | 'dps_duelist'
  | 'dps_blaster'
  | 'support_defensive'
  | 'support_offensive'
  | 'support_control';

export interface FoundryJsonEntry {
  id: string;
  characterId?: string;
  name: string;
  json: unknown;
  isActive?: boolean;
  sortOrder?: number;
  createdAt: string | Date;
  updatedAt?: string | Date;
}

export interface CharacterJournalEntry {
  id: string;
  characterId: string;
  authorId: string;
  title: string;
  body: string;
  likeCount: number;
  likedByCurrentUser: boolean;
  comments: CharacterJournalComment[];
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CharacterJournalComment {
  id: string;
  entryId: string;
  authorId: string;
  body: string;
  isEdited: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export type CharacterRelationshipType = 'family' | 'rival' | 'romantic' | 'patron' | 'owes_debt' | 'guildmate' | 'ally';
export type CharacterRelationshipStatus = 'official' | 'unofficial' | 'automatic';

export interface CharacterRelationship {
  id: string;
  sourceCharacterId: string;
  targetCharacterId: string;
  relationshipTypes: CharacterRelationshipType[];
  subtype?: string;
  label?: string;
  status?: CharacterRelationshipStatus;
  isAutomatic?: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CharacterRelationshipGraph {
  characters: Character[];
  relationships: CharacterRelationship[];
}

export interface GuildMembership {
  _id?: string;
  guildId: string;
  userId: string;
  characterId?: string;
  role: 'member' | 'officer' | 'leader';
  roleCategory: 'Leader' | 'Officer' | 'Member' | 'Ally';
  roleTitle?: string;
  membershipStatus: 'Invited' | 'Applied' | 'Active' | 'Rejected';
  joinDate: Date;
  acceptedAt?: Date;
  invitedBy?: string;
  badges: string[];
  contributions: number;
  user?: UserProfile;
  character?: Character;
}

export interface GuildApplication {
  _id?: string;
  guildId: string;
  userId: string;
  characterId?: string;
  requestedRoleCategory: 'Officer' | 'Member' | 'Ally';
  message: string;
  status: 'Pending' | 'Accepted' | 'Rejected' | 'Withdrawn';
  createdAt: Date;
  updatedAt: Date;
  user?: UserProfile;
  character?: Character;
}

export interface SchedulePoll {
  _id?: string;
  title: string;
  description: string;
  creatorId: string;
  timezone: string;
  dateStart: string;
  dateEnd: string;
  startMinutes: number;
  endMinutes: number;
  slotMinutes: 15 | 30 | 60;
  status: 'Open' | 'Closed';
  selectedSlotKey?: string;
  selectedSlotStart?: Date;
  participants: ScheduleParticipant[];
  availability: ScheduleAvailability[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduleParticipant {
  _id?: string;
  pollId: string;
  userId: string;
  displayName: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduleAvailability {
  _id?: string;
  pollId: string;
  participantId: string;
  userId: string;
  slotKey: string;
  slotStart: Date;
  createdAt: Date;
}

export type GameStatus = 'Open' | 'Closed' | 'Completed' | 'Cancelled';
export type GameApplicationStatus = 'Applied' | 'Roster' | 'On Deck' | 'Declined' | 'Withdrawn';
export type GameRewardsBonus = 0 | 5 | 10 | 15 | 20;

export interface GameListing {
  _id?: string;
  title: string;
  description: string;
  gmId: string;
  gmName: string;
  rewardCharacterId: string;
  rewardCharacter?: Character;
  schedulePollId?: string;
  startTime: Date;
  durationMinutes: number;
  characterLevel: number;
  tier: string;
  partySize: number;
  tags: string[];
  status: GameStatus;
  originalStartTime?: Date;
  rewardsBonus: GameRewardsBonus;
  completedAt?: Date;
  cancelledAt?: Date;
  likeCount: number;
  likedByCurrentUser: boolean;
  invites: GameInvite[];
  applications: GameApplication[];
  comments: GameArchiveComment[];
  createdAt: Date;
  updatedAt: Date;
}

export interface GameInvite {
  _id?: string;
  gameId: string;
  userId: string;
  displayName: string;
  source: 'Manual' | 'Poll';
  createdAt: Date;
}

export interface GameApplication {
  _id?: string;
  gameId: string;
  userId: string;
  displayName: string;
  characterIds: string[];
  lockedCharacterId?: string;
  status: GameApplicationStatus;
  note: string;
  characters: Character[];
  createdAt: Date;
  updatedAt: Date;
}

export interface GameArchiveComment {
  _id?: string;
  gameId: string;
  authorId: string;
  authorName: string;
  body: string;
  isEdited: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  error?: string;
}
