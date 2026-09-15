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
  /**
   * Render nothing while the answer is "fine". For the top bar, on a page that
   * has its own status to show: a green chip saying all is well competes with
   * the one thing the page needs you to see. A warning or an error is never
   * quiet - see the note in TopNav.
   */
  quietWhenSynced?: boolean;
};

const toneClasses: Record<DataModeInfo['severity'], string> = {
  neutral: 'border-gray-200 bg-gray-50 text-gray-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  error: 'border-red-200 bg-red-50 text-red-700',
};

/** The Daylight chip: no border, a tinted ground, a dot when all is well. */
const compactToneClasses: Record<DataModeInfo['severity'], string> = {
  neutral: 'bg-chip text-tint-neutral-ink',
  success: 'bg-[#E8F8F0] text-tint-green-solid',
  warning: 'bg-tint-amber-pill text-tint-amber-solid',
  error: 'bg-tint-red-bg text-tint-red-solid',
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
  quietWhenSynced = false,
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

  if (quietWhenSynced && (info.severity === 'success' || info.severity === 'neutral')) return null;

  if (compact) {
    return (
      <div
        className={`inline-flex min-w-0 shrink-0 items-center gap-[7px] rounded-full py-1.5 pl-2.5 pr-2.5 text-[11.5px] font-semibold sm:pr-3 ${compactToneClasses[info.severity]}`}
        title={`${info.description} ${info.privacyNote}`}
      >
        {info.mode === 'loading' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : info.mode === 'synced' ? (
          <span aria-hidden="true" className="mx-0.5 h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse-dot" />
        ) : info.mode === 'sync-error' ? (
          <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <DatabaseZap className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {/* Read on every width; drawn only where there is room for it. */}
        <span className="sr-only whitespace-nowrap sm:not-sr-only">{info.label}</span>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${toneClasses[info.severity]}`}
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
        {showDescription ? (
          <>
            <span className="mt-1 block leading-5">{info.description}</span>
            <span className="mt-1 block leading-5 opacity-80">{info.privacyNote}</span>
          </>
        ) : null}
      </span>
    </div>
  );
}
