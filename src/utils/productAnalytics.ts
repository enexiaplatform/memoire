import { isDemoWorkspaceActive, isSupabaseConfigured } from '../lib/demoMode';
import { getWorkspaceSyncStatus } from '../services/workspaceSyncStatus';
import { supabaseClient } from '../lib/supabaseClient';

const ANALYTICS_ID_KEY = 'memoire.analytics.anonymousId.v1';
const FIRST_EVENT_KEY_PREFIX = 'memoire.analytics.first.';
const PRODUCT_EVENTS_ENDPOINT = '/api/product-events';

/**
 * Product analytics, behaviour-centric.
 *
 * The old taxonomy counted page opens - `activity_ledger_opened`,
 * `master_dashboard_opened`, `weekly_plan_opened`. Those measured navigation,
 * which told us which rooms people walked into and nothing about whether the
 * product worked. Worse, they were tied to destinations that no longer exist,
 * so half the funnel would have gone permanently to zero and looked like a
 * collapse in usage.
 *
 * These names describe what a seller *did*: recorded something, promised
 * something, kept it, acted on a risk, closed a week. Four groups:
 *
 *   Activation - the first time each step of the loop happens at all.
 *   Core usage - is the loop actually being run, repeatedly?
 *   Value      - did Memoire do commercial good? (mirrors the value ledger)
 *   Trust      - does the product keep the data it was given?
 *
 * The list is duplicated in `api/product-events.ts` and in the product_events
 * CHECK constraint, and `scripts/verify-product-analytics-contract.mjs` fails
 * the build when the three disagree. They disagreed before: the client sent
 * twenty names into a table that allowed six, and the other fourteen were
 * rejected by Postgres, caught, and reported as delivered.
 */
export type ProductEvent =
  // Activation
  | 'first_capture_saved'
  | 'first_thread_linked'
  | 'first_commitment_created'
  | 'first_commitment_completed'
  | 'first_review_completed'
  // Core usage
  | 'capture_saved'
  | 'thread_viewed'
  | 'commitment_created'
  | 'commitment_completed'
  | 'commitment_rescheduled'
  | 'commercial_risk_viewed'
  | 'commercial_risk_acted_on'
  | 'review_completed'
  // Value
  | 'follow_up_recovered'
  | 'commitment_caught'
  | 'quote_advanced'
  | 'delivery_delay_avoided'
  | 'payment_recovered'
  | 'revenue_protected'
  // Trust
  | 'sync_failed'
  | 'sync_recovered'
  | 'backup_exported'
  | 'restore_completed'
  | 'duplicate_prevented'
  // Funnel
  | 'demo_started'
  | 'demo_completed'
  | 'request_access_submitted'
  | 'signup_completed'
  | 'csv_import_completed';

/**
 * How this workspace is actually storing data.
 *
 * The old set collapsed everything that was not the demo into `unknown`, which
 * made the one question analytics needed to answer - "did this person's data
 * reach the cloud?" - unanswerable. These five states are distinguishable and
 * each means something different for whether a record survived.
 */
export type AnalyticsDataMode =
  | 'demo-local'
  | 'cloud-synced'
  | 'browser-only'
  | 'sync-pending'
  | 'sync-failed'
  | 'unknown';

export function resolveAnalyticsDataMode(): AnalyticsDataMode {
  if (typeof window === 'undefined') return 'unknown';
  if (isDemoWorkspaceActive()) return 'demo-local';
  if (!isSupabaseConfigured) return 'browser-only';

  const sync = getWorkspaceSyncStatus();
  if (sync.state === 'error') return 'sync-failed';
  if (sync.state === 'checking') return 'sync-pending';

  // A configured Supabase with no session is a real, common state: the user is
  // working locally and their records are in this browser only. Reporting that
  // as `unknown` hid the single most important trust signal there is.
  if (!supabaseClient) return 'browser-only';
  const hasSession = Boolean(
    window.localStorage.getItem('memoire.supabase.auth'),
  );
  if (!hasSession) return 'browser-only';

  return sync.state === 'ready' ? 'cloud-synced' : 'sync-pending';
}

/**
 * Records a product event. Never throws, never blocks, never awaits.
 *
 * An analytics call sits inside save handlers and click handlers. If it can
 * fail loudly, it can lose the record the user just typed - so every failure
 * path here ends in silence.
 */
export function trackProductEvent(eventName: ProductEvent, dataMode?: AnalyticsDataMode) {
  if (typeof window === 'undefined') return;

  const mode = dataMode || resolveAnalyticsDataMode();
  const payload = JSON.stringify({
    eventName,
    anonymousId: getAnonymousId(),
    // Path only. A route with a query string would carry a customer id.
    route: window.location.pathname,
    dataMode: mode,
    isDemo: mode === 'demo-local',
  });

  void fetch(PRODUCT_EVENTS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // Analytics must never block the customer workflow.
  });
}

/**
 * Records an activation event the first time it happens in this browser, and
 * never again.
 *
 * Activation is "did this ever work for them once", so a repeated
 * `first_commitment_created` is not just noise - it makes the metric wrong.
 * The marker is local because activation is per-person, and the anonymous id
 * it accompanies is local too.
 */
export function trackFirstTimeEvent(eventName: ProductEvent, dataMode?: AnalyticsDataMode) {
  if (typeof window === 'undefined') return;
  // The demo is a showcase, not an activation. Counting it would report every
  // visitor who clicked "see it working" as an activated user.
  if (isDemoWorkspaceActive()) return;

  const key = `${FIRST_EVENT_KEY_PREFIX}${eventName}`;
  try {
    if (window.localStorage.getItem(key) === 'true') return;
    window.localStorage.setItem(key, 'true');
  } catch {
    // No storage means no way to avoid double-counting, so stay quiet rather
    // than inflate the activation numbers.
    return;
  }

  trackProductEvent(eventName, dataMode);
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
