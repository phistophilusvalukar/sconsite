import DatabaseService from './database';
import { DATABASE_TABLES } from '../config/database';
import { ApiResponse, NewsCategory, NewsComment, NewsPost, NewsPostStatus } from '../types/database';

export interface SaveNewsPostInput {
  authorId: string;
  authorName: string;
  title: string;
  summary: string;
  body: string;
  category: NewsCategory;
  tags: string[];
  status: NewsPostStatus;
  imageUrl?: string;
}

class NewsService {
  private static instance: NewsService;
  private dbService: DatabaseService;

  constructor() {
    this.dbService = DatabaseService.getInstance();
  }

  static getInstance(): NewsService {
    if (!NewsService.instance) {
      NewsService.instance = new NewsService();
    }

    return NewsService.instance;
  }

  async getPosts(currentUserId?: string, includeDrafts = false): Promise<ApiResponse<NewsPost[]>> {
    try {
      let query = this.dbService.getClient()
        .from(DATABASE_TABLES.NEWS_POSTS)
        .select(`
          *,
          comments:news_comments(*),
          likes:news_likes(*)
        `);

      if (!includeDrafts) {
        query = query.eq('status', 'published');
      }

      const { data, error } = await query
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        data: (data || []).map(post => this.transformPostFromDb(post, currentUserId))
      };
    } catch (error) {
      console.error('Error loading news posts:', error);
      return { success: false, error: 'Failed to load news posts' };
    }
  }

  async getPostBySlug(slug: string, currentUserId?: string): Promise<ApiResponse<NewsPost>> {
    try {
      const { data, error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.NEWS_POSTS)
        .select(`
          *,
          comments:news_comments(*),
          likes:news_likes(*)
        `)
        .eq('slug', slug)
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: this.transformPostFromDb(data, currentUserId) };
    } catch (error) {
      console.error('Error loading news post:', error);
      return { success: false, error: 'Failed to load news post' };
    }
  }

  async createPost(input: SaveNewsPostInput): Promise<ApiResponse<NewsPost>> {
    try {
      const now = new Date().toISOString();
      const statusFields = input.status === 'published' ? { published_at: now } : { published_at: null };
      const { data, error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.NEWS_POSTS)
        .insert({
          author_id: input.authorId,
          author_name: input.authorName,
          title: input.title.trim(),
          slug: await this.createUniqueSlug(input.title),
          summary: input.summary.trim(),
          body: input.body.trim(),
          category: input.category,
          tags: this.cleanTags(input.tags),
          status: input.status,
          image_url: input.imageUrl?.trim() || '/npc-placeholder.png',
          created_at: now,
          updated_at: now,
          ...statusFields
        })
        .select(`
          *,
          comments:news_comments(*),
          likes:news_likes(*)
        `)
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        data: this.transformPostFromDb(data, input.authorId),
        message: input.status === 'published' ? 'Post published.' : 'Draft saved.'
      };
    } catch (error) {
      console.error('Error creating news post:', error);
      return { success: false, error: 'Failed to save news post' };
    }
  }

  async updatePost(postId: string, input: SaveNewsPostInput): Promise<ApiResponse<boolean>> {
    try {
      const existing = await this.getPostStatus(postId);
      if (!existing.success || !existing.data) {
        return { success: false, error: existing.error || 'Post not found' };
      }

      const now = new Date().toISOString();
      const shouldStampPublish = input.status === 'published' && existing.data.status !== 'published';
      const { error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.NEWS_POSTS)
        .update({
          author_name: input.authorName,
          title: input.title.trim(),
          summary: input.summary.trim(),
          body: input.body.trim(),
          category: input.category,
          tags: this.cleanTags(input.tags),
          status: input.status,
          image_url: input.imageUrl?.trim() || '/npc-placeholder.png',
          published_at: shouldStampPublish ? now : existing.data.publishedAt?.toISOString() || null,
          updated_at: now
        })
        .eq('id', postId);

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        data: true,
        message: input.status === 'published' ? 'Post published.' : 'Draft updated.'
      };
    } catch (error) {
      console.error('Error updating news post:', error);
      return { success: false, error: 'Failed to update news post' };
    }
  }

  async deletePost(postId: string): Promise<ApiResponse<boolean>> {
    try {
      const { error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.NEWS_POSTS)
        .delete()
        .eq('id', postId);

      if (error) return { success: false, error: error.message };
      return { success: true, data: true, message: 'Post deleted.' };
    } catch (error) {
      console.error('Error deleting news post:', error);
      return { success: false, error: 'Failed to delete news post' };
    }
  }

  async addComment(postId: string, authorId: string, authorName: string, body: string): Promise<ApiResponse<NewsComment>> {
    try {
      const { data, error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.NEWS_COMMENTS)
        .insert({
          post_id: postId,
          author_id: authorId,
          author_name: authorName,
          body: body.trim()
        })
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data: this.transformCommentFromDb(data) };
    } catch (error) {
      console.error('Error adding news comment:', error);
      return { success: false, error: 'Failed to add comment' };
    }
  }

  async deleteComment(commentId: string): Promise<ApiResponse<boolean>> {
    try {
      const { error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.NEWS_COMMENTS)
        .delete()
        .eq('id', commentId);

      if (error) return { success: false, error: error.message };
      return { success: true, data: true };
    } catch (error) {
      console.error('Error deleting news comment:', error);
      return { success: false, error: 'Failed to delete comment' };
    }
  }

  async toggleLike(postId: string, userId: string, isLiked: boolean): Promise<ApiResponse<boolean>> {
    try {
      const query = this.dbService.getClient().from(DATABASE_TABLES.NEWS_LIKES);
      const { error } = isLiked
        ? await query.delete().eq('post_id', postId).eq('user_id', userId)
        : await query.insert({ post_id: postId, user_id: userId });

      if (error) return { success: false, error: error.message };
      return { success: true, data: true };
    } catch (error) {
      console.error('Error toggling news like:', error);
      return { success: false, error: 'Failed to update like' };
    }
  }

  private async getPostStatus(postId: string): Promise<ApiResponse<{ status: NewsPostStatus; publishedAt?: Date }>> {
    const { data, error } = await this.dbService.getClient()
      .from(DATABASE_TABLES.NEWS_POSTS)
      .select('status,published_at')
      .eq('id', postId)
      .single();

    if (error) return { success: false, error: error.message };
    return {
      success: true,
      data: {
        status: String(data.status || 'draft') as NewsPostStatus,
        publishedAt: data.published_at ? new Date(String(data.published_at)) : undefined
      }
    };
  }

  private async createUniqueSlug(title: string) {
    const baseSlug = slugify(title);
    let slug = baseSlug;
    let index = 2;

    while (await this.slugExists(slug)) {
      slug = `${baseSlug}-${index}`;
      index += 1;
    }

    return slug;
  }

  private async slugExists(slug: string) {
    const { data, error } = await this.dbService.getClient()
      .from(DATABASE_TABLES.NEWS_POSTS)
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      console.error('Error checking news slug:', error);
      return true;
    }

    return Boolean(data);
  }

  private cleanTags(tags: string[]) {
    return Array.from(new Set(tags.map(tag => tag.trim()).filter(Boolean))).slice(0, 12);
  }

  private transformPostFromDb(dbPost: Record<string, unknown>, currentUserId?: string): NewsPost {
    const comments = Array.isArray(dbPost.comments)
      ? dbPost.comments.map(comment => this.transformCommentFromDb(comment as Record<string, unknown>))
      : [];
    const likes = Array.isArray(dbPost.likes) ? dbPost.likes as Array<Record<string, unknown>> : [];

    return {
      _id: String(dbPost.id),
      authorId: String(dbPost.author_id),
      authorName: String(dbPost.author_name || 'Scon Admin'),
      title: String(dbPost.title || ''),
      slug: String(dbPost.slug || ''),
      summary: String(dbPost.summary || ''),
      body: String(dbPost.body || ''),
      category: String(dbPost.category || 'Announcements') as NewsCategory,
      tags: Array.isArray(dbPost.tags) ? dbPost.tags.map(String) : [],
      status: String(dbPost.status || 'draft') as NewsPostStatus,
      imageUrl: String(dbPost.image_url || '/npc-placeholder.png'),
      publishedAt: dbPost.published_at ? new Date(String(dbPost.published_at)) : undefined,
      likeCount: likes.length,
      likedByCurrentUser: currentUserId ? likes.some(like => String(like.user_id) === currentUserId) : false,
      comments: comments.sort((first, second) => first.createdAt.getTime() - second.createdAt.getTime()),
      createdAt: new Date(String(dbPost.created_at)),
      updatedAt: new Date(String(dbPost.updated_at))
    };
  }

  private transformCommentFromDb(dbComment: Record<string, unknown>): NewsComment {
    const createdAt = new Date(String(dbComment.created_at));
    const updatedAt = new Date(String(dbComment.updated_at));

    return {
      _id: String(dbComment.id),
      postId: String(dbComment.post_id),
      authorId: String(dbComment.author_id),
      authorName: String(dbComment.author_name || 'Player'),
      body: String(dbComment.body || ''),
      isEdited: updatedAt.getTime() > createdAt.getTime() + 1000,
      createdAt,
      updatedAt
    };
  }
}

const slugify = (title: string) => {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || `post-${Date.now()}`;
};

export default NewsService;
