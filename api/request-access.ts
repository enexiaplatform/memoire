import { createClient } from '@supabase/supabase-js';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from './_env.js';
import { enforceRateLimit, rateLimitExceeded } from './_rateLimit.js';

export interface RequestAccessBody {
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

// Product analytics used to be POSTed here, to the lead-capture endpoint. It
// now has its own route, table and rate limit in api/product-events.ts: a
// product measurement and a sales lead have different retention and different
// privacy weight, and sharing a route meant neither could be changed safely.
// This endpoint accepts leads only.

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
