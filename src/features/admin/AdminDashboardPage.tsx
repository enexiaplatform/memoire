import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthContext } from '../../auth/authContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { isWebAnalyticsEnabled } from '../../lib/webAnalytics';
import { formatCount } from '../../utils/numberFormat';

/**
 * The operator's console: the business behind the product, not a workspace.
 *
 * Deliberately outside `AppShell`. Every other signed-in page is framed by a
 * rail of eleven destinations that answer "what should I do about my customers
 * today"; this one answers "how is the company doing", and the two questions
 * have no business sharing a frame. Putting it in the rail would also have made
 * it a seventh destination, which the navigation contract exists to prevent.
 *
 * **This component is not a security boundary.** It hides a page. What actually
 * refuses the data is `api/admin-metrics.ts`, which decides on the server from
 * environment variables the browser never sees - so a curious signed-in user
 * who types /admin gets this shell and a 403, and no numbers. Everything
 * rendered below arrives from that endpoint already aggregated; no cross-tenant
 * query happens in the browser, and none could - RLS would refuse it.
 */

type DayCount = { day: string; count: number };

type AdminMetrics = {
  generatedAt: string;
  windowDays: number;
  accounts: {
    total: number;
    newLast7: number;
    newLast30: number;
    unconfirmed: number;
    activeLast7: number;
    activeLast30: number;
    neverReturned: number;
    signupsByDay: DayCount[];
    recent: Array<{
      id: string;
      email: string;
      createdAt: string;
      confirmed: boolean;
      lastSignInAt: string;
      neverCameBack: boolean;
      subscriptionStatus: string;
      subscriptionTier: string;
      trialEndsAt: string;
    }>;
  };
  billing: {
    checkoutEnabled: boolean;
    paying: number;
    entitledWithoutBilling: number;
    onTrial: number;
    cancelled: number;
    free: number;
    personal: number;
    team: number;
    trialsEndingWithin7Days: number;
    revenue: {
      configured: boolean;
      reason?: string;
      currency?: string;
      thirtyDayRevenue?: number;
      totalRevenue?: number;
      thirtyDaySales?: number;
      totalSales?: number;
    };
  };
  activation: Array<{ step: string; event: string; reached: number; shareOfSignups: number | null }>;
  usage: {
    eventsLast7: number;
    eventsLast30: number;
    devicesLast7: number;
    devicesLast30: number;
    demoEventsLast30: number;
    demoDevicesLast30: number;
    topRoutes: Array<{ route: string; count: number }>;
    topEvents: Array<{ event: string; count: number }>;
  };
  leads: {
    total: number;
    newLast7: number;
    recent: Array<{
      id: string;
      name: string;
      workEmail: string;
      role: string;
      currentTool: string;
      biggestPain: string;
      preferredUseCase: string;
      source: string;
      createdAt: string;
    }>;
  };
  trust: {
    syncFailed: number;
    syncRecovered: number;
    backupExported: number;
    restoreCompleted: number;
  };
};

type LoadState = 'loading' | 'ready' | 'denied' | 'error';

