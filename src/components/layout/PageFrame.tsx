import type { MouseEventHandler, ReactNode } from 'react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';


/**
 * The one page frame every surface opens with.
 *
 * Twelve destinations grew their own headers over sixty-odd phases, and by
 * 2026-08-04 they had drifted into three different products sharing a sidebar.
 * Measured across the rail, before this file existed:
 *
 * - Three title sizes. Accounts, Opportunities, Orders and Review opened at
 *   20px; Plan, Activity, Vault and Dashboard at 24px; Settings, Capture and
 *   Today at 30px. Tabbing between Accounts and Today, the title physically
 *   jumped a third of its size.
 * - Two subtitle greys (#6B7280 and #4B5563) with no rule about which meant
 *   what.
 * - Three vertical paddings (16/20/24px) and two gaps, so the first card on
 *   each page started at a different height.
 * - Two pages centred themselves in a reading column while ten ran full-bleed,
 *   which on a wide monitor reads as the layout breaking on navigation.
 *
 * None of that is a judgement call anyone made; it is what happens when the
 * header is retyped per page. So it is typed once here, and the pages describe
 * their header rather than drawing it.
 *
 * The anatomy is the 2026-07-18 polish pass's P3 contract, finally given a
 * place to live: what section this belongs to, what the page answers, the state
 * of it, and the one primary action - and above the fold, nothing else.
 */

export type PageHeaderProps = {
  /**
   * The rail group this surface sits in - "Run", "Records", "Workspace" - or,
   * for a contextual surface reached from a record, the destination that owns
   * it ("Review", "Orders").
   *
   * This is P2: a page opened from a link has to say where it sits, because the
   * rail cannot highlight a row that is not in it. Primary destinations pass
   * their group; contextual surfaces pass their parent.
   */
  eyebrow?: string;
  /** What this page answers, in the fewest words that survive a 5-second read. */
  title: string;
  /**
   * The clause of the title coloured by the page's worst status - "31 people,
   * *7 unknown roles*". Daylight headlines state the book and then the problem
   * in it, and the colour is what makes the second half read as the point.
   */
  titleAccent?: { text: string; tone: 'red' | 'amber' | 'green' };
  /**
   * State, not description: "128 shown of 340", "synced 2 minutes ago". Sits
   * inline with the title on a wide screen and wraps under it on a phone, so a
   * list page keeps its rows within the first screen.
   */
  meta?: ReactNode;
  /** One or two sentences. Omit it on list surfaces where the list is the page. */
  description?: ReactNode;
  /** The primary action and, at most, its quieter alternatives. */
  actions?: ReactNode;
  /**
   * Sibling views of the same destination, as a tab strip under the title.
   *
   * Deliberately its own slot rather than more `actions`: a view switch is
   * navigation within one place, and mixing it into the action row makes
   * "Collections" look like a button that does something to the orders you are
   * currently looking at.
   */
  tabs?: ReactNode;
  /** Optional glyph beside the title. */
  icon?: ReactNode;
  className?: string;
  /**
   * What the browser tab says, when the page's own title is too terse to be
   * useful out of context ("Today" is fine; "Review" alone is not).
   */
  documentTitle?: string;
  /**
   * `hero` is Today's greeting: a size larger, because it is the one page that
   * opens on a person rather than on a list.
   */
  size?: 'page' | 'hero';
};

export function PageHeader({
  eyebrow,
  title,
  titleAccent,
  meta,
  description,
  actions,
  tabs,
  icon,
  className = '',
  documentTitle,
  size = 'page',
}: PageHeaderProps) {
  useDocumentTitle(documentTitle || (titleAccent ? `${title}${titleAccent.text}` : title));

  const accentColour = titleAccent
    ? { red: 'text-tint-red-solid', amber: 'text-tint-amber-solid', green: 'text-tint-green-solid' }[titleAccent.tone]
    : '';

  /*
   * Daylight (2026-09-14). The eyebrow went from a grey filing label to the
   * brand blue at 0.22em, and the title from 24px to a display headline - the
   * page now opens on a statement rather than on the name of the tab you
   * clicked. The anatomy above is unchanged, so every page that describes its
   * header rather than drawing it picked this up without being edited.
   */
  return (
    <header className={`flex animate-rise flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-6 ${className}`}>
      <div className="min-w-0">
        {/* brand-blue-dark, not brand-blue: the eyebrow sits on the page ground,
            and #1976D2 on #F4F7FA is 4.28:1 - under AA at 11px. */}
        {eyebrow && (
          <p className="font-display text-[11px] font-bold uppercase tracking-[0.22em] text-brand-blue-dark">{eyebrow}</p>
        )}
        {/* `items-baseline` rather than `items-center`: the meta is type sitting
            next to type, and centring it against a display title floats it. */}
        <div className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 ${eyebrow ? 'mt-[7px]' : ''}`}>
          {icon && (
            /* Nudged onto the title's baseline - an icon centred in a baseline
               row rides high against the cap height. */
            <span className="relative top-0.5 shrink-0 text-brand-blue">{icon}</span>
          )}
          <h1 className={`font-display font-[750] leading-[1.1] tracking-[-0.03em] text-ink ${
            size === 'hero' ? 'text-[28px] sm:text-[34px] lg:text-[38px]' : 'text-[26px] sm:text-[30px] lg:text-[34px]'
          }`}>
            {title}
            {titleAccent && <span className={accentColour}>{titleAccent.text}</span>}
          </h1>
          {meta && <p className="text-sm text-gray-500">{meta}</p>}
        </div>
        {/* A div, not a p: a description may be a composed block (Today's brief
            carries its own paragraphs), and a paragraph cannot contain one. */}
        {description && (
          <div className={`max-w-2xl text-[13.5px] leading-6 text-tint-neutral-ink [text-wrap:pretty] ${size === 'hero' ? 'mt-2.5' : 'mt-2'}`}>
            {description}
          </div>
        )}
        {tabs && <div className="mt-3">{tabs}</div>}
      </div>
      {actions && (
        /* `shrink-0` so a long title never squeezes the primary action into a
           two-line stack of half-words, and `lg:justify-end` so the actions sit
           against the right edge on a wide screen instead of floating mid-row. */
        <div className="flex flex-wrap items-center gap-2.5 lg:shrink-0 lg:justify-end">{actions}</div>
      )}
    </header>
  );
}

/**
 * The page's outer box.
 *
 * `width="full"` is the default because most surfaces are tables and a table
 * wants the room. The cap at 2xl is not decoration: on a 2560px monitor a
 * full-bleed row of deal columns spreads a customer name and its amount three
 * feet apart, and the eye loses the row between them.
 *
 * `width="reading"` is for surfaces that are prose and forms rather than
 * records - Settings, Search & Insights - where a full-bleed line length is
 * simply harder to read.
 */
export function PageContainer({
  children,
  width = 'full',
  className = '',
  onClickCapture,
}: {
  children: ReactNode;
  width?: 'full' | 'reading';
  className?: string;
  /**
   * Today intercepts link clicks on the way down to route some of them through
   * a drawer instead of a navigation, and the listener has to sit on the page's
   * outermost node to see them all.
   */
  onClickCapture?: MouseEventHandler<HTMLDivElement>;
}) {
  const widths = {
    full: 'max-w-none 2xl:mx-auto 2xl:max-w-[1680px]',
    reading: 'mx-auto max-w-4xl',
  };

  return (
    <div
      className={`flex w-full flex-col gap-[18px] px-4 py-5 sm:px-6 lg:px-8 lg:py-[26px] ${widths[width]} ${className}`}
      onClickCapture={onClickCapture}
    >
      {children}
    </div>
  );
}
