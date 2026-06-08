import { Outlet } from 'react-router-dom';
import { Suspense, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { OnboardingModal } from './OnboardingModal';
import { DemoModeBanner } from '../demo/DemoModeBanner';
import { prefetchPrimaryAppRoutes } from '../../utils/routePrefetch';

export function AppShell() {
  useEffect(() => {
    prefetchPrimaryAppRoutes();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />
      <TopNav />
      <main className="flex-1 ml-[220px] pt-16 flex flex-col min-h-screen relative">
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
