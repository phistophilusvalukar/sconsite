import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { DATABASE_TABLES, supabase } from '../config/database';
import { useSupabaseRealtime } from '../hooks/useSupabaseRealtime';
import { UserService } from '../services/userService';
import { UserProfile } from '../types/database';
import { AuthContext, AuthUser } from './authContextCore';
import { storeAuthReturnPath } from './authReturnPath';
import { hasAuthIdentityChanged, supersedesInitialSessionLookup } from './authSessionIdentity';

interface AuthProviderProps {
  children: ReactNode;
}

const defaultSettings = {
  allowWallPosts: true,
  showOnlineStatus: true,
  profilePrivate: false,
  notifications: {
    guildAnnouncements: true,
    friendRequests: true,
    eventReminders: false,
  }
};

const defaultStats = {
  totalSessions: 1,
  totalAchievements: 0,
  joinedGuilds: 0,
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | undefined>(undefined);
  const [isProfileResolved, setIsProfileResolved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sessionUserIdRef = useRef<string | null>(null);
  const hasRestoredSessionRef = useRef(false);
  const userService = useMemo(() => UserService.getInstance(), []);

  const user = useMemo(() => {
    if (!session?.user) return null;

    const authUser = transformSupabaseUser(session.user);

    return {
      ...authUser,
      username: profile?.username?.trim() || authUser.username,
      avatar: profile?.avatar || authUser.avatar,
      email: profile?.email || authUser.email,
      isAdmin: profile?.isAdmin,
      isBanned: profile?.isBanned,
      profile,
    };
  }, [session, profile]);

  useEffect(() => {
    let isMounted = true;
    let authStateChangedDuringRestore = false;
    hasRestoredSessionRef.current = false;

    void supabase.auth.getSession()
      .then(({ data, error: sessionError }) => {
        if (!isMounted) return;

        if (sessionError) {
          console.error('Failed to restore auth session:', sessionError);
          setError(sessionError.message);
        }

        // INITIAL_SESSION can fire before getSession resolves. The explicit lookup
        // remains authoritative unless a real sign-in/sign-out happened meanwhile.
        if (!authStateChangedDuringRestore) {
          sessionUserIdRef.current = data.session?.user.id ?? null;
          setSession(data.session ?? null);
          setIsProfileResolved(!data.session?.user);
        }
      })
      .catch((sessionError: unknown) => {
        if (!isMounted) return;
        console.error('Failed to restore auth session:', sessionError);
        setError(sessionError instanceof Error ? sessionError.message : 'Failed to restore auth session');
      })
      .finally(() => {
        if (!isMounted) return;
        hasRestoredSessionRef.current = true;
        setIsLoading(false);
      });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;

      if (supersedesInitialSessionLookup(event)) {
        authStateChangedDuringRestore = true;
      }

      const nextUserId = nextSession?.user.id ?? null;
      const identityChanged = hasAuthIdentityChanged(sessionUserIdRef.current, nextUserId);
      sessionUserIdRef.current = nextUserId;
      setSession(nextSession);
      if (identityChanged) {
        setProfile(undefined);
        setIsProfileResolved(!nextSession?.user);
      }
      setError(null);
      if (hasRestoredSessionRef.current) {
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const syncUserProfile = useCallback(async (supabaseUser: SupabaseUser): Promise<UserProfile | undefined> => {
    const transformedUser = transformSupabaseUser(supabaseUser);
    const existingUserResponse = await userService.getUserByAuthUserId(transformedUser.id);

    if (existingUserResponse.success && existingUserResponse.data) {
      await userService.updateLastActive(transformedUser.id);

      const updateResponse = await userService.updateUser(transformedUser.id, {
        avatar: transformedUser.avatar,
        email: transformedUser.email,
        isOnline: true
      });

      return updateResponse.success && updateResponse.data
        ? updateResponse.data
        : existingUserResponse.data;
    }

    const newUserResponse = await userService.createUser({
      authUserId: transformedUser.id,
      username: transformedUser.username,
      email: transformedUser.email,
      avatar: transformedUser.avatar,
      bio: '',
      joinDate: new Date(),
      lastActive: new Date(),
      isOnline: true,
      settings: defaultSettings,
      stats: defaultStats
    });

    if (!newUserResponse.success || !newUserResponse.data) {
      throw new Error(`Failed to create user profile: ${newUserResponse.error || 'Unknown error'}`);
    }

    return newUserResponse.data;
  }, [userService]);

  useEffect(() => {
    if (!session?.user) return;

    let isCurrent = true;

    syncUserProfile(session.user)
      .then((syncedProfile) => {
        if (isCurrent) {
          setProfile(syncedProfile);
          setIsProfileResolved(true);
        }
      })
      .catch((err) => {
        console.error('Signed in, but profile sync failed:', err);
        if (isCurrent) {
          setError(err instanceof Error ? err.message : 'Signed in, but profile sync failed');
          setIsProfileResolved(true);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [session?.user, syncUserProfile]);

  const login = async (returnTo?: string) => {
    setIsLoading(true);
    setError(null);

    storeAuthReturnPath(returnTo);

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (signInError) {
      storeAuthReturnPath();
      setIsLoading(false);
      setError(signInError.message);
      throw signInError;
    }
  };

  const logout = async () => {
    const userId = session?.user?.id;
    if (userId) {
      await userService.setUserOffline(userId);
    }

    await supabase.auth.signOut();
    setSession(null);
    setProfile(undefined);
    setIsProfileResolved(true);
    setError(null);
  };

  const refreshUserProfile = async () => {
    const userId = session?.user?.id;
    if (!userId) return;

    const userResponse = await userService.getUserByAuthUserId(userId);
    if (userResponse.success && userResponse.data) {
      setProfile(userResponse.data);
    }
  };

  useSupabaseRealtime({
    channelName: `auth-profile-${session?.user?.id || 'anonymous'}`,
    tables: [DATABASE_TABLES.USERS],
    onChange: refreshUserProfile,
    enabled: Boolean(session?.user?.id)
  });

  return (
    <AuthContext.Provider value={{
      user,
      login,
      logout,
      isAuthenticated: Boolean(session?.user),
      isLoading: isLoading || Boolean(session?.user && !isProfileResolved),
      error,
      refreshUserProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
};

const transformSupabaseUser = (supabaseUser: SupabaseUser): AuthUser => {
  const metadata = supabaseUser.user_metadata || {};
  const username = metadata.full_name || metadata.name || metadata.preferred_username || supabaseUser.email || 'Adventurer';

  return {
    id: supabaseUser.id,
    username,
    avatar: metadata.avatar_url || metadata.picture || '',
    email: supabaseUser.email || '',
  };
};
