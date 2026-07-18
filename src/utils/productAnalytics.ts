import { isDemoWorkspaceActive } from '../lib/demoMode';

const ANALYTICS_ID_KEY = 'memoire.analytics.anonymousId.v1';

export type ProductFunnelEvent =
  | 'demo_started'
  | 'demo_completed'
  | 'request_access_submitted'
  | 'signup_completed'
  | 'csv_import_completed'
  | 'pipeline_defense_brief_created'
  | 'review_pack_saved'
  | 'activity_ledger_opened'
  | 'business_review_opened'
  | 'money_flow_opened'
  | 'cockpit_tile_clicked'
  | 'morning_brief_question_clicked'
  | 'follow_up_logged_as_sent'
  | 'next_touch_booked'
  | 'calibration_viewed'
  | 'proven_responses_copied'
  | 'voice_dictation_used'
  | 'learning_brief_copied'
  | 'revenue_risk_brief_copied'
  | 'follow_up_brief_copied'
  | 'master_dashboard_opened'
  | 'master_dashboard_exported'
  | 'daily_digest_copied'
  // The weekly commitment loop: shown -> confirmed -> edited -> returned to.
  // Without all four, acceptance and return rates are unmeasurable, and the
  // stop conditions for further planning work cannot be evaluated.
  | 'weekly_commitment_confirmed'
  | 'weekly_commitment_edited'
  | 'weekly_commitment_resolved'
  | 'weekly_commitment_reconciliation_viewed'
  // The plan board: is the week actually lived here, or abandoned after a look?
  | 'weekly_plan_opened'
  | 'weekly_plan_item_added'
  | 'weekly_plan_item_checked';

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
