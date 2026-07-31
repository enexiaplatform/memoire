export interface FunnelBarRow {
  label: string;
  value: number;
  valueText: string;
  countText?: string;
}

/**
 * Horizontal bars scaled to the largest row - reads as a pipeline funnel.
 * When onSelect is provided each row becomes a button (e.g. filter by stage).
 *
 * `scaleTo` changes the denominator, and it matters more than it looks. Scaled
 * to the largest row, a bar means "biggest"; scaled to a total, it means
 * "share". Putting a percent-of-total label beside a bar drawn against the
 * largest row is two different denominators on one line, and the reader
 * believes the bar.
 *
 * `labelWidth` exists because a Vietnamese company name carries its legal form
 * up front - "Cong ty TNHH Duoc pham ..." - and the default column truncates
 * every one of them to the same unreadable prefix.
 */
export function FunnelBars({
  rows,
  color = '#1976D2',
  ariaLabel,
  onSelect,
  scaleTo,
  labelWidth = 'sm:w-32',
}: {
  rows: FunnelBarRow[];
  color?: string;
  ariaLabel: string;
  onSelect?: (label: string) => void;
  /** Denominator for bar length. Defaults to the largest row. */
  scaleTo?: number;
  labelWidth?: string;
}) {
  if (rows.length === 0) return null;
  const max = Math.max(scaleTo ?? 0, ...rows.map((row) => row.value), 1);
  return (
    <div role={onSelect ? 'group' : 'img'} aria-label={ariaLabel} className="space-y-2">
      {rows.map((row) => {
        const valueLabel = (
          <>
            {row.valueText}
            {row.countText && <span className="ml-1 font-semibold text-gray-400">{row.countText}</span>}
          </>
        );
        // Mobile: label + value on one line, full-width bar underneath.
        // sm and up: label | bar | value in three columns.
        const content = (
          <>
            <div className={`flex w-full items-baseline justify-between gap-2 sm:shrink-0 sm:justify-start ${labelWidth}`}>
              <span className="truncate text-left text-xs font-semibold text-gray-600" title={row.label}>{row.label}</span>
              <span className="shrink-0 text-right text-xs font-bold text-navy sm:hidden">{valueLabel}</span>
            </div>
            <div className="relative h-5 w-full overflow-hidden rounded bg-gray-100 sm:flex-1">
              <div
                className="h-full rounded"
                style={{ width: `${Math.max((row.value / max) * 100, row.value > 0 ? 3 : 0)}%`, backgroundColor: color }}
              />
            </div>
            <span className="hidden w-36 shrink-0 text-right text-xs font-bold text-navy sm:block">{valueLabel}</span>
          </>
        );
        if (onSelect) {
          return (
            <button
              key={row.label}
              type="button"
              onClick={() => onSelect(row.label)}
              className="flex w-full flex-col gap-1 rounded px-1 py-0.5 hover:bg-blue-50/60 sm:flex-row sm:items-center sm:gap-3"
              title={`Filter to ${row.label}`}
            >
              {content}
            </button>
          );
        }
        return (
          <div key={row.label} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            {content}
          </div>
        );
      })}
    </div>
  );
}
