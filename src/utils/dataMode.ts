export type DataMode = 'synced' | 'local-only' | 'sync-error' | 'demo-local' | 'loading';

export type DataModeInfo = {
  mode: DataMode;
  label: string;
  description: string;
  privacyNote: string;
  severity: 'neutral' | 'success' | 'warning' | 'error';
};

export type DataModeInput = {
  isAuthenticated: boolean;
  isSupabaseConfigured: boolean;
  cloudAvailable?: boolean;
  syncError?: string | null;
  hasSampleData?: boolean;
  isLoading?: boolean;
};

const DATA_MODE_COPY: Record<DataMode, DataModeInfo> = {
  synced: {
    mode: 'synced',
    label: 'Cloud + browser',
    description: 'Pipeline records, review packs, assets, and action outcomes sync to your account. Lightweight setup preferences may remain in this browser.',
    privacyNote: 'Cloud records are available across devices. Browser preferences may reset when browser data is cleared.',
    severity: 'success',
  },
  'local-only': {
    mode: 'local-only',
    label: 'Browser only',
    description: 'Saved only in this browser. Sign in to sync across devices.',
    privacyNote: 'Clearing browser data may remove saved Memoire records.',
    severity: 'warning',
  },
  'sync-error': {
    mode: 'sync-error',
    label: 'Sync issue',
    description: 'Cloud sync is unavailable. New changes may remain only in this browser.',
    privacyNote: 'Keep this browser open and retry before switching devices.',
    severity: 'error',
  },
  'demo-local': {
    mode: 'demo-local',
    label: 'Demo browser',
    description: 'Sample data is stored only in this browser.',
    privacyNote: 'Sample data is local. Replace it with real activities when ready.',
    severity: 'neutral',
  },
  loading: {
    mode: 'loading',
    label: 'Checking sync...',
    description: 'Checking your sync status.',
    privacyNote: 'Memoire will keep a local copy if cloud sync cannot be reached.',
    severity: 'neutral',
  },
};

export function getDataModeInfo(input: DataModeInput): DataModeInfo {
  if (input.isLoading) return DATA_MODE_COPY.loading;
  if (input.hasSampleData) return DATA_MODE_COPY['demo-local'];
  if (!input.isAuthenticated) return DATA_MODE_COPY['local-only'];
  if (!input.isSupabaseConfigured || input.syncError || input.cloudAvailable === false) {
    return DATA_MODE_COPY['sync-error'];
  }
  return DATA_MODE_COPY.synced;
}

export function hasLocalSampleData() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem('memoire.sampleData.loaded') === 'true';
  } catch {
    return false;
  }
}
