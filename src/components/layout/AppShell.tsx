import { Outlet } from 'react-router-dom';
import { Suspense, useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { OnboardingModal } from './OnboardingModal';
import { DemoModeBanner } from '../demo/DemoModeBanner';

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <TopNav onOpenMenu={() => setMobileNavOpen(true)} />
      <main className="relative ml-0 flex min-h-screen min-w-0 flex-1 flex-col pt-16 lg:ml-[220px]">
        <DemoModeBanner />
        <div className="flex-1">
          <Suspense fallback={<AppContentLoading />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
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
