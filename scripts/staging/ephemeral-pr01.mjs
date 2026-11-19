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
assert.match(sha ?? '', /^[a-f0-9]{40}$/);
assert.match(container ?? '', /^[a-f0-9]{64}$/);
assert.equal(process.env.CI, 'true');
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sha);
assert.ok(!Object.keys(process.env).some(key => /^(SUPABASE|VERCEL|VITE_|MEMOIRE_STAGING|PGPASSWORD)/.test(key)), 'Use a clean process without application credentials.');
assert.ok(!readdirSync('.').some(name => /^\.env(?:$|\.(?!example$))/.test(name)), 'A checked-out dotenv file could introduce external credentials.');

const origin = 'http://127.0.0.1:4175';
const authOrigin = 'http://127.0.0.1:9999';
const restOrigin = 'http://127.0.0.1:3301';
const secret = randomBytes(40).toString('hex');
const databasePassword = randomBytes(20).toString('hex');
const targetMigration = '20261118053205_plan_completion_receipts.sql';
const results = { label, sha, hosted: false, app: 'built frontend and real api/commercial.ts', credentials: 'run-local random values', migration: 'NOT RUN', integration: 'NOT RUN' };
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

function sql(input) {
  return execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], {
    input, encoding: 'utf8', maxBuffer: 2_000_000,
  }).trim();
}

function service(name, image, variables) {
  const options = Object.entries(variables).flatMap(([key, value]) => ['-e', key + '=' + value]);
  execFileSync('docker', ['run', '-d', '--name', name, '--network', 'host', ...options, image], { stdio: 'ignore' });
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
        return res.writeHead(response.status).end(Buffer.from(await response.arrayBuffer()));
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
  sql(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD '${databasePassword}';
    GRANT anon, authenticated, service_role TO authenticator;
    ALTER ROLE postgres PASSWORD '${databasePassword}';
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
    GOTRUE_DB_DATABASE_URL: 'postgres://postgres:' + databasePassword + '@127.0.0.1:55432/postgres',
    GOTRUE_JWT_SECRET: secret, GOTRUE_JWT_EXP: '3600', GOTRUE_JWT_ADMIN_ROLES: 'service_role',
    GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated', GOTRUE_MAILER_AUTOCONFIRM: 'true',
    GOTRUE_LOG_LEVEL: 'warn',
  });
  await healthy(authOrigin + '/health');
  const migrations = readdirSync('supabase/migrations').filter(file => file.endsWith('.sql')).sort((a, b) => a.localeCompare(b));
  assert.ok(migrations.includes(targetMigration));
  for (const file of migrations.filter(file => file !== targetMigration)) sql(readFileSync('supabase/migrations/' + file, 'utf8'));
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
    label, rehearseFlag: true, browserOptions: { channel: 'chrome' },
    attestTarget: async () => ({ commit: sha, planCompletionEnabled: process.env.PLAN_COMPLETION_ENABLED === 'true' }),
    setFlag: enabled => { process.env.PLAN_COMPLETION_ENABLED = String(enabled); },
    prepare: async (fixture, seedCase) => {
      const [book] = fixture.books;
      const { plan, activity } = await seedCase(book, 'Synthetic pre-migration fixture');
      assert.match(plan.id, /^stage-[a-f0-9-]{36}$/);
      assert.match(activity, /^[a-f0-9-]{36}$/);
      const snapshot = () => sql(`select jsonb_build_array(
        (select row_to_json(p) from public.plan_items p where id='${plan.id}'),
        (select row_to_json(a) from public.sales_activities a where id='${activity}'));
      `);
      const before = snapshot();
      assert.ok(JSON.parse(before).every(Boolean));
      sql(readFileSync('supabase/migrations/' + targetMigration, 'utf8'));
      assert.equal(snapshot(), before);
      // Force PostgREST to observe the new RPC before issuing app requests.
      sql("NOTIFY pgrst, 'reload schema';");
      for (let attempt = 0; attempt < 40; attempt++) {
        const spec = await fetch(restOrigin + '/', { headers: { Authorization: 'Bearer ' + c.service } }).then(r => r.json());
        if (spec.paths?.['/rpc/memoire_confirm_plan_completion']) break;
        if (attempt === 39) throw new Error('PostgREST did not reload the candidate RPC.');
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      results.migration = 'PASS: pre-existing synthetic Plan and Activity rows unchanged';
      console.log(label, results.migration);
    },
  });
  results.integration = 'PASS: Auth/revocation, offline Capture/Plan, switch with withheld acknowledgment, legacy/replay and flag pause/resume';
} catch (error) {
  results.integration = 'FAIL: see job log for the failing step';
  console.error(error.message);
  process.exitCode = 1;
} finally {
  mkdirSync('ephemeral-evidence', { recursive: true });
  writeFileSync(artifact, JSON.stringify(results, null, 2) + '\n');
  server?.closeAllConnections();
  server?.close();
  for (const name of ['memoire-ephemeral-rest', 'memoire-ephemeral-auth']) {
    try { execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' }); } catch { /* VM is disposable. */ }
  }
}
