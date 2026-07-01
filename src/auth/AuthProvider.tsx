import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { UserProfile } from '../types';
import { pipelineSupabaseConfigMessage, supabaseClient } from '../lib/supabaseClient';
import { clearDemoWorkspaceForAccount, clearDemoWorkspaceMode } from '../lib/demoMode';
import { AuthContext, type AuthContextValue } from './authContext';
import { getFriendlyAuthErrorMessage, logAuthDebug, logAuthWarning } from './authErrors';
import { getPasswordPolicyError } from './passwordPolicy';

const PIPELINE_AUTH_REDIRECT_KEY = 'memoire.pipelineDefenseAuthRedirect.v1';
const DEFAULT_AUTH_ROUTE = '/app/today';
const PROFILE_TIMEOUT_MS = 5000;
const AUTH_TIMEOUT_MS = 9000;

let sessionBootstrapPromise: Promise<Session | null> | null = null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const applySession = useCallback((nextSession: Session | null) => {
    setSession(nextSession);
    setUser(nextSession?.user ?? null);
    if (!nextSession?.user) {
      setProfile(null);
      setProfileLoading(false);
      setProfileError(null);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!supabaseClient) {
      setLoading(false);
      setError(pipelineSupabaseConfigMessage);
      return;
    }

    let cancelled = false;

    getInitialSession()
      .then((initialSession) => {
        if (cancelled || !mountedRef.current) return;
        applySession(initialSession);
        setError(null);
        logAuthDebug('auth session loaded', { hasSession: Boolean(initialSession) });
        void completePendingCloudWorkspace(initialSession?.user ?? null);
      })
      .catch((sessionError: unknown) => {
        if (cancelled || !mountedRef.current) return;
        const friendlyMessage = getFriendlyAuthErrorMessage(sessionError);
        setError(friendlyMessage);
        logAuthWarning('auth bootstrap failed', sessionError);
      })
      .finally(() => {
        if (!cancelled && mountedRef.current) setLoading(false);
      });

    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled || !mountedRef.current) return;
      applySession(nextSession);
      setLoading(false);
      setError(null);
      logAuthDebug('auth state changed', { hasSession: Boolean(nextSession) });
      void completePendingCloudWorkspace(nextSession?.user ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [applySession]);

  useEffect(() => {
    if (!supabaseClient || !user) {
      setProfile(null);
      setProfileLoading(false);
      setProfileError(null);
      return;
    }

    let cancelled = false;
    setProfileLoading(true);
    setProfileError(null);

    loadUserProfile(user.id)
      .then((nextProfile) => {
        if (cancelled || !mountedRef.current) return;
        setProfile(nextProfile);
        setProfileError(null);
      })
      .catch((profileLoadError: unknown) => {
        if (cancelled || !mountedRef.current) return;
        setProfile(null);
        setProfileError(getFriendlyAuthErrorMessage(profileLoadError, 'Cloud profile is temporarily unavailable.'));
        logAuthWarning('profile lookup failed', profileLoadError);
      })
      .finally(() => {
        if (!cancelled && mountedRef.current) setProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    session,
    profile,
    profileLoading,
    profileError,
    loading,
    error,
    isAuthenticated: Boolean(user),
    signIn: async (email: string, password: string) => {
      if (!supabaseClient) {
        setError(pipelineSupabaseConfigMessage);
        return { error: { message: pipelineSupabaseConfigMessage } };
      }

      setLoading(true);
      setError(null);
      try {
        const { data, error: signInError } = await withTimeout(
          supabaseClient.auth.signInWithPassword({ email, password }),
          'Login timed out. Please retry.',
          AUTH_TIMEOUT_MS,
        );
        if (signInError) {
          const message = getFriendlyAuthErrorMessage(signInError, 'Login failed. Please retry.');
          setError(message);
          return { error: { message } };
        }
        await clearDemoWorkspaceForAccount();
        applySession(data.session);
        return { error: null };
      } catch (signInFailure: unknown) {
        const message = getFriendlyAuthErrorMessage(signInFailure, 'Login failed. Please retry.');
        setError(message);
        logAuthWarning('password sign-in failed', signInFailure);
        return { error: { message } };
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    signUp: async (email: string, password: string, displayName?: string) => {
      if (!supabaseClient) {
        setError(pipelineSupabaseConfigMessage);
        return { error: { message: pipelineSupabaseConfigMessage } };
      }

      setLoading(true);
      setError(null);
      const passwordError = getPasswordPolicyError(password);
      if (passwordError) {
        setLoading(false);
        setError(passwordError);
        return { error: { message: passwordError } };
      }
      try {
        const { data, error: signUpError } = await withTimeout(
          supabaseClient.auth.signUp({
            email,
            password,
            options: {
              data: { display_name: displayName || '' },
              emailRedirectTo: `${window.location.origin}/login?verified=1`,
            },
          }),
          'Signup timed out. Please try again.',
          AUTH_TIMEOUT_MS,
        );
        if (signUpError) {
          const message = getFriendlyAuthErrorMessage(signUpError, 'Signup failed. Please retry.');
          setError(message);
          return { error: { message } };
        }
        await clearDemoWorkspaceForAccount();
        applySession(data.session);
        return { error: null };
      } catch (signUpFailure: unknown) {
        const message = getFriendlyAuthErrorMessage(signUpFailure, 'Signup failed. Please retry.');
        setError(message);
        logAuthWarning('password sign-up failed', signUpFailure);
        return { error: { message } };
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    signInWithGoogle: async (redirectTo?: string) => {
      if (!supabaseClient) {
        setError(pipelineSupabaseConfigMessage);
        return { error: pipelineSupabaseConfigMessage };
      }

      setLoading(true);
      const authDestination = getCurrentAuthDestination(redirectTo);
      setPendingAuthRedirect(authDestination);
      const { error: signInError } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}${authDestination}`,
        },
      });
      setLoading(false);
      if (signInError) {
        const message = getFriendlyAuthErrorMessage(signInError, 'Could not start Google sign-in.');
        setError(message);
        return { error: message };
      }
      return { error: null };
    },
    requestPasswordReset: async (email: string) => {
      if (!supabaseClient) return { error: pipelineSupabaseConfigMessage };
      setError(null);
      try {
        const { error: resetError } = await withTimeout(
          supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
          }),
          'Password reset request timed out. Please retry.',
          AUTH_TIMEOUT_MS,
        );
        if (resetError) {
          const message = getFriendlyAuthErrorMessage(resetError, 'Could not send the reset email.');
          return { error: message };
        }
        return { error: null };
      } catch (resetFailure: unknown) {
        return {
          error: getFriendlyAuthErrorMessage(resetFailure, 'Could not send the reset email.'),
        };
      }
    },
    updatePassword: async (password: string) => {
      if (!supabaseClient) return { error: pipelineSupabaseConfigMessage };
      setError(null);
      const passwordError = getPasswordPolicyError(password);
      if (passwordError) return { error: passwordError };
      try {
        const { error: updateError } = await withTimeout(
          supabaseClient.auth.updateUser({ password }),
          'Password update timed out. Please retry.',
          AUTH_TIMEOUT_MS,
        );
        if (updateError) {
          return { error: getFriendlyAuthErrorMessage(updateError, 'Could not update your password.') };
        }
        return { error: null };
      } catch (updateFailure: unknown) {
        return {
          error: getFriendlyAuthErrorMessage(updateFailure, 'Could not update your password.'),
        };
      }
    },
    resendSignupConfirmation: async (email: string) => {
      if (!supabaseClient) return { error: pipelineSupabaseConfigMessage };
      setError(null);
      try {
        const { error: resendError } = await withTimeout(
          supabaseClient.auth.resend({
            type: 'signup',
            email,
            options: {
              emailRedirectTo: `${window.location.origin}/login?verified=1`,
            },
          }),
          'Verification email request timed out. Please retry.',
          AUTH_TIMEOUT_MS,
        );
        if (resendError) {
          return { error: getFriendlyAuthErrorMessage(resendError, 'Could not resend the verification email.') };
        }
        return { error: null };
      } catch (resendFailure: unknown) {
        return {
          error: getFriendlyAuthErrorMessage(resendFailure, 'Could not resend the verification email.'),
        };
      }
    },
    signOut: async () => {
      if (!supabaseClient) {
        applySession(null);
        setError(null);
        return { error: null };
      }

      setLoading(true);
      try {
        const { error: signOutError } = await withTimeout(
          supabaseClient.auth.signOut(),
          'Sign out timed out. Please refresh.',
          AUTH_TIMEOUT_MS,
        );
        clearDemoWorkspaceMode();
        if (signOutError) {
          const message = getFriendlyAuthErrorMessage(signOutError, 'Could not sign out. Please retry.');
          setError(message);
          return { error: message };
        }
        applySession(null);
        setError(null);
        return { error: null };
      } catch (signOutFailure: unknown) {
        const message = getFriendlyAuthErrorMessage(signOutFailure, 'Could not sign out. Please retry.');
        setError(message);
        logAuthWarning('sign-out failed', signOutFailure);
        return { error: message };
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
  }), [applySession, error, loading, profile, profileError, profileLoading, session, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function getInitialSession() {
  if (!supabaseClient) return Promise.resolve(null);

  if (!sessionBootstrapPromise) {
    sessionBootstrapPromise = withTimeout(
      supabaseClient.auth.getSession().then(({ data, error }) => {
        if (error) throw error;
        return data.session;
      }),
      'Session restore timed out.',
      AUTH_TIMEOUT_MS,
    ).finally(() => {
      window.setTimeout(() => {
        sessionBootstrapPromise = null;
      }, 0);
    });
  }

  return sessionBootstrapPromise;
}

async function loadUserProfile(userId: string) {
  if (!supabaseClient) return null;

  const { data, error } = await withTimeout(
    Promise.resolve(
      supabaseClient
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle(),
    ),
    'Profile lookup timed out.',
    PROFILE_TIMEOUT_MS,
  );

  if (error) throw error;
  return data as UserProfile | null;
}

function withTimeout<T>(promise: Promise<T>, message: string, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => resolve(value))
      .catch((timeoutError) => reject(timeoutError))
      .finally(() => window.clearTimeout(timer));
  });
}

function setPendingAuthRedirect(target: string) {
  try {
    window.localStorage.setItem(PIPELINE_AUTH_REDIRECT_KEY, target);
  } catch {
    // Non-blocking: OAuth can still proceed without the marker.
  }
}

function getCurrentAuthDestination(requestedDestination?: string) {
  if (typeof window === 'undefined') return DEFAULT_AUTH_ROUTE;
  if (requestedDestination?.startsWith('/app/')) return requestedDestination;
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (currentPath.startsWith('/app/')) return currentPath;
  return DEFAULT_AUTH_ROUTE;
}

async function completePendingCloudWorkspace(user: User | null) {
  if (!user || typeof window === 'undefined') return;

  const clearedDemoWorkspace = await clearDemoWorkspaceForAccount();

  let target = '';
  try {
    target = window.localStorage.getItem(PIPELINE_AUTH_REDIRECT_KEY) || '';
  } catch {
    target = '';
  }

  if (!target) {
    if (clearedDemoWorkspace && window.location.pathname.startsWith('/app/')) {
      window.setTimeout(() => {
        window.location.reload();
      }, 0);
    }
    return;
  }

  try {
    window.localStorage.removeItem(PIPELINE_AUTH_REDIRECT_KEY);
  } catch {
    // Ignore localStorage cleanup errors.
  }

  if (window.location.pathname !== target.split(/[?#]/)[0]) {
    window.setTimeout(() => {
      window.location.replace(target);
    }, 0);
    return;
  }

  if (clearedDemoWorkspace) {
    window.setTimeout(() => {
      window.location.reload();
    }, 0);
  }
}
