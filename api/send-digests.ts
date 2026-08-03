import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from './_env.js';
import {
  buildDailyDigest,
  buildWeeklyDigest,
  loadDigestInputs,
  localHourInZone,
  renderDigestEmail,
  sendEmail,
  todayInZone,
} from './_digest.js';

/**
 * The scheduled send. One function, two verbs, and a reason for both.
 *
 * POST is the cron: Vercel calls it hourly, it works out whose local hour has
 * arrived, and it sends. Hourly rather than daily because the operators this is
 * built for are not in one timezone and "7am" has to mean 7am where they are.
 *
 * GET is the unsubscribe link, because an unsubscribe has to work from an email
 * client with no session and one credential - the token in the URL. It lives
 * here rather than in a function of its own because the Hobby plan caps the
 * project at twelve, and a second function to set one boolean is not what the
 * remaining slots are for.
 *
 * Everything this endpoint does is idempotent per day. The cron may fire twice,
 * a retry may land late, and a partial unique index in Postgres refuses the
 * second send rather than trusting the caller to be careful.
 */

type ApiRequest = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  send: (body: string) => void;
  setHeader: (name: string, value: string) => void;
  end: () => void;
};

/**
 * The service-role client, left untyped on purpose. This project has no
 * generated database types, and `ReturnType<typeof createClient>` resolves
 * every table to `never`, which makes an insert impossible to write.
 */
type ServiceClient = SupabaseClient;

type ProfileRow = {
  id: string;
  email: string;
  display_name: string | null;
  daily_digest_enabled: boolean;
  weekly_review_enabled: boolean;
  digest_send_hour: number;
  digest_utc_offset_minutes: number;
  digest_last_daily_sent_on: string | null;
  digest_last_weekly_sent_on: string | null;
  digest_unsubscribe_token: string;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === 'GET') return handleUnsubscribe(req, res);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  }
  return handleCron(req, res);
}

/**
 * Only the scheduler may run a send. Without this the endpoint is a way for
 * anyone to make the product email its users, which is both a spam vector and a
 * way to burn a provider quota from outside.
 */
function isAuthorizedCron(req: ApiRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = req.headers?.authorization;
  const provided = Array.isArray(header) ? header[0] : header;
  return provided === `Bearer ${expected}`;
}

async function handleCron(req: ApiRequest, res: ApiResponse) {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'unauthorized' });

  let supabase;
  try {
    supabase = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
      auth: { persistSession: false },
    });
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }

  const now = new Date();
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, display_name, daily_digest_enabled, weekly_review_enabled, digest_send_hour, digest_utc_offset_minutes, digest_last_daily_sent_on, digest_last_weekly_sent_on, digest_unsubscribe_token')
    .or('daily_digest_enabled.eq.true,weekly_review_enabled.eq.true')
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });

  const profiles = (data || []) as ProfileRow[];
  const results = { considered: profiles.length, sent: 0, skipped: 0, failed: 0 };

  for (const profile of profiles) {
    const kind = dueKind(profile, now);
    if (!kind) {
      results.skipped += 1;
      continue;
    }

    const today = todayInZone(profile.digest_utc_offset_minutes, now);
    try {
      const outcome = await sendOne(supabase, profile, kind, today);
      if (outcome === 'sent') results.sent += 1;
      else if (outcome === 'skipped') results.skipped += 1;
      else results.failed += 1;
    } catch (sendError) {
      results.failed += 1;
      await logDelivery(supabase, profile.id, kind, today, 'failed', (sendError as Error).message);
    }
  }

  return res.status(200).json(results);
}

/**
 * Which digest, if any, is due for this operator right now.
 *
 * The weekly one wins on the day it is due: two emails in the same hour is how
 * a product teaches somebody to filter it. Monday is the send day because a
 * review of last week is only useful before this one is spent.
 */
function dueKind(profile: ProfileRow, now: Date): 'daily' | 'weekly' | null {
  const offset = profile.digest_utc_offset_minutes || 0;
  const localHour = localHourInZone(offset, now);
  if (localHour !== profile.digest_send_hour) return null;

  const today = todayInZone(offset, now);
  const localDay = new Date(now.getTime() + offset * 60_000).getUTCDay();

  if (profile.weekly_review_enabled && localDay === 1 && profile.digest_last_weekly_sent_on !== today) {
    return 'weekly';
  }
  if (profile.daily_digest_enabled && profile.digest_last_daily_sent_on !== today) {
    return 'daily';
  }
  return null;
}

