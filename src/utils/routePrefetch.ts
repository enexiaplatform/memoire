// Only routes that still exist as surfaces. A prefetcher for a retired
// destination would keep a removed page's chunk in the bundle graph forever.
const routePrefetchers: Record<string, () => Promise<unknown>> = {
  '/app/today': () => import('../features/dashboard/DashboardPage'),
  '/app/accounts': () => import('../features/accounts/AccountsPage'),
  '/app/opportunities': () => import('../features/opportunities/OpportunitiesPage'),
  '/app/revenue': () => import('../features/revenue/RevenueViewPage'),
  '/app/timeline': () => import('../features/timeline/TimelinePage'),
  '/app/reviews': () => import('../features/reviews/SalesReviewsPage'),
  '/app/capture': () => import('../features/dailyCapture/DailyCapturePage'),
  '/app/ask': () => import('../features/v31/AskMemoirePage'),
  '/app/settings': () => import('../features/settings/SettingsPage'),
  '/app/quotes': () => import('../features/quotes/QuotesPage'),
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
  const routes = [
    '/app/capture',
    '/app/accounts',
    '/app/opportunities',
    '/app/revenue',
    '/app/timeline',
    '/app/reviews',
  ];

  scheduleRoutePrefetch(routes);
}

function scheduleRoutePrefetch(routes: string[]) {
  let index = 0;
  const idleCallback = (globalThis as typeof globalThis & {
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  }).requestIdleCallback;

  const runNext = () => {
    const route = routes[index];
    if (!route) return;

    prefetchAppRoute(route);
    index += 1;

    if (idleCallback) {
      idleCallback(runNext, { timeout: 2500 });
      return;
    }

    globalThis.setTimeout(runNext, 700);
  };

  globalThis.setTimeout(() => {
    if (idleCallback) {
      idleCallback(runNext, { timeout: 2500 });
      return;
    }

    runNext();
  }, 4500);
}
