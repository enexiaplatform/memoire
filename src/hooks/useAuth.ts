import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import type { UserProfile } from '../types';
import { createDemoUser, DEMO_AUTH_KEY, DEMO_WORKSPACE_KEY, isDemoMode, isSupabaseConfigured, SUPABASE_ENV_ERROR } from '../lib/demoMode';

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
}

const AUTH_TIMEOUT_MS = 9000;

function withTimeout<T>(promise: Promise<T>, message: string, timeoutMs = AUTH_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => window.clearTimeout(timer));
  });
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
    const { data, error } = await withTimeout(
      Promise.resolve(supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()),
      'Profile lookup timed out.'
    );

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
    withTimeout(supabase.auth.getSession(), 'Session restore timed out.')
      .then(async ({ data: { session } }) => {
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
      })
      .catch((error) => {
        console.error('Auth bootstrap failed:', error);
        setState({
          user: null,
          session: null,
          profile: null,
          loading: false,
          error: error instanceof Error ? error.message : 'Could not restore session.',
        });
      });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        try {
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
        } catch (error) {
          console.error('Auth state update failed:', error);
          setState({
            user: session?.user ?? null,
            session,
            profile: null,
            loading: false,
            error: error instanceof Error ? error.message : 'Could not finish auth update.',
          });
        }
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

    let result;
    try {
      result = await withTimeout(
        supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName || '' },
          },
        }),
        'Signup timed out. Please try again.'
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Signup failed. Please retry.';
      setState((prev) => ({ ...prev, loading: false, error: message }));
      return { error: { message } };
    }
    const { data, error } = result;
    if (error) {
      setState((prev) => ({ ...prev, loading: false, error: error.message }));
      return { error };
    }
    setState((prev) => ({ ...prev, user: data.user ?? prev.user, session: data.session ?? prev.session, loading: false }));
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

    let result;
    try {
      result = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        'Login timed out. Please retry.'
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed. Please retry.';
      setState((prev) => ({ ...prev, loading: false, error: message }));
      return { error: { message } };
    }

    const { data, error } = result;
    if (error) {
      setState((prev) => ({ ...prev, loading: false, error: error.message }));
      return { error };
    }
    let profile: UserProfile | null = null;
    if (data.user) {
      profile = await fetchProfile(data.user.id);
    }
    setState((prev) => ({
      ...prev,
      user: data.user ?? prev.user,
      session: data.session ?? prev.session,
      profile,
      loading: false,
      error: null,
    }));
    return { error: null };
  };

  const signOut = async () => {
    if (isDemoMode) {
      localStorage.removeItem(DEMO_AUTH_KEY);
      localStorage.removeItem(DEMO_WORKSPACE_KEY);
      setState({
        user: null,
        session: null,
        profile: null,
        loading: false,
        error: null,
      });
      return;
    }

    await withTimeout(supabase.auth.signOut(), 'Sign out timed out. Please refresh.');
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
