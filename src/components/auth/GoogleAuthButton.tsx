import { useState } from 'react';
import { useAuthContext } from '../../auth/authContext';

export function GoogleAuthButton({ label = 'Continue with Google' }: { label?: string }) {
  const { loading, error, signInWithGoogle } = useAuthContext();
  const [actionError, setActionError] = useState('');

  const handleSignIn = async () => {
    setActionError('');
    const result = await signInWithGoogle();
    if (result.error) setActionError(result.error);
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleSignIn}
        disabled={loading}
        className="flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? 'Loading account...' : label}
      </button>
      {(actionError || error) && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
          {actionError || error}
        </p>
      )}
    </div>
  );
}
