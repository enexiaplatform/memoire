import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { getUserDisplayName } from '../../utils/userDisplay';

/**
 * The operator's own name. It is not decoration: it names them in the sidebar,
 * signs the manager-facing brief, and heads the daily digest they mail to
 * themselves. Until now it could only be set at signup, so anyone who skipped
 * that field was addressed by their email address for good.
 *
 * Email and password are deliberately absent. Changing either is an
 * authentication action with its own verification flow, not a profile edit.
 */
export function ProfileTab() {
  const { user, profile, profileLoading, updateDisplayName, isAuthenticated } = useAuthContext();
  const storedName = profile?.display_name || '';
  const [name, setName] = useState(storedName);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // The profile arrives after the first render, so the field follows it until
  // the operator starts typing.
  useEffect(() => {
    if (!saving) setName(storedName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedName]);

  if (!isAuthenticated) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-navy">Your profile</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-gray-500">
          You are working in this browser without an account, so there is no profile to name yet. Sign in and your name
          will appear here, in the sidebar, and on anything you share.
        </p>
      </section>
    );
  }

  const shownName = getUserDisplayName(user, profile);
  const unchanged = name.trim() === storedName.trim();

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    setError('');
    const result = await updateDisplayName(name);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage('Saved. This is the name Memoire will use for you.');
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-navy">Your profile</h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
        How Memoire refers to you — in the sidebar, on a brief you share with a manager, and at the top of your daily
        digest.
      </p>

      <div className="mt-5 max-w-md space-y-4">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Display name</span>
          <input
            type="text"
            value={name}
            maxLength={80}
            disabled={profileLoading || saving}
            onChange={(event) => { setName(event.target.value); setMessage(''); setError(''); }}
            onKeyDown={(event) => { if (event.key === 'Enter' && !unchanged) void handleSave(); }}
            // Somebody else's name, on the one field that asks for yours: the
            // example here was the name of the person who built the product,
            // shown to every operator who opened their own profile.
            placeholder="e.g. Jane Smith"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-navy outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10 disabled:bg-gray-50"
          />
          <span className="mt-1 block text-[11px] text-gray-400">
            Currently shown as <strong className="text-gray-600">{shownName}</strong>
          </span>
        </label>

        <div>
          <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Email</span>
          <p className="mt-1 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-600">
            {user?.email || 'Not available'}
          </p>
          <span className="mt-1 block text-[11px] text-gray-400">
            Your email and password are changed from the sign-in flow, so each one is verified before it moves.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || unchanged || !name.trim()}
            className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Saving...' : 'Save name'}
          </button>
          {message && (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
              <Check className="h-4 w-4" />
              {message}
            </span>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
