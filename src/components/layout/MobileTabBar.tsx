import { NavLink } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { mobileTabs } from '../../config/featureRegistry';
import { prefetchAppRoute } from '../../utils/routePrefetch';
import { navIcon } from './navIcons';

/**
 * The phone's navigation.
 *
 * Memoire is installable and the whole reason it is on a phone is that the work
 * being recorded happens away from a desk. Until now every move between
 * destinations on a phone cost three taps - open the drawer, read eleven items,
 * pick one, and it closed over the page you landed on. That is a desktop rail
 * behind a hamburger, not a phone app.
 *
 * Four destinations sit on the bar because they are what somebody standing in a
 * customer's lobby actually opens; the fifth button is the same rail as before,
 * for the other seven. Capture stays in the top bar rather than taking a tab:
 * it is an action, not a place, and it is already reachable from the home
 * screen shortcut.
 *
 * Which four is a product decision and lives in the registry.
 */
export function MobileTabBar({ onOpenMenu, menuOpen }: { onOpenMenu: () => void; menuOpen: boolean }) {
  return (
    <nav
      // Distinct from the rail's "Primary" landmark: two navigation landmarks
      // with the same name are indistinguishable in a screen reader's list.
      aria-label="Quick navigation"
      // Hidden while the drawer is open: two navigations stacked on top of each
      // other is the confusion this bar exists to remove.
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur lg:hidden ${
        menuOpen ? 'hidden' : ''
      }`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-5">
        {mobileTabs.map((feature) => (
          <NavLink
            key={feature.id}
            to={feature.route as string}
            onMouseEnter={() => prefetchAppRoute(feature.route as string)}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold tracking-tight transition-colors ${
                isActive ? 'text-brand-blue' : 'text-gray-500'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={isActive ? 'text-brand-blue' : 'text-gray-400'}>
                  {navIcon(feature.id, 'h-5 w-5')}
                </span>
                <span className="max-w-full truncate px-0.5">{feature.shortLabel || feature.label}</span>
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={onOpenMenu}
          aria-controls="app-navigation"
          aria-expanded={menuOpen}
          className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold tracking-tight text-gray-500"
        >
          <Menu className="h-5 w-5 text-gray-400" />
          More
        </button>
      </div>
    </nav>
  );
}
