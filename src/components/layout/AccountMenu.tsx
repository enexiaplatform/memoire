import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { getUserDisplayName, getUserInitials } from '../../utils/userDisplay';
import { useDemoWorkspaceMode } from '../../hooks/useDemoWorkspaceMode';

/**
 * The avatar menu - where administration lives.
 *
 * Settings was a navigation row, which put "reporting currency" and "exchange
 * rates" in the same list as the customers you sell to. Administration is not
 * commercial work: it is something you do a handful of times and then forget
 * about, and a row in the rail is a permanent cost for an occasional job.
 *
 * It also reclaims the top bar. A full display name and a permanent Sign out
 * button sat on every screen, saying who you are to the only person who already
 * knows - and the name was frequently an email address, truncated.
 */
export function AccountMenu({ variant = 'bar' }: {
  /**
   * `rail` is the Daylight placement: a quiet gear at the end of the user row,
   * opening upward, because the name and avatar are already drawn beside it.
   */
  variant?: 'bar' | 'rail';
} = {}) {
  const { user, profile, signOut } = useAuthContext();
  const navigate = useNavigate();
  const demoActive = useDemoWorkspaceMode();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const displayName = demoActive ? 'Demo workspace' : getUserDisplayName(user, profile);
  const initials = demoActive ? 'D' : getUserInitials(user, profile);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleSignOut = async () => {
    setOpen(false);
    const result = await signOut();
    if (!result.error) navigate('/', { replace: true });
  };

  // Each row names the Settings tab it opens, so the menu is a table of
  // contents for administration rather than a second place it is configured.
  const items = [
    { to: '/app/settings?tab=profile', label: 'Profile' },
    { to: '/app/settings', label: 'Settings' },
    { to: '/app/settings?tab=billing', label: 'Plan & billing' },
    { to: '/app/settings?tab=export', label: 'Data & privacy' },
  ];

  const inRail = variant === 'rail';

  return (
    <div ref={containerRef} className="relative">
      {inRail ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Account and settings for ${displayName}`}
          title="Account and settings"
          className={`flex h-[30px] w-[30px] items-center justify-center rounded-[9px] transition-colors ${
            open ? 'bg-white/12 text-white' : 'text-white/55 hover:bg-white/[0.07] hover:text-white'
          }`}
        >
          <Settings className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Account menu for ${displayName}`}
          title={displayName}
          className="brand-gradient flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-brand-blue"
        >
          {initials}
        </button>
      )}

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className={`absolute z-50 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg ${
            inRail ? 'bottom-10 left-0' : 'right-0 top-10'
          }`}
        >
          <div className="border-b border-gray-100 px-3 py-2">
            <p className="truncate text-sm font-semibold text-navy" title={displayName}>{displayName}</p>
            <p className="truncate text-xs text-gray-500">
              {demoActive ? 'Local sample data' : 'Personal workspace'}
            </p>
          </div>

          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              role="menuitem"
              onClick={() => setOpen(false)}
              // The rail paints focus rings white so they show on navy; this
              // menu is white, so it takes the brand ring back.
              className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 focus-visible:outline-brand-blue"
            >
              {item.label}
            </Link>
          ))}

          {user && (
            <>
              <div className="my-1 border-t border-gray-100" />
              <button
                type="button"
                role="menuitem"
                onClick={handleSignOut}
                className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 focus-visible:outline-brand-blue"
              >
                Sign out
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
