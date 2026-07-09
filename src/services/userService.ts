import DatabaseService from './database';
import { DATABASE_TABLES } from '../config/database';
import { UserProfile, ApiResponse } from '../types/database';

export class UserService {
  private static instance: UserService;
  private dbService: DatabaseService;

  constructor() {
    this.dbService = DatabaseService.getInstance();
  }

  static getInstance(): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService();
    }
    return UserService.instance;
  }

  async createUser(userData: Omit<UserProfile, '_id' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<UserProfile>> {
    try {
      const supabase = this.dbService.getClient();

      console.log('Creating user with auth user ID:', userData.authUserId);

      // Check if user already exists with this auth user ID
      const { data: existingUser, error: checkError } = await supabase
        .from(DATABASE_TABLES.USERS)
        .select('*')
        .eq('auth_user_id', userData.authUserId)
        .maybeSingle();

      // Log the check error for debugging
      if (checkError) {
        console.log('Check error (this might be normal):', checkError);
      }

      if (existingUser) {
        console.log('User already exists with auth user ID:', userData.authUserId);
        return {
          success: false,
          error: 'User already exists with this auth user ID'
        };
      }

      const now = new Date().toISOString();
      const newUser = {
        auth_user_id: userData.authUserId, // Primary identifier
        username: userData.username,
        discriminator: userData.discriminator,
        email: userData.email,
        avatar: userData.avatar,
        bio: userData.bio || '',
        join_date: userData.joinDate?.toISOString() || now,
        last_active: userData.lastActive?.toISOString() || now,
        is_online: userData.isOnline || true,
        settings: userData.settings || {
          allowWallPosts: true,
          showOnlineStatus: true,
          profilePrivate: false,
          notifications: {
            guildAnnouncements: true,
            friendRequests: true,
            eventReminders: false,
          }
        },
        stats: userData.stats || {
          totalSessions: 1,
          totalAchievements: 0,
          joinedGuilds: 0,
        },
        created_at: now,
        updated_at: now
      };

      console.log('Attempting to insert user:', { auth_user_id: newUser.auth_user_id, username: newUser.username });

      const { data, error } = await supabase
        .from(DATABASE_TABLES.USERS)
        .insert(newUser)
        .select()
        .single();

      if (error) {
        console.error('Database error creating user:', error);
        return {
          success: false,
          error: `Database error: ${error.message}`
        };
      }

      console.log('User created successfully:', data.auth_user_id);
      return {
        success: true,
        data: this.transformUserFromDb(data),
        message: 'User profile created successfully'
      };
    } catch (error) {
      console.error('Error creating user:', error);
      return {
        success: false,
        error: 'Failed to create user profile'
      };
    }
  }

  async getUserByAuthUserId(authUserId: string): Promise<ApiResponse<UserProfile>> {
    try {
      const supabase = this.dbService.getClient();

      console.log('Looking up user by auth user ID:', authUserId);

      // Use a more explicit query approach
      const { data, error, count } = await supabase
        .from(DATABASE_TABLES.USERS)
        .select('*', { count: 'exact' })
        .eq('auth_user_id', authUserId);

      console.log('Query result:', { data, error, count });

      if (error) {
        console.error('Database error fetching user:', error);
        return {
          success: false,
          error: `Database error: ${error.message}`
        };
      }

      if (!data || data.length === 0) {
        console.log('User not found with auth user ID:', authUserId);
        return {
          success: false,
          error: 'User not found'
        };
      }

      const user = data[0]; // Get the first (and should be only) result
      console.log('User found:', user.username);
      return {
        success: true,
        data: this.transformUserFromDb(user)
      };
    } catch (error) {
      console.error('Error fetching user by auth user ID:', error);
      return {
        success: false,
        error: 'Failed to fetch user'
      };
    }
  }

  async updateUser(authUserId: string, updates: Partial<UserProfile>): Promise<ApiResponse<UserProfile>> {
    try {
      const supabase = this.dbService.getClient();

      console.log('Updating user with auth user ID:', authUserId);

      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      // Map the updates to database column names
      if (updates.username !== undefined) updateData.username = updates.username;
      if (updates.avatar !== undefined) updateData.avatar = updates.avatar;
      if (updates.email !== undefined) updateData.email = updates.email;
      if (updates.discriminator !== undefined) updateData.discriminator = updates.discriminator;
      if (updates.bio !== undefined) updateData.bio = updates.bio;
      if (updates.settings !== undefined) updateData.settings = updates.settings;
      if (updates.stats !== undefined) updateData.stats = updates.stats;
      if (updates.isOnline !== undefined) updateData.is_online = updates.isOnline;

      const { data, error } = await supabase
        .from(DATABASE_TABLES.USERS)
        .update(updateData)
        .eq('auth_user_id', authUserId)
        .select()
        .single();

      if (error) {
        console.error('Failed to update user:', error);
        return {
          success: false,
          error: error.message
        };
      }

      if (!data) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      console.log('User updated successfully');
      return {
        success: true,
        data: this.transformUserFromDb(data),
        message: 'User updated successfully'
      };
    } catch (error) {
      console.error('Error updating user:', error);
      return {
        success: false,
        error: 'Failed to update user'
      };
    }
  }

  async updateLastActive(authUserId: string): Promise<void> {
    try {
      const supabase = this.dbService.getClient();

      console.log('Updating last active for auth user ID:', authUserId);

      const { error } = await supabase
        .from(DATABASE_TABLES.USERS)
        .update({
          last_active: new Date().toISOString(),
          is_online: true,
          updated_at: new Date().toISOString()
        })
        .eq('auth_user_id', authUserId);

      if (error) {
        console.error('Failed to update last active:', error);
      }
    } catch (error) {
      console.error('Error updating last active:', error);
    }
  }

  async setUserOffline(authUserId: string): Promise<void> {
    try {
      const supabase = this.dbService.getClient();

      console.log('Setting user offline for auth user ID:', authUserId);

      const { error } = await supabase
        .from(DATABASE_TABLES.USERS)
        .update({
          is_online: false,
          updated_at: new Date().toISOString()
        })
        .eq('auth_user_id', authUserId);

      if (error) {
        console.error('Failed to set user offline:', error);
      }
    } catch (error) {
      console.error('Error setting user offline:', error);
    }
  }

  async searchUsers(query: string, limit: number = 10): Promise<ApiResponse<UserProfile[]>> {
    try {
      const supabase = this.dbService.getClient();

      console.log('Searching users with query:', query);

      const { data, error } = await supabase
        .from(DATABASE_TABLES.USERS)
        .select('*')
        .ilike('username', `%${query}%`)
        .not('settings->>profilePrivate', 'eq', 'true')
        .limit(limit);

      if (error) {
        console.error('Error searching users:', error);
        return {
          success: false,
          error: error.message
        };
      }

      return {
        success: true,
        data: data.map(user => this.transformUserFromDb(user))
      };
    } catch (error) {
      console.error('Error searching users:', error);
      return {
        success: false,
        error: 'Failed to search users'
      };
    }
  }

  async deleteUser(authUserId: string): Promise<ApiResponse<boolean>> {
    try {
      const supabase = this.dbService.getClient();

      console.log('Deleting user with auth user ID:', authUserId);

      const { error } = await supabase
        .from(DATABASE_TABLES.USERS)
        .delete()
        .eq('auth_user_id', authUserId);

      if (error) {
        console.error('Failed to delete user:', error);
        return {
          success: false,
          error: error.message
        };
      }

      console.log('User deleted successfully');
      return {
        success: true,
        data: true,
        message: 'User deleted successfully'
      };
    } catch (error) {
      console.error('Error deleting user:', error);
      return {
        success: false,
        error: 'Failed to delete user'
      };
    }
  }

  async getUserStats(authUserId: string): Promise<ApiResponse<any>> {
    try {
      const supabase = this.dbService.getClient();

      console.log('Getting user stats for auth user ID:', authUserId);

      // Get user's basic stats
      const { data: user, error: userError } = await supabase
        .from(DATABASE_TABLES.USERS)
        .select('stats, created_at')
        .eq('auth_user_id', authUserId)
        .single();

      if (userError || !user) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      // Get additional stats from other tables
      const [
        { count: wallPostsCount },
        { count: friendsCount },
        { count: charactersCount }
      ] = await Promise.all([
        supabase
          .from(DATABASE_TABLES.WALL_POSTS)
          .select('*', { count: 'exact', head: true })
          .eq('author_id', authUserId),
        supabase
          .from(DATABASE_TABLES.FRIENDSHIPS)
          .select('*', { count: 'exact', head: true })
          .or(`requester_id.eq.${authUserId},addressee_id.eq.${authUserId}`)
          .eq('status', 'accepted'),
        supabase
          .from(DATABASE_TABLES.CHARACTERS)
          .select('*', { count: 'exact', head: true })
          .eq('user_id', authUserId)
      ]);

      const stats = {
        ...user.stats,
        wallPosts: wallPostsCount || 0,
        friends: friendsCount || 0,
        characters: charactersCount || 0,
        memberSince: user.created_at
      };

      return {
        success: true,
        data: stats
      };
    } catch (error) {
      console.error('Error fetching user stats:', error);
      return {
        success: false,
        error: 'Failed to fetch user stats'
      };
    }
  }

  private transformUserFromDb(dbUser: any): UserProfile {
    return {
      _id: dbUser.id,
      authUserId: dbUser.auth_user_id, // This is the primary identifier
      username: dbUser.username,
      discriminator: dbUser.discriminator,
      email: dbUser.email,
      avatar: dbUser.avatar,
      bio: dbUser.bio,
      joinDate: new Date(dbUser.join_date),
      lastActive: new Date(dbUser.last_active),
      isOnline: dbUser.is_online,
      isAdmin: Boolean(dbUser.is_admin),
      settings: dbUser.settings,
      stats: dbUser.stats,
      createdAt: new Date(dbUser.created_at),
      updatedAt: new Date(dbUser.updated_at)
    };
  }
}

export default UserService;
