import { createClient } from '@supabase/supabase-js';
import { verifyUserToken } from './_auth.js';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from './_env.js';
import { applyRateLimitHeaders, enforceRateLimit, rateLimitExceeded } from './_rateLimit.js';
import { billingConfigured, lemonSqueezyRequest } from './_lemonsqueezy.js';

/**
 * The operator's own dashboard: how many accounts exist, how many pay, and
 * whether the product's loop is actually being run.
 *
 * Every other endpoint here answers for one account and is bound to it - the
 * shared rule in `_auth.js` is that the id a query filters by is the id the
 * token *proved*, never the one the body asked for. This endpoint is the single
 * exception in the codebase: it reads across every workspace, so that rule
 * cannot protect it and something else has to.
 *
 * That something is the gate below, and it has three properties worth stating
 * because each one closes a way this could have gone wrong:
 *
 * 1. **It is decided on the server.** The browser sends a token and nothing
 *    else. There is no `isAdmin` in the request, no VITE_ flag, no email
 *    comparison in the bundle. `src/features/admin/*` hides the page from
 *    people who are not admins; this file is what stops them reading the data,
 *    and only this file. The existing founder gates are the other pattern -
 *    `isFounderImportUser` compares an email in the browser and
 *    `isFounderWorkspaceEnabled` is a VITE_ flag shipped inside the bundle -
 *    which is fine for hiding a nav row and would be nothing at all here.
 *
 * 2. **It fails closed.** With neither ADMIN_USER_IDS nor ADMIN_EMAILS set,
 *    every caller is refused. The tempting default - "no admins configured, so
 *    let the first signed-in caller through" - would have made this endpoint
 *    world-readable on any deploy that forgot an environment variable.
 *
 * 3. **An email only authorises once it is confirmed.** Anyone may type any
 *    address into the signup form. If ADMIN_EMAILS could match an unconfirmed
 *    address, admin access would be granted by *claiming* the founder's email
 *    rather than by controlling it. ADMIN_USER_IDS has no such problem - a uuid
 *    cannot be claimed - which is why it is the one to prefer.
 *
 * Nothing here is customer content. The counts come from `auth.users`,
 * `user_profiles` and `product_events`; `product_events` is anonymous by
 * construction (see its migration), and the two account tables are read for
 * dates and subscription state, never for notes, deals or account names.
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

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;
/** PostgREST caps a request at `db-max-rows`; asking for more silently truncates. */
const PAGE_SIZE = 1000;
const MAX_PAGES = 60;

function envList(name: string) {
  return String(process.env[name] ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/** Preferred: a uuid cannot be claimed by signing up with it. */
function adminUserIds() {
  return envList('ADMIN_USER_IDS');
}

function adminEmails() {
  return envList('ADMIN_EMAILS');
}

export function adminGateConfigured() {
  return adminUserIds().length > 0 || adminEmails().length > 0;
}

/**
 * Signed up, used it once, and never came back.
 *
 * This tile is labelled "Never signed in again / First session was the only
 * one" and was computed as `!account.last_sign_in_at` - never signed in *at
 * all*. Supabase writes `last_sign_in_at` when the signup session is
 * created, so the population the label describes always has that column
 * set, and the number was structurally zero for exactly the people it
 * claimed to count. It read 0 while `admin@memoireapp.com` sat in the
 * database having joined and last appeared on the same day in May.
 *
 * It is the worst number on the page to get wrong: "did anybody come back
 * after the first session" is the single question a product in preview
 * exists to answer.
 *
 * So it is computed the way the label reads - no sign-in more than a day
 * after signing up. A day rather than an hour because a session that runs
 * long is still one session, and because the alternative is guessing at a
 * session length Supabase does not record.
 *
 * Unconfirmed signups are excluded and counted by the tile beside this one.
 * Somebody who never confirmed their email never had a first session to
 * come back from, and the two failures have different fixes - one is email
 * deliverability, the other is the first five minutes of the product.
 */
export function neverCameBack(account: { created_at?: string; last_sign_in_at?: string; email_confirmed_at?: string }) {
  if (!account.email_confirmed_at) return false;
  const created = Date.parse(account.created_at || '');
  if (!Number.isFinite(created)) return false;
  const lastSeen = Date.parse(account.last_sign_in_at || '');
  if (!Number.isFinite(lastSeen)) return true;
  return lastSeen - created < DAY_MS;
}

/**
 * Exported for the contract test. Takes the *verified* user object, so there is
 * no overload that accepts an id or an email on its own - passing a value the
 * caller supplied is then not something this function will do for you.
 */
export function isAdminUser(user: { id?: string; email?: string; email_confirmed_at?: string } | null) {
  // Fail closed. An unconfigured gate authorises nobody, including the first
  // caller to find the URL.
  if (!user || !adminGateConfigured()) return false;

  const id = String(user.id ?? '').trim().toLowerCase();
  if (id && adminUserIds().includes(id)) return true;

  const email = String(user.email ?? '').trim().toLowerCase();
  // An address nobody has proved they own is a claim, not an identity.
  if (!email || !user.email_confirmed_at) return false;
  return adminEmails().includes(email);
}

async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    // A short page is the last page. An exactly-full one is ambiguous, so it
    // costs one more request to find out - the alternative is guessing.
    if (batch.length < PAGE_SIZE) return rows;
  }

  throw new Error(`more than ${MAX_PAGES * PAGE_SIZE} rows; refusing to report a partial count as a total`);
}

