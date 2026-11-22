import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { verifyPr01 } from './verify-pr01.mjs';

const label = 'EPHEMERAL INTEGRATION';
const artifact = 'ephemeral-evidence/pr01.json';
const sha = process.env.GITHUB_SHA;
const container = process.env.PLAN_TEST_PG_CONTAINER;
const validSha = /^[a-f0-9]{40}$/.test(sha ?? '');

const origin = 'http://127.0.0.1:4175';
const authOrigin = 'http://127.0.0.1:9999';
const restOrigin = 'http://127.0.0.1:3301';
const secret = randomBytes(40).toString('hex');
const databasePassword = randomBytes(20).toString('hex');
const targetMigration = '20261118053205_plan_completion_receipts.sql';
const results = { label, sha: validSha ? sha : null, hosted: false, app: 'built frontend and real api/commercial.ts', credentials: 'run-local random values', preflight: 'NOT RUN', migration: 'NOT RUN', integration: 'NOT RUN', checks: {} };
const services = [];

function assertIsolatedRunner() {
  assert.ok(validSha, 'An exact Git commit is required.');
  assert.match(container ?? '', /^[a-f0-9]{64}$/, 'A disposable PostgreSQL container ID is required.');
  assert.equal(process.env.CI, 'true', 'Use a CI process.');
  assert.ok(!Object.keys(process.env).some(key => /^(SUPABASE|VERCEL|VITE_|MEMOIRE_STAGING|PGPASSWORD)/i.test(key)), 'Use a clean process without application credentials.');
  assert.ok(!readdirSync('.').some(name => /^\.env(?:$|\.(?!example$))/i.test(name)), 'A checked-out dotenv file could introduce external credentials.');
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sha, 'Checkout differs from the requested commit.');
}
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function key(role) {
  const input = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ role, iss: 'ephemeral', exp: Math.floor(Date.now() / 1000) + 3600 });
  return input + '.' + createHmac('sha256', secret).update(input).digest('base64url');
}
const c = {
  origin, backend: origin, anon: key('anon'), service: key('service_role'),
  checkSession(token, userId) {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    assert.equal(claims.sub, userId);
    assert.equal(claims.role, 'authenticated');
    assert.match(claims.session_id, /^[a-f0-9-]{36}$/);
  },
};

function docker(args, options = {}) {
  return execFileSync('docker', ['--host', 'unix:///var/run/docker.sock', ...args], options);
}

function sql(input) {
  return docker(['exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], {
    input, encoding: 'utf8', maxBuffer: 2_000_000, timeout: 20_000,
  }).trim();
}

function service(name, image, variables) {
  const options = Object.entries(variables).flatMap(([key, value]) => ['-e', key + '=' + value]);
  const id = docker(['run', '-d', '--name', name, '--network', 'host', ...options, image],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90_000 }).trim();
  assert.match(id, /^[a-f0-9]{64}$/);
  services.push(id);
}

async function healthy(url) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await fetch(url, { signal: AbortSignal.timeout(1500) }).then(r => r.ok).catch(() => false)) return;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error('Loopback service did not become healthy: ' + url);
}

