export interface MiniBarItem {
  label: string;
  value: number;
  secondaryValue?: number;
  valueText?: string;
  secondaryText?: string;
}

/**
 * Small vertical bar chart. When secondaryValue is present each item renders a
 * pale full-height bar (secondary, e.g. unweighted value) with a solid bar
 * (primary, e.g. weighted value) in front of it.
 */
export function MiniBarChart({
  items,
  color = '#1976D2',
  secondaryColor = '#BBDEFB',
  height = 120,
  ariaLabel,
}: {
  items: MiniBarItem[];
  color?: string;
  secondaryColor?: string;
  height?: number;
  ariaLabel: string;
}) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((item) => Math.max(item.value, item.secondaryValue ?? 0)), 1);
  return (
    <div role="img" aria-label={ariaLabel}>
      <div className="flex items-end gap-2" style={{ height }}>
        {items.map((item) => {
          const primaryHeight = Math.max((item.value / max) * height, item.value > 0 ? 4 : 0);
          const secondaryHeight = item.secondaryValue !== undefined
            ? Math.max((item.secondaryValue / max) * height, item.secondaryValue > 0 ? 4 : 0)
            : 0;
          return (
            <div
              key={item.label}
              className="relative flex-1"
              style={{ height }}
              title={`${item.label}: ${item.valueText || item.value}${item.secondaryText ? ` / ${item.secondaryText}` : ''}`}
            >
              {item.secondaryValue !== undefined && (
                <div
                  className="absolute inset-x-0 bottom-0 rounded-t"
                  style={{ height: secondaryHeight, backgroundColor: secondaryColor }}
                />
              )}
              <div
                className="absolute bottom-0 rounded-t"
                style={{
                  height: primaryHeight,
                  backgroundColor: color,
                  left: item.secondaryValue !== undefined ? '20%' : 0,
                  right: item.secondaryValue !== undefined ? '20%' : 0,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-2">
        {items.map((item) => (
          <div key={item.label} className="flex-1 truncate text-center text-[10px] font-semibold text-gray-500" title={item.label}>
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}
