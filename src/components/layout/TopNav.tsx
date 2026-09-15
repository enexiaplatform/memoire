import { useEffect, useState } from 'react';
import { useAuthContext } from '../../auth/authContext';
import { Link, useLocation } from 'react-router-dom';
import { BrandWordmark } from '../brand/BrandWordmark';
import { Menu, Plus, Search } from 'lucide-react';
import { GlobalSearch } from './GlobalSearch';
import { useDemoWorkspaceMode } from '../../hooks/useDemoWorkspaceMode';
import { DataModePill } from '../common/DataModePill';
import { isSupabaseConfigured } from '../../lib/demoMode';
import { reportWorkspaceSyncError, useWorkspaceSyncStatus } from '../../services/workspaceSyncStatus';
import { loadReviewPacksForUser } from '../../utils/reviewPacks';
import { useTopBarShell } from './topBarContext';

export function TopNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { user, loading, isAuthenticated } = useAuthContext();
  const demoActive = useDemoWorkspaceMode();
  const syncStatus = useWorkspaceSyncStatus();
  const [searchOpen, setSearchOpen] = useState(false);
  const { leadRef, actionsRef, state: page } = useTopBarShell();
  // Capture is the page you are on; a button to open it again is noise there.
  const onCapture = useLocation().pathname.startsWith('/app/capture');

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
    <header className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-bar px-4 sm:h-16 sm:gap-3.5 sm:px-6 lg:left-[220px] lg:px-8">
      {/* On a phone the wordmark takes the corner the hamburger used to hold.
          Navigation lives on the tab bar at the bottom, where a thumb is - the
          top-left menu button was a desktop rail wearing a phone's clothes, and
          it left the app with no visible identity on mobile at all. The button
          survives for tablet widths between the bar and the pinned rail. */}
      <Link to="/app/today" className="shrink-0 lg:hidden" aria-label="Memoire home">
        <BrandWordmark className="text-lg" />
      </Link>
      <button
        type="button"
        onClick={onOpenMenu}
        aria-controls="app-navigation"
        className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-line bg-white text-gray-600 md:inline-flex lg:hidden"
        title="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* The page's own context - "Back to Today", what this surface is - when
          it has some. It takes the search pill's place on a wide screen only;
          on a phone there is no room for a sentence and the icon below stays. */}
      <div ref={leadRef} className={`min-w-0 items-center gap-3 ${page.replacesSearch ? 'hidden md:flex' : 'hidden'}`} />

      {/* Search first: reading what you already know is the more frequent job.
          Drawn as the field it opens rather than as a button with a label, so
          the bar says where to type before anyone presses a key. */}
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        aria-label="Search Memoire"
        className={`items-center gap-2.5 rounded-full bg-chip text-tint-neutral-ink transition-colors hover:text-ink ${
          page.replacesSearch
            ? 'inline-flex h-9 w-9 justify-center md:hidden'
            : 'inline-flex h-9 w-9 shrink-0 justify-center sm:h-auto sm:w-auto sm:max-w-[380px] sm:flex-1 sm:shrink sm:justify-start sm:px-4 sm:py-2.5'
        }`}
      >
        <Search className="h-4 w-4 shrink-0" />
        {!page.replacesSearch && (
          <>
            <span className="hidden truncate text-[13.5px] sm:inline">Search accounts, deals, notes</span>
            <kbd className="ml-auto hidden font-mono text-[11px] font-normal lg:inline">&#8984;K</kbd>
          </>
        )}
      </button>

      <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-2.5">
        {/* The page's worst signal and its own actions, portalled in by the page. */}
        <div ref={actionsRef} className="flex min-w-0 items-center gap-2 sm:gap-2.5" />
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
          *
          * When the page has its own status to show, a healthy sync chip steps
          * aside for it. An unhealthy one never does: "your records are not
          * reaching the cloud" outranks anything a page has to say.
          */}
        <DataModePill
          compact
          quietWhenSynced={page.hasStatus}
          isLoading={loading || syncStatus.state === 'checking'}
          isAuthenticated={isAuthenticated}
          isSupabaseConfigured={isSupabaseConfigured}
          hasSampleData={demoActive}
        />
        {!onCapture && <Link
          to="/app/capture"
          aria-label="Capture"
          className={
            page.ownsPrimary
              ? 'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-white p-2 font-display text-[13px] font-semibold text-gray-700 transition hover:-translate-y-px hover:text-ink sm:px-3.5'
              : 'inline-flex shrink-0 items-center gap-2 rounded-full bg-brand-blue p-2 font-display text-sm font-semibold text-white shadow-btn-blue transition hover:-translate-y-px hover:bg-brand-blue-dark sm:px-5 sm:py-2.5'
          }
        >
          <Plus className="h-4 w-4" strokeWidth={2.4} />
          <span className="hidden sm:inline">Capture</span>
        </Link>}
      </div>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
