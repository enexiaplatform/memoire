import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// The event taxonomy exists in three places - the client union, the endpoint
// allowlist and the product_events CHECK constraint - and all three have to
// agree or events are silently dropped.
//
// They did not agree before. The client had grown to twenty event names while
// product_funnel_events allowed six; Postgres rejected the other fourteen, the
// endpoint caught the error and returned 202, and the events looked delivered.
// Nothing in the app or the test suite could see it. This contract can.

const client = readFileSync('src/utils/productAnalytics.ts', 'utf8');
const endpoint = readFileSync('api/product-events.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260726160000_product_events.sql', 'utf8');

// 1. Extract each list and compare them as sets.
const clientUnion = client.slice(
  client.indexOf('export type ProductEvent ='),
  client.indexOf(';', client.indexOf("| 'csv_import_completed'")),
);
const clientEvents = new Set([...clientUnion.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]));

const endpointBlock = endpoint.slice(
  endpoint.indexOf('export const PRODUCT_EVENTS = new Set(['),
  endpoint.indexOf(']);', endpoint.indexOf('export const PRODUCT_EVENTS')),
);
const endpointEvents = new Set([...endpointBlock.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]));

const checkBlock = migration.slice(
  migration.indexOf('event_name text NOT NULL CHECK (event_name IN ('),
  migration.indexOf('))', migration.indexOf('event_name text NOT NULL CHECK')),
);
const tableEvents = new Set([...checkBlock.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]));

assert.ok(clientEvents.size >= 25, `client taxonomy looks truncated: ${clientEvents.size} events`);
assert.deepEqual(
  [...clientEvents].sort(),
  [...endpointEvents].sort(),
  'the client union and the endpoint allowlist disagree - events would be rejected with a 400',
);
assert.deepEqual(
  [...endpointEvents].sort(),
  [...tableEvents].sort(),
  'the endpoint allowlist and the product_events CHECK constraint disagree - events would be silently dropped by Postgres',
);

// 2. The four groups the taxonomy is built from are all present.
for (const [group, events] of [
  ['activation', ['first_capture_saved', 'first_thread_linked', 'first_commitment_created', 'first_commitment_completed', 'first_review_completed']],
  ['core usage', ['capture_saved', 'thread_viewed', 'commitment_created', 'commitment_completed', 'commitment_rescheduled', 'commercial_risk_viewed', 'commercial_risk_acted_on', 'review_completed']],
  ['value', ['follow_up_recovered', 'commitment_caught', 'quote_advanced', 'delivery_delay_avoided', 'payment_recovered', 'revenue_protected']],
  ['trust', ['sync_failed', 'sync_recovered', 'backup_exported', 'restore_completed', 'duplicate_prevented']],
]) {
  for (const event of events) {
    assert.ok(clientEvents.has(event), `${group} taxonomy missing: ${event}`);
  }
}

// 3. Page-centric events are gone. They measured which rooms people walked
// into, and most named destinations that no longer exist.
for (const retired of [
  'activity_ledger_opened',
  'business_review_opened',
  'money_flow_opened',
  'master_dashboard_opened',
  'weekly_plan_opened',
  'cockpit_tile_clicked',
  'timeline_upcoming_viewed',
]) {
  assert.equal(clientEvents.has(retired), false, `a page-open event is back in the taxonomy: ${retired}`);
}

// 4. Analytics has its own endpoint. It must not ride the lead-capture route.
{
  assert.ok(client.includes("'/api/product-events'"), 'the client must post to the dedicated endpoint');
  assert.equal(
    client.includes('/api/request-access'),
    false,
    'product analytics must not be sent through the lead-capture endpoint',
  );

  const requestAccess = readFileSync('api/request-access.ts', 'utf8');
  for (const leftover of ['PRODUCT_EVENTS', 'buildProductEventPayload', 'product_funnel_events', "kind === 'event'"]) {
    assert.equal(
      requestAccess.includes(leftover),
      false,
      `the lead endpoint still handles analytics: ${leftover}`,
    );
  }
}

