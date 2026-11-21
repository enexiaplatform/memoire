import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const runner = new URL('../../scripts/staging/ephemeral-pr01.mjs', import.meta.url);
const candidate = 'a'.repeat(40);
const fixtureEnvironment = {
  PATH: process.env.PATH,
  ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
  CI: 'true',
  GITHUB_SHA: candidate,
  PLAN_TEST_PG_CONTAINER: 'a'.repeat(64),
};

for (const [label, overrides, dotenv] of [
  ['invalid commit', { GITHUB_SHA: 'fixture-private-value' }, false],
  ['application credential', { supabase_fixture: 'fixture-private-value' }, false],
  ['dotenv file', {}, true],
  ['missing checkout', {}, false],
]) {
  test('isolated runner emits redacted failure evidence for ' + label, t => {
    const directory = mkdtempSync(join(tmpdir(), 'memoire-ephemeral-preflight-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    if (dotenv) writeFileSync(join(directory, '.ENV.production'), 'FIXTURE=fixture-private-value');
    const run = spawnSync(process.execPath, ['--input-type=module', '--eval', 'await import(' + JSON.stringify(runner.href) + ')'], {
      cwd: directory, env: { ...fixtureEnvironment, ...overrides }, encoding: 'utf8', timeout: 10_000,
    });
    assert.ifError(run.error);
    assert.equal(run.status, 1);
    assert.doesNotMatch(run.stderr, /fixture-private-value/);
    const evidence = JSON.parse(readFileSync(join(directory, 'ephemeral-evidence', 'pr01.json'), 'utf8'));
    assert.equal(evidence.label, 'EPHEMERAL INTEGRATION');
    assert.equal(evidence.hosted, false);
    assert.equal(evidence.sha, overrides.GITHUB_SHA ? null : candidate);
    assert.equal(evidence.preflight, 'FAIL');
    assert.equal(evidence.migration, 'NOT RUN');
    assert.equal(evidence.integration, 'NOT RUN');
    assert.deepEqual(evidence.checks, {});
  });
}
