import { useState } from 'react';
import { useAuthContext } from '../../auth/authContext';

export function GoogleAuthButton({
  label = 'Continue with Google',
  redirectTo,
}: {
  label?: string;
  redirectTo?: string;
}) {
  const { loading, error, signInWithGoogle } = useAuthContext();
  const [actionError, setActionError] = useState('');

  const handleSignIn = async () => {
    setActionError('');
    const result = await signInWithGoogle(redirectTo);
    if (result.error) setActionError(result.error);
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleSignIn}
        disabled={loading}
        className="flex w-full items-center justify-center rounded-full border border-gray-300 bg-white px-4 py-3 font-display text-sm font-bold text-gray-800 transition-colors hover:border-brand-blue hover:bg-blue-50/50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? 'Opening secure sign-in...' : label}
      </button>
      {(actionError || error) && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
          {actionError || error}
        </p>
      )}
    </div>
  );
}
