import { createContext } from 'react';
import { SitePageKey } from '../config/sitePages';
import { PageVisibilitySetting } from '../services/pageVisibilityService';

export interface PageVisibilityContextValue {
  settings: PageVisibilitySetting[];
  settingsByKey: Record<SitePageKey, PageVisibilitySetting>;
  isLoading: boolean;
  error: string | null;
  isPageEnabled: (pageKey: SitePageKey) => boolean;
  refreshSettings: () => Promise<void>;
  setPageEnabled: (pageKey: SitePageKey, isEnabled: boolean, updatedBy: string) => Promise<PageVisibilitySetting>;
}

export const PageVisibilityContext = createContext<PageVisibilityContextValue | undefined>(undefined);
