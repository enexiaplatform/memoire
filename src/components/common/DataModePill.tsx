import { Cloud, CloudOff, DatabaseZap, Loader2 } from 'lucide-react';
import { getDataModeInfo, type DataModeInfo, type DataModeInput } from '../../utils/dataMode';

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

export function DataModePill({
  modeInfo,
  compact = false,
  showDescription = false,
  ...input
}: DataModePillProps) {
  const info = modeInfo || getDataModeInfo({
    isAuthenticated: Boolean(input.isAuthenticated),
    isSupabaseConfigured: Boolean(input.isSupabaseConfigured),
    cloudAvailable: input.cloudAvailable,
    syncError: input.syncError,
    hasSampleData: input.hasSampleData,
    isLoading: input.isLoading,
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
