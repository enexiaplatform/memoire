import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { pipelineSupabaseConfigMessage, supabaseClient } from '../lib/supabaseClient';
import { AuthContext, type AuthContextValue } from './authContext';

const PIPELINE_AUTH_REDIRECT_KEY = 'memoire.pipelineDefenseAuthRedirect.v1';
const PIPELINE_DEFENSE_ROUTE = '/app/pipeline-defense';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseClient) {
      setLoading(false);
      setError(pipelineSupabaseConfigMessage);
      return;
    }

    let mounted = true;

    supabaseClient.auth.getSession()
      .then(({ data, error: sessionError }) => {
        if (!mounted) return;
        if (sessionError) {
          setError(sessionError.message);
        } else {
          setSession(data.session);
          setUser(data.session?.user ?? null);
          setError(null);
          debugAuth('auth session loaded', { hasSession: Boolean(data.session) });
          completePendingPipelineRedirect(data.session?.user ?? null);
        }
      })
      .catch((sessionError: unknown) => {
        if (!mounted) return;
        setError(sessionError instanceof Error ? sessionError.message : 'Could not load account session.');
        debugAuth('auth session load failed');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
      setError(null);
      debugAuth('auth state changed', { hasSession: Boolean(nextSession) });
      completePendingPipelineRedirect(nextSession?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    session,
    loading,
    error,
    isAuthenticated: Boolean(user),
    signInWithGoogle: async () => {
      if (!supabaseClient) {
        setError(pipelineSupabaseConfigMessage);
        return { error: pipelineSupabaseConfigMessage };
      }

      setLoading(true);
      setPendingPipelineRedirect();
      const { error: signInError } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}${PIPELINE_DEFENSE_ROUTE}`,
        },
      });
      setLoading(false);
      if (signInError) {
        setError(signInError.message);
        return { error: signInError.message };
      }
      return { error: null };
    },
    signOut: async () => {
      if (!supabaseClient) {
        setUser(null);
        setSession(null);
        setError(null);
        return { error: null };
      }

      setLoading(true);
      const { error: signOutError } = await supabaseClient.auth.signOut();
      setLoading(false);
      if (signOutError) {
        setError(signOutError.message);
        return { error: signOutError.message };
      }
      setUser(null);
      setSession(null);
      setError(null);
      return { error: null };
    },
  }), [error, loading, session, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function setPendingPipelineRedirect() {
  try {
    window.localStorage.setItem(PIPELINE_AUTH_REDIRECT_KEY, PIPELINE_DEFENSE_ROUTE);
  } catch {
    // Non-blocking: OAuth can still proceed without the marker.
  }
}

function completePendingPipelineRedirect(user: User | null) {
  if (!user || typeof window === 'undefined') return;

  let target = '';
  try {
    target = window.localStorage.getItem(PIPELINE_AUTH_REDIRECT_KEY) || '';
  } catch {
    target = '';
  }

  if (!target) return;

  try {
    window.localStorage.removeItem(PIPELINE_AUTH_REDIRECT_KEY);
  } catch {
    // Ignore localStorage cleanup errors.
  }

  if (window.location.pathname !== target) {
    window.setTimeout(() => {
      window.location.replace(target);
    }, 0);
  }
}

function debugAuth(message: string, context?: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.debug(`[MemoireAuth] ${message}`, context || {});
  }
}