/**
 * Every account, from the auth table rather than from `user_profiles`.
 *
 * `user_profiles` is populated by a trigger, so a row missing there is a bug
 * that would show up here as a missing *user* - the signup count would quietly
 * under-report exactly when something was wrong. auth.users is the register.
 */
async function fetchAuthUsers(supabase: any) {
  const users: Array<{ id: string; email?: string; created_at?: string; last_sign_in_at?: string; email_confirmed_at?: string }> = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw new Error(error.message);

    const batch = Array.isArray(data?.users) ? data.users : [];
    users.push(...batch);
    if (batch.length < PAGE_SIZE) return users;
  }

  throw new Error(`more than ${MAX_PAGES * PAGE_SIZE} accounts; refusing to report a partial count as a total`);
}

function withinDays(iso: string | null | undefined, days: number, now: number) {
  if (!iso) return false;
  const at = Date.parse(iso);
  return Number.isFinite(at) && now - at <= days * DAY_MS;
}

/** `YYYY-MM-DD` in UTC. One timezone for the whole page beats three. */
function dayKey(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

function countByDay(timestamps: Array<string | null | undefined>, days: number, now: number) {
  const buckets = new Map<string, number>();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    buckets.set(new Date(now - offset * DAY_MS).toISOString().slice(0, 10), 0);
  }
  for (const iso of timestamps) {
    if (!iso) continue;
    const key = dayKey(iso);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([day, count]) => ({ day, count }));
}

/**
 * The loop the product claims to create, in the order somebody walks it.
 *
 * Read as a funnel and not as five unrelated counts: each step can only be
 * reached from the one above it, so the biggest drop is the question worth
 * answering that week.
 */
const ACTIVATION_STEPS = [
  { event: 'signup_completed', label: 'Signed up' },
  { event: 'first_capture_saved', label: 'Captured once' },
  { event: 'first_thread_linked', label: 'Linked a thread' },
  { event: 'first_commitment_created', label: 'Made a commitment' },
  { event: 'first_commitment_completed', label: 'Kept a commitment' },
  { event: 'first_review_completed', label: 'Ran a review' },
] as const;

/**
 * Revenue, read from Lemon Squeezy rather than reconstructed from a price list.
 *
 * Memoire stores which tier somebody is on, never what they were charged. The
 * arithmetic version of this - count the tiers, multiply by the prices on the
 * pricing page - is wrong the moment a discount, a coupon, an annual plan or a
 * currency exists, and it is wrong silently. The store object already carries
 * the real figures, so this asks for them and reports nothing when it cannot.
 */
