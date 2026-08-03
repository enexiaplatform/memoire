import { useCallback, useEffect, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { hasLocalSampleData } from '../../utils/dataMode';
import {
  flushPendingSalesActivities,
  listPendingSalesActivities,
  PENDING_SYNC_CHANGED_EVENT,
} from '../../services/salesActivityStore';

/**
 * What happens to a capture made where there is no signal.
 *
 * Capture is the one thing this product asks people to do away from a desk -
 * in a car park, in a lobby, on the way out of a hospital - which is exactly
 * where the connection is worst. The record has always been written to this
 * device first, so nothing was ever lost; what was missing was anything that
 * sent it afterwards, and anything that said it was waiting.
 *
 * Two rules here:
 *
 * - It sends by itself. Somebody who logged a visit from a basement should not
 *   have to remember to press a button an hour later; the browser tells us when
 *   the connection is back, and that is when it goes.
 * - It says "waiting", never "saved" and never "failed". The capture is safe on
 *   the device and it is not in the account yet, and both halves are true at the
 *   same time. Reporting only one of them is how a product ends up either
 *   frightening somebody whose note is fine, or reassuring somebody whose note
 *   is about to be lost with the browser cache.
 */
export function OfflineCaptureBanner() {
  const { user } = useAuthContext();
  const sampleDataActive = hasLocalSampleData();
  const userId = sampleDataActive ? undefined : user?.id;

  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [failure, setFailure] = useState('');

  const flush = useCallback(async () => {
    if (!userId || syncing) return;
    if (listPendingSalesActivities().length === 0) return;

    setSyncing(true);
    const result = await flushPendingSalesActivities(userId);
    setSyncing(false);
    setPending(result.remaining);
    setFailure(result.remaining > 0 && result.error ? result.error : '');
  }, [syncing, userId]);

  useEffect(() => {
    setPending(listPendingSalesActivities().length);

    const onChanged = () => setPending(listPendingSalesActivities().length);
    const onOnline = () => {
      setOnline(true);
      void flush();
    };
    const onOffline = () => setOnline(false);

    window.addEventListener(PENDING_SYNC_CHANGED_EVENT, onChanged);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener(PENDING_SYNC_CHANGED_EVENT, onChanged);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [flush]);

  // A tab opened after the connection came back never sees an `online` event.
  useEffect(() => {
    if (online) void flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, userId]);

  if (online && pending === 0) return null;

  return (
    <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 sm:px-5 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 items-start gap-2">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p className="min-w-0 text-sm leading-6 text-amber-900">
            {pending > 0 ? (
              <>
                <span className="font-bold">
                  {pending} capture{pending === 1 ? '' : 's'} saved on this device, waiting to sync.
                </span>
                {' '}
                {online
                  ? failure || 'Memoire is sending them now.'
                  : 'They will be sent as soon as you are back online.'}
              </>
            ) : (
              <>
                <span className="font-bold">You are offline.</span>
                {' '}
                Capture still works - anything you log is saved here and sent when the connection is back.
              </>
            )}
          </p>
        </div>
        {pending > 0 && online && userId && (
          <button
            type="button"
            onClick={() => { void flush(); }}
            disabled={syncing}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-bold text-amber-900 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sending' : 'Send now'}
          </button>
        )}
      </div>
    </div>
  );
}
