import { createClient } from '@supabase/supabase-js';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from './_env.js';
import { enforceRateLimit, rateLimitExceeded } from './_rateLimit.js';

export interface RequestAccessBody {
  kind?: unknown;
  eventName?: unknown;
  anonymousId?: unknown;
  route?: unknown;
  dataMode?: unknown;
  name?: unknown;
  workEmail?: unknown;
  role?: unknown;
  currentTool?: unknown;
  biggestPain?: unknown;
  preferredUseCase?: unknown;
  consent?: unknown;
  website?: unknown;
}

interface ApiRequest {
  method?: string;
  body?: RequestAccessBody;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  end: () => void;
  setHeader: (name: string, value: string) => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PRODUCT_EVENTS = new Set([
  'demo_started',
  'demo_completed',
  'request_access_submitted',
  'signup_completed',
  'csv_import_completed',
  'pipeline_defense_brief_created',
  'review_pack_saved',
  'activity_ledger_opened',
  'business_review_opened',
  'money_flow_opened',
  'cockpit_tile_clicked',
  'morning_brief_question_clicked',
  'follow_up_logged_as_sent',
  'next_touch_booked',
  'calibration_viewed',
  'proven_responses_copied',
  'voice_dictation_used',
  'learning_brief_copied',
  'revenue_risk_brief_copied',
  'follow_up_brief_copied',
]);
export const DATA_MODES = new Set(['demo-local', 'cloud-browser', 'browser-only', 'sync-issue', 'unknown']);

type LeadPayloadResult =
  | { kind: 'honeypot' }
  | { kind: 'invalid' }
  | {
      kind: 'lead';
      rateLimitIdentity: string;
      payload: {
        name: string;
        work_email: string;
        role: string;
        current_tool: string;
        biggest_pain: string;
        preferred_use_case: string;
        consent_at: string;
        source: 'request_access_page';
      };
    };

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const body = req.body || {};
  if (body.kind === 'event') {
    return recordProductEvent(req, res, body);
  }

  if (isHoneypotSubmission(body)) {
    return res.status(201).json({ success: true });
  }

  const leadPayload = buildLeadInsertPayload(body);

  if (leadPayload.kind !== 'lead') {
    return res.status(400).json({ error: 'Please complete the required fields and confirm consent.' });
  }

  const rateLimit = enforceRateLimit(req, 'request-access', leadPayload.rateLimitIdentity, 3, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return rateLimitExceeded(res, rateLimit, 'This request was already received. Please try again later.');
  }

  try {
    const supabase = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await supabase.from('early_access_requests').insert(leadPayload.payload);

    if (error) throw error;
    return res.status(201).json({ success: true });
  } catch (error) {
    console.error('Request access submission failed:', error);
    return res.status(500).json({ error: 'We could not submit your request. Please retry.' });
  }
}

async function recordProductEvent(req: ApiRequest, res: ApiResponse, body: RequestAccessBody) {
  const eventPayload = buildProductEventPayload(body);

  if (!eventPayload) {
    return res.status(400).json({ error: 'Invalid analytics event.' });
  }

  const rateLimit = enforceRateLimit(req, 'product-event', eventPayload.anonymous_id, 60, 60 * 60 * 1000);
  if (!rateLimit.allowed) return res.status(202).json({ success: true });

  try {
    const supabase = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await supabase.from('product_funnel_events').insert(eventPayload);
    if (error) throw error;
    return res.status(202).json({ success: true });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'Product event insert failed',
      eventName: eventPayload.event_name,
      error: error instanceof Error ? error.message : String(error),
    }));
    return res.status(202).json({ success: true });
  }
}

export function buildLeadInsertPayload(body: RequestAccessBody): LeadPayloadResult {
  if (isHoneypotSubmission(body)) return { kind: 'honeypot' };

  const name = cleanText(body.name, 120);
  const workEmail = cleanText(body.workEmail, 320).toLowerCase();
  const role = cleanText(body.role, 120);
  const currentTool = cleanText(body.currentTool, 160);
  const biggestPain = cleanText(body.biggestPain, 240);
  const preferredUseCase = cleanText(body.preferredUseCase, 1200);

  if (!name || !EMAIL_PATTERN.test(workEmail) || !currentTool || !preferredUseCase || body.consent !== true) {
    return { kind: 'invalid' };
  }

  return {
    kind: 'lead',
    rateLimitIdentity: workEmail,
    payload: {
      name,
      work_email: workEmail,
      role,
      current_tool: currentTool,
      biggest_pain: biggestPain,
      preferred_use_case: preferredUseCase,
      consent_at: new Date().toISOString(),
      source: 'request_access_page',
    },
  };
}

export function buildProductEventPayload(body: RequestAccessBody) {
  const eventName = cleanText(body.eventName, 80);
  const anonymousId = cleanText(body.anonymousId, 100);
  const route = cleanRoute(body.route);
  const dataMode = cleanText(body.dataMode, 40);

  if (!PRODUCT_EVENTS.has(eventName) || anonymousId.length < 8 || !DATA_MODES.has(dataMode)) return null;

  return {
    event_name: eventName,
    anonymous_id: anonymousId,
    route,
    data_mode: dataMode,
  };
}

export function isHoneypotSubmission(body: RequestAccessBody) {
  return typeof body.website === 'string' && body.website.trim();
}

export function cleanText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function cleanRoute(value: unknown) {
  const route = cleanText(value, 160);
  return route.startsWith('/') && !route.includes('?') && !route.includes('#') ? route : '';
}
