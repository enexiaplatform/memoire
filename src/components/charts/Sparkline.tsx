export interface SparklinePoint {
  label: string;
  value: number;
}

/** Compact area sparkline with per-point dots and labels underneath. */
export function Sparkline({
  points,
  color = '#1976D2',
  height = 56,
  ariaLabel,
}: {
  points: SparklinePoint[];
  color?: string;
  height?: number;
  ariaLabel: string;
}) {
  if (points.length === 0) return null;
  const width = 100;
  const max = Math.max(...points.map((point) => point.value), 1);
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  const coords = points.map((point, index) => ({
    x: points.length > 1 ? index * step : width / 2,
    y: height - 6 - (point.value / max) * (height - 12),
  }));
  const line = coords.map((coord, index) => `${index === 0 ? 'M' : 'L'}${coord.x.toFixed(1)},${coord.y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords[coords.length - 1].x.toFixed(1)},${height} L${coords[0].x.toFixed(1)},${height} Z`;
  return (
    <div role="img" aria-label={ariaLabel}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block w-full" style={{ height }}>
        <path d={area} fill={color} opacity={0.12} />
        <path d={line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        {coords.map((coord, index) => (
          <circle key={points[index].label + index} cx={coord.x} cy={coord.y} r={1.8} fill={color}>
            <title>{`${points[index].label}: ${points[index].value}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 flex justify-between">
        {points.map((point, index) => (
          <span key={point.label + index} className="text-[10px] font-semibold text-gray-400">{point.label}</span>
        ))}
      </div>
    </div>
  );
}
