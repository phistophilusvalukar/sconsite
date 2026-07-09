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
  const debounceTimerRef = useRef<number | undefined>(undefined);
  const tablesKey = tables.join('|');

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!enabled || !tablesKey) return;

    const uniqueTables = Array.from(new Set(tablesKey.split('|').filter(Boolean)));
    const channel = supabase.channel(channelName);
    const scheduleRefresh = () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = window.setTimeout(() => {
        void onChangeRef.current();
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
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
      void supabase.removeChannel(channel);
    };
  }, [channelName, debounceMs, enabled, tablesKey]);
}
