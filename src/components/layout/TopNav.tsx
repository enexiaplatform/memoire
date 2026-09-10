import { useEffect, useState } from 'react';
import { useAuthContext } from '../../auth/authContext';
import { Link } from 'react-router-dom';
import { BrandWordmark } from '../brand/BrandWordmark';
import { Menu, Plus, Search } from 'lucide-react';
import { AccountMenu } from './AccountMenu';
import { GlobalSearch } from './GlobalSearch';
import { useDemoWorkspaceMode } from '../../hooks/useDemoWorkspaceMode';
import { DataModePill } from '../common/DataModePill';
import { isSupabaseConfigured } from '../../lib/demoMode';
import { reportWorkspaceSyncError, useWorkspaceSyncStatus } from '../../services/workspaceSyncStatus';
import { loadReviewPacksForUser } from '../../utils/reviewPacks';

export function TopNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { user, loading, isAuthenticated } = useAuthContext();
  const demoActive = useDemoWorkspaceMode();
  const syncStatus = useWorkspaceSyncStatus();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (!user || demoActive) return;
    void loadReviewPacksForUser(user.id).catch(() => reportWorkspaceSyncError());
  }, [demoActive, user]);

  // Cmd/Ctrl+K from anywhere in the app. Registered on the bar rather than in
  // each page, because the whole argument for search not being a destination is
  // that it is available from wherever you are already standing.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <header className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 sm:h-16 sm:px-5 lg:left-[220px] lg:px-6">
      {/* On a phone the wordmark takes the corner the hamburger used to hold.
          Navigation lives on the tab bar at the bottom, where a thumb is - the
          top-left menu button was a desktop rail wearing a phone's clothes, and
          it left the app with no visible identity on mobile at all. The button
          survives for tablet widths between the bar and the pinned rail. */}
      <Link to="/app/today" className="lg:hidden" aria-label="Memoire home">
        <BrandWordmark className="text-lg" />
      </Link>
      <button
        type="button"
        onClick={onOpenMenu}
        aria-controls="app-navigation"
        className="ml-2 hidden h-9 w-9 items-center justify-center rounded-md border border-gray-200 text-gray-600 md:inline-flex lg:hidden"
        title="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {/* Search first, then Capture: reading what you already know is the more
            frequent job, and the two together are the only global actions. */}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Search Memoire"
          className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-2.5 py-1.5 text-sm text-gray-500 hover:border-gray-300 hover:text-gray-700 sm:px-3"
        >
          <Search className="h-4 w-4" />
          <span className="hidden lg:inline">Search</span>
          <kbd className="hidden rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-sans text-[11px] text-gray-400 lg:inline">
            &#8984;K
          </kbd>
        </button>
        <Link
          to="/app/capture"
          className="inline-flex items-center gap-1.5 rounded-full bg-navy px-3 py-1.5 text-sm font-bold text-white hover:bg-navy/90"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Capture</span>
        </Link>
        {/*
          * Sync state only. This used to pass `syncError={profileError || ...}`,
          * and `profileError` is a failed read of the `user_profiles` row - a
          * display name and a handful of preferences. It is not the workspace.
          * One slow row (the read gives up at 5s and never retries) turned the
          * global chip red and left it red for the rest of the session, telling
          * an operator "new changes may remain only in this browser" while the
          * pill two inches below it on Today read "Cloud + browser" and every
          * record was in fact syncing. Two chips, one screen, opposite answers,
          * and the alarming one was the wrong one.
          *
          * Nothing here overrides the global status any more, because this bar
          * knows nothing the status does not - `cloudAvailable` was
          * `syncStatus.state !== 'error'`, which is the same fact twice. The
          * profile failure now surfaces in Settings → Profile, which is the
          * screen it is actually about.
          */}
        <DataModePill
          compact
          isLoading={loading || syncStatus.state === 'checking'}
          isAuthenticated={isAuthenticated}
          isSupabaseConfigured={isSupabaseConfigured}
          hasSampleData={demoActive}
        />
        <AccountMenu />
      </div>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
