import { Outlet, useLocation } from 'react-router-dom';
import { Suspense, useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { MobileTabBar } from './MobileTabBar';
import { OnboardingModal } from './OnboardingModal';
import { DemoModeBanner } from '../demo/DemoModeBanner';
import { StorageFailureBanner } from '../common/StorageFailureBanner';
import { OfflineCaptureBanner } from '../common/OfflineCaptureBanner';
import { prefetchPrimaryAppRoutes } from '../../utils/routePrefetch';

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { pathname } = useLocation();

  // Warm every nav destination's chunk once the first screen has settled, so a
  // tab switch renders from memory instead of downloading a page first.
  useEffect(() => {
    prefetchPrimaryAppRoutes();
  }, []);

  // Reset scroll on navigation. Without this a new page opened mid-content
  // (e.g. jumping from a long Opportunities list to Accounts) - it looked like
  // the page loaded half-scrolled or, worse, empty.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <a href="#app-main-content" className="skip-link">
        Skip to main content
      </a>
      <Sidebar isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <TopNav onOpenMenu={() => setMobileNavOpen(true)} />
      {/* pb-16 on small screens keeps the last row of any page clear of the
          phone tab bar; the bar itself adds the safe-area inset below that. */}
      <main
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
    <div className="w-full px-4 py-6 sm:px-5 lg:px-6" aria-label="Loading workspace">
      <div className="space-y-4">
        <div className="h-7 w-56 animate-pulse rounded bg-gray-200" />
        <div className="h-28 w-full animate-pulse rounded-lg border border-gray-200 bg-white" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-36 animate-pulse rounded-lg border border-gray-200 bg-white" />
          <div className="h-36 animate-pulse rounded-lg border border-gray-200 bg-white" />
          <div className="h-36 animate-pulse rounded-lg border border-gray-200 bg-white" />
        </div>
      </div>
    </div>
  );
}
