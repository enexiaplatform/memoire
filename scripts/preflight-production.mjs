#!/usr/bin/env node
import { argv, exit } from 'node:process';

/**
 * The go-live checks that can only be made against the running product.
 *
 * Everything in `npm run check` proves the code is right. None of it can prove
 * the domain resolves, the auth emails point at the host somebody actually
 * typed, the cron secret is set, or that a browser opening the app gets the
 * shell rather than a 404. Those are facts about a deployment, and they are
 * exactly the ones that break a launch - the founder's first signup went to a
 * domain the project did not own, and no test could have known.
 *
 * Run it against the live host before opening the door, and again after any
 * env change:
 *
 *   node scripts/preflight-production.mjs --base https://memoire-official.com
 *
 * It reads only public endpoints and never sends a secret. Where a check needs
 * privileged information it says what to look at rather than guessing.
 */

const args = argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const base = option('base', 'https://memoire-official.com').replace(/\/$/, '');
const host = new URL(base).host;

const results = [];
const record = (name, status, detail) => {
  results.push({ name, status, detail });
  const mark = status === 'pass' ? 'ok  ' : status === 'warn' ? 'WARN' : 'FAIL';
  console.log(`  ${mark}  ${name.padEnd(38)} ${detail}`);
};

async function get(path, options = {}) {
  const response = await fetch(`${base}${path}`, { redirect: 'follow', ...options });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON, which is itself a finding */ }
  return { response, text, json };
}

console.log(`Preflight against ${base}\n`);

// 1. The host answers, and it answers with the app rather than a parked page.
try {
  const { response, text } = await get('/');
  if (!response.ok) {
    record('site responds', 'fail', `GET / returned ${response.status}`);
  } else if (!/<div id="root"/.test(text)) {
    record('site responds', 'fail', 'GET / did not return the app shell - check the deployment target');
  } else {
    record('site responds', 'pass', `${response.status}, app shell served`);
  }
} catch (error) {
  record('site responds', 'fail', `could not reach ${base}: ${error.message}`);
}

// 2. Health. The endpoint names its own failing env var, so the detail is worth
//    printing verbatim rather than summarising.
try {
  const { response, json } = await get('/api/health');
  if (!json) {
    record('health endpoint', 'fail', `GET /api/health returned ${response.status} and no JSON`);
  } else if (json.ok !== true) {
    const failing = (json.checks || []).filter((check) => check.ok === false).map((check) => check.name);
    record('health endpoint', 'fail', `ok:false - ${failing.join(', ') || 'see response'}`);
  } else {
    const warnings = json.warnings ?? (json.checks || []).filter((check) => check.warn).length;
    record('health endpoint', warnings > 0 ? 'warn' : 'pass', `ok:true, ${warnings} warning(s)`);
  }

  // 3. The single fact that broke the last launch: auth emails carrying a link
  //    to a host nobody owns.
  const matches = json?.checks?.find((check) => /app_url_matches_request_host/.test(check.name || ''));
  if (!matches) {
    record('app url matches host', 'warn', 'health did not report app_url_matches_request_host');
  } else if (matches.ok === false) {
    record('app url matches host', 'fail', `APP_URL does not match ${host} - signup emails will point elsewhere`);
  } else {
    record('app url matches host', 'pass', `APP_URL agrees with ${host}`);
  }
} catch (error) {
  record('health endpoint', 'fail', error.message);
}

// 4. The scheduled sender must refuse an unauthenticated caller. If it does
//    not, anyone on the internet can make the product email its own users.
try {
  const { response } = await get('/api/send-digests', { method: 'POST' });
  if (response.status === 401 || response.status === 403) {
    record('digest sender is authenticated', 'pass', `POST without a secret returned ${response.status}`);
  } else if (response.status === 404) {
    record('digest sender is authenticated', 'fail', 'POST /api/send-digests is 404 - the function is not deployed');
  } else {
    record('digest sender is authenticated', 'fail', `POST without a secret returned ${response.status}, expected 401`);
  }
} catch (error) {
  record('digest sender is authenticated', 'fail', error.message);
}

// 5. The unsubscribe link in every email has to land somewhere, without a
//    session, for somebody who is angry enough to be clicking it.
try {
  const { response } = await get('/api/send-digests?token=preflight-not-a-real-token&kind=daily');
  if (response.status >= 500) {
    record('unsubscribe link lands', 'fail', `GET returned ${response.status} - the link in every email is broken`);
  } else {
    record('unsubscribe link lands', 'pass', `GET returned ${response.status} for an unknown token`);
  }
} catch (error) {
  record('unsubscribe link lands', 'fail', error.message);
}

// 6. The offline shell. Without the worker, an installed app on a phone with no
//    signal shows the browser's error page and the capture is lost to memory.
try {
  const { response, text } = await get('/sw.js');
  const type = response.headers.get('content-type') || '';
  if (!response.ok) {
    record('service worker is served', 'fail', `GET /sw.js returned ${response.status}`);
  } else if (!/javascript/.test(type)) {
    record('service worker is served', 'fail', `/sw.js served as ${type} - a worker must be JavaScript`);
  } else if (!/addEventListener\('fetch'/.test(text)) {
    record('service worker is served', 'fail', '/sw.js does not install a fetch handler');
  } else {
    record('service worker is served', 'pass', `${text.length} bytes, fetch handler present`);
  }
} catch (error) {
  record('service worker is served', 'fail', error.message);
}

// 7. Installability. The manifest is what makes capture one tap from a home
//    screen, which is the only place capture actually happens.
try {
  const { response, json } = await get('/manifest.webmanifest');
  if (!response.ok || !json) {
    record('manifest is served', 'fail', `GET /manifest.webmanifest returned ${response.status}`);
  } else if (!json.start_url?.startsWith('/app/')) {
    record('manifest is served', 'fail', `start_url is ${json.start_url}, expected the workspace`);
  } else {
    record('manifest is served', 'pass', `${json.short_name}, start_url ${json.start_url}`);
  }
} catch (error) {
  record('manifest is served', 'fail', error.message);
}

// 8. A deep link must return the app, not a 404. A static host that has not
//    been told about client-side routing breaks every link in every email.
try {
  const { response, text } = await get('/app/today');
  if (!response.ok) {
    record('deep links resolve', 'fail', `GET /app/today returned ${response.status} - SPA rewrite is missing`);
  } else if (!/<div id="root"/.test(text)) {
    record('deep links resolve', 'fail', 'GET /app/today did not return the app shell');
  } else {
    record('deep links resolve', 'pass', 'the app shell is served for /app/*');
  }
} catch (error) {
  record('deep links resolve', 'fail', error.message);
}

const failed = results.filter((result) => result.status === 'fail');
const warned = results.filter((result) => result.status === 'warn');

console.log(
  failed.length === 0
    ? `\n${results.length} checks, all passing${warned.length ? ` (${warned.length} warning(s))` : ''}.`
    : `\n${failed.length} of ${results.length} checks failed: ${failed.map((result) => result.name).join(', ')}`,
);

if (failed.length === 0) {
  console.log(
    '\nWhat this cannot tell you, and you still have to do by hand:\n'
    + '  - Sign up with a real address on this host and click the verification link.\n'
    + '  - Ask for a password reset and check the link points at this host.\n'
    + '  - Confirm client-log entries and product_events rows are arriving in Supabase.\n'
    + '  - Turn on the daily digest for your own account and wait for one to arrive.',
  );
}

exit(failed.length === 0 ? 0 : 1);
