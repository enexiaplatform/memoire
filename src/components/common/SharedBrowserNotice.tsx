import { useEffect, useState } from 'react';
import { Users, X } from 'lucide-react';
import { LOCAL_WORKSPACE_PURGED_EVENT } from '../../services/localWorkspaceOwner';

/**
 * Says out loud that this browser had somebody else's workspace in it.
 *
 * Clearing the records is the right thing to do and it is invisible, which is
 * the problem: the operator signs in on the office machine, sees a workspace
 * that looks emptier than the one that was on screen a minute ago, and has no
 * way to tell a privacy measure from data loss. So the notice explains both
 * halves - what was removed was not theirs, and their own records are in their
 * account, not in this browser.
 *
 * Dismissible, unlike the storage banner: nothing of the reader's is at risk
 * here, and a notice that cannot be closed is a notice that gets ignored.
 */
export function SharedBrowserNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onPurged = () => setVisible(true);
    window.addEventListener(LOCAL_WORKSPACE_PURGED_EVENT, onPurged);
    return () => window.removeEventListener(LOCAL_WORKSPACE_PURGED_EVENT, onPurged);
  }, []);

  if (!visible) return null;

  return (
    <div role="status" className="border-b border-blue-200 bg-blue-50 px-4 py-3 sm:px-5 lg:px-6">
      <div className="flex items-start gap-2.5">
        <Users className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
        <p className="max-w-3xl text-sm leading-6 text-blue-900">
          <span className="font-bold">This browser was holding another account&apos;s records.</span>
          {' '}
          They have been cleared so they stay with the account they belong to. Nothing of yours was
          removed — your workspace loads from your account.
        </p>
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Dismiss"
          className="ml-auto shrink-0 rounded-full p-1 text-blue-700 hover:bg-blue-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
