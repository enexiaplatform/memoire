import { useState } from 'react';
import { useAuthContext } from '../../auth/authContext';

export function AuthButton() {
  const { user, loading, error, isAuthenticated, signInWithGoogle, signOut } = useAuthContext();
  const [actionError, setActionError] = useState('');

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email ||
    'Signed in';

  const handleSignIn = async () => {
    setActionError('');
    const result = await signInWithGoogle();
    if (result.error) setActionError(result.error);
  };

  const handleSignOut = async () => {
    setActionError('');
    const result = await signOut();
    if (result.error) setActionError(result.error);
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {loading ? (
          <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-bold text-gray-600">
            Loading account...
          </span>
        ) : isAuthenticated ? (
          <>
            <span className="max-w-[240px] truncate text-xs font-semibold text-gray-600" title={displayName}>
              {displayName}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
            >
              Sign out
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleSignIn}
            className="rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white hover:bg-navy/90"
          >
            Sign in / create account with Google
          </button>
        )}
      </div>
      {(actionError || error) && !isAuthenticated && (
        <p className="text-xs leading-5 text-amber-700">
          {actionError || error}
        </p>
      )}
    </div>
  );
}
