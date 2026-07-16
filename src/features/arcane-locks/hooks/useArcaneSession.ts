import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../config/database';
import type { LockAction } from '../engine/types';
import {
  getLockViewForCurrentUser,
  inviteArcaneSessionUser,
  performLockAction,
  removeArcaneSessionMember,
  resetAllLocks,
  resetLock,
  updateAccessProvider,
  updatePlayerLockAccess,
  updateSessionStatus,
  type LockView
} from '../api/arcaneLocksService';
import type { AccessProviderType, PermissionOverride, PuzzleSessionStatus } from '../engine/types';

export function useArcaneSession(sessionId: string, selectedLockId?: string) {
  const [view, setView] = useState<LockView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('Connecting to the seal chamber...');

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const next = await getLockViewForCurrentUser(sessionId, selectedLockId);
      setView(next);
      setMessage('Synchronized with the canonical lock state.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load the lock session.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedLockId, sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const channel = supabase
      .channel(`arcane-session:${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'arcane_lock_instances' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'arcane_lock_player_access' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'arcane_puzzle_sessions' }, () => void refresh())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh, sessionId]);

  const submitAction = useCallback(async (action: LockAction) => {
    if (!view) return;
    setMessage('Submitting one authoritative action...');
    try {
      const updatedLock = await performLockAction({
        lockInstanceId: view.activeLock.id,
        expectedVersion: view.activeLock.version,
        generation: view.activeLock.generation,
        actionId: crypto.randomUUID(),
        action
      });
      setView(current => current ? {
        ...current,
        locks: current.locks.map(lock => lock.id === updatedLock.id ? updatedLock : lock),
        activeLock: updatedLock
      } : current);
      if (updatedLock.currentState.solved) {
        setMessage('The lock core opens.');
      } else if (action.type === 'invoke' && updatedLock.currentState.lastInvokeFailed) {
        setMessage('The lock flares red; the path is incorrect.');
      } else {
        setMessage('Action accepted.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The lock changed before your action completed.');
      await refresh();
    }
  }, [refresh, view]);

  const runGmAction = useCallback(async (label: string, action: () => Promise<void>) => {
    setMessage(label);
    try {
      await action();
      await refresh();
      setMessage('GM change synchronized.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'GM change failed.');
    }
  }, [refresh]);

  const setSessionStatus = useCallback((status: PuzzleSessionStatus) => {
    if (!view) return Promise.resolve();
    return runGmAction(`Setting session to ${status}...`, () => updateSessionStatus(view.session.id, status));
  }, [runGmAction, view]);

  const setProvider = useCallback((providerType: AccessProviderType) => {
    if (!view) return Promise.resolve();
    return runGmAction(`Switching access provider to ${providerType}...`, () => updateAccessProvider(view.session.id, providerType));
  }, [runGmAction, view]);

  const setPlayerAccess = useCallback((userId: string, values: {
    providerCanInteract?: boolean;
    providerCanRead?: boolean;
    interactOverride?: PermissionOverride;
    readOverride?: PermissionOverride;
  }) => {
    if (!view) return Promise.resolve();
    return runGmAction('Updating player access...', () => updatePlayerLockAccess({
      lockId: view.activeLock.id,
      userId,
      ...values
    }));
  }, [runGmAction, view]);

  const resetActiveLock = useCallback(() => {
    if (!view) return Promise.resolve();
    return runGmAction(`Resetting ${view.activeLock.displayName}...`, () => resetLock(view.activeLock.id));
  }, [runGmAction, view]);

  const resetEveryLock = useCallback(() => {
    if (!view) return Promise.resolve();
    return runGmAction('Resetting all locks...', () => resetAllLocks(view.session.id));
  }, [runGmAction, view]);

  const inviteUser = useCallback((userId: string, role: 'player' | 'spectator') => {
    if (!view) return Promise.resolve();
    return runGmAction('Inviting user...', () => inviteArcaneSessionUser(view.session.id, userId, role));
  }, [runGmAction, view]);

  const removeUser = useCallback((userId: string) => {
    if (!view) return Promise.resolve();
    return runGmAction('Removing user...', () => removeArcaneSessionMember(view.session.id, userId));
  }, [runGmAction, view]);

  return useMemo(() => ({
    view,
    isLoading,
    message,
    refresh,
    submitAction,
    setSessionStatus,
    setProvider,
    setPlayerAccess,
    resetActiveLock,
    resetEveryLock,
    inviteUser,
    removeUser
  }), [inviteUser, isLoading, message, refresh, removeUser, resetActiveLock, resetEveryLock, setPlayerAccess, setProvider, setSessionStatus, submitAction, view]);
}