export function AdminDashboardPage() {
  useDocumentTitle('Operator console');
  const { user, loading: authLoading } = useAuthContext();
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [message, setMessage] = useState('');

  const load = async () => {
    if (!user?.id) return;
    setState('loading');
    setMessage('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/admin-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, authToken: session?.access_token }),
      });

      // 401 and 403 are the same answer to the person reading it - you cannot
      // see this - and telling them apart would only tell an attacker whether
      // their token was the problem or their account was.
      if (response.status === 401 || response.status === 403) {
        setState('denied');
        return;
      }

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setState('error');
        setMessage(payload?.error || `The metrics endpoint answered ${response.status}.`);
        return;
      }

      setMetrics(payload as AdminMetrics);
      setState('ready');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'The metrics endpoint could not be reached.');
    }
  };

  useEffect(() => {
    if (!authLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id]);

  if (authLoading) {
    return <CenteredNote title="Checking your session..." />;
  }

  if (!user) {
    return (
      <CenteredNote
        title="Sign in to continue"
        body="The operator console reads business-wide figures, so it needs an account."
        action={<Link to="/login" className="font-bold text-brand-blue underline">Sign in</Link>}
      />
    );
  }

  if (state === 'denied') {
    return (
      <CenteredNote
        title="This account is not an administrator"
        body="Access is granted server-side and cannot be turned on from the browser. If this is your deployment, set ADMIN_USER_IDS on the project and sign in again."
        action={<Link to="/app/today" className="font-bold text-brand-blue underline">Back to Today</Link>}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">Operator</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-navy">Operator console</h1>
              {metrics && (
                <p className="text-sm text-gray-500">
                  last {metrics.windowDays} days · read {new Date(metrics.generatedAt).toLocaleString()}
                </p>
              )}
            </div>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-gray-600">
              Every workspace on this deployment, counted. Nothing on this page is customer content -
              accounts are read for dates and subscription state, and product events carry no names.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
            <button
              type="button"
              onClick={load}
              disabled={state === 'loading'}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${state === 'loading' ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <Link
              to="/app/today"
              className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white"
            >
              My workspace
            </Link>
          </div>
        </header>

        {state === 'error' && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
            {message}
          </p>
        )}

        {state === 'loading' && !metrics && <CardSkeleton />}

        {metrics && (
          <>
            <TrustBanner trust={metrics.trust} />

            <Section title="Accounts" note={`${metrics.windowDays}-day window on the chart; totals are all time.`}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <StatTile label="Accounts" value={metrics.accounts.total} tone="primary" />
                <StatTile label="New, 7 days" value={metrics.accounts.newLast7} />
                <StatTile label="New, 30 days" value={metrics.accounts.newLast30} />
                <StatTile label="Signed in, 7 days" value={metrics.accounts.activeLast7} />
                <StatTile label="Signed in, 30 days" value={metrics.accounts.activeLast30} />
                <StatTile
                  label="Never confirmed email"
                  value={metrics.accounts.unconfirmed}
                  note="Signups that did not finish"
                />
                <StatTile
                  label="Never came back"
                  value={metrics.accounts.neverReturned}
                  note="No sign-in after the first day"
                />
              </div>
              <SignupChart days={metrics.accounts.signupsByDay} />
              <AccountList accounts={metrics.accounts.recent} />
            </Section>

            <LeadsSection leads={metrics.leads} />

            <Section title="Money">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {/* "Paying" means Lemon Squeezy has a subscription for them.
                    A profile can read `active` without one - comped, seeded or
                    set by hand - and counting those as revenue would be the
                    number lying in the direction anyone most wants to believe,
                    so they sit in their own tile with their own name. */}
                <StatTile label="Paying" value={metrics.billing.paying} tone="primary" note="Has a Lemon Squeezy subscription" />
                <StatTile
                  label="Entitled, not billed"
                  value={metrics.billing.entitledWithoutBilling}
                  note="Comped or set by hand"
                />
                <StatTile label="On trial" value={metrics.billing.onTrial} />
                <StatTile
                  label="Trials ending in 7 days"
                  value={metrics.billing.trialsEndingWithin7Days}
                  note="The list to act on"
                />
                <StatTile label="Cancelled" value={metrics.billing.cancelled} />
                <StatTile label="Personal tier" value={metrics.billing.personal} />
                <StatTile label="Team tier" value={metrics.billing.team} />
                <StatTile label="Free" value={metrics.billing.free} />
              </div>

              <RevenuePanel revenue={metrics.billing.revenue} checkoutEnabled={metrics.billing.checkoutEnabled} />
            </Section>

            <Section
              title="Activation"
              note="Each step can only be reached from the one above it, so the biggest drop is the question worth answering."
            >
              <BarList
                rows={metrics.activation.map((step) => ({
                  label: step.step,
                  value: step.reached,
                  share: step.shareOfSignups,
                }))}
                /* Two different silences, and the first version said the wrong
                   one out loud: production showed "No product events in this
                   window yet" directly above a Usage block counting 221 of
                   them. An empty funnel next to a busy product means the
                   activation events specifically are not arriving - which is a
                   finding, not an absence of data - and saying "no events"
                   there sends the reader to look for a logging outage that
                   isn't happening. */
                emptyNote={
                  metrics.usage.eventsLast30 > 0
                    ? `No activation steps recorded, though ${formatCount(metrics.usage.eventsLast30)} other events arrived in this window. Activation events only fire the first time an account does each thing, so an established workspace produces none.`
                    : 'No product events in this window yet.'
                }
              />
            </Section>

            <Section title="Usage" note="Demo traffic is counted separately - folding it in would inflate every number above.">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <StatTile label="Devices, 7 days" value={metrics.usage.devicesLast7} tone="primary" />
                <StatTile label="Devices, 30 days" value={metrics.usage.devicesLast30} />
                <StatTile label="Events, 7 days" value={metrics.usage.eventsLast7} />
                <StatTile label="Events, 30 days" value={metrics.usage.eventsLast30} />
                <StatTile label="Demo devices, 30 days" value={metrics.usage.demoDevicesLast30} note="Showcase visitors" />
                <StatTile label="Demo events, 30 days" value={metrics.usage.demoEventsLast30} />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <SubPanel title="Busiest surfaces">
                  <BarList
                    rows={metrics.usage.topRoutes.map((row) => ({ label: row.route, value: row.count, share: null }))}
                    emptyNote="No routes recorded in this window."
                  />
                </SubPanel>
                <SubPanel title="Most frequent events">
                  <BarList
                    rows={metrics.usage.topEvents.map((row) => ({ label: row.event, value: row.count, share: null }))}
                    emptyNote="No events recorded in this window."
                  />
                </SubPanel>
              </div>
            </Section>

            <Section title="Anonymous traffic">
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-bold text-navy">Landing-page visits</h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      isWebAnalyticsEnabled ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {/* What this badge can honestly claim is the build flag,
                        because the build flag is the only half of the pair the
                        browser can see. It read "Beacon on" while Vercel's own
                        project switch was off - so the page announced that
                        traffic was being measured, on a deployment where every
                        beacon was 404ing and nothing was being collected at
                        all. A status badge that can only see one of two
                        switches has to name the one it sees. */}
                    Beacon {isWebAnalyticsEnabled ? 'on in this build' : 'off in this build'}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  Everything above starts at the first product event, so it only sees people who reached the app.
                  Visits to the landing page, where they came from, and everyone who read the pricing page and left
                  are measured by Vercel from the edge and read in Vercel's own dashboard.
                  {isWebAnalyticsEnabled
                    ? ' This build sends the beacon, but nothing is collected until Web Analytics is also switched on for the project in Vercel - check the Analytics tab there before trusting an empty chart.'
                    : ' Two switches turn it on: Web Analytics on the Vercel project, and VITE_ENABLE_WEB_ANALYTICS=true.'}
                </p>
                <a
                  href="https://vercel.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-brand-blue underline"
                >
                  Open Vercel analytics
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Sync failures are the one figure here that is an alarm rather than a
 * measurement: they mean somebody's work may not have been kept. So it is
 * hoisted above every other number, and it says so in words and an icon rather
 * than by turning a tile red - colour alone is not a message.
 */
/**
 * Everyone who filled in the contact form, because nothing else shows them.
 *
 * `/api/request-access` writes the row and sends no notification, so before
 * this section existed a lead reached the database and stopped there. It is
 * placed above Money on purpose: an unanswered lead is the most perishable
 * thing on this page.
 */
/**
 * Who holds an account, newest first.
 *
 * Everything above this on the page is a count, and counts are what you read
 * when there are thousands of accounts. At four, "1 new in 30 days" is not a
 * measurement - it is a row you want to look at. Which one is new, did they
 * confirm their email, have they ever come back.
 *
 * The two states worth spotting at a glance get a chip rather than two dates to
 * compare: a signup that never confirmed (which is not a customer, it is a form
 * submission), and one that never came back after the day it joined (which is
 * the product failing in the first session). Both chips read a flag the server
 * computed with the same predicate as the tile above, so a row can never
 * disagree with the count about the same person.
 *
 * There is no "has this person activated" column, and its absence is
 * deliberate: `product_events` carries an anonymous id and no user id by
 * construction, so the funnel above is a population measure and cannot be
 * resolved to a name without changing what the product records about people.
 */
function AccountList({ accounts }: { accounts: AdminMetrics['accounts']['recent'] }) {
  if (accounts.length === 0) {
    return (
      <p className="mt-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
        No accounts yet.
      </p>
    );
  }

  return (
    <div className="mt-5">
      <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">
        Accounts, newest first
      </h3>
      {/* Its own scroller, so a long email never makes the page scroll sideways. */}
      <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th scope="col" className="px-4 py-2 font-bold">Account</th>
              <th scope="col" className="px-4 py-2 font-bold">Joined</th>
              <th scope="col" className="px-4 py-2 font-bold">Last seen</th>
              <th scope="col" className="px-4 py-2 font-bold">Plan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {accounts.map((account) => (
              <tr key={account.id}>
                <td className="px-4 py-3 align-top">
                  <a className="font-medium text-brand-blue hover:underline" href={`mailto:${account.email}`}>
                    {account.email || account.id}
                  </a>
                  {!account.confirmed && (
                    <span className="ml-2 inline-block rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">
                      Never confirmed
                    </span>
                  )}
                  {account.neverCameBack && (
                    <span className="ml-2 inline-block rounded border border-red-100 bg-red-50 px-1.5 py-0.5 text-[11px] font-bold text-red-700">
                      Never came back
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-top text-gray-600">{formatLeadDate(account.createdAt)}</td>
                <td className="whitespace-nowrap px-4 py-3 align-top text-gray-600">
                  {account.lastSignInAt ? formatLeadDate(account.lastSignInAt) : '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-top text-gray-600">
                  {account.subscriptionTier || account.subscriptionStatus || 'free'}
                  {account.trialEndsAt && (
                    <span className="block text-[11px] text-gray-500">
                      trial ends {formatLeadDate(account.trialEndsAt)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-gray-500">
        Newest 100. Emails and dates only — no workspace content is readable from here, and the activation funnel
        below stays anonymous by design.
      </p>
    </div>
  );
}

function LeadsSection({ leads }: { leads: AdminMetrics['leads'] }) {
  return (
    <Section
      title="Leads"
      note="From the contact form. Nobody is emailed when one arrives - this list is the whole mechanism."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile label="Leads" value={leads.total} tone="primary" />
        <StatTile label="New, 7 days" value={leads.newLast7} note="Waiting on a reply" />
      </div>

      {leads.recent.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
          No one has used the contact form yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {leads.recent.map((lead) => (
            <li key={lead.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-navy">{lead.name || 'No name given'}</p>
                  <a className="text-sm text-brand-blue hover:underline" href={`mailto:${lead.workEmail}`}>
                    {lead.workEmail}
                  </a>
                </div>
                <p className="text-xs text-gray-500">{formatLeadDate(lead.createdAt)}</p>
              </div>
              {lead.role && <p className="mt-2 text-xs text-gray-500">{lead.role}{lead.currentTool ? ` · uses ${lead.currentTool}` : ''}</p>}
              {lead.biggestPain && <p className="mt-2 text-sm text-gray-700">{lead.biggestPain}</p>}
              {lead.preferredUseCase && (
                <p className="mt-1 text-xs text-gray-500">Wants: {lead.preferredUseCase}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function formatLeadDate(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return '';
  return new Date(parsed).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function TrustBanner({ trust }: { trust: AdminMetrics['trust'] }) {
  const unrecovered = trust.syncFailed - trust.syncRecovered;

  if (trust.syncFailed === 0) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        No sync failures recorded in this window.
      </p>
    );
  }

  return (
    <div
      role="alert"
      className={`rounded-lg border p-3 text-sm ${
        unrecovered > 0 ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'
      }`}
    >
      <p className="flex items-center gap-2 font-bold">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {unrecovered > 0
          ? `${formatCount(unrecovered)} sync failures have not recovered`
          : 'All sync failures recovered'}
      </p>
      <p className="mt-1 font-semibold">
        {formatCount(trust.syncFailed)} failed · {formatCount(trust.syncRecovered)} recovered ·{' '}
        {formatCount(trust.backupExported)} backups exported · {formatCount(trust.restoreCompleted)} restores
      </p>
    </div>
  );
}

function RevenuePanel({
  revenue,
  checkoutEnabled,
}: {
  revenue: AdminMetrics['billing']['revenue'];
  checkoutEnabled: boolean;
}) {
  const money = (amount: number | undefined) =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: revenue.currency || 'USD',
      maximumFractionDigits: 0,
    }).format(amount ?? 0);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-navy">Revenue</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
            checkoutEnabled ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Checkout {checkoutEnabled ? 'open' : 'closed'}
        </span>
      </div>

      {/* Read from Lemon Squeezy rather than multiplied out from the pricing
          page: a figure reconstructed from list prices is wrong the moment a
          discount or an annual plan exists, and wrong without saying so. */}
      {revenue.configured && revenue.thirtyDayRevenue !== undefined ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Last 30 days" value={money(revenue.thirtyDayRevenue)} tone="primary" />
          <StatTile label="All time" value={money(revenue.totalRevenue)} />
          <StatTile label="Sales, 30 days" value={revenue.thirtyDaySales ?? 0} />
          <StatTile label="Sales, all time" value={revenue.totalSales ?? 0} />
        </div>
      ) : (
        <div className="mt-2 text-sm leading-6 text-gray-600">
          <p>
            {revenue.reason || 'Lemon Squeezy did not answer.'} Subscriber counts above come from this database and
            are unaffected.
          </p>
          {/* This console is the first code in the product that ever called the
              Lemon Squeezy API - checkout has never been open, and the webhook
              only runs when somebody buys - so a 404 here is not a fault that
              started today. It is the store configuration being exercised for
              the first time and failing, which is worth saying plainly while
              there is still no money riding on it. */}
          {!checkoutEnabled && revenue.reason?.includes('404') && (
            <p className="mt-2">
              A 404 means the API key and the configured store id do not name the same store. Nothing has been
              lost - no payment has ever been taken - but this is the first thing to fix before checkout opens,
              because the same pair is what the webhook and checkout will use.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Thirty columns, one per day, anchored to a baseline. No y-axis: the question
 * this answers is "is the shape going up", and the exact height of day 12 is
 * not something anyone reads off a 30px column. The peak is labelled because it
 * is the only number that gives the rest of them a scale.
 */
function SignupChart({ days }: { days: DayCount[] }) {
  const peak = days.reduce((max, day) => Math.max(max, day.count), 0);
  const total = days.reduce((sum, day) => sum + day.count, 0);

  return (
    <figure className="rounded-lg border border-gray-200 bg-white p-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-navy">Signups per day</h3>
        <p className="text-xs font-semibold text-gray-500">
          {formatCount(total)} in {days.length} days · peak {formatCount(peak)}
        </p>
      </figcaption>

      <div
        role="img"
        aria-label={`Signups per day over the last ${days.length} days: ${formatCount(total)} in total, with a peak of ${formatCount(peak)} in one day.`}
        className="mt-3 flex h-24 items-end gap-[2px] border-b border-gray-200"
      >
        {days.map((day) => (
          <div
            key={day.day}
            title={`${day.day}: ${formatCount(day.count)}`}
            className="flex-1 rounded-t bg-brand-blue"
            /* A zero day is drawn as a 2px stub rather than nothing, so the
               axis reads as thirty days with gaps rather than a short chart. */
            style={{ height: peak > 0 ? `${Math.max(day.count > 0 ? 6 : 2, (day.count / peak) * 100)}%` : '2px' }}
          />
        ))}
      </div>

      <div className="mt-1.5 flex justify-between text-[11px] font-semibold text-gray-500">
        <span>{days[0]?.day}</span>
        <span>{days[days.length - 1]?.day}</span>
      </div>
    </figure>
  );
}

function BarList({
  rows,
  emptyNote,
}: {
  rows: Array<{ label: string; value: number; share: number | null }>;
  emptyNote: string;
}) {
  const peak = rows.reduce((max, row) => Math.max(max, row.value), 0);

  if (rows.length === 0 || peak === 0) {
    return <p className="text-sm text-gray-600">{emptyNote}</p>;
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <li key={row.label} className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="truncate text-sm font-semibold text-navy">{row.label}</span>
            <span className="shrink-0 text-xs font-bold text-gray-600">
              {formatCount(row.value)}
              {/* Null share means nobody signed up in the window, which is not
                  the same answer as 0% and must not be rendered as one. */}
              {row.share !== null && ` · ${Math.round(row.share * 100)}%`}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-brand-blue"
              style={{ width: `${Math.max(row.value > 0 ? 2 : 0, (row.value / peak) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-navy">{title}</h2>
        {note && <p className="mt-0.5 max-w-2xl text-sm leading-6 text-gray-600">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function SubPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-navy">{title}</h3>
      {children}
    </div>
  );
}

function StatTile({
  label,
  value,
  note,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  note?: string;
  tone?: 'default' | 'primary';
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-xs font-semibold text-gray-600">{label}</p>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${tone === 'primary' ? 'text-brand-blue' : 'text-navy'}`}>
        {typeof value === 'number' ? formatCount(value) : value}
      </p>
      {note && <p className="mt-0.5 text-[11px] leading-4 text-gray-500">{note}</p>}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="h-20 animate-pulse rounded-lg border border-gray-200 bg-white" />
      ))}
    </div>
  );
}

function CenteredNote({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-navy">{title}</h1>
        {body && <p className="mt-2 text-sm leading-6 text-gray-600">{body}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}
