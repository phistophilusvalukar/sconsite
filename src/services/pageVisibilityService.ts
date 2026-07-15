import { DATABASE_TABLES } from '../config/database';
import { sitePages, SitePageKey } from '../config/sitePages';
import { ApiResponse } from '../types/database';
import DatabaseService from './database';

export interface PageVisibilitySetting {
  pageKey: SitePageKey;
  isEnabled: boolean;
  updatedAt?: Date;
  updatedBy?: string;
}

interface PageVisibilityRow {
  page_key: SitePageKey;
  is_enabled: boolean;
  updated_at?: string;
  updated_by?: string;
}

class PageVisibilityService {
  private static instance: PageVisibilityService;
  private dbService: DatabaseService;

  constructor() {
    this.dbService = DatabaseService.getInstance();
  }

  static getInstance(): PageVisibilityService {
    if (!PageVisibilityService.instance) {
      PageVisibilityService.instance = new PageVisibilityService();
    }
    return PageVisibilityService.instance;
  }

  async getSettings(): Promise<ApiResponse<PageVisibilitySetting[]>> {
    try {
      const supabase = this.dbService.getClient();
      const { data, error } = await supabase
        .from(DATABASE_TABLES.SITE_PAGES)
        .select('page_key, is_enabled, updated_at, updated_by')
        .order('page_key');

      if (error) {
        return {
          success: false,
          error: error.message
        };
      }

      const rowsByKey = new Map((data || []).map((row: PageVisibilityRow) => [row.page_key, row]));
      return {
        success: true,
        data: sitePages.map(page => this.transformRow(rowsByKey.get(page.key), page.key))
      };
    } catch (error) {
      console.error('Error loading page visibility settings:', error);
      return {
        success: false,
        error: 'Failed to load page visibility settings'
      };
    }
  }

  async setPageEnabled(pageKey: SitePageKey, isEnabled: boolean, updatedBy: string): Promise<ApiResponse<PageVisibilitySetting>> {
    try {
      const supabase = this.dbService.getClient();
      const { data, error } = await supabase
        .from(DATABASE_TABLES.SITE_PAGES)
        .upsert({
          page_key: pageKey,
          is_enabled: isEnabled,
          updated_by: updatedBy,
          updated_at: new Date().toISOString()
        }, { onConflict: 'page_key' })
        .select('page_key, is_enabled, updated_at, updated_by')
        .single();

      if (error) {
        return {
          success: false,
          error: error.message
        };
      }

      return {
        success: true,
        data: this.transformRow(data as PageVisibilityRow, pageKey),
        message: 'Page visibility updated'
      };
    } catch (error) {
      console.error('Error saving page visibility setting:', error);
      return {
        success: false,
        error: 'Failed to save page visibility setting'
      };
    }
  }

  private transformRow(row: PageVisibilityRow | undefined, fallbackKey: SitePageKey): PageVisibilitySetting {
    return {
      pageKey: row?.page_key || fallbackKey,
      isEnabled: row?.is_enabled ?? true,
      updatedAt: row?.updated_at ? new Date(row.updated_at) : undefined,
      updatedBy: row?.updated_by
    };
  }
}

export default PageVisibilityService;
