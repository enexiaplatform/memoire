import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adminGateConfigured, isAdminUser } from '../api/admin-metrics.ts';

/**
 * The operator console is the one endpoint in this product that reads across
 * every workspace. Everywhere else, the isolation guarantee is structural: RLS
 * refuses a cross-tenant read, and `verifyUserToken` binds a service-role query
 * to the account the token proved. Neither of those can protect this one, so
 * what protects it is the gate in `api/admin-metrics.ts` - and a gate nothing
 * tests is a gate nobody notices losing.
 *
 * So the first half of this file **runs the gate** rather than grepping for it.
 * A marker contract can only prove a line of source exists; every property
 * below is about what the function decides, and three of them (fail-closed,
 * unconfirmed-email, non-matching id) are the ways this could silently become
 * world-readable while the source still looked correct.
 *
 * The second half is structural, and only for the properties that are about
 * *where* code lives rather than what it computes.
 */

const failures = [];
const originalIds = process.env.ADMIN_USER_IDS;
const originalEmails = process.env.ADMIN_EMAILS;

function check(label, run) {
  try {
    run();
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function withEnv({ ids, emails }, run) {
  if (ids === undefined) delete process.env.ADMIN_USER_IDS;
  else process.env.ADMIN_USER_IDS = ids;
  if (emails === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = emails;
  run();
}

const FOUNDER_ID = '11111111-2222-3333-4444-555555555555';
const OTHER_ID = '99999999-8888-7777-6666-555555555555';
const confirmed = (patch) => ({ id: OTHER_ID, email: 'someone@example.com', email_confirmed_at: '2026-01-01T00:00:00Z', ...patch });

// ---------------------------------------------------------------- behaviour

// 1. Fail closed. A deployment that forgot the environment variables must
// authorise nobody - not the first caller, not a signed-in user, not the
// account that happens to own the project.
check('unconfigured gate authorises nobody', () => {
  withEnv({}, () => {
    assert.equal(adminGateConfigured(), false, 'gate reports itself configured with no environment set');
    assert.equal(isAdminUser(confirmed({ id: FOUNDER_ID })), false, 'an unconfigured gate let a caller through');
    assert.equal(isAdminUser(confirmed()), false, 'an unconfigured gate let a caller through');
  });
  withEnv({ ids: '', emails: '   ' }, () => {
    assert.equal(adminGateConfigured(), false, 'blank environment values count as a configured gate');
    assert.equal(isAdminUser(confirmed({ id: FOUNDER_ID })), false, 'a blank gate let a caller through');
  });
});

// 2. No caller at all is not a caller who passes.
check('a missing user is refused', () => {
  withEnv({ ids: FOUNDER_ID }, () => {
    assert.equal(isAdminUser(null), false, 'null user was treated as an administrator');
    assert.equal(isAdminUser(undefined), false, 'undefined user was treated as an administrator');
    assert.equal(isAdminUser({}), false, 'an empty user object was treated as an administrator');
  });
});

// 3. An id on the list passes; an id that is not on it does not. The second
// half is the one that matters: it is the whole gate.
check('the id list admits only ids on it', () => {
  withEnv({ ids: `${FOUNDER_ID}, ${OTHER_ID}` }, () => {
    assert.equal(isAdminUser(confirmed({ id: FOUNDER_ID })), true, 'a listed id was refused');
    assert.equal(isAdminUser(confirmed({ id: OTHER_ID })), true, 'a listed id was refused');
  });
  withEnv({ ids: FOUNDER_ID }, () => {
    assert.equal(isAdminUser(confirmed({ id: OTHER_ID })), false, 'an unlisted id was admitted');
    assert.equal(isAdminUser(confirmed({ id: '' })), false, 'an empty id was admitted');
  });
});

// 4. An id list does not silently admit an email, and an email list does not
// silently admit an id. Configuring one must not open the other.
check('the two lists do not leak into each other', () => {
  withEnv({ ids: FOUNDER_ID }, () => {
    assert.equal(
      isAdminUser(confirmed({ id: OTHER_ID, email: FOUNDER_ID })),
      false,
      'a uuid in the email field matched the id allow-list',
    );
  });
  withEnv({ emails: 'founder@example.com' }, () => {
    assert.equal(
      isAdminUser(confirmed({ id: 'founder@example.com', email: 'nobody@example.com' })),
      false,
      'an email in the id field matched the email allow-list',
    );
  });
});

// 5. **The property that makes ADMIN_EMAILS safe at all.** Anyone may type any
// address into the signup form. If an unconfirmed address could authorise, then
// admin access would be granted by claiming the founder's email rather than by
// controlling it - a self-service admin account.
check('an unconfirmed email never authorises', () => {
  withEnv({ emails: 'founder@example.com' }, () => {
    assert.equal(
      isAdminUser({ id: OTHER_ID, email: 'founder@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' }),
      true,
      'a confirmed listed email was refused',
    );
    assert.equal(
      isAdminUser({ id: OTHER_ID, email: 'founder@example.com' }),
      false,
      'an UNCONFIRMED address on the allow-list was admitted - anyone could sign up as the founder',
    );
    assert.equal(
      isAdminUser({ id: OTHER_ID, email: 'founder@example.com', email_confirmed_at: '' }),
      false,
      'an empty confirmation timestamp was treated as confirmation',
    );
  });
});

// 6. Case and stray whitespace are configuration noise, not identity. Email is
// case-insensitive; a config line pasted with spaces must still match.
check('matching ignores case and surrounding whitespace', () => {
  withEnv({ emails: '  FOUNDER@Example.com , second@example.com ' }, () => {
    assert.equal(isAdminUser(confirmed({ email: 'founder@example.com' })), true, 'case-different email was refused');
    assert.equal(isAdminUser(confirmed({ email: '  Second@Example.COM  ' })), true, 'padded email was refused');
    assert.equal(isAdminUser(confirmed({ email: 'third@example.com' })), false, 'an unlisted email was admitted');
  });
  withEnv({ ids: `  ${FOUNDER_ID.toUpperCase()}  ` }, () => {
    assert.equal(isAdminUser(confirmed({ id: FOUNDER_ID })), true, 'case-different uuid was refused');
  });
});

// --------------------------------------------------------------- structural

const endpoint = readFileSync('api/admin-metrics.ts', 'utf8');
const page = readFileSync('src/features/admin/AdminDashboardPage.tsx', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const registry = readFileSync('src/config/featureRegistry.ts', 'utf8');

// 7. The request body may name a user and carry a token, and nothing else. An
// `isAdmin`, a `role` or a `scope` read from the body would be a gate the
// caller writes for themselves.
check('the endpoint reads nothing but a token from the request', () => {
  assert.ok(
    endpoint.includes('const { userId: claimedUserId, authToken } = (req.body ?? {}) as Record<string, string>;'),
    'admin-metrics must destructure only userId and authToken from the body',
  );
  for (const claim of ['body.isAdmin', 'body.role', 'body.admin', 'body.scope']) {
    assert.equal(endpoint.includes(claim), false, `admin-metrics reads an authorisation claim from the body: ${claim}`);
  }
});

// 8. Identity is proven before it is authorised, and the *proven* user object is
// what the gate reads. Passing `claimedUserId` to `isAdminUser` would authorise
// the id the body asked for rather than the one the token established.
check('the token is verified before the gate, and the gate reads the verified user', () => {
  assert.ok(
    endpoint.includes('const user = await verifyUserToken(authToken, claimedUserId);'),
    'admin-metrics must verify the token against the claimed user id',
  );
  assert.ok(endpoint.includes('if (!isAdminUser(user))'), 'admin-metrics must gate on the verified user object');
  assert.equal(
    endpoint.includes('isAdminUser(claimedUserId'),
    false,
    'admin-metrics authorises the id the body claimed rather than the one the token proved',
  );
  assert.ok(
    endpoint.indexOf('await verifyUserToken(') < endpoint.indexOf('if (!isAdminUser(user))'),
    'admin-metrics gates before it verifies',
  );
  assert.ok(
    endpoint.indexOf('if (!isAdminUser(user))') < endpoint.indexOf('getSupabaseServiceRoleKey()'),
    'admin-metrics reaches for the service-role key before the gate has refused anyone',
  );
});

// 9. Offset paging over a non-unique sort column repeats rows and drops rows,
// silently, and the result is a total that is simply wrong. Both paged reads
// must carry a unique tiebreak.
check('cross-workspace paging has a total order', () => {
  const orderedById = endpoint.match(/\.order\('id', \{ ascending: true \}\)/g) || [];
  assert.equal(
    orderedById.length,
    2,
    'both paged reads (user_profiles, product_events) must break ties on id, or counts silently drift',
  );
});

// 10. The browser decides nothing. No VITE_ flag and no client-side allow-list
// may exist: both would ship the gate inside the bundle, where it is a
// suggestion. (The page names ADMIN_USER_IDS in its refusal copy, which is
// help text, not a decision - so the check is on how the code *reads* config.)
check('no admin gate exists in client code', () => {
  for (const clientGate of ['VITE_ADMIN', 'import.meta.env.VITE_ADMIN', 'process.env.ADMIN_']) {
    assert.equal(page.includes(clientGate), false, `the admin page reads its own gate from ${clientGate}`);
    assert.equal(app.includes(clientGate), false, `App.tsx reads an admin gate from ${clientGate}`);
  }
  assert.ok(
    page.includes("fetch('/api/admin-metrics'"),
    'the admin page must get its figures from the server endpoint, not from a query of its own',
  );
  // A page that queried Supabase directly would be asking the browser's own
  // token for other people's rows - RLS would refuse it, and the fix somebody
  // reaches for next is a service-role key in the bundle.
  assert.equal(
    /supabase\s*\n?\s*\.from\(/.test(page),
    false,
    'the admin page queries the database directly instead of going through the gated endpoint',
  );
});

// 11. 401 and 403 must read the same to the browser. Telling them apart tells a
// prober whether their token was the problem or their account was.
check('refusal does not distinguish a bad token from a non-admin', () => {
  assert.ok(
    page.includes("if (response.status === 401 || response.status === 403)"),
    'the admin page must treat 401 and 403 as one refusal',
  );
});

// 12. The console lives outside `/app`. Inside it, it would be a seventh
// destination needing an exception in the rail, the phone tab bar and the
// six-destination contract - one exception at a time, which is how surface
// sprawl started last time.
check('the console is not an app destination', () => {
  assert.ok(app.includes('path="/admin"'), 'App.tsx must route /admin');
  assert.equal(app.includes('path="admin"'), false, '/admin must not be a child route of the /app shell');
  // Written as a regex over the route block rather than a literal string: the
  // literal version encoded this file's indentation and line endings, so a
  // reformat could have "failed" a route that was still perfectly protected.
  assert.ok(
    /path="\/admin"[\s\S]{0,200}?<ProtectedRoute>\s*<AdminDashboardPage \/>/.test(app),
    '/admin must still require a signed-in session',
  );
  const record = registry.match(/id: 'admin-console',[\s\S]*?route: '([^']*)'/);
  assert.ok(record, 'the feature registry must carry a record for admin-console');
  assert.equal(record[1], '/admin', 'the admin-console registry route must match the route App.tsx serves');
});

// ------------------------------------------------------------------ report

if (originalIds === undefined) delete process.env.ADMIN_USER_IDS;
else process.env.ADMIN_USER_IDS = originalIds;
if (originalEmails === undefined) delete process.env.ADMIN_EMAILS;
else process.env.ADMIN_EMAILS = originalEmails;

if (failures.length > 0) {
  console.error('Admin console contract verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Admin console contract verified: the gate fails closed, is decided server-side, and pages with a total order.');
