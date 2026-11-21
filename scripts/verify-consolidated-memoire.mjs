import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const [path, expectedCommit, expectedTree, browser] = process.argv.slice(2);
assert.ok(path && /^[a-f0-9]{40}$/.test(expectedCommit) && /^[a-f0-9]{40}$/.test(expectedTree),
  'Usage: node verify-consolidated-memoire.mjs <worktree> <commit> <tree> [--plan-browser]');
assert.ok(browser === undefined || browser === '--plan-browser');
const cwd = resolve(path);
const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
assert.equal(git('rev-parse', 'HEAD'), expectedCommit);
assert.equal(git('rev-parse', 'HEAD^{tree}'), expectedTree);
assert.equal(git('status', '--porcelain'), '');
assert.ok(!existsSync(resolve(cwd, 'packages/memoire-sdk/dist')), 'Start in a fresh worktree without generated SDK output.');
assert.ok(!readdirSync(cwd).some(name => /^\.env(?:$|\.(?!example$))/i.test(name)), 'Use a worktree without dotenv overrides.');
const env = Object.fromEntries(Object.entries(process.env)
  .filter(([key]) => !/^(SUPABASE|VERCEL|VITE_|DATABASE_URL|PGPASSWORD|GITHUB_TOKEN|CRON_SECRET|MEMOIRE_STAGING|AI_API)/i.test(key)));

function run(program, args) {
  const result = spawnSync(program, args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('Integration commit ' + expectedCommit + ' tree ' + expectedTree);
if (process.platform === 'win32') run('cmd.exe', ['/d', '/c', 'npm run check']);
else run('npm', ['run', 'check']);
if (browser) run(process.execPath, ['scripts/verify-plan-completion-browser.mjs', '--system-chrome']);
