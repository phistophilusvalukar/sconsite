import { createContext } from 'react';
import { UserProfile } from '../types/database';

export interface AuthUser {
  id: string;
  username: string;
  avatar: string;
  email: string;
  isAdmin?: boolean;
  profile?: UserProfile;
}

export interface AuthContextType {
  user: AuthUser | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  refreshUserProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
