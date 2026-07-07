import DatabaseService from './database';
import { DATABASE_TABLES } from '../config/database';
import { WallPost, WallPostReply, ApiResponse, PaginatedResponse } from '../types/database';

export class WallService {
  private static instance: WallService;
  private dbService: DatabaseService;

  constructor() {
    this.dbService = DatabaseService.getInstance();
  }

  static getInstance(): WallService {
    if (!WallService.instance) {
      WallService.instance = new WallService();
    }
    return WallService.instance;
  }

  async createWallPost(authorId: string, targetUserId: string, content: string): Promise<ApiResponse<WallPost>> {
    try {
      const supabase = this.dbService.getClient();

      const now = new Date().toISOString();
      const newPost = {
        author_id: authorId,
        target_user_id: targetUserId,
        content,
        likes: [],
        replies: [],
        created_at: now,
        updated_at: now
      };

      const { data, error } = await supabase
        .from(DATABASE_TABLES.WALL_POSTS)
        .insert(newPost)
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
        data: this.transformWallPostFromDb(data),
        message: 'Wall post created successfully'
      };
    } catch (error) {
      console.error('Error creating wall post:', error);
      return {
        success: false,
        error: 'Failed to create wall post'
      };
    }
  }

  async getWallPosts(targetUserId: string, page: number = 1, limit: number = 10): Promise<PaginatedResponse<WallPost & { authorInfo: any }>> {
    try {
      const supabase = this.dbService.getClient();
      const offset = (page - 1) * limit;

      // Get posts with author information
      const { data: posts, error } = await supabase
        .from(DATABASE_TABLES.WALL_POSTS)
        .select(`
          *,
          author:users!wall_posts_author_id_fkey(username, avatar, global_name)
        `)
        .eq('target_user_id', targetUserId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        return {
          success: false,
          data: [],
          pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
          error: error.message
        };
      }

      // Get total count
      const { count } = await supabase
        .from(DATABASE_TABLES.WALL_POSTS)
        .select('*', { count: 'exact', head: true })
        .eq('target_user_id', targetUserId);

      const total = count || 0;
      const totalPages = Math.ceil(total / limit);

      const transformedPosts = posts?.map(post => ({
        ...this.transformWallPostFromDb(post),
        authorInfo: {
          username: post.author.username,
          avatar: post.author.avatar,
          globalName: post.author.global_name
        }
      })) || [];

      return {
        success: true,
        data: transformedPosts,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      };
    } catch (error) {
      console.error('Error fetching wall posts:', error);
      return {
        success: false,
        data: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
        error: 'Failed to fetch wall posts'
      };
    }
  }

  async likePost(postId: string, userId: string): Promise<ApiResponse<boolean>> {
    try {
      const supabase = this.dbService.getClient();

      // Get current post
      const { data: post, error: fetchError } = await supabase
        .from(DATABASE_TABLES.WALL_POSTS)
        .select('likes')
        .eq('id', postId)
        .single();

      if (fetchError || !post) {
        return {
          success: false,
          error: 'Post not found'
        };
      }

      const likes = post.likes || [];
      const hasLiked = likes.includes(userId);
      
      let newLikes;
      if (hasLiked) {
        // Unlike the post
        newLikes = likes.filter((id: string) => id !== userId);
      } else {
        // Like the post
        newLikes = [...likes, userId];
      }

      const { error } = await supabase
        .from(DATABASE_TABLES.WALL_POSTS)
        .update({
          likes: newLikes,
          updated_at: new Date().toISOString()
        })
        .eq('id', postId);

      if (error) {
        return {
          success: false,
          error: error.message
        };
      }

      return {
        success: true,
        data: !hasLiked,
        message: hasLiked ? 'Post unliked' : 'Post liked'
      };
    } catch (error) {
      console.error('Error liking/unliking post:', error);
      return {
        success: false,
        error: 'Failed to like/unlike post'
      };
    }
  }

  async addReply(postId: string, authorId: string, content: string): Promise<ApiResponse<WallPost>> {
    try {
      const supabase = this.dbService.getClient();

      // Get current post
      const { data: post, error: fetchError } = await supabase
        .from(DATABASE_TABLES.WALL_POSTS)
        .select('replies')
        .eq('id', postId)
        .single();

      if (fetchError || !post) {
        return {
          success: false,
          error: 'Post not found'
        };
      }

      const reply: WallPostReply = {
        _id: crypto.randomUUID(),
        authorId,
        content,
        createdAt: new Date()
      };

      const newReplies = [...(post.replies || []), reply];

      const { data, error } = await supabase
        .from(DATABASE_TABLES.WALL_POSTS)
        .update({
          replies: newReplies,
          updated_at: new Date().toISOString()
        })
        .eq('id', postId)
        .select()
        .single();

      if (error || !data) {
        return {
          success: false,
          error: 'Failed to add reply'
        };
      }

      return {
        success: true,
        data: this.transformWallPostFromDb(data),
        message: 'Reply added successfully'
      };
    } catch (error) {
      console.error('Error adding reply:', error);
      return {
        success: false,
        error: 'Failed to add reply'
      };
    }
  }

  async deletePost(postId: string, userId: string): Promise<ApiResponse<boolean>> {
    try {
      const supabase = this.dbService.getClient();

      // Only allow deletion by the author or the target user
      const { error } = await supabase
        .from(DATABASE_TABLES.WALL_POSTS)
        .delete()
        .eq('id', postId)
        .or(`author_id.eq.${userId},target_user_id.eq.${userId}`);

      if (error) {
        return {
          success: false,
          error: error.message
        };
      }

      return {
        success: true,
        data: true,
        message: 'Post deleted successfully'
      };
    } catch (error) {
      console.error('Error deleting post:', error);
      return {
        success: false,
        error: 'Failed to delete post'
      };
    }
  }

  async updatePost(postId: string, authorId: string, content: string): Promise<ApiResponse<WallPost>> {
    try {
      const supabase = this.dbService.getClient();

      const { data, error } = await supabase
        .from(DATABASE_TABLES.WALL_POSTS)
        .update({
          content,
          updated_at: new Date().toISOString()
        })
        .eq('id', postId)
        .eq('author_id', authorId) // Only allow updates by the author
        .select()
        .single();

      if (error || !data) {
        return {
          success: false,
          error: 'Post not found or unauthorized'
        };
      }

      return {
        success: true,
        data: this.transformWallPostFromDb(data),
        message: 'Post updated successfully'
      };
    } catch (error) {
      console.error('Error updating post:', error);
      return {
        success: false,
        error: 'Failed to update post'
      };
    }
  }

  private transformWallPostFromDb(dbPost: any): WallPost {
    return {
      _id: dbPost.id,
      authorId: dbPost.author_id,
      targetUserId: dbPost.target_user_id,
      content: dbPost.content,
      likes: dbPost.likes || [],
      replies: dbPost.replies || [],
      createdAt: new Date(dbPost.created_at),
      updatedAt: new Date(dbPost.updated_at)
    };
  }
}

export default WallService;
