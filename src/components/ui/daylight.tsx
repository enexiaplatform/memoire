import type { CSSProperties, ReactNode } from 'react';
import { monogramGround, monogramInitials, type DaylightTone } from './daylightStyles';

/**
 * Daylight - the shared vocabulary of the 2026-09-14 redesign.
 *
 * The mock is hand-written HTML with every style inline, and copying that shape
 * into six pages is how the product ended up with three header sizes last time.
 * So the recurring pieces are named once here: the white panel, the micro pill,
 * the segmented track, the status chip in the top bar, the tinted row. Pages
 * compose these; they do not restate the colours.
 */

/** A white surface lifted off the canvas. No border: the shadow is the edge. */
export function Panel({
  children,
  className = '',
  style,
  as: Tag = 'section',
  ...rest
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  as?: 'section' | 'div' | 'article' | 'aside';
  'aria-label'?: string;
  'aria-labelledby'?: string;
  id?: string;
}) {
  return (
    <Tag className={`rounded-panel bg-white shadow-panel ${className}`} style={style} {...rest}>
      {children}
    </Tag>
  );
}

/** The uppercase 10-11px label that names a figure or a column. */
export function MicroLabel({ children, className = '', as: Tag = 'span' }: { children: ReactNode; className?: string; as?: 'span' | 'p' | 'h2' | 'h3' | 'dt' }) {
  return (
    <Tag className={`text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted ${className}`}>
      {children}
    </Tag>
  );
}

const pillSoft: Record<DaylightTone, string> = {
  red: 'bg-tint-red-bg text-tint-red-solid',
  amber: 'bg-tint-amber-pill text-tint-amber-solid',
  green: 'bg-tint-green-pill text-tint-green-solid',
  neutral: 'bg-chip text-tint-neutral-ink',
  blue: 'bg-tint-blue-bg text-tint-blue-ink',
  violet: 'bg-tint-violet-bg text-tint-violet-ink',
  cyan: 'bg-tint-cyan-bg text-tint-cyan-ink',
};

const pillSolid: Record<DaylightTone, string> = {
  red: 'bg-tint-red-solid text-white',
  amber: 'bg-tint-amber-solid text-white',
  green: 'bg-tint-green-solid text-white',
  neutral: 'bg-ink text-white',
  blue: 'bg-brand-blue text-white',
  violet: 'bg-spectrum-purple text-white',
  cyan: 'bg-tint-cyan-ink text-white',
};

