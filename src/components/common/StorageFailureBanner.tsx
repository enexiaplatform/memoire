import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import {
  getLastLocalWriteFailure,
  LOCAL_WRITE_FAILED_EVENT,
  LOCAL_WRITE_RECOVERED_EVENT,
  type LocalWriteFailure,
} from '../../services/localWriteGuard';

/**
 * The one thing the interface must never do quietly.
 *
 * When the browser refuses a write, the record the operator just typed is not
 * anywhere on this device. Every other failure state in Memoire is a
 * degradation - the cloud is unreachable, a sync is pending - and is reported
 * in the calm language those deserve. This one is data that does not exist, so
 * it gets a banner that stays until a write succeeds, and it says what to do
 * about it rather than what went wrong.
 *
 * It is deliberately not dismissible. A dismissed warning about unsaved data is
 * a worse lie than no warning at all.
 */
export function StorageFailureBanner() {
  const [failure, setFailure] = useState<LocalWriteFailure | null>(() => getLastLocalWriteFailure());

  useEffect(() => {
    const onFailed = (event: Event) => {
      const detail = (event as CustomEvent<LocalWriteFailure>).detail;
      if (detail) setFailure(detail);
    };
    const onRecovered = () => setFailure(null);

    window.addEventListener(LOCAL_WRITE_FAILED_EVENT, onFailed);
    window.addEventListener(LOCAL_WRITE_RECOVERED_EVENT, onRecovered);
    return () => {
      window.removeEventListener(LOCAL_WRITE_FAILED_EVENT, onFailed);
      window.removeEventListener(LOCAL_WRITE_RECOVERED_EVENT, onRecovered);
    };
  }, []);

  if (!failure) return null;

  return (
    <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-3 sm:px-5 lg:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
          <div>
            <p className="text-sm font-bold text-red-900">Your last change was not saved in this browser.</p>
            <p className="mt-0.5 max-w-3xl text-sm leading-6 text-red-800">
              {failure.message}
              {' '}
              If you are signed in, the change may still have reached your account - Settings shows what this
              workspace is storing and when it last synced.
            </p>
          </div>
        </div>
        <Link
          to="/app/settings"
          className="shrink-0 self-start rounded-full bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800"
        >
          Open Settings
        </Link>
      </div>
    </div>
  );
}
