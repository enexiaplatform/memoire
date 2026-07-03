export interface FunnelBarRow {
  label: string;
  value: number;
  valueText: string;
  countText?: string;
}

/** Horizontal bars scaled to the largest row - reads as a pipeline funnel. */
export function FunnelBars({ rows, color = '#1976D2', ariaLabel }: { rows: FunnelBarRow[]; color?: string; ariaLabel: string }) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div role="img" aria-label={ariaLabel} className="space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3">
          <span className="w-32 shrink-0 truncate text-xs font-semibold text-gray-600" title={row.label}>{row.label}</span>
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
        </div>
      ))}
    </div>
  );
}
