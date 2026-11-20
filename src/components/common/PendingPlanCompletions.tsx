import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthContext } from '../../auth/authContext';
import { dataOwnerForLogin } from '../../services/activeWorkspaceScope';
import {
  getPlanCompletionJournalStatus,
  flushPendingPlanCompletions,
  PLAN_COMPLETION_CHANGED,
} from '../../services/planCompletionClient';
import { hasLocalSampleData } from '../../utils/dataMode';

const emptyJournal = { pending: 0, unreadable: 0 };

export function PendingPlanCompletions() {
  const { user } = useAuthContext();
  const ownerId = hasLocalSampleData() ? undefined : dataOwnerForLogin(user?.id);
  const [{ pending, unreadable }, setJournal] = useState(emptyJournal);
  const [conflict, setConflict] = useState(false);
  const running = useRef(false);

  const readJournal = useCallback(() => {
    try {
      return ownerId ? getPlanCompletionJournalStatus(ownerId) : emptyJournal;
    } catch {
      return emptyJournal;
    }
  }, [ownerId]);
  const flush = useCallback(async () => {
    if (!ownerId || running.current || navigator.onLine === false || !readJournal().pending) return;
    running.current = true;
    try {
      await flushPendingPlanCompletions(ownerId);
    } catch {
      // A scope change or inaccessible browser storage leaves the intent parked.
    } finally {
      running.current = false;
    }
  }, [readJournal, ownerId]);

  useEffect(() => {
    setJournal(readJournal());
    setConflict(false);
    const changed = (event: Event) => {
      setJournal(readJournal());
      if ((event as CustomEvent).detail?.status === 'conflict') setConflict(true);
    };
    const sync = () => { void flush(); };
    window.addEventListener(PLAN_COMPLETION_CHANGED, changed);
    window.addEventListener('storage', changed);
    window.addEventListener('online', sync);
    const timer = window.setInterval(sync, 30_000);
    sync();
    return () => {
      window.removeEventListener(PLAN_COMPLETION_CHANGED, changed);
      window.removeEventListener('storage', changed);
      window.removeEventListener('online', sync);
      window.clearInterval(timer);
    };
  }, [readJournal, flush]);

  if (!ownerId || (!pending && !unreadable && !conflict)) return null;
  return (
    <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      {pending > 0 && (
        <>
          {pending} Plan completion{pending === 1 ? '' : 's'} waiting for workspace confirmation.{' '}
          <button type="button" className="font-semibold underline" onClick={() => { void flush(); }}>Retry</button>
        </>
      )}
      {conflict && (
        <p>
          An Activity link could not be confirmed. Review the current item in Plan.{' '}
          <button type="button" className="font-semibold underline" onClick={() => setConflict(false)}>Dismiss</button>
        </p>
      )}
      {unreadable > 0 && (
        <p>Some saved Plan completions could not be read. Check the current item in Plan before trying again.</p>
      )}
    </div>
  );
}
