import { useEffect, useRef, useState } from 'react';
import { supabaseClient } from '../../lib/supabaseClient';

const GOOGLE_SCRIPT_ID = 'memoire-google-identity-services';
const PIPELINE_AUTH_REDIRECT_KEY = 'memoire.pipelineDefenseAuthRedirect.v1';
const DEFAULT_AUTH_ROUTE = '/app/today';
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleAccounts = {
  id: {
    initialize: (config: {
      client_id: string;
      callback: (response: GoogleCredentialResponse) => void;
      nonce: string;
      use_fedcm_for_prompt?: boolean;
    }) => void;
    renderButton: (
      parent: HTMLElement,
      options: {
        type: 'standard';
        theme: 'outline';
        size: 'large';
        shape: 'pill';
        text: 'continue_with';
        logo_alignment: 'left';
        width: number;
      },
    ) => void;
  };
};

declare global {
  interface Window {
    google?: { accounts: GoogleAccounts };
  }
}

export function GoogleAuthButton({
  redirectTo,
}: {
  /**
   * Accepted, and deliberately not read.
   *
   * Google Identity Services renders its own button and owns the words on it;
   * the render option below picks which of Google's phrasings, and that is the
   * only lever there is. So there is nothing here for a caller's label to
   * apply to. The prop stays in the type
   * because Login and Signup each pass a different one, and removing it would
   * break two call sites to delete a string nobody reads.
   *
   * It was destructured as `_label` for one commit. This project sets no
   * underscore ignore pattern on `no-unused-vars`, so that failed `npm run
   * lint` and took the whole build gate with it.
   */
  label?: string;
  redirectTo?: string;
}) {
  /**
   * Deliberately not reading the shared auth error.
   *
   * `useAuthContext().error` is whatever failed last anywhere in auth,
   * including a mistyped password on the form below. This button rendered it
   * in its own amber slot, so a stale saved password produced "Invalid login
   * credentials" *underneath the Google button* as well as under the password
   * field - and the honest reading of that is that Google sign-in is broken.
   * It is not: nothing here had run. A button reports what this button did.
   */
  const buttonRef = useRef<HTMLDivElement>(null);
  const [actionError, setActionError] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function initializeGoogle() {
      if (!googleClientId) {
        setActionError('Google sign-in is not configured.');
        return;
      }
      if (!supabaseClient) {
        setActionError('Cloud sign-in is not configured.');
        return;
      }

      try {
        await loadGoogleIdentityServices();
        if (cancelled || !buttonRef.current || !window.google) return;

        const { nonce, hashedNonce } = await createNoncePair();
        if (cancelled || !buttonRef.current || !window.google) return;

        window.google.accounts.id.initialize({
          client_id: googleClientId,
          nonce: hashedNonce,
          use_fedcm_for_prompt: true,
          callback: async (response) => {
            if (!response.credential || !supabaseClient) {
              setActionError('Google did not return a valid sign-in credential.');
              return;
            }

            setIsSigningIn(true);
            setActionError('');
            const destination = getAuthDestination(redirectTo);
            setPendingAuthRedirect(destination);

            try {
              const { error: signInError } = await supabaseClient.auth.signInWithIdToken({
                provider: 'google',
                token: response.credential,
                nonce,
              });

              if (signInError) {
                setActionError(signInError.message || 'Could not sign in with Google.');
                setIsSigningIn(false);
              }
            } catch (signInFailure) {
              setActionError(signInFailure instanceof Error ? signInFailure.message : 'Could not sign in with Google.');
              setIsSigningIn(false);
            }
          },
        });

        buttonRef.current.replaceChildren();
        window.google.accounts.id.renderButton(buttonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          logo_alignment: 'left',
          width: Math.min(400, Math.max(240, buttonRef.current.clientWidth || 320)),
        });
      } catch (scriptError) {
        if (!cancelled) {
          setActionError(scriptError instanceof Error ? scriptError.message : 'Could not load Google sign-in.');
        }
      }
    }

    void initializeGoogle();
    return () => {
      cancelled = true;
    };
  }, [redirectTo]);

  return (
    <div className="space-y-2">
      <div
        ref={buttonRef}
        aria-busy={isSigningIn}
        className={isSigningIn ? 'pointer-events-none flex min-h-11 w-full justify-center opacity-60' : 'flex min-h-11 w-full justify-center'}
      />
      {isSigningIn && <p className="text-center text-xs text-gray-500">Signing in securely...</p>}
      {actionError && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
          {actionError}
        </p>
      )}
    </div>
  );
}

function loadGoogleIdentityServices() {
  if (window.google?.accounts?.id) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Could not load Google sign-in.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Google sign-in.'));
    document.head.appendChild(script);
  });
}

async function createNoncePair() {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = btoa(String.fromCharCode(...randomBytes));
  const encodedNonce = new TextEncoder().encode(nonce);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encodedNonce);
  const hashedNonce = Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return { nonce, hashedNonce };
}

function getAuthDestination(requestedDestination?: string) {
  if (requestedDestination?.startsWith('/app/')) return requestedDestination;
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (currentPath.startsWith('/app/')) return currentPath;
  return DEFAULT_AUTH_ROUTE;
}

function setPendingAuthRedirect(target: string) {
  try {
    window.localStorage.setItem(PIPELINE_AUTH_REDIRECT_KEY, target);
  } catch {
    // AuthProvider can still complete the session if localStorage is unavailable.
  }
}