const root = resolve('dist');
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' };
function serve(handler) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, origin);
      if (url.origin !== origin) return res.writeHead(400).end();
      if (url.pathname === '/__ephemeral_ready') return res.end('ok');
      const body = [];
      for await (const part of req) body.push(part);
      const payload = Buffer.concat(body);
      for (const [prefix, target] of [['/auth/v1', authOrigin], ['/rest/v1', restOrigin]]) {
        if (url.pathname !== prefix && !url.pathname.startsWith(prefix + '/')) continue;
        const pathname = url.pathname.slice(prefix.length) || '/';
        if (pathname.startsWith('//')) return res.writeHead(400).end();
        const headers = { ...req.headers };
        delete headers.host;
        const response = await fetch(target + pathname + url.search, {
          method: req.method, headers, ...(payload.length ? { body: payload } : {}),
          redirect: 'error', signal: AbortSignal.timeout(15_000),
        });
        for (const [name, value] of response.headers) {
          if (!['content-encoding', 'content-length', 'connection', 'transfer-encoding'].includes(name)) res.setHeader(name, value);
        }
        const responseBody = Buffer.from(await response.arrayBuffer());
        if (prefix === '/rest/v1' && pathname === '/rpc/memoire_confirm_plan_completion' && response.status >= 400) {
          const problem = JSON.parse(responseBody.toString());
          console.error('PostgREST RPC fixture diagnostic', JSON.stringify({ code: problem.code, message: problem.message }));
        }
        return res.writeHead(response.status).end(responseBody);
      }
      if (url.pathname === '/api/commercial' || url.pathname === '/api/ai-chat') {
        req.query = Object.fromEntries(url.searchParams);
        if (url.pathname === '/api/ai-chat') req.query.resource = 'ai-chat';
        req.body = payload.length ? JSON.parse(payload.toString()) : undefined;
        res.status = code => { res.statusCode = code; return res; };
        res.json = data => res.setHeader('Content-Type', 'application/json').end(JSON.stringify(data));
        return await handler(req, res);
      }
      if (url.pathname.startsWith('/api/')) return res.writeHead(404).end();
      let file = resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
        file = resolve(root, existsSync(resolve(root, 'spa-fallback.html')) ? 'spa-fallback.html' : 'index.html');
      }
      return res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream').end(readFileSync(file));
    } catch {
      console.error('Loopback bridge request failed');
      res.writeHead(500).end();
    }
  });
}

