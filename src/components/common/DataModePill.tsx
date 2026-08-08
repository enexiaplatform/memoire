import { useContext } from 'react';
import { Cloud, CloudOff, DatabaseZap, Loader2 } from 'lucide-react';
import { AuthContext } from '../../auth/authContext';
import { isSupabaseConfigured } from '../../lib/demoMode';
import { getDataModeInfo, hasLocalSampleData, type DataModeInfo, type DataModeInput } from '../../utils/dataMode';
import { useWorkspaceSyncStatus } from '../../services/workspaceSyncStatus';

type DataModePillProps = Partial<DataModeInput> & {
  modeInfo?: DataModeInfo;
  compact?: boolean;
  showDescription?: boolean;
};

const toneClasses: Record<DataModeInfo['severity'], string> = {
  neutral: 'border-gray-200 bg-gray-50 text-gray-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  error: 'border-red-200 bg-red-50 text-red-700',
};

/**
 * Where the records on this screen actually live.
 *
 * Every input used to come from props, and out of twenty call sites three passed
 * `syncError` and several passed no auth state at all. `Boolean(undefined)` is
 * false, so those pages rendered a green "Cloud + browser" while sync was down,
 * and two rendered "Browser only" for a signed-in seller - three different
 * answers to one question, none of them read from the thing that knows.
 *
 * So the pill asks for itself. Props still win where a surface genuinely knows
 * better than the global status - a page mid-save, a brief with its own cloud
 * handle - but omitting one no longer invents a reassuring answer.
 */
export function DataModePill({
  modeInfo,
  compact = false,
  showDescription = false,
  ...input
}: DataModePillProps) {
  // Read rather than required: this component appears on surfaces that render
  // outside the provider in tests and on the marketing shell.
  const auth = useContext(AuthContext);
  const syncStatus = useWorkspaceSyncStatus();

  const info = modeInfo || getDataModeInfo({
    isAuthenticated: input.isAuthenticated ?? Boolean(auth?.isAuthenticated),
    isSupabaseConfigured: input.isSupabaseConfigured ?? isSupabaseConfigured,
    cloudAvailable: input.cloudAvailable,
    // An explicit `null` from a caller means "I checked and it is fine", which
    // is why this is `??` and not `||`.
    syncError: input.syncError ?? (syncStatus.state === 'error' ? syncStatus.message || 'Cloud sync is unavailable.' : null),
    hasSampleData: input.hasSampleData ?? hasLocalSampleData(),
    isLoading: input.isLoading ?? (syncStatus.state === 'checking' || Boolean(auth?.loading)),
  });

  return (
    <div
      className={`inline-flex ${compact ? 'items-center' : 'items-start'} gap-2 rounded-lg border px-3 py-2 text-xs ${toneClasses[info.severity]}`}
      title={`${info.description} ${info.privacyNote}`}
    >
      <span className="mt-0.5">
        {info.mode === 'loading' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : info.mode === 'synced' ? (
          <Cloud className="h-3.5 w-3.5" />
        ) : info.mode === 'sync-error' ? (
          <CloudOff className="h-3.5 w-3.5" />
        ) : (
          <DatabaseZap className="h-3.5 w-3.5" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block font-bold">{info.label}</span>
        {showDescription && !compact ? (
          <>
            <span className="mt-1 block leading-5">{info.description}</span>
            <span className="mt-1 block leading-5 opacity-80">{info.privacyNote}</span>
          </>
        ) : null}
      </span>
    </div>
  );
}
