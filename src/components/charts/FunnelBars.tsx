export interface FunnelBarRow {
  label: string;
  value: number;
  valueText: string;
  countText?: string;
}

/**
 * Horizontal bars scaled to the largest row - reads as a pipeline funnel.
 * When onSelect is provided each row becomes a button (e.g. filter by stage).
 */
export function FunnelBars({
  rows,
  color = '#1976D2',
  ariaLabel,
  onSelect,
}: {
  rows: FunnelBarRow[];
  color?: string;
  ariaLabel: string;
  onSelect?: (label: string) => void;
}) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div role={onSelect ? 'group' : 'img'} aria-label={ariaLabel} className="space-y-2">
      {rows.map((row) => {
        const content = (
          <>
            <span className="w-32 shrink-0 truncate text-left text-xs font-semibold text-gray-600" title={row.label}>{row.label}</span>
            <div className="relative h-5 flex-1 overflow-hidden rounded bg-gray-100">
              <div
                className="h-full rounded"
                style={{ width: `${Math.max((row.value / max) * 100, row.value > 0 ? 3 : 0)}%`, backgroundColor: color }}
              />
            </div>
            <span className="w-36 shrink-0 text-right text-xs font-bold text-navy">
              {row.valueText}
              {row.countText && <span className="ml-1 font-semibold text-gray-400">{row.countText}</span>}
            </span>
          </>
        );
        if (onSelect) {
          return (
            <button
              key={row.label}
              type="button"
              onClick={() => onSelect(row.label)}
              className="flex w-full items-center gap-3 rounded px-1 py-0.5 hover:bg-blue-50/60"
              title={`Filter to ${row.label}`}
            >
              {content}
            </button>
          );
        }
        return (
          <div key={row.label} className="flex items-center gap-3">
            {content}
          </div>
        );
      })}
    </div>
  );
}
