export interface SegmentBarSegment {
  label: string;
  value: number;
  color: string;
  detail?: string;
}

/**
 * Horizontal stacked bar with a legend. Values are proportional; zero-value
 * segments stay in the legend so the reader sees the empty bucket.
 */
export function SegmentBar({ segments, ariaLabel }: { segments: SegmentBarSegment[]; ariaLabel: string }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return (
    <div>
      <div role="img" aria-label={ariaLabel} className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
        {total > 0 && segments.filter((segment) => segment.value > 0).map((segment) => (
          <div
            key={segment.label}
            style={{ width: `${(segment.value / total) * 100}%`, backgroundColor: segment.color }}
            title={`${segment.label}: ${segment.value}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((segment) => (
          <span key={segment.label} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
            {segment.label}: <span className="font-bold text-navy">{segment.value}</span>
            {segment.detail && <span className="text-gray-400">({segment.detail})</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
