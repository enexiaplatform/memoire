import { Outlet, useLocation } from 'react-router-dom';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { MobileTabBar } from './MobileTabBar';
import { OnboardingModal } from './OnboardingModal';
import { DemoModeBanner } from '../demo/DemoModeBanner';
import { StorageFailureBanner } from '../common/StorageFailureBanner';
import { NoIndex } from '../marketing/PageSeo';
import { OfflineCaptureBanner } from '../common/OfflineCaptureBanner';
import { TrialStatusBanner } from '../common/TrialStatusBanner';
import { prefetchPrimaryAppRoutes } from '../../utils/routePrefetch';
import { hydrateWorkspacePreferences } from '../../services/workspacePreferences';
import { useAuth } from '../../hooks/useAuth';
import { PageContainer } from './PageFrame';

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { pathname } = useLocation();
  const { user } = useAuth();

  // Warm every nav destination's chunk once the first screen has settled, so a
  // tab switch renders from memory instead of downloading a page first.
  useEffect(() => {
    prefetchPrimaryAppRoutes();
  }, []);

  // Fill the browser's preference cache from the account before the first page
  // paints a number.
  //
  // Every money figure is formatted through a *synchronous* read of the
  // reporting currency - it has to be, because it runs once per value on screen
  // and cannot become a promise. So the account's answer has to be in the cache
  // by the time a page renders, or a second device opens the whole workspace in
  // VND and the setting looks like it never saved.
  useEffect(() => {
    void hydrateWorkspacePreferences(user?.id);
  }, [user?.id]);

  // Reset scroll on navigation. Without this a new page opened mid-content
  // (e.g. jumping from a long Opportunities list to Accounts) - it looked like
  // the page loaded half-scrolled or, worse, empty.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  /**
   * Move keyboard focus to the new page.
   *
   * Scrolling to the top moves the *eye*. For anyone driving this by keyboard
   * or screen reader, nothing moved at all: measured on production, activating
   * a rail link left focus sitting on that link, so the next Tab carried on
   * through the rail rather than entering the page that had just replaced
   * itself - and with no `aria-live` anywhere, nothing said a navigation had
   * happened either. The whole product was one silent swap.
   *
   * `main` already carries `tabIndex={-1}` and the skip link already targets
   * it, so the landing place existed; nothing was sending anyone to it.
   * `outline-none` on the same element is deliberate and stays - a focus ring
   * drawn around the entire page reads as damage, and this focus is a reading
   * position rather than a control.
   *
   * Two things it refuses to do. It does not fire on the first render: focus
   * on arrival belongs to the browser, and stealing it would fight the skip
   * link on the very load where that link matters most. And it leaves a typing
   * operator alone - a surface that navigates while a field has focus (the
   * capture typeahead does) must not have the caret pulled out from under it.
   */
  const mainRef = useRef<HTMLElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const active = document.activeElement as HTMLElement | null;
    const typing = Boolean(active) && (
      active instanceof HTMLInputElement
      || active instanceof HTMLTextAreaElement
      || active?.isContentEditable === true
    );
    if (typing) return;

    mainRef.current?.focus();
  }, [pathname]);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* One tag for every `/app/*` route. The public pages became indexable on
          2026-08-11; the workspace did not, and it never should - these pages
          render one person's accounts, deals and amounts. */}
      <NoIndex />
      <a href="#app-main-content" className="skip-link">
        Skip to main content
      </a>
      <Sidebar isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <TopNav onOpenMenu={() => setMobileNavOpen(true)} />
      {/* pb-16 on small screens keeps the last row of any page clear of the
          phone tab bar; the bar itself adds the safe-area inset below that. */}
      <main
        ref={mainRef}
        id="app-main-content"
        tabIndex={-1}
        aria-label="Memoire workspace"
        className="relative ml-0 flex min-h-screen min-w-0 flex-1 flex-col pb-16 pt-14 outline-none sm:pt-16 lg:ml-[220px] lg:pb-0"
      >
        {/* Above the demo banner on purpose: unsaved data outranks every
            other thing this shell has to say. */}
        <StorageFailureBanner />
        {/* Below the unsaved-data alert and above the demo notice: a waiting
            capture is real data in a state the operator should know about,
            but it is safe, and the one above it is not. */}
        <OfflineCaptureBanner />
        <DemoModeBanner />
        {/* Last of the banners: the trial is the only one of these that is not
            about the state of the data in front of you. It also stays silent
            for most of the trial - see the component. */}
        <TrialStatusBanner />
        <div className="flex-1">
          <Suspense fallback={<AppContentLoading />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
      <MobileTabBar onOpenMenu={() => setMobileNavOpen(true)} menuOpen={mobileNavOpen} />
      <OnboardingModal />
    </div>
  );
}

function AppContentLoading() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 180);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    /* Same frame the real page will use, so the skeleton does not shift the
       moment content replaces it. */
    <PageContainer>
      <div className="space-y-4" aria-label="Loading workspace">
        <div className="h-7 w-56 animate-pulse rounded bg-gray-200" />
        <div className="h-28 w-full animate-pulse rounded-xl border border-gray-200 bg-white" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-36 animate-pulse rounded-xl border border-gray-200 bg-white" />
          <div className="h-36 animate-pulse rounded-xl border border-gray-200 bg-white" />
          <div className="h-36 animate-pulse rounded-xl border border-gray-200 bg-white" />
        </div>
      </div>
    </PageContainer>
  );
}
