import { createClient } from '@supabase/supabase-js';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from './_env.js';
import { applyRateLimitHeaders, enforceRateLimit } from './_rateLimit.js';

/**
 * Product analytics. Its own endpoint, deliberately.
 *
 * These events used to ride /api/request-access, the lead-capture route. A
 * product measurement and a sales lead have different retention, different
 * privacy weight and different rate limits; sharing a route meant neither could
 * be changed safely, and it put analytics traffic through a path built to
 * accept a person's name and email.
 *
 * What may be sent is fixed here and nowhere else: an event name from the
 * allowlist, an anonymous id, a route *path*, and a data mode. No customer
 * notes, no account names, no deal values, no email. Anything else in the body
 * is discarded rather than stored, so a future caller cannot widen the payload
 * by accident.
 */

type ApiRequest = {
  method?: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  end: () => void;
  setHeader: (name: string, value: string) => void;
};

/**
 * The taxonomy. This list is the contract shared with
 * `src/utils/productAnalytics.ts` and the product_events CHECK constraint;
 * `scripts/verify-product-analytics-contract.mjs` fails the build if the three
 * drift apart. They had drifted before: the client sent twenty names into a
 * table that allowed six, and the other fourteen were silently rejected.
 */
export const PRODUCT_EVENTS = new Set([
  // Activation
  'first_capture_saved',
  'first_thread_linked',
  'first_commitment_created',
  'first_commitment_completed',
  'first_review_completed',
  // Core usage
  'capture_saved',
  'thread_viewed',
  'commitment_created',
  'commitment_completed',
  'commitment_rescheduled',
  'commercial_risk_viewed',
  'commercial_risk_acted_on',
  'review_completed',
  // Value
  'follow_up_recovered',
  'commitment_caught',
  'quote_advanced',
  'delivery_delay_avoided',
  'payment_recovered',
  'revenue_protected',
  // Trust
  'sync_failed',
  'sync_recovered',
  'backup_exported',
  'restore_completed',
  'duplicate_prevented',
  // Funnel
  'demo_started',
  'demo_completed',
  'request_access_submitted',
  'signup_completed',
  'csv_import_completed',
]);

export const DATA_MODES = new Set([
  'demo-local',
  'cloud-synced',
  'browser-only',
  'sync-pending',
  'sync-failed',
  'unknown',
]);

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const payload = buildProductEventPayload(req.body || {});
  if (!payload) {
    return res.status(400).json({ error: 'Invalid product event.' });
  }

  const rateLimit = enforceRateLimit(req, 'product-event', payload.anonymous_id, 120, 60 * 60 * 1000);
  applyRateLimitHeaders(res, rateLimit);
  // Rate-limited analytics succeed quietly. Analytics must never surface an
  // error into a workflow the user is in the middle of.
  if (!rateLimit.allowed) return res.status(202).json({ success: true });

  try {
    const supabase = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await supabase.from('product_events').insert(payload);
    if (error) throw error;
    return res.status(202).json({ success: true });
  } catch (error) {
    // Logged loudly on the server, so a rejected insert is visible to the
    // operator instead of being swallowed the way the old one was.
    console.error(JSON.stringify({
      level: 'error',
      message: 'Product event insert failed',
      eventName: payload.event_name,
      error: error instanceof Error ? error.message : String(error),
    }));
    return res.status(202).json({ success: true });
  }
}

export function buildProductEventPayload(body: Record<string, unknown>) {
  const eventName = cleanText(body.eventName, 80);
  const anonymousId = cleanText(body.anonymousId, 100);
  const dataMode = cleanText(body.dataMode, 40);

  if (!PRODUCT_EVENTS.has(eventName)) return null;
  if (anonymousId.length < 8) return null;
  if (!DATA_MODES.has(dataMode)) return null;

  return {
    event_name: eventName,
    anonymous_id: anonymousId,
    route: cleanRoute(body.route),
    data_mode: dataMode,
    is_demo: body.isDemo === true || dataMode === 'demo-local',
  };
}

export function cleanText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

/**
 * Path only. A route such as `/app/accounts?accountId=acme-labs` would carry a
 * customer identifier straight into the analytics table, so anything with a
 * query string or a fragment is dropped rather than truncated.
 */
export function cleanRoute(value: unknown) {
  const route = cleanText(value, 160);
  return route.startsWith('/') && !route.includes('?') && !route.includes('#') ? route : '';
}