let server;
try {
  assertIsolatedRunner();
  results.preflight = 'PASS';
  sql(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD '${databasePassword}';
    GRANT anon, authenticated, service_role TO authenticator;
    CREATE ROLE supabase_auth_admin LOGIN SUPERUSER PASSWORD '${databasePassword}';
    ALTER ROLE supabase_auth_admin SET search_path TO auth, public;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT coalesce(NULLIF(current_setting('request.jwt.claim.sub', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
    $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
  `);
  service('memoire-ephemeral-auth', 'supabase/auth:v2.176.0', {
    GOTRUE_API_HOST: '127.0.0.1', GOTRUE_API_PORT: '9999', API_EXTERNAL_URL: origin + '/auth/v1',
    GOTRUE_SITE_URL: origin, GOTRUE_DB_DRIVER: 'postgres', DB_NAMESPACE: 'auth',
    GOTRUE_DB_DATABASE_URL: 'postgres://supabase_auth_admin:' + databasePassword + '@127.0.0.1:55432/postgres',
    GOTRUE_JWT_SECRET: secret, GOTRUE_JWT_EXP: '3600', GOTRUE_JWT_ADMIN_ROLES: 'service_role',
    GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated', GOTRUE_MAILER_AUTOCONFIRM: 'true',
    GOTRUE_LOG_LEVEL: 'warn',
  });
  await healthy(authOrigin + '/health');
  const migrations = readdirSync('supabase/migrations').filter(file => file.endsWith('.sql')).sort((a, b) => a.localeCompare(b));
  const targetIndex = migrations.indexOf(targetMigration);
  assert.ok(targetIndex >= 0);
  for (const file of migrations.slice(0, targetIndex)) sql(readFileSync('supabase/migrations/' + file, 'utf8'));
  service('memoire-ephemeral-rest', 'postgrest/postgrest:v13.0.7', {
    PGRST_DB_URI: 'postgres://authenticator:' + databasePassword + '@127.0.0.1:55432/postgres',
    PGRST_DB_ANON_ROLE: 'anon', PGRST_DB_SCHEMAS: 'public', PGRST_SERVER_PORT: '3301',
    PGRST_SERVER_HOST: '127.0.0.1', PGRST_JWT_SECRET: secret,
  });
  await healthy(restOrigin + '/');

  Object.assign(process.env, {
    SUPABASE_URL: origin, VITE_SUPABASE_URL: origin, VITE_SUPABASE_ANON_KEY: c.anon,
    SUPABASE_SERVICE_ROLE_KEY: c.service, VITE_ENABLE_NATIVE_WORKSPACES: 'true',
    VITE_ENABLE_WEB_ANALYTICS: 'false', PLAN_COMPLETION_ENABLED: 'false',
  });
  execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
  const { default: handler } = await import('../../api/commercial.ts');
  server = serve(handler).listen(4175, '127.0.0.1');
  await healthy(origin + '/__ephemeral_ready');
  await verifyPr01(c, {
    label, rehearseFlag: true,
    onPass: key => { results.checks[key] = 'PASS'; },
    attestTarget: async () => ({ commit: sha, planCompletionEnabled: process.env.PLAN_COMPLETION_ENABLED === 'true' }),
    setFlag: enabled => { process.env.PLAN_COMPLETION_ENABLED = String(enabled); },
    afterRevocation: async (fixture) => {
      const denied = await fetch(restOrigin + '/rpc/memoire_review_plan_status', {
        headers: { Authorization: 'Bearer ' + fixture.outsider.session.access_token },
      });
      assert.equal(denied.status, 403);
      results.checks.review_status_revocation = 'PASS';
    },
    prepare: async (fixture, seedCase) => {
      const [book] = fixture.books;
      const { plan, activity } = await seedCase(book, 'Synthetic pre-migration fixture');
      assert.match(plan.id, /^stage-[a-f0-9-]{36}$/);
      assert.match(activity, /^[a-f0-9-]{36}$/);
      sql(`UPDATE public.plan_items SET payload=payload || '{"reviewProposal":{"proposalId":"ephemeral-fixture"}}'
        WHERE id='${plan.id}';`);
      const snapshot = () => sql(`select jsonb_build_array(
        (select row_to_json(p) from public.plan_items p where id='${plan.id}'),
        (select row_to_json(a) from public.sales_activities a where id='${activity}'));
      `);
      const before = snapshot();
      assert.ok(JSON.parse(before).every(Boolean));
      for (const file of migrations.slice(targetIndex)) sql(readFileSync('supabase/migrations/' + file, 'utf8'));
      assert.equal(snapshot(), before);
      // Force PostgREST to observe the new RPC before issuing app requests.
      sql("NOTIFY pgrst, 'reload schema';");
      for (let attempt = 0; attempt < 40; attempt++) {
        const probe = await fetch(restOrigin + '/rpc/memoire_confirm_plan_completion', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + c.service, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            p_actor: null, p_session: null, p_workspace: null, p_request: null, p_activity: null,
            p_plan_id: null, p_derived_key: null, p_expected: null, p_label: null, p_tag: null,
          }),
        });
        if (probe.ok && (await probe.json()).status === 'unauthorized') break;
        if (attempt === 39) throw new Error('PostgREST did not reload the candidate RPC.');
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      results.migration = 'PASS: pre-existing synthetic Plan and Activity rows unchanged';
      results.checks.additive_migration = 'PASS';
      const tracked = await book.scoped.rpc('memoire_review_plan_status', {}, { get: true });
      assert.equal(tracked.error, null);
      assert.deepEqual(tracked.data.map(row => [row.item_id, row.completion_status, row.activity_id]), [[plan.id, 'planned', null]]);
      const sibling = await fixture.books[1].scoped.rpc('memoire_review_plan_status', {}, { get: true });
      assert.equal(sibling.error, null);
      assert.deepEqual(sibling.data, []);
      const personal = await fixture.outsider.account.rpc('memoire_review_plan_status', {}, { get: true });
      assert.equal(personal.error, null);
      assert.deepEqual(personal.data, []);
      results.checks.review_status_scope = 'PASS';
      console.log(label, results.migration);
    },
  });
  results.integration = 'PASS: Auth/revocation, offline Capture/Plan, switch with withheld acknowledgment, legacy/replay and flag pause/resume';
} catch (error) {
  if (results.preflight === 'PASS') {
    results.integration = 'FAIL: see job log for the failing step';
    console.error(error.message.replaceAll(secret, '[redacted]').replaceAll(databasePassword, '[redacted]'));
  } else {
    results.preflight = 'FAIL';
    console.error('Ephemeral runner refused the environment or checkout.');
  }
  for (const id of services) {
    try {
      const log = docker(['logs', '--tail', '20', id], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5_000 });
      console.error(log.replaceAll(secret, '[redacted]').replaceAll(databasePassword, '[redacted]'));
    } catch { /* Service may not have started. */ }
  }
  process.exitCode = 1;
} finally {
  mkdirSync('ephemeral-evidence', { recursive: true });
  writeFileSync(artifact, JSON.stringify(results, null, 2) + '\n');
  server?.closeAllConnections();
  server?.close();
  for (const id of services.reverse()) {
    try { docker(['rm', '-f', id], { stdio: 'ignore', timeout: 10_000 }); } catch { /* VM is disposable. */ }
  }
}
