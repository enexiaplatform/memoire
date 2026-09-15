import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Database, X } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { getUserDisplayName, getUserInitials } from '../../utils/userDisplay';
import { prefetchAppRoute } from '../../utils/routePrefetch';
import { useDemoWorkspaceMode } from '../../hooks/useDemoWorkspaceMode';
import { BrandWordmark } from '../brand/BrandWordmark';
import { isFounderImportUser } from '../../services/importAuditStore';
import { getFeature, navigationGroups } from '../../config/featureRegistry';
import { navIcon } from './navIcons';
import { AccountMenu } from './AccountMenu';
import { useRailSignals } from './useRailSignals';
import { formatCount } from '../../utils/numberFormat';

type RailItem = { id: string; to: string; label: string; icon: ReactNode };

export function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user, profile } = useAuthContext();
  const demoActive = useDemoWorkspaceMode();
  const displayName = demoActive ? 'Demo workspace' : getUserDisplayName(user, profile);
  const initials = demoActive ? 'D' : getUserInitials(user, profile);
  const { pathname } = useLocation();
  const panelRef = useRef<HTMLElement | null>(null);
  const signals = useRailSignals();

  const groups = navigationGroups.map((group) => ({
    id: group.id,
    label: group.label,
    items: group.items.map((feature): RailItem => ({
      id: feature.id,
      to: feature.route as string,
      label: feature.label,
      icon: navIcon(feature.id),
    })),
  }));

  // The weekly review's door, read from the registry like every other link in
  // this rail - the rail does not get to decide where Review lives.
  const reviewRoute = getFeature('review')?.route || null;

  // Founder Import is operator tooling, not a twelfth rail item. It appears
  // only for the founder account, stays visually separated from the product,
  // and - like everything else in this rail - is declared in the registry
  // rather than hard-coded here.
  const founderImport = getFeature('founder-import');
  const founderItems: RailItem[] = isFounderImportUser(user?.email) && founderImport?.route
    ? [{ id: founderImport.id, to: founderImport.route, label: 'Import Review', icon: <Database className="h-[18px] w-[18px]" /> }]
    : [];

  useEffect(() => {
    if (!isOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);

  // A drawer over a page that still scrolls underneath is the single most
  // irritating thing a phone menu can do: you flick to reach Settings and the
  // page behind moves instead. Locking the body while it is open costs one
  // effect and fixes it. The lock is released on close and on unmount, so a
  // route change mid-animation can never leave the page frozen.
  useEffect(() => {
    if (!isOpen) return;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => { body.style.overflow = previousOverflow; };
  }, [isOpen]);

  // Opening a drawer and landing focus nowhere means a keyboard or screen
  // reader user is still on the page behind it. Move focus in; the Escape
  // handler above and the close button take it from there.
  useEffect(() => {
    if (isOpen) panelRef.current?.focus();
  }, [isOpen]);

  // Navigating closes it. Every link already calls onClose, but a redirect, a
  // deep link inside the page, or the browser's back button does not - and a
  // drawer left open over the destination is what "opening and closing this
  // thing is annoying" actually means.
  useEffect(() => {
    if (isOpen) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Rotating to landscape or resizing past the breakpoint pins the rail open
  // permanently; the drawer state has to let go of it or the body stays locked.
  useEffect(() => {
    if (!isOpen) return;
    const desktop = window.matchMedia('(min-width: 1024px)');
    const sync = () => { if (desktop.matches) onClose(); };
    sync();
    desktop.addEventListener('change', sync);
    return () => desktop.removeEventListener('change', sync);
  }, [isOpen, onClose]);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `relative flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-[13.5px] font-semibold transition-colors duration-150 ${
      isActive ? 'bg-white/12 text-white' : 'text-white/55 hover:bg-white/[0.07] hover:text-white/90'
    }`;

  /*
   * One figure per row, and only where it is a fact rather than a mood. Open
   * deals is a count anyone can check against the Opportunities list. A number
   * beside Today would have to be a ranking of what matters, and the rail has no
   * business computing a second one of those beside the page that owns it.
   */
  const railCount = (item: RailItem) => (item.id === 'opportunities' && signals.openDeals ? signals.openDeals : null);

  const renderNavItem = (item: RailItem) => {
    const count = railCount(item);
    return (
      <NavLink
        key={item.to}
        to={item.to}
        onClick={onClose}
        onMouseEnter={() => prefetchAppRoute(item.to)}
        onFocus={() => prefetchAppRoute(item.to)}
        className={navLinkClass}
      >
        {({ isActive }) => (
          <>
            <span className={isActive ? 'text-white' : 'text-white/45'}>{item.icon}</span>
            {item.label}
            {count !== null && (
              <span
                className="ml-auto font-mono text-[11px] font-bold text-[#B9C6D3]"
                aria-label={`${count} open`}
              >
                {formatCount(count)}
              </span>
            )}
            {isActive && <span className="brand-gradient absolute -left-2 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r" />}
          </>
        )}
      </NavLink>
    );
  };

  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[1px] lg:hidden"
        />
      )}
      <aside
        ref={panelRef}
        id="app-navigation"
        tabIndex={-1}
        role="navigation"
        // Two navigation landmarks exist at phone width - this rail and the tab
        // bar - so they carry different names. This is the whole rail; the bar
        // is the four-destination shortcut into it.
        aria-label="Primary"
        // Off-canvas links stay in the tab order unless the panel is told it is
        // not there. On a phone that means tabbing off the top bar walked into
        // eleven invisible destinations.
        inert={!isOpen && typeof window !== 'undefined' && window.innerWidth < 1024 ? true : undefined}
        className={`fixed left-0 top-0 z-50 flex h-full w-[236px] flex-col border-r border-rail-line bg-rail shadow-xl outline-none transition-transform duration-200 lg:z-40 lg:w-[220px] lg:translate-x-0 lg:shadow-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* The same height as the top bar beside it, so the two rules meet in
            one line across the screen rather than stepping at the rail's edge. */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-rail-line px-4 sm:h-16">
          <BrandWordmark className="text-xl" />
          <button type="button" onClick={onClose} className="-mr-1 rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white lg:hidden" title="Close navigation">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* `nav-scroll` keeps the scrollbar thin and dark instead of letting the
            OS paint a light native bar down a navy rail - the rail is tall
            enough to overflow on a laptop, so this shows more often than not. */}
        {/* The landmark is the panel above; this is only the scroll area. */}
        <div className="nav-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3">
          {groups.map((group, index) => (
            <div
              key={group.id}
              className={index === 0 ? '' : 'mt-2.5 border-t border-white/[0.08] pt-2.5'}
            >
              {group.label && (
                <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/25">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">{group.items.map(renderNavItem)}</div>
            </div>
          ))}

          {founderItems.length > 0 && (
            <div className="mt-2.5 border-t border-white/[0.08] pt-2.5">
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/25">
                Founder only
              </p>
              <div className="space-y-0.5">{founderItems.map(renderNavItem)}</div>
            </div>
          )}
        </div>

        <RailReviewCard review={signals.review} route={reviewRoute} onNavigate={onClose} />

        <div className="mt-3 shrink-0 border-t border-rail-line px-3 py-3">
          <div className="flex items-center gap-2.5">
            <div
              aria-hidden="true"
              className="brand-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-white" title={displayName}>{displayName}</div>
              <div className="truncate text-[11px] text-white/55">{demoActive ? 'Local sample data' : 'Personal workspace'}</div>
            </div>
            {/* Administration, under the person it belongs to. It sat as an
                avatar in the top bar; the rail already carries the name, and a
                second copy of who you are was a second place to look for it. */}
            <AccountMenu variant="rail" />
          </div>
        </div>
      </aside>
    </>
  );
}

/**
 * The weekly review, one sentence long.
 *
 * The sentence is the qualification engine's `overStated` count - deals whose
 * stage is ahead of what their people, objections and touches support - which is
 * exactly the question a manager asks at a pipeline review. It says nothing when
 * there is nothing live to review: an empty workspace does not need a nudge to
 * defend a forecast it does not have.
 */
function RailReviewCard({
  review,
  route,
  onNavigate,
}: {
  review: { scored: number; overStated: number } | null;
  route: string | null;
  onNavigate: () => void;
}) {
  if (!review || review.scored === 0 || !route) return null;
  const clean = review.overStated === 0;

  return (
    <div className="mx-3 mt-3 shrink-0 rounded-[14px] border border-white/[0.08] bg-rail-card p-4">
      <div className="flex items-center gap-[7px]">
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${clean ? 'bg-[#34D399]' : 'bg-[#FFB74D]'}`} />
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">Weekly review</span>
      </div>
      <p className="mt-2 text-[12.5px] leading-[1.5] text-white/75">
        {clean
          ? `All ${formatCount(review.scored)} open deals have evidence for the stage they are at.`
          : `${formatCount(review.overStated)} of ${formatCount(review.scored)} open deals sit at a stage their evidence does not reach yet.`}
      </p>
      <Link
        to={route}
        onClick={onNavigate}
        className="mt-3 flex items-center justify-center rounded-full bg-white px-3.5 py-2 font-display text-[12.5px] font-bold text-ink transition hover:-translate-y-px"
      >
        Open the review
      </Link>
    </div>
  );
}
