import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  buildDailyDigest,
  buildWeeklyDigest,
  localHourInZone,
  renderDigestEmail,
  todayInZone,
} from '../api/_digest.js';

/**
 * Reaching the operator when the app is closed.
 *
 * "Nothing goes silent" was, until 2026-08-02, a promise the product could only
 * keep while somebody was already looking at it. Every mechanism behind it -
 * going-quiet detection, overdue commitments, stuck money, the weekly
 * scoreboard - ran in the browser and waited to be visited.
 *
 * Sending email to users is also the fastest way a product loses their trust,
 * so the guarantees here are as much about restraint as about delivery.
 */

const digest = readFileSync('api/_digest.js', 'utf8');
const endpoint = readFileSync('api/send-digests.ts', 'utf8');
const panel = readFileSync('src/features/settings/NotificationsPanel.tsx', 'utf8');
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));

// 1. Nobody is emailed unless they asked, and every send can be stopped.
{
  const migrations = readdirSync('supabase/migrations')
    .filter((file) => file.endsWith('.sql'))
    .map((file) => readFileSync(`supabase/migrations/${file}`, 'utf8'))
    .join('\n');

  assert.match(
    migrations,
    /daily_digest_enabled boolean not null default false/,
    'the daily digest must be off until it is asked for',
  );
  assert.match(
    migrations,
    /weekly_review_enabled boolean not null default false/,
    'the weekly review must be off until it is asked for',
  );
  assert.match(migrations, /digest_unsubscribe_token/, 'an unsubscribe must work without a session');
  assert.match(migrations, /create table if not exists public\.digest_deliveries/, 'what was sent has to be answerable');

  assert.match(endpoint, /handleUnsubscribe/, 'the unsubscribe link has somewhere to land');
  assert.match(digest, /unsubscribeUrl/, 'every email carries the way to stop it');
  assert.match(panel, /Daily digest/, 'the operator can turn it on and off in Settings');
}

// 2. Only the scheduler may cause a send. Without this the endpoint is a way
//    for anyone on the internet to make the product email its own users.
{
  assert.match(endpoint, /process\.env\.CRON_SECRET/, 'the cron endpoint is authenticated');
  assert.match(endpoint, /if \(!expected\) return false/, 'an unset secret refuses rather than allows');
  assert.match(endpoint, /res\.status\(401\)/, 'an unauthorised caller is refused');

  // Not a Vercel Cron. The Hobby plan this deploys on permits a cron no more
  // frequent than once a day and rejects the whole deployment if vercel.json
  // declares one that runs more often - discovered 2026-08-03 when an hourly
  // entry here silently blocked every subsequent production deploy, with no
  // failed-deployment record to point at. A GitHub Actions workflow on the
  // same schedule calls the same authenticated endpoint instead.
  assert.equal(
    vercel.crons,
    undefined,
    'vercel.json must not declare a cron - Hobby rejects anything more frequent than daily, and it fails the deploy silently rather than the build',
  );

  const workflow = readFileSync('.github/workflows/send-digests.yml', 'utf8');
  assert.match(workflow, /schedule:\s*\n\s*- cron: '0 \* \* \* \*'/, 'the workflow fires hourly, because 7am has to mean 7am where the operator is');
  assert.match(workflow, /secrets\.CRON_SECRET/, 'the workflow authenticates with a GitHub Actions secret, not a hardcoded value');
  assert.match(workflow, /Authorization: Bearer \$\{CRON_SECRET\}/, 'the request carries the same bearer scheme the endpoint checks');
  assert.match(workflow, /-X POST/, 'the workflow calls the cron verb, not the unsubscribe GET');
  assert.match(workflow, /\/api\/send-digests/, 'the workflow calls the actual endpoint');
}

