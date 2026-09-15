import type { CSSProperties } from 'react';

/**
 * The non-component half of the Daylight vocabulary - class strings, tone maps
 * and the monogram maths - kept apart from `daylight.tsx` so that file stays a
 * components-only module and fast refresh keeps working on it.
 */

export type DaylightTone = 'red' | 'amber' | 'green' | 'neutral' | 'blue' | 'violet' | 'cyan';

/** Entry stagger. Pair with `animate-rise` (or `animate-grow-*`) on the element. */
export function delay(ms: number): CSSProperties {
  return { animationDelay: `${ms}ms` };
}

export const primaryPillClass =
  'inline-flex items-center justify-center gap-2 rounded-full bg-brand-blue px-5 py-2.5 font-display text-sm font-semibold text-white shadow-btn-blue transition hover:-translate-y-px hover:bg-brand-blue-dark disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60';

export const ghostPillClass =
  'inline-flex items-center justify-center gap-1.5 rounded-full border border-line bg-white px-4 py-2 font-display text-[13px] font-semibold text-gray-700 transition hover:-translate-y-px hover:border-line-strong hover:text-ink disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60';

export const darkPillClass =
  'inline-flex items-center justify-center gap-1.5 rounded-full bg-ink px-4 py-2 font-display text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-navy disabled:translate-y-0 disabled:opacity-60';

/** Ground and ink for a tinted row - the status is the colour of the whole card. */
export const tintSurface: Record<DaylightTone, { ground: string; ink: string; strong: string }> = {
  red: { ground: 'bg-tint-red-bg', ink: 'text-tint-red-ink', strong: 'text-tint-red-solid' },
  amber: { ground: 'bg-tint-amber-bg', ink: 'text-tint-amber-ink', strong: 'text-tint-amber-solid' },
  green: { ground: 'bg-tint-green-bg', ink: 'text-tint-green-ink', strong: 'text-tint-green-solid' },
  neutral: { ground: 'bg-tint-neutral-bg', ink: 'text-ink', strong: 'text-tint-neutral-ink' },
  blue: { ground: 'bg-tint-blue-bg', ink: 'text-ink', strong: 'text-tint-blue-ink' },
  violet: { ground: 'bg-tint-violet-bg', ink: 'text-ink', strong: 'text-tint-violet-ink' },
  cyan: { ground: 'bg-tint-cyan-bg', ink: 'text-ink', strong: 'text-tint-cyan-ink' },
};

/*
 * Monogram grounds. Darker than the mock's pairs on purpose - the mock put white
 * initials on #FF9800, which is 2.2:1 - and chosen per name so the same customer
 * wears the same colours on every page it appears on.
 */
const monogramGrounds = [
  'linear-gradient(135deg,#1976D2,#3949AB)',
  'linear-gradient(135deg,#7B1FA2,#C2185B)',
  'linear-gradient(135deg,#047857,#0E7490)',
  'linear-gradient(135deg,#3949AB,#7B1FA2)',
  'linear-gradient(135deg,#C2185B,#7B1FA2)',
  'linear-gradient(135deg,#0E7490,#1976D2)',
];

export function monogramGround(name: string): string {
  let hash = 0;
  for (const char of name.trim().toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return monogramGrounds[hash % monogramGrounds.length];
}

export function monogramInitials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}
