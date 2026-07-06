import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { UserService } from '../services/userService';
import { UserProfile } from '../types/database';
import { supabase } from '../config/database';

interface User {
  id: string;
  username: string;
  avatar: string;
  email: string;
  globalName?: string | null;
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
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userService = UserService.getInstance();

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          throw sessionError;
        }

        if (data.session?.user && isMounted) {
          const appUser = await syncUserProfile(data.session.user);
          setUser(appUser);
        }
      } catch (err) {
        console.error('Failed to initialize auth:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize authentication');
        setUser(null);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initializeAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return;

      try {
        setIsLoading(true);
        setError(null);

        if (session?.user) {
          const appUser = await syncUserProfile(session.user);
          setUser(appUser);
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error('Auth state change failed:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const syncUserProfile = async (SupabaseUser: SupabaseUser): Promise<User> => {
    const transformedUser = transformSupabaseUser(SupabaseUser);
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

      transformedUser.profile = updateResponse.success && updateResponse.data
        ? updateResponse.data
        : existingUserResponse.data;

      return transformedUser;
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

    transformedUser.profile = newUserResponse.data;
    return transformedUser;
  };

  const login = async () => {
    try {
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
        throw signInError;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      setError(errorMessage);
      setIsLoading(false);
      throw err;
    }
  };

  const logout = async () => {
    if (user?.id) {
      await userService.setUserOffline(user.id);
    }

    await supabase.auth.signOut();
    setUser(null);
    setError(null);
  };

  const refreshUserProfile = async () => {
    if (!user?.id) return;

    try {
      const userResponse = await userService.getUserByAuthUserId(user.id);
      if (userResponse.success && userResponse.data) {
        setUser(prev => prev ? { ...prev, profile: userResponse.data } : null);
      }
    } catch (err) {
      console.error('Failed to refresh user profile:', err);
    }
  };

  const transformSupabaseUser = (SupabaseUser: SupabaseUser): User => {
    const metadata = SupabaseUser.user_metadata || {};
    const username = metadata.full_name || metadata.name || metadata.preferred_username || SupabaseUser.email || 'Adventurer';

    return {
      id: SupabaseUser.id,
      username,
      avatar: metadata.avatar_url || metadata.picture || '',
      email: SupabaseUser.email || '',
      globalName: metadata.full_name || metadata.name || null,
    };
  };

  return (
    <AuthContext.Provider value={{
      user,
      login,
      logout,
      isAuthenticated: user !== null,
      isLoading,
      error,
      refreshUserProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
};
