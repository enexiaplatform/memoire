import { Outlet } from 'react-router-dom';
import { Suspense, useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { OnboardingModal } from './OnboardingModal';
import { DemoModeBanner } from '../demo/DemoModeBanner';
import { prefetchPrimaryAppRoutes } from '../../utils/routePrefetch';

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    prefetchPrimaryAppRoutes();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <TopNav onOpenMenu={() => setMobileNavOpen(true)} />
      <main className="relative ml-0 flex min-h-screen flex-1 flex-col pt-16 lg:ml-[220px]">
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
  return (
    <div className="flex w-full max-w-none px-4 py-6 sm:px-5 lg:px-6">
      <div className="w-full rounded-lg border border-gray-200 bg-white p-5 text-sm font-semibold text-gray-500 shadow-sm">
        Loading this workspace...
      </div>
    </div>
  );
}
