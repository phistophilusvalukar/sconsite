import { useEffect, useRef } from 'react';
import { supabase } from '../config/database';

interface UseSupabaseRealtimeOptions {
  channelName: string;
  tables: string[];
  onChange: () => void | Promise<void>;
  enabled?: boolean;
  debounceMs?: number;
}

export function useSupabaseRealtime({
  channelName,
  tables,
  onChange,
  enabled = true,
  debounceMs = 250
}: UseSupabaseRealtimeOptions) {
  const onChangeRef = useRef(onChange);
  const tablesKey = tables.join('|');

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!enabled || !tablesKey) return;

    let disposed = false;
    let debounceTimer: number | undefined;
    let refreshInFlight = false;
    let refreshQueued = false;
    const uniqueTables = Array.from(new Set(tablesKey.split('|').filter(Boolean)));
    const channel = supabase.channel(channelName);
    const runRefresh = async () => {
      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }

      refreshInFlight = true;
      try {
        await onChangeRef.current();
      } finally {
        refreshInFlight = false;
        if (!disposed && refreshQueued) {
          refreshQueued = false;
          debounceTimer = window.setTimeout(() => {
            void runRefresh();
          }, debounceMs);
        }
      }
    };
    const scheduleRefresh = () => {
      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }

      if (debounceTimer) {
        window.clearTimeout(debounceTimer);
      }

      debounceTimer = window.setTimeout(() => {
        void runRefresh();
      }, debounceMs);
    };

    uniqueTables.forEach(table => {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table
        },
        scheduleRefresh
      );
    });

    void channel.subscribe();

    return () => {
      disposed = true;
      refreshQueued = false;
      if (debounceTimer) {
        window.clearTimeout(debounceTimer);
      }
      void supabase.removeChannel(channel);
    };
  }, [channelName, debounceMs, enabled, tablesKey]);
}
