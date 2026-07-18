import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { buildRestorePlan, parseBackupFile } from '../src/utils/workspaceBackup.ts';

/**
 * Export without restore is half a promise. This contract protects the half
 * that is easy to get wrong: a restore overwrites a workspace, so it must be
 * refusable, previewable, and incapable of dragging demo data into live data.
 */

// 1. A foreign file can never reach the write path.
{
  for (const [input, reason] of [
    ['<html>nope</html>', 'not-json'],
    ['"a string"', 'not-an-object'],
    ['{"exportedAt":"2026-07-18T09:00:00.000Z"}', 'not-a-memoire-backup'],
    ['{"localBrowserData":{}}', 'not-a-memoire-backup'],
  ]) {
    const result = parseBackupFile(input);
    assert.equal(result.ok, false, `must refuse: ${input.slice(0, 24)}`);
    assert.equal(result.reason, reason);
    assert.ok(result.message.length > 0, 'a refusal always explains itself');
  }
}

// 2. Sample/live separation survives a round trip through a backup file. This
//    is the same line the stores hold at write time; a restore is just another
//    way in.
{
  const plan = buildRestorePlan({
    exportedAt: '2026-07-18T09:00:00.000Z',
    localBrowserData: {
      'memoire.opportunities.v1': [
        { id: 'live-1' },
        { id: 'demo-1', isSample: true },
        { id: 'demo-2', source: 'demo' },
      ],
    },
  });
  assert.equal(plan.droppedSampleRecords, 2, 'demo records are dropped on restore');
  assert.equal(plan.restoredRecords, 1);
  assert.equal(JSON.parse(plan.writes[0].value).length, 1);
}

// 3. A restore writes only inside the app's own namespace.
{
  const plan = buildRestorePlan({
    exportedAt: '2026-07-18T09:00:00.000Z',
    localBrowserData: {
      'memoire.accounts.v1': [{ id: 'a' }],
      'evil.token': 'stolen',
      'supabase.auth.token': 'session',
    },
  });
  assert.equal(plan.writes.length, 1, 'keys outside the memoire namespace are ignored');
  assert.equal(plan.writes[0].key, 'memoire.accounts.v1');
}

// 4. UI contract: nothing is written until the user has seen what is in the
//    file and confirmed. A file picker is not consent to replace a workspace.
{
  const tab = readFileSync(new URL('../src/features/settings/ExportTab.tsx', import.meta.url), 'utf8');

  assert.match(tab, /parseBackupFile/, 'the restore path validates before doing anything');
  assert.match(tab, /setPending\(\{ envelope: result\.envelope/, 'a valid file fills a preview, not the workspace');
  assert.match(tab, /window\.confirm\(/, 'the destructive step is confirmed explicitly');

  const chooseHandler = tab.slice(tab.indexOf('handleChooseBackup'), tab.indexOf('handleConfirmRestore'));
  assert.ok(
    !/localStorage\.setItem|clearMemoireLocalData/.test(chooseHandler),
    'choosing a file must not write anything',
  );

  const confirmStart = tab.indexOf('const handleConfirmRestore');
  const confirmHandler = tab.slice(confirmStart, tab.indexOf('\n  const handle', confirmStart + 1));
  assert.match(confirmHandler, /buildRestorePlan/, 'the write path goes through the sanitized plan');
  assert.match(confirmHandler, /clearMemoireLocalData\(\)/, 'a restore replaces rather than merges');
  assert.ok(
    !/localBrowserData/.test(confirmHandler),
    'the raw envelope never reaches localStorage - only the plan does',
  );
}

// 5. Restore is refused inside the demo sandbox. Found by running it: a
//    restore clears every memoire.* key including the sample flag, and access
//    is granted on a session *or* that flag - so a demo visitor who restored
//    was left at the login wall with their own data behind it.
{
  const tab = readFileSync(new URL('../src/features/settings/ExportTab.tsx', import.meta.url), 'utf8');
  assert.match(tab, /const sampleDataActive = hasLocalSampleData\(\)/, 'the tab knows whether the demo is loaded');
  assert.match(tab, /if \(!file \|\| sampleDataActive\) return;/, 'choosing a file is refused in the demo');
  assert.match(tab, /if \(!pending \|\| sampleDataActive\) return;/, 'confirming is refused in the demo');
  assert.match(tab, /disabled=\{sampleDataActive\}/, 'the control is visibly disabled, not silently inert');
  assert.match(tab, /Exit the demo first/, 'and it says why');
}

// 6. Export carries the version that restore checks. Without it, a future
//    format would be silently half-read by an older build.
{
  const tab = readFileSync(new URL('../src/features/settings/ExportTab.tsx', import.meta.url), 'utf8');
  assert.match(tab, /formatVersion: BACKUP_FORMAT_VERSION/, 'exports declare their format version');

  const future = parseBackupFile(JSON.stringify({
    exportedAt: '2026-07-18T09:00:00.000Z',
    formatVersion: 99,
    localBrowserData: { 'memoire.accounts.v1': [] },
  }));
  assert.equal(future.ok, false);
  assert.equal(future.reason, 'unsupported-version');
}

// 7. Restore stays client-side. Vercel Hobby caps api/ at 12 functions, and
//    putting a user's whole workspace through an endpoint would earn nothing.
{
  const apiFunctions = readdirSync(new URL('../api/', import.meta.url))
    .filter((file) => /\.(ts|js)$/.test(file) && !file.startsWith('_'));
  assert.ok(apiFunctions.length <= 12, `api/ must stay within the Hobby cap (found ${apiFunctions.length})`);
  assert.ok(!apiFunctions.includes('restore.ts'), 'restore needs no endpoint');
}

console.log('Workspace restore contract verified.');