async function fetchStoreRevenue() {
  if (!billingConfigured()) {
    return { configured: false, reason: 'Lemon Squeezy is not configured on this deployment.' };
  }

  try {
    const store = await lemonSqueezyRequest(`/stores/${process.env.LEMONSQUEEZY_STORE_ID}`);
    const attributes = store?.data?.attributes ?? {};
    return {
      configured: true,
      currency: attributes.currency ?? 'USD',
      // Lemon Squeezy reports these in cents.
      thirtyDayRevenue: Number(attributes.thirty_day_revenue ?? 0) / 100,
      totalRevenue: Number(attributes.total_revenue ?? 0) / 100,
      thirtyDaySales: Number(attributes.thirty_day_sales ?? 0),
      totalSales: Number(attributes.total_sales ?? 0),
    };
  } catch (error) {
    return {
      configured: true,
      reason: error instanceof Error ? error.message : 'Lemon Squeezy did not answer.',
    };
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { userId: claimedUserId, authToken } = (req.body ?? {}) as Record<string, string>;
  const user = await verifyUserToken(authToken, claimedUserId);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // The gate. Note what is *not* consulted: nothing from `req.body` beyond the
  // token, and nothing the browser could set.
  if (!isAdminUser(user)) {
    return res.status(403).json({ error: 'Not an administrator.' });
  }

  const limit = enforceRateLimit(req, 'admin-metrics', user.id, 30, 60_000);
  if (!limit.allowed) return rateLimitExceeded(res, limit);
  applyRateLimitHeaders(res, limit);

  const supabase = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey());
  const now = Date.now();
  const windowStart = new Date(now - WINDOW_DAYS * DAY_MS).toISOString();

  try {
    const [authUsers, profiles, events, revenue, leads] = await Promise.all([
      fetchAuthUsers(supabase),
      fetchAllRows<any>((from, to) => supabase
        .from('user_profiles')
        // The two Lemon Squeezy ids are read for one reason: to tell a paying
        // customer from a row that merely says 'active'. See `paying` below.
        .select('id, subscription_status, subscription_tier, subscription_trial_ends_at, created_at, lemonsqueezy_subscription_id, lemonsqueezy_customer_id')
        // Offset paging needs a total order or rows repeat and rows vanish.
        // `created_at` alone is not one: profiles created in the same import
        // share a timestamp, and Postgres is free to order those differently
        // between two requests. `id` is the tiebreak that makes it total.
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)),
      fetchAllRows<any>((from, to) => supabase
        .from('product_events')
        .select('event_name, anonymous_id, route, is_demo, created_at')
        .gte('created_at', windowStart)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)),
      fetchStoreRevenue(),
      // The contact form's only reader.
      //
      // `/api/request-access` writes a lead and notifies nobody, and until
      // 2026-08-18 this console did not read the table either - so a person who
      // filled in the form on the marketing site reached a row that no surface
      // in the product displayed. Empty at the time it was found, which is the
      // only reason it cost nothing.
      fetchAllRows<any>((from, to) => supabase
        .from('early_access_requests')
        .select('id, name, work_email, role, current_tool, biggest_pain, preferred_use_case, source, created_at')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to)),
    ]);

    // Demo traffic is separated rather than dropped: it is the only measure of
    // whether the showcase is being looked at, and folding it in would inflate
    // every activation number with people who are just looking around.
    const realEvents = events.filter((event) => event.is_demo !== true);
    const demoEvents = events.filter((event) => event.is_demo === true);

    const countEvent = (name: string) => realEvents.filter((event) => event.event_name === name).length;
    const signedUp = countEvent('signup_completed');

    const eventsByName = new Map<string, number>();
    for (const event of realEvents) {
      eventsByName.set(event.event_name, (eventsByName.get(event.event_name) ?? 0) + 1);
    }

    const routeCounts = new Map<string, number>();
    for (const event of realEvents) {
      const route = event.route || '(none)';
      routeCounts.set(route, (routeCounts.get(route) ?? 0) + 1);
    }

    const uniqueDevices = (days: number) => new Set(
      realEvents.filter((event) => withinDays(event.created_at, days, now)).map((event) => event.anonymous_id),
    ).size;


    // `user_profiles.id` is the auth user id, so the account list below can say
    // what plan somebody is on without a second round trip. A missing row is
    // normal rather than an error - a profile is created lazily, and an account
    // that has not been back since signing up may not have one yet.
    const profileById = new Map<string, any>(profiles.map((profile) => [profile.id, profile]));

    const tierCount = (tier: string) => profiles.filter((profile) => profile.subscription_tier === tier).length;
    const statusCount = (status: string) => profiles.filter((profile) => profile.subscription_status === status).length;

    /**
     * A subscription Lemon Squeezy knows about.
     *
     * `subscription_status` alone does not mean money. Checked against the live
     * database on 2026-08-18, two profiles read `active`/`team` and neither had
     * a Lemon Squeezy id - which they must, because the webhook writes
     * `lemonsqueezy_subscription_id` from the event id on every subscription
     * event it processes. Checkout has also never been open. So those rows were
     * set by hand or by an old seed path, and a "Paying: 2" on the first
     * dashboard the operator ever opens would have been the number lying on day
     * one, in the direction people most want to believe.
     *
     * They are still counted, under their own name, because a comped or legacy
     * account is a real thing to know about. What they are not is revenue.
     */
    const hasBillingAccount = (profile: any) =>
      Boolean(profile.lemonsqueezy_subscription_id || profile.lemonsqueezy_customer_id);
    const ENTITLED = new Set(['active', 'on_trial', 'cancelled']);

    return res.json({
      generatedAt: new Date(now).toISOString(),
      windowDays: WINDOW_DAYS,

      accounts: {
        total: authUsers.length,
        newLast7: authUsers.filter((account) => withinDays(account.created_at, 7, now)).length,
        newLast30: authUsers.filter((account) => withinDays(account.created_at, 30, now)).length,
        // An account that never confirmed its email is a signup that did not
        // finish, and it sits in the total looking like a user.
        unconfirmed: authUsers.filter((account) => !account.email_confirmed_at).length,
        activeLast7: authUsers.filter((account) => withinDays(account.last_sign_in_at, 7, now)).length,
        activeLast30: authUsers.filter((account) => withinDays(account.last_sign_in_at, 30, now)).length,
        neverReturned: authUsers.filter(neverCameBack).length,
        signupsByDay: countByDay(authUsers.map((account) => account.created_at), WINDOW_DAYS, now),

        /**
         * Who they actually are, newest first.
         *
         * Every figure above this line is a count, and until now that was all
         * this endpoint returned about accounts: it read `id, email,
         * created_at, last_sign_in_at, email_confirmed_at` for every user and
         * then collapsed the lot into `.filter().length` before responding. Not
         * one account row ever left the server.
         *
         * The same endpoint already returns a list for leads, with the reason
         * written above it - "a count alone would tell the operator that
         * somebody wanted something without telling them what". That argument
         * was made for leads and never applied here, and it applies harder
         * here: "1 new in 30 days" and "0 never confirmed" are unactionable at
         * four accounts and stay unactionable at forty. Which one is new, did
         * they confirm, have they ever come back - those are the questions, and
         * every one of them was already in memory and thrown away.
         *
         * ## What this may carry, and what it may not
         *
         * The line this file draws is between *who holds an account* and *what
         * is inside their workspace*. An email address and a signup date are
         * the operator's own signup ledger, which every product has. A customer
         * name, a deal, an amount or a note belongs to one seller and is not
         * readable from here at any tier - see the queries above, which never
         * select from those tables.
         *
         * Activation is deliberately absent, and it is the one people will ask
         * for. `product_events` is keyed on `anonymous_id` and carries no user
         * id by construction (see its migration), so "did *this* account ever
         * capture anything" cannot be answered without breaking that. The
         * activation funnel below stays a population measure. Making it
         * per-person would mean attaching identity to every product event,
         * which is a much larger decision than a table on a dashboard.
         */
        recent: authUsers
          .slice()
          .sort((a, b) => Date.parse(b.created_at || '') - Date.parse(a.created_at || ''))
          .slice(0, 100)
          .map((account) => {
            const profile = profileById.get(account.id);
            return {
              id: account.id,
              email: account.email || '',
              createdAt: account.created_at || '',
              confirmed: Boolean(account.email_confirmed_at),
              lastSignInAt: account.last_sign_in_at || '',
              // Read from the same predicate the tile counts, so a row can
              // never disagree with the number above it about the same person.
              neverCameBack: neverCameBack(account),
              subscriptionStatus: profile?.subscription_status || 'free',
              subscriptionTier: profile?.subscription_tier || '',
              trialEndsAt: profile?.subscription_trial_ends_at || '',
            };
          }),
      },

      billing: {
        checkoutEnabled: process.env.BILLING_CHECKOUT_ENABLED === 'true',
        paying: profiles.filter((profile) => profile.subscription_status === 'active' && hasBillingAccount(profile)).length,
        // Entitled, but with no billing relationship behind it: comped, seeded
        // or set by hand. Reported rather than folded into either side.
        entitledWithoutBilling: profiles.filter(
          (profile) => ENTITLED.has(profile.subscription_status) && !hasBillingAccount(profile),
        ).length,
        onTrial: statusCount('on_trial'),
        cancelled: statusCount('cancelled'),
        free: profiles.filter((profile) => !profile.subscription_status || profile.subscription_status === 'free').length,
        personal: tierCount('personal'),
        team: tierCount('team'),
        // The list to act on this week, not a number to admire.
        trialsEndingWithin7Days: profiles.filter((profile) => {
          const endsAt = profile.subscription_trial_ends_at ? Date.parse(profile.subscription_trial_ends_at) : Number.NaN;
          return Number.isFinite(endsAt) && endsAt >= now && endsAt - now <= 7 * DAY_MS;
        }).length,
        revenue,
      },

      activation: ACTIVATION_STEPS.map((step) => {
        const reached = countEvent(step.event);
        return {
          step: step.label,
          event: step.event,
          reached,
          // Share of the people who signed up in this window. Null rather than
          // zero when nobody has: 0% and "nobody to measure" are different
          // answers and only one of them means something is wrong.
          shareOfSignups: signedUp > 0 ? reached / signedUp : null,
        };
      }),

      usage: {
        eventsLast7: realEvents.filter((event) => withinDays(event.created_at, 7, now)).length,
        eventsLast30: realEvents.length,
        devicesLast7: uniqueDevices(7),
        devicesLast30: uniqueDevices(30),
        demoEventsLast30: demoEvents.length,
        demoDevicesLast30: new Set(demoEvents.map((event) => event.anonymous_id)).size,
        topRoutes: [...routeCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
          .map(([route, count]) => ({ route, count })),
        topEvents: [...eventsByName.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
          .map(([event, count]) => ({ event, count })),
      },

      // Nobody is emailed when one of these arrives, so this list is the whole
      // mechanism. It carries the message the person wrote, because a count
      // alone would tell the operator that somebody wanted something without
      // telling them what.
      leads: {
        total: leads.length,
        newLast7: leads.filter((lead) => withinDays(lead.created_at, 7, now)).length,
        recent: leads.slice(0, 20).map((lead) => ({
          id: lead.id,
          name: lead.name || '',
          workEmail: lead.work_email || '',
          role: lead.role || '',
          currentTool: lead.current_tool || '',
          biggestPain: lead.biggest_pain || '',
          preferredUseCase: lead.preferred_use_case || '',
          source: lead.source || '',
          createdAt: lead.created_at,
        })),
      },

      // Sync failures are the one number here that is an alarm rather than a
      // measurement: they mean somebody's work may not have been kept.
      trust: {
        syncFailed: countEvent('sync_failed'),
        syncRecovered: countEvent('sync_recovered'),
        backupExported: countEvent('backup_exported'),
        restoreCompleted: countEvent('restore_completed'),
      },
    });
  } catch (error) {
    // The message can name a table or a row ceiling, which is useful to the one
    // person who can reach this and harmless to everyone else - they got a 403.
    return res.status(502).json({
      error: error instanceof Error ? error.message : 'Metrics could not be read.',
    });
  }
}
