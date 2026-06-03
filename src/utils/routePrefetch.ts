const routePrefetchers: Record<string, () => Promise<unknown>> = {
  '/app/dashboard': () => import('../features/dashboard/DashboardPage'),
  '/app/calendar': () => import('../features/calendar/SalesActivityCalendarPage'),
  '/app/reviews': () => import('../features/reviews/SalesReviewsPage'),
  '/app/playbook': () => import('../features/playbook/SalesPlaybookPage'),
  '/app/accounts': () => import('../features/accounts/AccountsPage'),
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
  const routes = [
    '/app/dashboard',
    '/app/pipeline-defense',
    '/app/calendar',
    '/app/reviews',
    '/app/accounts',
    '/app/stakeholders',
    '/app/objections',
    '/app/playbook',
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