// 3. Silence when there is nothing to say. An email that arrives every morning
//    to report that nothing needs attention trains the operator to stop reading
//    the one that does.
{
  const quiet = buildDailyDigest({
    opportunities: [{
      id: 'a', account_name: 'Fine Co', opportunity_name: 'Deal', status: 'Active',
      next_action: 'Follow up', next_action_date: '2026-09-01', updated_at: '2026-08-01T00:00:00.000Z',
    }],
    activities: [{ id: 't', account_name: 'Fine Co', activity_date: '2026-08-01' }],
    quotes: [],
    errors: [],
  }, '2026-08-02');

  assert.equal(quiet.hasSignal, false, 'a quiet morning produces no signal');
  assert.match(endpoint, /if \(!digest\.hasSignal\)/, 'and the endpoint declines to send it');
}

// 4. A late thing is always reported. The other failure mode is worse than a
//    noisy inbox: the product knew and said nothing.
{
  const loud = buildDailyDigest({
    opportunities: [{
      id: 'a', account_name: 'Late Co', opportunity_name: 'Deal', status: 'Active',
      next_action: 'Chase the PO', next_action_date: '2026-07-01', updated_at: '2026-07-01T00:00:00.000Z',
    }],
    activities: [],
    quotes: [{ id: 'q', accountName: 'Late Co', title: 'Analyzer', paymentDueDate: '2026-07-10', paymentStatus: 'Due' }],
    errors: [],
  }, '2026-08-02');

  assert.equal(loud.hasSignal, true);
  assert.equal(loud.counts.overdue, 1);
  assert.equal(loud.counts.quiet, 1, 'a deal with no touch at all has gone quiet');
  assert.equal(loud.counts.stuckMoney, 1);

  const weekly = buildWeeklyDigest({
    opportunities: [{ id: 'w', account_name: 'A', status: 'Won', updated_at: '2026-07-30T00:00:00.000Z' }],
    activities: [],
    quotes: [],
    errors: [],
  }, '2026-08-02');
  assert.equal(weekly.counts.won, 1);
}

// 5. What leaves the server carries no tracking and no unescaped customer text.
//    This product's whole trust position is that customer context stays where
//    the operator put it; an email that phones home about being opened would be
//    the first thing to contradict it.
{
  const withMarkup = buildDailyDigest({
    opportunities: [{
      id: 'x', account_name: '<img src=x onerror=1>', opportunity_name: 'Deal', status: 'Active',
      next_action: 'Follow up', next_action_date: '2026-07-01', updated_at: '2026-07-01T00:00:00.000Z',
    }],
    activities: [],
    quotes: [],
    errors: [],
  }, '2026-08-02');

  const email = renderDigestEmail(withMarkup, { appUrl: 'https://app', unsubscribeUrl: 'https://stop' });
  assert.doesNotMatch(email.html, /<img/i, 'no image means no open tracking, and no injected markup');
  assert.match(email.html, /&lt;img/, 'customer text is escaped, not rendered');
  // Comments stripped first: the sender explains in prose that it does not
  // track opens, and a check that trips on its own reasoning is not a check.
  const digestCode = digest.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(digestCode, /pixel|track(ing)?\.gif|open_rate/i, 'the sender does not track opens');
}

// 6. Scheduling follows the operator's clock, not the server's.
{
  const sundayNightUtc = new Date('2026-08-02T23:30:00.000Z');
  assert.equal(localHourInZone(420, sundayNightUtc), 6, 'UTC+7 is already Monday morning');
  assert.equal(todayInZone(420, sundayNightUtc), '2026-08-03');
  assert.match(endpoint, /digest_utc_offset_minutes/, 'the send hour is local to the operator');
}

// 7. The Hobby function cap is a hard ceiling, and this added one function.
{
  const apiFunctions = readdirSync('api')
    .filter((file) => /\.(ts|js)$/.test(file) && !file.startsWith('_'));
  assert.ok(
    apiFunctions.length <= 12,
    `api/ must stay within the Hobby function cap (found ${apiFunctions.length}: ${apiFunctions.join(', ')})`,
  );
  assert.ok(
    apiFunctions.includes('send-digests.ts'),
    'the scheduled send is a function; the unsubscribe rides the same one on GET',
  );
}

console.log('Digest delivery verified: opt-in only, authenticated, silent when there is nothing to say, and stoppable from the email.');
