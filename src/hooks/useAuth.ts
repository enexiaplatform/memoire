/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import type { UserProfile } from '../types';
import { createDemoUser, DEMO_AUTH_KEY, isDemoMode, isSupabaseConfigured, SUPABASE_ENV_ERROR } from '../lib/demoMode';

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    loading: true,
    error: null,
  });

  // Fetch user profile from user_profiles table
  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
    return data as UserProfile;
  }, []);

  useEffect(() => {
    if (isDemoMode) {
      const demoEmail = localStorage.getItem(DEMO_AUTH_KEY);
      setState({
        user: demoEmail ? createDemoUser(demoEmail) : null,
        session: null,
        profile: null,
        loading: false,
        error: null,
      });
      return;
    }

    if (!isSupabaseConfigured) {
      setState({
        user: null,
        session: null,
        profile: null,
        loading: false,
        error: SUPABASE_ENV_ERROR,
      });
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      let profile: UserProfile | null = null;
      if (session?.user) {
        profile = await fetchProfile(session.user.id);
      }
      setState({
        user: session?.user ?? null,
        session,
        profile,
        loading: false,
        error: null,
      });
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        let profile: UserProfile | null = null;
        if (session?.user) {
          profile = await fetchProfile(session.user.id);
        }
        setState({
          user: session?.user ?? null,
          session,
          profile,
          loading: false,
          error: null,
        });
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signUp = async (email: string, password: string, displayName?: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    if (isDemoMode) {
      localStorage.setItem(DEMO_AUTH_KEY, email || 'admin@memoire.local');
      setState((prev) => ({
        ...prev,
        user: createDemoUser(email || 'admin@memoire.local', displayName || 'Local Admin'),
        loading: false,
        error: null,
      }));
      return { error: null };
    }

    if (!isSupabaseConfigured) {
      setState((prev) => ({ ...prev, loading: false, error: SUPABASE_ENV_ERROR }));
      return { error: { message: SUPABASE_ENV_ERROR } };
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName || '' },
      },
    });
    if (error) {
      setState((prev) => ({ ...prev, loading: false, error: error.message }));
      return { error };
    }
    setState((prev) => ({ ...prev, loading: false }));
    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    if (isDemoMode) {
      localStorage.setItem(DEMO_AUTH_KEY, email || 'admin@memoire.local');
      setState((prev) => ({
        ...prev,
        user: createDemoUser(email || 'admin@memoire.local'),
        loading: false,
        error: null,
      }));
      return { error: null };
    }

    if (!isSupabaseConfigured) {
      setState((prev) => ({ ...prev, loading: false, error: SUPABASE_ENV_ERROR }));
      return { error: { message: SUPABASE_ENV_ERROR } };
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setState((prev) => ({ ...prev, loading: false, error: error.message }));
      return { error };
    }
    setState((prev) => ({ ...prev, loading: false }));
    return { error: null };
  };

  const signOut = async () => {
    if (isDemoMode) {
      localStorage.removeItem(DEMO_AUTH_KEY);
      setState({
        user: null,
        session: null,
        profile: null,
        loading: false,
        error: null,
      });
      return;
    }

    await supabase.auth.signOut();
    setState({
      user: null,
      session: null,
      profile: null,
      loading: false,
      error: null,
    });
  };

  return {
    ...state,
    signUp,
    signIn,
    signOut,
  };
}
