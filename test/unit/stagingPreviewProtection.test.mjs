import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attest } from '../../scripts/staging/hosted.mjs';

const origin = 'https://memoire-staging-fixture.vercel.app';
const candidate = {
  origin, backend: 'https://fixture.supabase.co', gitSha: 'a'.repeat(40),
  probe: 'synthetic-probe', bypass: 'synthetic-bypass',
};
const binding = { origin, backend: candidate.backend, commit: candidate.gitSha, planCompletionEnabled: false };
const denied = () => new Response(null, { status: 401 });

test('staging preflight checks anonymous access before sending credentials to the pinned Preview', async () => {
  for (const challenge of [denied, () => Response.redirect('https://vercel.com/sso-api?fixture=1', 302)]) {
    const paths = [];
    const result = await attest(candidate, async (url, options) => {
      paths.push(url);
      if (paths.length === 1) {
        assert.equal(options.credentials, 'omit');
        assert.equal(options.redirect, 'manual');
        assert.equal(options.headers, undefined);
        return challenge();
      }
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, 'Bearer synthetic-probe');
      assert.equal(options.headers['x-vercel-protection-bypass'], 'synthetic-bypass');
      return Response.json(binding);
    });
    assert.deepEqual(paths, [origin + '/', origin + '/api/commercial?resource=staging-attestation']);
    assert.deepEqual(result, binding);
  }
});

test('public, failed and unrelated redirects are rejected before credentialed requests', async () => {
  for (const reply of [
    new Response('public', { status: 200 }),
    new Response(null, { status: 404 }),
    new Response(null, { status: 503 }),
    Response.redirect('https://other.example/login', 302),
    Response.redirect('https://vercel.com/docs', 302),
  ]) {
    let attempts = 0;
    await assert.rejects(attest(candidate, async (_url, options) => {
      attempts++;
      assert.equal(options.headers, undefined);
      return reply;
    }), /did not deny anonymous access/);
    assert.equal(attempts, 1);
  }
});

test('anonymous denial does not substitute for the exact staging deployment binding', async () => {
  await assert.rejects(attest(candidate, async url => url.endsWith('/') ? denied()
    : Response.json({ ...binding, commit: 'b'.repeat(40) })), { code: 'ERR_ASSERTION' });
  await assert.rejects(attest({ ...candidate, origin: 'https://www.memoire-official.com' }, async () => {
    assert.fail('Production origin may not be contacted');
  }), /dedicated Memoire staging Vercel origin/);
});
