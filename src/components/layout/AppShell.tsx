import { Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { OnboardingModal } from './OnboardingModal';
import { DemoModeBanner } from '../demo/DemoModeBanner';
import { prefetchPrimaryAppRoutes } from '../../utils/routePrefetch';
import { useAuthContext } from '../../auth/authContext';
import { hasLocalSampleData } from '../../utils/dataMode';
import { loadSalesWorkspaceData } from '../../services/workspaceData';

export function AppShell() {
  const { user, loading: authLoading } = useAuthContext();

  useEffect(() => {
    prefetchPrimaryAppRoutes();
  }, []);

  useEffect(() => {
    if (authLoading) return;

    const warmWorkspaceData = () => {
      loadSalesWorkspaceData(hasLocalSampleData() ? undefined : user?.id).catch(() => {
        // Routes still show their own fallback if warm loading cannot complete.
      });
    };

    const idleCallback = (globalThis as typeof globalThis & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
    }).requestIdleCallback;

    if (idleCallback) {
      idleCallback(warmWorkspaceData, { timeout: 2500 });
      return;
    }

    const timer = window.setTimeout(warmWorkspaceData, 800);
    return () => window.clearTimeout(timer);
  }, [authLoading, user?.id]);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />
      <TopNav />
      <main className="flex-1 ml-[220px] pt-16 flex flex-col min-h-screen relative">
        <DemoModeBanner />
        <div className="flex-1">
          <Outlet />
        </div>
      </main>
      <OnboardingModal />
    </div>
  );
}