// 5. Privacy: only four fields leave the browser, and the route never carries a
// query string - `/app/accounts?accountId=acme` would be a customer identifier.
{
  assert.ok(endpoint.includes('cleanRoute'), 'the endpoint must sanitise the route');
  assert.ok(
    endpoint.includes("!route.includes('?')") && endpoint.includes("!route.includes('#')"),
    'a route with a query string or fragment must be dropped, not stored',
  );
  assert.ok(client.includes('window.location.pathname'), 'the client must send a path, never a full URL');

  const payloadBlock = endpoint.slice(
    endpoint.indexOf('export function buildProductEventPayload'),
    endpoint.indexOf('export function cleanText'),
  );
  const stored = [...payloadBlock.matchAll(/^\s{4}([a-z_]+):/gm)].map((match) => match[1]);
  assert.deepEqual(
    stored.sort(),
    ['anonymous_id', 'data_mode', 'event_name', 'is_demo', 'route'],
    'the analytics payload must carry nothing but these five fields',
  );

  // No commercial content may appear in the endpoint's *code*. Comments are
  // stripped first, because the file names these fields in order to forbid
  // them and a substring match would flag its own documentation.
  const endpointCode = endpoint
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n');
  for (const forbidden of ['accountName', 'account_name', 'summary', 'note', 'email', 'amount', 'commitmentText']) {
    assert.equal(
      new RegExp(`\\b${forbidden}\\b`).test(endpointCode),
      false,
      `analytics must never carry ${forbidden}`,
    );
  }
}

// 6. Analytics never blocks or breaks a workflow.
{
  assert.ok(client.includes('void fetch('), 'analytics must be fire-and-forget');
  assert.ok(client.includes('.catch(() => {'), 'a failed analytics call must be swallowed');
  assert.ok(
    endpoint.includes('return res.status(202).json({ success: true })'),
    'a rate-limited or failed event must still return success',
  );
}

// 7. Activation is counted once, and never from the demo.
{
  assert.ok(client.includes('export function trackFirstTimeEvent'), 'activation needs a first-time-only path');
  assert.ok(
    client.includes('if (isDemoWorkspaceActive()) return;'),
    'the demo must never count as activation - every visitor who clicked "see it working" would read as an activated user',
  );
}

// 7b. Every activation event is actually sent by something.
//
// This is the check the taxonomy checks above could not make. All three copies
// of the list agreed perfectly while three of the five activation events -
// first_capture_saved, first_thread_linked and first_review_completed - had no
// emitter anywhere in src/. The funnel was declared, validated, and empty at
// the top: the product could report how many people kept a promise and could
// not report how many had ever captured anything.
//
// `capture_saved` is named separately because it is the root of the funnel and
// the product's primary action. Every later step is conditional on it, so a
// missing emitter there makes every rate below it uncomputable rather than
// merely incomplete.
{
  const sources = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name)) sources.push(readFileSync(path, 'utf8'));
    }
  };
  walk('src');
  const app = sources.join('\n');

  // A call site, not a mention: the name has to appear inside one of the two
  // tracking calls. `'capture_saved'` in a comment or a type is not an emitter,
  // which is the failure mode this whole contract exists for.
  const emitted = new Set(
    [...app.matchAll(/track(?:ProductEvent|FirstTimeEvent)\(\s*'([a-z_]+)'/g)].map((match) => match[1]),
  );

  // An event paired in ACTIVATION_OF is emitted whenever its trigger is. The
  // map lives in its own module because `productAnalytics.ts` imports the
  // Supabase client and only runs in a browser, which made the one part of the
  // funnel that is pure data the one part nothing could test.
  const pairs = readFileSync('src/utils/activationEvents.ts', 'utf8');
  const pairBlock = pairs.slice(
    pairs.indexOf('export const ACTIVATION_OF'),
    pairs.indexOf('};', pairs.indexOf('export const ACTIVATION_OF')),
  );
  assert.ok(
    client.includes("import { ACTIVATION_OF } from './activationEvents'"),
    'the tracker must read the pairing map rather than keep a second copy of it',
  );
  assert.ok(pairBlock.includes('capture_saved'), 'ACTIVATION_OF must pair the capture with its activation event');
  for (const [, trigger, activation] of pairBlock.matchAll(/^\s*([a-z_]+):\s*'([a-z_]+)'/gm)) {
    if (emitted.has(trigger)) emitted.add(activation);
  }

  for (const event of [
    'capture_saved',
    'first_capture_saved',
    'first_thread_linked',
    'first_commitment_created',
    'first_commitment_completed',
    'first_review_completed',
  ]) {
    assert.ok(
      emitted.has(event),
      `${event} is in the taxonomy but nothing in src/ sends it - the onboarding funnel cannot be measured at that step`,
    );
  }
}

