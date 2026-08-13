import type { ProfileDecorationColorSource, ProfileDecorationTheme } from '../features/profiles/profileDecorations';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface CharacterStats extends JsonObject {
  avatar?: string;
  abilityBoosts?: JsonObject & {
    scores?: JsonValue;
  };
}

export interface UserProfile {
  _id?: string;
  authUserId: string;
  username: string;
  discriminator?: string;
  email: string;
  avatar: string;
  bio?: string;
  joinDate: Date;
  lastActive: Date;
  isOnline: boolean;
  isAdmin?: boolean;
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
  stats?: CharacterStats; // JSON data for character stats, appearance, etc.
  equipment?: JsonValue[]; // JSON array for equipment
  foundryJson?: unknown;
  foundryFileName?: string;
  mainRole?: CharacterRoleCategory;
  roleBadges?: CharacterRoleBadge[];
  backstory?: string;
  notes?: string;
  isActive: boolean;
  guildId?: string;
  profileSubtitle: string;
  profileTitleFontFamily: ProfileFontFamily;
  profileSubtitleFontFamily: ProfileFontFamily;
  profileFontFamily: ProfileFontFamily;
  profileTitleFontSize: number;
  profileSubtitleFontSize: number;
  profileTextFontSize: number;
  profileBorderTheme: ProfileDecorationTheme;
  profileBackgroundTheme: ProfileDecorationTheme;
  profileBorderColorSource: ProfileDecorationColorSource;
  profileBackgroundColorSource: ProfileDecorationColorSource;
  profileFontColor: string;
  profileBaseColor: string;
  profileAccentColor: string;
  profileBackgroundMode: 'solid' | 'gradient';
  profileGradientColor: string;
  profileGradientOrientation: 'horizontal' | 'diagonal' | 'vertical';
  profileGradientTransitionRate: number;
  profileBannerImageUrl?: string;
  profileDynamicPortraitEnabled?: boolean;
  profilePortraitBackgroundImageUrl?: string;
  profilePortraitCutoutImageUrl?: string;
  profilePortraitBackgroundScale: number;
  profilePortraitBackgroundPositionX: number;
  profilePortraitBackgroundPositionY: number;
  profilePortraitCutoutScale: number;
  profilePortraitCutoutPositionX: number;
  profilePortraitCutoutPositionY: number;
  profilePortraitFocusX?: number;
  profilePortraitFocusY?: number;
  profileLayoutStyle: 'chronicle' | 'dossier' | 'spotlight' | 'saga';
  profileSectionVisibility: CharacterProfileSectionVisibility;
  createdAt: Date;
  updatedAt: Date;
}

export interface CharacterProfileSectionVisibility {
  portrait: boolean;
  details: boolean;
  abilityMatrix: boolean;
  backstory: boolean;
  notes: boolean;
  journal: boolean;
  relationships: boolean;
}

