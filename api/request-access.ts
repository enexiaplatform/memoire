import { createClient } from '@supabase/supabase-js';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from './_env.js';
import { enforceRateLimit, rateLimitExceeded } from './_rateLimit.js';
import { sendEmail } from './_digest.js';

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

    // Only after the row is safely in. The row is the record; the email is an
    // alert about it, and an alert that could lose the record it is about would
    // be worse than no alert.
    await notifyOperatorOfLead(leadPayload.payload);

    return res.status(201).json({ success: true });
  } catch (error) {
    console.error('Request access submission failed:', error);
    return res.status(500).json({ error: 'We could not submit your request. Please retry.' });
  }
}

/**
 * Tell somebody a lead arrived.
 *
 * ## Why this exists
 *
 * It did not, and the operator console said so out loud: "From the contact
 * form. Nobody is emailed when one arrives - this list is the whole mechanism."
 * A stranger who filled in the form was written to `early_access_requests` and
 * then waited for somebody to happen to open `/admin`. Zero leads had arrived,
 * so it had cost nothing yet; the first real one it swallowed would have been a
 * customer, and nobody would ever have known it was lost.
 *
 * ## Three properties, and each one has a failure it prevents
 *
 * **It runs after the insert.** The row is the record. An alert that could take
 * the record down with it is worse than no alert.
 *
 * **It is awaited, and its failure is swallowed.** Awaited because this is a
 * serverless function: an unawaited promise is killed the moment the handler
 * returns, so fire-and-forget here means fire-and-never-send. Swallowed because
 * the person who filled in the form is owed their 201 whether or not our
 * mailbox is reachable - they cannot fix our email configuration and should not
 * be asked to resubmit because of it.
 *
 * **It is silent when unconfigured.** `sendEmail` returns `{skipped: true}`
 * rather than throwing when `EMAIL_API_KEY`/`EMAIL_FROM` are unset, which is
 * the state this deployment is in today. So this ships dormant and starts
 * working the moment email is configured for the digest - no second deploy, no
 * second decision.
 *
 * The destination is `LEAD_NOTIFICATION_EMAIL`, falling back to `EMAIL_FROM`.
 * No address is written here on purpose: the support address has a single home
 * in `src/config/contact.ts`, and it was typed literally in five places once
 * already.
 */
export async function notifyOperatorOfLead(lead: {
  name: string;
  work_email: string;
  role: string;
  current_tool: string;
  biggest_pain: string;
  preferred_use_case: string;
}) {
  const to = process.env.LEAD_NOTIFICATION_EMAIL || process.env.EMAIL_FROM;
  if (!to) return;

  // The address is in the subject because that is what a phone shows on the
  // lock screen, and replying is the entire point of the notification.
  const subject = `Memoire lead: ${lead.name} <${lead.work_email}>`;
  const lines = [
    `${lead.name} <${lead.work_email}>`,
    lead.role ? `Role: ${lead.role}` : '',
    `Today they use: ${lead.current_tool}`,
    lead.biggest_pain ? `Where follow-up falls through: ${lead.biggest_pain}` : '',
    '',
    'What they want it for:',
    lead.preferred_use_case,
    '',
    'The full list is at https://www.memoire-official.com/admin',
  ].filter(Boolean);

  try {
    await sendEmail({
      to,
      subject,
      text: lines.join('\n'),
      html: `<pre style="font:14px/1.6 ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(lines.join('\n'))}</pre>`,
    });
  } catch {
    // See above: never fail the submission over the notification.
  }
}

/** Local, because the lead's own words end up inside an HTML body. */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
