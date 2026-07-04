/** Neutral shimmer block. Compose these to mirror a screen's real layout so
 * the loading state reads as "content arriving" rather than a blank wait. */
export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200/70 ${className}`} aria-hidden="true" />;
}

export function SkeletonCard({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-5 shadow-sm ${className}`} aria-hidden="true">
      <SkeletonBlock className="h-3 w-24" />
      <SkeletonBlock className="mt-3 h-6 w-2/3" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: lines }).map((_, index) => (
          <SkeletonBlock key={index} className={`h-3 ${index === lines - 1 ? 'w-1/2' : 'w-full'}`} />
        ))}
      </div>
    </div>
  );
}

/** Full-screen loading region with an accessible status label. */
export function SkeletonScreen({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function SkeletonTable({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm" aria-hidden="true">
      <div className="flex gap-4 border-b border-gray-200 bg-gray-50 px-4 py-3">
        {Array.from({ length: columns }).map((_, index) => (
          <SkeletonBlock key={index} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 border-b border-gray-100 px-4 py-4 last:border-0">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <SkeletonBlock key={colIndex} className={`h-4 flex-1 ${colIndex === 0 ? 'opacity-90' : 'opacity-70'}`} />
          ))}
        </div>
      ))}
    </div>
  );
}