export interface GuildRosterLineupPlacement {
  characterId: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface Guild {
  _id?: string;
  name: string;
  titleHtml: string;
  titleAnimation: 'none' | 'reveal' | 'shimmer' | 'drift' | 'glow';
  subtitle: string;
  description: string;
  descriptionHtml: string;
  type: string;
  leaderId: string;
  createdBy?: string;
  leaderCharacterId?: string;
  leaderCharacterName?: string;
  logo?: string;
  emblemUrl?: string;
  bannerImageUrl?: string;
  region: string;
  titleFontFamily: ProfileFontFamily;
  subtitleFontFamily: ProfileFontFamily;
  fontFamily: ProfileFontFamily;
  titleFontSize: number;
  subtitleFontSize: number;
  textFontSize: number;
  borderTheme: ProfileDecorationTheme;
  backgroundTheme: ProfileDecorationTheme;
  borderColorSource: ProfileDecorationColorSource;
  backgroundColorSource: ProfileDecorationColorSource;
  fontColor: string;
  baseColor: string;
  accentColor: string;
  backgroundMode: 'solid' | 'gradient';
  gradientColor: string;
  gradientOrientation: 'horizontal' | 'diagonal' | 'vertical';
  gradientTransitionRate: number;
  layoutStyle: 'chronicle' | 'stronghold' | 'banner' | 'saga';
  rosterDisplay: 'ledger' | 'dossiers' | 'cards' | 'lineup';
  rosterLineup?: GuildRosterLineupPlacement[];
  sectionVisibility: GuildSectionVisibility;
  sectionHeadings: GuildSectionHeadings;
  autoLeaderEnabled: boolean;
  autoLeaderAwaitingCheckin: boolean;
  nextLeaderCharacterId?: string;
  leadershipChangedAt?: Date;
  headquartersName: string;
  headquartersTitle: string;
  headquartersTitleHtml: string;
  headquartersDescription: string;
  headquartersDescriptionHtml: string;
  headquartersImageUrl?: string;
  roleLabels: GuildRoleLabels;
  established: Date;
  status: 'Active' | 'Inactive' | 'Recruiting';
  recruitmentStatus: 'open' | 'selective' | 'closed';
  requirements: string;
  messageBoardHtml: string;
  messageBoardUpdatedAt?: Date;
  guestbookEnabled: boolean;
  influencePoints: number;
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

export type ProfileFontFamily =
  | 'cinzel'
  | 'cormorant'
  | 'merriweather'
  | 'inter'
  | 'alegreya'
  | 'im-fell'
  | 'uncial'
  | 'pirata'
  | 'grenze'
  | 'caesar'
  | 'metal-mania'
  | 'new-rocker'
  | 'trade-winds'
  | 'great-vibes'
  | 'marcellus'
  | 'cinzel-decorative'
  | 'tangerine'
  | 'almendra-display'
  | 'henny-penny'
  | 'macondo'
  | 'mystery-quest';

export interface GuildSectionVisibility {
  charter: boolean;
  requirements: boolean;
  headquarters: boolean;
  leader: boolean;
  roster: boolean;
  messageBoard: boolean;
  checkIn: boolean;
  guestbook: boolean;
}

export interface GuildSectionHeadings {
  charterLabel: string;
  charterTitle: string;
  requirementsLabel: string;
  requirementsTitle: string;
  headquartersLabel: string;
  rosterLabel: string;
  rosterTitle: string;
  messageBoardLabel: string;
  messageBoardTitle: string;
  checkInLabel: string;
  checkInTitle: string;
  guestbookLabel: string;
  guestbookTitle: string;
  leaderLabel: string;
  membershipLabel: string;
  membershipTitle: string;
  petitionLabel: string;
  petitionTitle: string;
  foundersLabel: string;
  foundersTitle: string;
  applicationsLabel: string;
  applicationsTitle: string;
}

export interface GuildRoleLabels {
  Leader: string;
  Subleader: string;
  Officer: string;
  Member: string;
  Ally: string;
}

export interface GuildManagementPermissions {
  kickMembers: boolean;
  setMessageBoard: boolean;
  acceptApplications: boolean;
  customizeGuild: boolean;
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
  plannerData?: unknown;
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

export type CharacterRelationshipSentiment = 'negative' | 'neutral' | 'positive';
export type CharacterRelationshipStatus = 'pending' | 'confirmed';

export interface CharacterRelationship {
  id: string;
  sourceCharacterId: string;
  targetCharacterId: string;
  name: string;
  tag?: string;
  sentiment: number;
  sourceApproved: boolean;
  targetApproved: boolean;
  status: CharacterRelationshipStatus;
  confirmedAt?: string | Date;
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
  roleCategory: 'Leader' | 'Subleader' | 'Officer' | 'Member' | 'Ally';
  roleTitle?: string;
  membershipStatus: 'Invited' | 'Applied' | 'Active' | 'Rejected';
  joinDate: Date;
  acceptedAt?: Date;
  invitedBy?: string;
  badges: string[];
  contributions: number;
  permissions: GuildManagementPermissions;
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

export interface GuildCheckin {
  _id: string;
  guildId: string;
  characterId: string;
  userId: string;
  checkinDate: string;
  influenceAwarded: number;
  createdAt: Date;
  character?: Character;
}

export interface GuildCheckinResult {
  awarded: boolean;
  influencePoints: number;
  checkinDate: string;
}

export interface GuildGuestbookEntry {
  _id: string;
  guildId: string;
  authorUserId: string;
  characterId?: string;
  message: string;
  isHidden: boolean;
  hiddenAt?: Date;
  createdAt: Date;
  updatedAt: Date;
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

export type NewsCategory = 'Announcements' | 'Events' | 'Updates' | 'Community';
export type NewsPostStatus = 'draft' | 'published';

export interface NewsPost {
  _id?: string;
  authorId: string;
  authorName: string;
  title: string;
  slug: string;
  summary: string;
  body: string;
  category: NewsCategory;
  tags: string[];
  status: NewsPostStatus;
  imageUrl: string;
  publishedAt?: Date;
  likeCount: number;
  likedByCurrentUser: boolean;
  comments: NewsComment[];
  createdAt: Date;
  updatedAt: Date;
}

export interface NewsComment {
  _id?: string;
  postId: string;
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