async function sendOne(
  supabase: ServiceClient,
  profile: ProfileRow,
  kind: 'daily' | 'weekly',
  today: string,
): Promise<'sent' | 'skipped' | 'failed'> {
  const inputs = await loadDigestInputs(supabase, profile.id, today);
  if (inputs.errors.length > 0) {
    await logDelivery(supabase, profile.id, kind, today, 'failed', inputs.errors.join('; ').slice(0, 400));
    return 'failed';
  }

  const digest = kind === 'weekly' ? buildWeeklyDigest(inputs, today) : buildDailyDigest(inputs, today);

  // Silence is the correct output when there is nothing to say. An email that
  // arrives every morning to report that nothing needs attention trains the
  // operator to stop reading the one that does.
  if (!digest.hasSignal) {
    await markSent(supabase, profile.id, kind, today);
    await logDelivery(supabase, profile.id, kind, today, 'skipped', 'no signal');
    return 'skipped';
  }

  const appUrl = process.env.VITE_APP_URL || 'https://memoire-official.com';
  const email = renderDigestEmail(digest, {
    appUrl: `${appUrl}/app/${kind === 'weekly' ? 'reviews' : 'today'}`,
    unsubscribeUrl: `${appUrl}/api/send-digests?token=${profile.digest_unsubscribe_token}&kind=${kind}`,
  });

  const delivery = await sendEmail({ to: profile.email, ...email });
  if (!delivery.ok) {
    await logDelivery(supabase, profile.id, kind, today, delivery.skipped ? 'skipped' : 'failed', delivery.detail);
    return delivery.skipped ? 'skipped' : 'failed';
  }

  await markSent(supabase, profile.id, kind, today);
  await logDelivery(supabase, profile.id, kind, today, 'sent', '');
  return 'sent';
}

async function markSent(
  supabase: ServiceClient,
  userId: string,
  kind: 'daily' | 'weekly',
  today: string,
) {
  const column = kind === 'weekly' ? 'digest_last_weekly_sent_on' : 'digest_last_daily_sent_on';
  await supabase.from('user_profiles').update({ [column]: today }).eq('id', userId);
}

async function logDelivery(
  supabase: ServiceClient,
  userId: string,
  kind: 'daily' | 'weekly',
  sentFor: string,
  status: 'sent' | 'skipped' | 'failed',
  detail: string,
) {
  await supabase.from('digest_deliveries').insert({
    user_id: userId,
    kind,
    sent_for: sentFor,
    status,
    detail: detail ? detail.slice(0, 400) : null,
  });
}

/**
 * Unsubscribe. One click, no session, no confirmation page that asks the
 * operator to sign in first - the whole point is that they are in their mail
 * client and want it to stop.
 */
async function handleUnsubscribe(req: ApiRequest, res: ApiResponse) {
  const rawToken = req.query?.token;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  const rawKind = req.query?.kind;
  const kind = (Array.isArray(rawKind) ? rawKind[0] : rawKind) === 'weekly' ? 'weekly' : 'daily';

  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) {
    return htmlResponse(res, 400, 'That unsubscribe link is not valid. You can turn these emails off in Settings.');
  }

  let supabase;
  try {
    supabase = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
      auth: { persistSession: false },
    });
  } catch (error) {
    return htmlResponse(res, 500, (error as Error).message);
  }

  const column = kind === 'weekly' ? 'weekly_review_enabled' : 'daily_digest_enabled';
  const { data, error } = await supabase
    .from('user_profiles')
    .update({ [column]: false })
    .eq('digest_unsubscribe_token', token)
    .select('id');

  if (error) return htmlResponse(res, 500, 'Something went wrong turning these off. Settings can do it too.');
  if (!data || data.length === 0) {
    return htmlResponse(res, 404, 'That link has already been used, or the account no longer exists.');
  }

  return htmlResponse(
    res,
    200,
    `The ${kind === 'weekly' ? 'weekly review' : 'daily'} email is off. Everything else about your workspace is unchanged, and you can turn it back on in Settings whenever you want.`,
  );
}

function htmlResponse(res: ApiResponse, status: number, message: string) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(status).send(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:14vh auto;padding:0 24px;line-height:1.6;color:#0F172A">`
    + `<p style="font-weight:800;font-size:20px;margin:0 0 12px">Memoire</p>`
    + `<p style="margin:0">${message}</p></div>`,
  );
}
