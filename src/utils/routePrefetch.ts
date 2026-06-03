const routePrefetchers: Record<string, () => Promise<unknown>> = {
  '/app/dashboard': () => import('../features/dashboard/DashboardPage'),
  '/app/capture': () => import('../features/dailyCapture/DailyCapturePage'),
  '/app/calendar': () => import('../features/calendar/SalesActivityCalendarPage'),
  '/app/reviews': () => import('../features/reviews/SalesReviewsPage'),
  '/app/playbook': () => import('../features/playbook/SalesPlaybookPage'),
  '/app/assets': () => import('../features/assets/SalesAssetsPage'),
  '/app/accounts': () => import('../features/accounts/AccountsPage'),
  '/app/opportunities': () => import('../features/opportunities/OpportunitiesPage'),
  '/app/stakeholders': () => import('../features/stakeholders/StakeholdersPage'),
  '/app/objections': () => import('../features/objections/ObjectionsPage'),
  '/app/pipeline-defense': () => import('../features/pipeline/PipelineReviewDefenseBriefPage'),
};

const prefetchedRoutes = new Set<string>();

export function prefetchAppRoute(route: string) {
  const prefetcher = routePrefetchers[route];
  if (!prefetcher || prefetchedRoutes.has(route)) return;

  prefetchedRoutes.add(route);
  prefetcher().catch(() => {
    prefetchedRoutes.delete(route);
  });
}

export function prefetchPrimaryAppRoutes() {
  const primaryRoutes = [
    '/app/dashboard',
    '/app/capture',
    '/app/opportunities',
    '/app/pipeline-defense',
    '/app/calendar',
    '/app/reviews',
  ];

  const run = () => primaryRoutes.forEach(prefetchAppRoute);

  const idleCallback = (globalThis as typeof globalThis & {
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  }).requestIdleCallback;

  if (idleCallback) {
    idleCallback(run, { timeout: 2500 });
    return;
  }

  globalThis.setTimeout(run, 800);
}
