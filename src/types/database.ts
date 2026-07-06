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
