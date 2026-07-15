import React, { ReactNode, createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { DATABASE_TABLES } from '../config/database';
import { SitePageKey, sitePages } from '../config/sitePages';
import { useSupabaseRealtime } from '../hooks/useSupabaseRealtime';
import PageVisibilityService, { PageVisibilitySetting } from '../services/pageVisibilityService';

interface PageVisibilityContextValue {
  settings: PageVisibilitySetting[];
  settingsByKey: Record<SitePageKey, PageVisibilitySetting>;
  isLoading: boolean;
  error: string | null;
  isPageEnabled: (pageKey: SitePageKey) => boolean;
  refreshSettings: () => Promise<void>;
  setPageEnabled: (pageKey: SitePageKey, isEnabled: boolean, updatedBy: string) => Promise<PageVisibilitySetting>;
}

export const PageVisibilityContext = createContext<PageVisibilityContextValue | undefined>(undefined);

export const PageVisibilityProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const visibilityService = useMemo(() => PageVisibilityService.getInstance(), []);
  const [settings, setSettings] = useState<PageVisibilitySetting[]>(() =>
    sitePages.map(page => ({ pageKey: page.key, isEnabled: true }))
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshSettings = useCallback(async () => {
    const result = await visibilityService.getSettings();
    if (result.success && result.data) {
      setSettings(result.data);
      setError(null);
    } else {
      setError(result.error || 'Failed to load page visibility settings.');
    }
    setIsLoading(false);
  }, [visibilityService]);

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  useSupabaseRealtime({
    channelName: 'site-page-visibility',
    tables: [DATABASE_TABLES.SITE_PAGES],
    onChange: refreshSettings
  });

  const settingsByKey = useMemo(() => {
    const nextSettings = {} as Record<SitePageKey, PageVisibilitySetting>;
    sitePages.forEach(page => {
      nextSettings[page.key] = settings.find(setting => setting.pageKey === page.key) || {
        pageKey: page.key,
        isEnabled: true
      };
    });
    return nextSettings;
  }, [settings]);

  const isPageEnabled = useCallback((pageKey: SitePageKey) => {
    return settingsByKey[pageKey]?.isEnabled ?? true;
  }, [settingsByKey]);

  const setPageEnabled = useCallback(async (pageKey: SitePageKey, isEnabled: boolean, updatedBy: string) => {
    const result = await visibilityService.setPageEnabled(pageKey, isEnabled, updatedBy);
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to save page visibility setting.');
    }

    setSettings(currentSettings => currentSettings.map(setting =>
      setting.pageKey === pageKey ? result.data! : setting
    ));
    return result.data;
  }, [visibilityService]);

  return (
    <PageVisibilityContext.Provider value={{
      settings,
      settingsByKey,
      isLoading,
      error,
      isPageEnabled,
      refreshSettings,
      setPageEnabled
    }}>
      {children}
    </PageVisibilityContext.Provider>
  );
};
