import { z } from 'zod';
import { DATABASE_TABLES } from '../config/database';
import { isSafeExternalImageUrl } from '../features/guilds/guildCustomization';
import { sanitizeRichHtml } from '../features/guilds/richText';
import type { ApiResponse, LoreCategory, LoreEntry, LoreEntryStatus } from '../types/database';
import DatabaseService from './database';

export interface SaveLoreEntryInput {
  title: string;
  summary: string;
  bodyHtml: string;
  category: LoreCategory;
  tags: string[];
  status: LoreEntryStatus;
  imageUrl?: string;
  isFeatured: boolean;
}

const loreInputSchema = z.object({
  title: z.string().trim().min(2).max(100),
  summary: z.string().trim().min(2).max(500),
  bodyHtml: z.string().trim().min(2).max(30000),
  category: z.enum(['Places', 'People', 'Factions', 'History', 'Mysteries', 'Artifacts']),
  tags: z.array(z.string().trim().min(1).max(40)).max(12),
  status: z.enum(['draft', 'published']),
  imageUrl: z.string().trim().max(2000).refine(isSafeExternalImageUrl, 'Use a direct HTTPS image URL.'),
  isFeatured: z.boolean()
}).strict();

class LoreService {
  private static instance: LoreService;
  private readonly dbService = DatabaseService.getInstance();

  static getInstance() {
    if (!LoreService.instance) LoreService.instance = new LoreService();
    return LoreService.instance;
  }

  async getEntries(includeDrafts = false): Promise<ApiResponse<LoreEntry[]>> {
    try {
      let query = this.dbService.getClient().from(DATABASE_TABLES.LORE_ENTRIES).select('*');
      if (!includeDrafts) query = query.eq('status', 'published');
      const { data, error } = await query
        .order('is_featured', { ascending: false })
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('updated_at', { ascending: false });

      if (error) return { success: false, error: error.message };
      return { success: true, data: (data || []).map(entry => this.transformFromDb(entry as Record<string, unknown>)) };
    } catch (error) {
      console.error('Error loading lore entries:', error);
      return { success: false, error: 'Failed to load the lore atlas.' };
    }
  }

  async saveEntry(entryId: string | undefined, input: SaveLoreEntryInput): Promise<ApiResponse<LoreEntry>> {
    const safeInput = {
      ...input,
      title: input.title.trim(),
      summary: input.summary.trim(),
      bodyHtml: sanitizeRichHtml(input.bodyHtml),
      tags: Array.from(new Set(input.tags.map(tag => tag.trim()).filter(Boolean))).slice(0, 12),
      imageUrl: input.imageUrl?.trim() || ''
    };
    const parsed = loreInputSchema.safeParse(safeInput);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || 'Invalid lore entry.' };

    try {
      const { data, error } = await this.dbService.getClient().rpc('save_lore_entry_command', {
        p_entry_id: entryId || null,
        p_entry: {
          title: parsed.data.title,
          summary: parsed.data.summary,
          body_html: parsed.data.bodyHtml,
          category: parsed.data.category,
          tags: parsed.data.tags,
          status: parsed.data.status,
          image_url: parsed.data.imageUrl,
          is_featured: parsed.data.isFeatured
        }
      });
      if (error) return { success: false, error: error.message };

      const savedId = String(data || entryId || '');
      const { data: saved, error: loadError } = await this.dbService.getClient()
        .from(DATABASE_TABLES.LORE_ENTRIES)
        .select('*')
        .eq('id', savedId)
        .single();
      if (loadError) return { success: false, error: loadError.message };
      return {
        success: true,
        data: this.transformFromDb(saved as Record<string, unknown>),
        message: parsed.data.status === 'published' ? 'Lore entry published.' : 'Lore draft saved.'
      };
    } catch (error) {
      console.error('Error saving lore entry:', error);
      return { success: false, error: 'Failed to save the lore entry.' };
    }
  }

  async deleteEntry(entryId: string): Promise<ApiResponse<boolean>> {
    try {
      const { error } = await this.dbService.getClient().rpc('delete_lore_entry_command', { p_entry_id: entryId });
      if (error) return { success: false, error: error.message };
      return { success: true, data: true, message: 'Lore entry deleted.' };
    } catch (error) {
      console.error('Error deleting lore entry:', error);
      return { success: false, error: 'Failed to delete the lore entry.' };
    }
  }

  private transformFromDb(entry: Record<string, unknown>): LoreEntry {
    return {
      _id: String(entry.id),
      authorId: String(entry.author_id || ''),
      authorName: String(entry.author_name || 'The Loremaster'),
      title: String(entry.title || ''),
      slug: String(entry.slug || ''),
      summary: String(entry.summary || ''),
      bodyHtml: sanitizeRichHtml(String(entry.body_html || '')),
      category: String(entry.category || 'Mysteries') as LoreCategory,
      tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
      status: String(entry.status || 'draft') as LoreEntryStatus,
      imageUrl: isSafeExternalImageUrl(String(entry.image_url || '')) ? String(entry.image_url || '') || undefined : undefined,
      isFeatured: Boolean(entry.is_featured),
      publishedAt: entry.published_at ? new Date(String(entry.published_at)) : undefined,
      createdAt: new Date(String(entry.created_at)),
      updatedAt: new Date(String(entry.updated_at))
    };
  }
}

export default LoreService;
