import { useEffect, useState } from 'react';

export const WORKSPACE_SYNC_STATUS_EVENT = 'memoire:workspace-sync-status';

export type WorkspaceSyncStatus = {
  state: 'idle' | 'checking' | 'ready' | 'error';
  message: string;
};

let status: WorkspaceSyncStatus = {
  state: 'idle',
  message: '',
};

/**
 * Whether cloud sync has ever answered in this session.
 *
 * "Checking sync..." is honest information the first time, when the user does
 * not yet know whether their data is reaching the cloud. Afterwards it is
 * noise: several surfaces reload the workspace as the user moves around, and
 * announcing each one flickered the pill between "Checking sync..." and its
 * real state. Once the answer is known, later checks happen quietly and the
 * pill only moves when the answer itself changes.
 */
let hasAnswered = false;

export function beginWorkspaceSyncCheck() {
  if (hasAnswered) return;
  setStatus({ state: 'checking', message: '' });
}

export function reportWorkspaceSyncReady() {
  hasAnswered = true;
  if (status.state === 'error') return;
  if (status.state === 'ready') return;
  setStatus({ state: 'ready', message: '' });
}

export function reportWorkspaceSyncError(message = 'Cloud sync is unavailable. Browser copies remain available.') {
  hasAnswered = true;
  if (status.state === 'error' && status.message === message) return;
  setStatus({ state: 'error', message });
}

export function getWorkspaceSyncStatus() {
  return status;
}

export function useWorkspaceSyncStatus() {
  const [current, setCurrent] = useState(status);

  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceSyncStatus>).detail;
      setCurrent(detail || status);
    };
    window.addEventListener(WORKSPACE_SYNC_STATUS_EVENT, refresh);
    return () => window.removeEventListener(WORKSPACE_SYNC_STATUS_EVENT, refresh);
  }, []);

  return current;
}

function setStatus(next: WorkspaceSyncStatus) {
  status = next;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(WORKSPACE_SYNC_STATUS_EVENT, { detail: next }));
  }
}
