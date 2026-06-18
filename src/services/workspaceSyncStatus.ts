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

export function beginWorkspaceSyncCheck() {
  setStatus({ state: 'checking', message: '' });
}

export function reportWorkspaceSyncReady() {
  if (status.state === 'error') return;
  setStatus({ state: 'ready', message: '' });
}

export function reportWorkspaceSyncError(message = 'Cloud sync is unavailable. Browser copies remain available.') {
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
