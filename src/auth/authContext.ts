import { createContext, useContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { UserProfile } from '../types';

export type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  profileLoading: boolean;
  profileError: string | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<{ error: { message: string } | null }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: { message: string } | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<{ error: string | null }>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthContext() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuthContext must be used inside AuthProvider.');
  }
  return value;
}