// 8. Data mode distinguishes the states that matter for whether data survived.
{
  for (const mode of ['demo-local', 'cloud-synced', 'browser-only', 'sync-pending', 'sync-failed']) {
    assert.ok(client.includes(`'${mode}'`), `data mode missing: ${mode}`);
    assert.ok(endpoint.includes(`'${mode}'`), `endpoint data mode missing: ${mode}`);
    assert.ok(migration.includes(`'${mode}'`), `product_events data mode missing: ${mode}`);
  }
  assert.ok(
    client.includes('export function resolveAnalyticsDataMode'),
    'the data mode must be resolved from real sync state, not defaulted to unknown',
  );
}

// 9. The table is server-only and indexed, like every other user-scoped table.
{
  const migrations = readdirSync('supabase/migrations')
    .filter((file) => file.endsWith('.sql'))
    .map((file) => readFileSync(`supabase/migrations/${file}`, 'utf8'))
    .join('\n')
    .toLowerCase();

  assert.ok(migrations.includes('alter table public.product_events enable row level security'));
  assert.ok(/revoke all on table public\.product_events from anon, authenticated/.test(migrations),
    'product_events must be server-only');
  assert.ok(migrations.includes('product_events_name_created_idx'), 'product_events needs its query index');
  assert.ok(migrations.includes('is_demo'), 'demo traffic must be separable from real usage');
}

// 10. Runtime: the payload builder actually enforces what the comments claim.
{
  const source = endpoint.replace(/^import .+;\r?\n/gm, '');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  });
  const dir = mkdtempSync(join(tmpdir(), 'memoire-analytics-contract-'));
  const file = join(dir, `product-events-${Date.now()}.mjs`);
  writeFileSync(file, transpiled.outputText, 'utf8');

  try {
    const mod = await import(pathToFileURL(file).href);
    const { buildProductEventPayload } = mod;

    const valid = buildProductEventPayload({
      eventName: 'commitment_completed',
      anonymousId: 'anonymous-user-123',
      route: '/app/today',
      dataMode: 'cloud-synced',
    });
    assert.equal(valid?.event_name, 'commitment_completed');
    assert.equal(valid?.anonymous_id, 'anonymous-user-123');
    assert.equal(valid?.route, '/app/today');
    assert.equal(valid?.data_mode, 'cloud-synced');
    assert.equal(valid?.is_demo, false);

    // A route carrying a customer id must be blanked, not truncated.
    const leaky = buildProductEventPayload({
      eventName: 'thread_viewed',
      anonymousId: 'anonymous-user-123',
      route: '/app/accounts?accountId=acme-labs',
      dataMode: 'cloud-synced',
    });
    assert.equal(leaky?.route, '', 'a route with a query string must never be stored');

    const demo = buildProductEventPayload({
      eventName: 'demo_started',
      anonymousId: 'anonymous-user-123',
      route: '/demo',
      dataMode: 'demo-local',
    });
    assert.equal(demo?.is_demo, true, 'demo traffic must be flagged so it can be excluded from real usage');

    assert.equal(
      buildProductEventPayload({ eventName: 'made_up_event', anonymousId: 'anonymous-user-123', dataMode: 'cloud-synced' }),
      null,
      'an unknown event must be rejected rather than stored',
    );
    assert.equal(
      buildProductEventPayload({ eventName: 'capture_saved', anonymousId: 'short', dataMode: 'cloud-synced' }),
      null,
      'a short anonymous id must be rejected',
    );
    assert.equal(
      buildProductEventPayload({ eventName: 'capture_saved', anonymousId: 'anonymous-user-123', dataMode: 'private' }),
      null,
      'an unknown data mode must be rejected',
    );

    // Extra fields are discarded, not stored - a caller cannot widen the
    // payload by accident.
    const withExtras = buildProductEventPayload({
      eventName: 'capture_saved',
      anonymousId: 'anonymous-user-123',
      route: '/app/capture',
      dataMode: 'browser-only',
      accountName: 'Northstar Foods',
      commitmentText: 'Confirm the validation quantity',
    });
    assert.deepEqual(
      Object.keys(withExtras).sort(),
      ['anonymous_id', 'data_mode', 'event_name', 'is_demo', 'route'],
      'extra fields must be discarded, never carried through',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('Product analytics contract verified: one taxonomy in three places, five fields, no customer content.');