/** A status, a count or a class, in the smallest type the product uses. */
export function MicroPill({
  tone = 'neutral',
  solid = false,
  children,
  className = '',
  title,
}: {
  tone?: DaylightTone;
  solid?: boolean;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-[3px] text-[10px] font-bold uppercase leading-none tracking-[0.07em] ${
        solid ? pillSolid[tone] : pillSoft[tone]
      } ${className}`}
    >
      {children}
    </span>
  );
}

export type SegmentOption<Value extends string> = {
  value: Value;
  label: string;
  /** Rendered after the label, so the count never becomes the name. */
  count?: number;
};

/**
 * A white pill sliding along a grey track.
 *
 * `tabs` when the options are views of one place (the panel below changes), and
 * `filter` when they narrow a list in place - the two announce differently, and
 * a filter wearing tab semantics tells a screen reader a panel exists that does
 * not.
 */
export function Segmented<Value extends string>({
  options,
  value,
  onChange,
  label,
  semantics = 'tabs',
  className = '',
}: {
  options: SegmentOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  label: string;
  semantics?: 'tabs' | 'filter';
  className?: string;
}) {
  const isTabs = semantics === 'tabs';
  return (
    <div
      role={isTabs ? 'tablist' : 'group'}
      aria-label={label}
      className={`inline-flex max-w-full flex-wrap gap-0.5 rounded-full bg-chip p-1 ${className}`}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role={isTabs ? 'tab' : undefined}
            aria-selected={isTabs ? active : undefined}
            aria-pressed={isTabs ? undefined : active}
            onClick={() => onChange(option.value)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-[12.5px] transition ${
              active
                ? 'bg-white font-display font-bold text-ink shadow-seg'
                : 'font-semibold text-tint-neutral-ink hover:text-ink'
            }`}
          >
            {option.label}
            {typeof option.count === 'number' && (
              <span className={`ml-1.5 font-mono text-[11px] ${active ? 'text-ink' : 'text-tint-neutral-ink'}`}>
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const chipTone: Record<'green' | 'amber' | 'red' | 'neutral', { ground: string; dot: string; pulse: boolean }> = {
  green: { ground: 'bg-[#E8F8F0] text-tint-green-solid', dot: 'bg-[#10B981]', pulse: true },
  amber: { ground: 'bg-tint-amber-pill text-tint-amber-solid', dot: 'bg-[#E8891A]', pulse: false },
  red: { ground: 'bg-tint-red-bg text-tint-red-solid', dot: 'bg-[#EF5350]', pulse: true },
  neutral: { ground: 'bg-chip text-tint-neutral-ink', dot: 'bg-muted', pulse: false },
};

/**
 * The top bar's one-line state: the worst thing about the page you are on.
 * A dot, not an icon, unless the caller has a better glyph for it.
 */
export function StatusChip({
  tone,
  children,
  icon,
  title,
  className = '',
}: {
  tone: 'green' | 'amber' | 'red' | 'neutral';
  children: ReactNode;
  icon?: ReactNode;
  title?: string;
  className?: string;
}) {
  const spec = chipTone[tone];
  return (
    <span
      title={title}
      className={`inline-flex min-w-0 items-center gap-[7px] whitespace-nowrap rounded-full py-1.5 pl-2.5 pr-3 text-[11.5px] font-semibold ${spec.ground} ${className}`}
    >
      {icon || (
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${spec.dot} ${spec.pulse ? 'animate-pulse-dot' : ''}`}
        />
      )}
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * N segments, `filled` of them lit - the evidence meter, the role coverage
 * meter, the minimum-evidence rule. A row of equal cells reads as "how much of
 * a known set", which a percentage bar does not.
 */
export function SegmentMeter({
  total,
  filled,
  tone,
  label,
  cellClassName = 'h-[5px] w-3.5',
  filledCells,
}: {
  total: number;
  filled: number;
  tone: 'green' | 'amber' | 'red' | 'blue';
  label: string;
  cellClassName?: string;
  /** Which cells are lit, when position means something (a named role). */
  filledCells?: boolean[];
}) {
  const fill = { green: 'bg-tint-green-solid', amber: 'bg-[#E8891A]', red: 'bg-[#C62828]', blue: 'bg-brand-blue' }[tone];
  const cells = filledCells || Array.from({ length: total }, (_, index) => index < filled);
  return (
    <span role="img" aria-label={label} className="inline-flex gap-[3px]">
      {cells.map((lit, index) => (
        <span key={index} className={`rounded-full ${cellClassName} ${lit ? fill : 'bg-chip'}`} />
      ))}
    </span>
  );
}

/** The spectrum edge: a 2px gradient frame around a white card. */
export function GradientEdge({ children, className = '', innerClassName = '', style }: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`rounded-panel bg-daylight-edge p-[2px] ${className}`} style={style}>
      <div className={`h-full rounded-[18px] bg-white ${innerClassName}`}>{children}</div>
    </div>
  );
}

/** Initials on a gradient tile. Decorative: the name always sits beside it. */
export function Monogram({ name, size = 28, className = '' }: { name: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center font-display font-extrabold text-white ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size / 3.1),
        background: monogramGround(name),
        fontSize: size <= 30 ? 10.5 : 13,
      }}
    >
      {monogramInitials(name)}
    </span>
  );
}
