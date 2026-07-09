import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { DATABASE_TABLES, supabase } from '../config/database';
import { useSupabaseRealtime } from '../hooks/useSupabaseRealtime';
import { UserService } from '../services/userService';
import { UserProfile } from '../types/database';

interface User {
  id: string;
  username: string;
  avatar: string;
  email: string;
  globalName?: string | null;
  isAdmin?: boolean;
  profile?: UserProfile;
}

interface AuthContextType {
  user: User | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  refreshUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userService = useMemo(() => UserService.getInstance(), []);

  const user = useMemo(() => {
    if (!session?.user) return null;

    return {
      ...transformSupabaseUser(session.user),
      isAdmin: profile?.isAdmin,
      profile,
    };
  }, [session, profile]);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!isMounted) return;

      if (sessionError) {
        console.error('Failed to restore auth session:', sessionError);
        setError(sessionError.message);
      }

      setSession(data.session ?? null);
      setIsLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;

      setSession(nextSession);
      setProfile(undefined);
      setError(null);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) return;

    let isCurrent = true;

    syncUserProfile(session.user)
      .then((syncedProfile) => {
        if (isCurrent) {
          setProfile(syncedProfile);
        }
      })
      .catch((err) => {
        console.error('Signed in, but profile sync failed:', err);
        if (isCurrent) {
          setError(err instanceof Error ? err.message : 'Signed in, but profile sync failed');
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [session?.user?.id]);

  const syncUserProfile = async (supabaseUser: SupabaseUser): Promise<UserProfile | undefined> => {
    const transformedUser = transformSupabaseUser(supabaseUser);
    const existingUserResponse = await userService.getUserByAuthUserId(transformedUser.id);

    if (existingUserResponse.success && existingUserResponse.data) {
      await userService.updateLastActive(transformedUser.id);

      const updateResponse = await userService.updateUser(transformedUser.id, {
        username: transformedUser.username,
        avatar: transformedUser.avatar,
        email: transformedUser.email,
        globalName: transformedUser.globalName,
        isOnline: true
      });

      return updateResponse.success && updateResponse.data
        ? updateResponse.data
        : existingUserResponse.data;
    }

    const newUserResponse = await userService.createUser({
      authUserId: transformedUser.id,
      username: transformedUser.username,
      globalName: transformedUser.globalName,
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
  };

  const login = async () => {
    setIsLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (signInError) {
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
      isLoading,
      error,
      refreshUserProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
};

const transformSupabaseUser = (supabaseUser: SupabaseUser): User => {
  const metadata = supabaseUser.user_metadata || {};
  const username = metadata.full_name || metadata.name || metadata.preferred_username || supabaseUser.email || 'Adventurer';

  return {
    id: supabaseUser.id,
    username,
    avatar: metadata.avatar_url || metadata.picture || '',
    email: supabaseUser.email || '',
    globalName: metadata.full_name || metadata.name || null,
  };
};
