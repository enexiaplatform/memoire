import { isDemoWorkspaceActive } from '../lib/demoMode';

const ANALYTICS_ID_KEY = 'memoire.analytics.anonymousId.v1';

export type ProductFunnelEvent =
  | 'demo_started'
  | 'demo_completed'
  | 'request_access_submitted'
  | 'signup_completed'
  | 'csv_import_completed'
  | 'pipeline_defense_brief_created'
  | 'review_pack_saved';

export type AnalyticsDataMode = 'demo-local' | 'cloud-browser' | 'browser-only' | 'sync-issue' | 'unknown';

export function trackProductEvent(eventName: ProductFunnelEvent, dataMode?: AnalyticsDataMode) {
  if (typeof window === 'undefined') return;

  const payload = JSON.stringify({
    kind: 'event',
    eventName,
    anonymousId: getAnonymousId(),
    route: window.location.pathname,
    dataMode: dataMode || (isDemoWorkspaceActive() ? 'demo-local' : 'unknown'),
  });

  void fetch('/api/request-access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // Analytics must never block the customer workflow.
  });
}

function getAnonymousId() {
  try {
    const existing = window.localStorage.getItem(ANALYTICS_ID_KEY);
    if (existing) return existing;
    const next = crypto.randomUUID?.() || `anonymous-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(ANALYTICS_ID_KEY, next);
    return next;
  } catch {
    return `ephemeral-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
