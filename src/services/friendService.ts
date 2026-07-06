import DatabaseService from './database';
import { DATABASE_TABLES } from '../config/database';
import { Friendship, UserProfile, ApiResponse } from '../types/database';

export class FriendService {
  private static instance: FriendService;
  private dbService: DatabaseService;

  constructor() {
    this.dbService = DatabaseService.getInstance();
  }

  static getInstance(): FriendService {
    if (!FriendService.instance) {
      FriendService.instance = new FriendService();
    }
    return FriendService.instance;
  }

  async sendFriendRequest(requesterId: string, addresseeId: string): Promise<ApiResponse<Friendship>> {
    try {
      const supabase = this.dbService.getClient();

      // Check if friendship already exists
      const { data: existingFriendship } = await supabase
        .from(DATABASE_TABLES.FRIENDSHIPS)
        .select('*')
        .or(`and(requester_id.eq.${requesterId},addressee_id.eq.${addresseeId}),and(requester_id.eq.${addresseeId},addressee_id.eq.${requesterId})`)
        .single();

      if (existingFriendship) {
        return {
          success: false,
          error: 'Friendship request already exists or users are already friends'
        };
      }

      // Can't send friend request to yourself
      if (requesterId === addresseeId) {
        return {
          success: false,
          error: 'Cannot send friend request to yourself'
        };
      }

      const now = new Date().toISOString();
      const newFriendship = {
        requester_id: requesterId,
        addressee_id: addresseeId,
        status: 'pending',
        created_at: now,
        updated_at: now
      };

      const { data, error } = await supabase
        .from(DATABASE_TABLES.FRIENDSHIPS)
        .insert(newFriendship)
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
        data: this.transformFriendshipFromDb(data),
        message: 'Friend request sent successfully'
      };
    } catch (error) {
      console.error('Error sending friend request:', error);
      return {
        success: false,
        error: 'Failed to send friend request'
      };
    }
  }

  async respondToFriendRequest(friendshipId: string, userId: string, accept: boolean): Promise<ApiResponse<Friendship>> {
    try {
      const supabase = this.dbService.getClient();

      const newStatus = accept ? 'accepted' : 'blocked';
      const { data, error } = await supabase
        .from(DATABASE_TABLES.FRIENDSHIPS)
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', friendshipId)
        .eq('addressee_id', userId)
        .eq('status', 'pending')
        .select()
        .single();

      if (error || !data) {
        return {
          success: false,
          error: 'Friend request not found or unauthorized'
        };
      }

      return {
        success: true,
        data: this.transformFriendshipFromDb(data),
        message: accept ? 'Friend request accepted' : 'Friend request declined'
      };
    } catch (error) {
      console.error('Error responding to friend request:', error);
      return {
        success: false,
        error: 'Failed to respond to friend request'
      };
    }
  }

  async getFriends(userId: string): Promise<ApiResponse<(UserProfile & { friendshipId: string })[]>> {
    try {
      const supabase = this.dbService.getClient();

      // Get accepted friendships where user is either requester or addressee
      const { data: friendships, error } = await supabase
        .from(DATABASE_TABLES.FRIENDSHIPS)
        .select(`
          id,
          requester_id,
          addressee_id,
          requester:users!friendships_requester_id_fkey(*),
          addressee:users!friendships_addressee_id_fkey(*)
        `)
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .eq('status', 'accepted');

      if (error) {
        return {
          success: false,
          error: error.message
        };
      }

      const friends = friendships?.map(friendship => {
        const friendData = friendship.requester_id === userId ? friendship.addressee : friendship.requester;
        return {
          ...this.transformUserFromDb(friendData),
          friendshipId: friendship.id
        };
      }) || [];

      return {
        success: true,
        data: friends
      };
    } catch (error) {
      console.error('Error fetching friends:', error);
      return {
        success: false,
        error: 'Failed to fetch friends'
      };
    }
  }

  async getPendingFriendRequests(userId: string): Promise<ApiResponse<(UserProfile & { friendshipId: string })[]>> {
    try {
      const supabase = this.dbService.getClient();

      const { data: pendingRequests, error } = await supabase
        .from(DATABASE_TABLES.FRIENDSHIPS)
        .select(`
          id,
          requester:users!friendships_requester_id_fkey(*)
        `)
        .eq('addressee_id', userId)
        .eq('status', 'pending');

      if (error) {
        return {
          success: false,
          error: error.message
        };
      }

      const requests = pendingRequests?.map(request => ({
        ...this.transformUserFromDb(request.requester),
        friendshipId: request.id
      })) || [];

      return {
        success: true,
        data: requests
      };
    } catch (error) {
      console.error('Error fetching pending friend requests:', error);
      return {
        success: false,
        error: 'Failed to fetch pending friend requests'
      };
    }
  }

  async removeFriend(userId: string, friendId: string): Promise<ApiResponse<boolean>> {
    try {
      const supabase = this.dbService.getClient();

      const { error } = await supabase
        .from(DATABASE_TABLES.FRIENDSHIPS)
        .delete()
        .or(`and(requester_id.eq.${userId},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${userId})`)
        .eq('status', 'accepted');

      if (error) {
        return {
          success: false,
          error: error.message
        };
      }

      return {
        success: true,
        data: true,
        message: 'Friend removed successfully'
      };
    } catch (error) {
      console.error('Error removing friend:', error);
      return {
        success: false,
        error: 'Failed to remove friend'
      };
    }
  }

  async blockUser(userId: string, targetUserId: string): Promise<ApiResponse<boolean>> {
    try {
      const supabase = this.dbService.getClient();

      // Check if friendship exists
      const { data: existingFriendship } = await supabase
        .from(DATABASE_TABLES.FRIENDSHIPS)
        .select('*')
        .or(`and(requester_id.eq.${userId},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${userId})`)
        .single();

      const now = new Date().toISOString();

      if (existingFriendship) {
        // Update existing friendship to blocked
        const { error } = await supabase
          .from(DATABASE_TABLES.FRIENDSHIPS)
          .update({
            status: 'blocked',
            updated_at: now
          })
          .eq('id', existingFriendship.id);

        if (error) {
          return {
            success: false,
            error: error.message
          };
        }
      } else {
        // Create new blocked relationship
        const { error } = await supabase
          .from(DATABASE_TABLES.FRIENDSHIPS)
          .insert({
            requester_id: userId,
            addressee_id: targetUserId,
            status: 'blocked',
            created_at: now,
            updated_at: now
          });

        if (error) {
          return {
            success: false,
            error: error.message
          };
        }
      }

      return {
        success: true,
        data: true,
        message: 'User blocked successfully'
      };
    } catch (error) {
      console.error('Error blocking user:', error);
      return {
        success: false,
        error: 'Failed to block user'
      };
    }
  }

  async unblockUser(userId: string, targetUserId: string): Promise<ApiResponse<boolean>> {
    try {
      const supabase = this.dbService.getClient();

      const { error } = await supabase
        .from(DATABASE_TABLES.FRIENDSHIPS)
        .delete()
        .eq('requester_id', userId)
        .eq('addressee_id', targetUserId)
        .eq('status', 'blocked');

      if (error) {
        return {
          success: false,
          error: error.message
        };
      }

      return {
        success: true,
        data: true,
        message: 'User unblocked successfully'
      };
    } catch (error) {
      console.error('Error unblocking user:', error);
      return {
        success: false,
        error: 'Failed to unblock user'
      };
    }
  }

  async getFriendshipStatus(userId: string, targetUserId: string): Promise<ApiResponse<string>> {
    try {
      const supabase = this.dbService.getClient();

      const { data: friendship } = await supabase
        .from(DATABASE_TABLES.FRIENDSHIPS)
        .select('*')
        .or(`and(requester_id.eq.${userId},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${userId})`)
        .single();

      if (!friendship) {
        return {
          success: true,
          data: 'none'
        };
      }

      // Determine the specific status from the user's perspective
      let status = friendship.status;
      if (friendship.status === 'pending') {
        if (friendship.requester_id === userId) {
          status = 'pending_sent';
        } else {
          status = 'pending_received';
        }
      }

      return {
        success: true,
        data: status
      };
    } catch (error) {
      console.error('Error getting friendship status:', error);
      return {
        success: false,
        error: 'Failed to get friendship status'
      };
    }
  }

  private transformFriendshipFromDb(dbFriendship: any): Friendship {
    return {
      _id: dbFriendship.id,
      requesterId: dbFriendship.requester_id,
      addresseeId: dbFriendship.addressee_id,
      status: dbFriendship.status,
      createdAt: new Date(dbFriendship.created_at),
      updatedAt: new Date(dbFriendship.updated_at)
    };
  }

  private transformUserFromDb(dbUser: any): UserProfile {
    return {
      _id: dbUser.id,
      authUserId: dbUser.auth_user_id,
      username: dbUser.username,
      discriminator: dbUser.discriminator,
      globalName: dbUser.global_name,
      email: dbUser.email,
      avatar: dbUser.avatar,
      bio: dbUser.bio,
      joinDate: new Date(dbUser.join_date),
      lastActive: new Date(dbUser.last_active),
      isOnline: dbUser.is_online,
      settings: dbUser.settings,
      stats: dbUser.stats,
      createdAt: new Date(dbUser.created_at),
      updatedAt: new Date(dbUser.updated_at)
    };
  }
}

export default FriendService;
