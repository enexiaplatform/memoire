import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/**
 * Every record Memoire holds is written to this browser first, and a browser
 * that refuses the write says so by throwing. Before 2026-08-02 the stores
 * called `localStorage.setItem` directly: four wrapped it in a catch that
 * returned false, the rest did not wrap it at all, and no caller anywhere read
 * the result. The user got a saved-looking interface and no record.
 *
 * This contract keeps writing to one guarded path, so that failure can never
 * become quiet again.
 */

const serviceFiles = collect('src/services');

function collect(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return collect(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}
const guardPath = 'src/services/localWriteGuard.ts';
const guard = readFileSync(guardPath, 'utf8');

// 1. Only the guard writes to localStorage inside the stores.
{
  const offenders = serviceFiles
    .filter((file) => file !== guardPath)
    .filter((file) => /localStorage\.setItem\(/.test(readFileSync(file, 'utf8')));

  assert.deepEqual(
    offenders,
    [],
    `these stores write to localStorage directly instead of through writeLocalCollection/writeLocalRecords: ${offenders.join(', ')}`,
  );
}

// 2. The record collections that grow without bound go through the guard.
//    Named individually because these are the ones whose loss is data loss,
//    not a preference that can be set again.
for (const [label, file] of [
  ['activities', 'src/services/salesActivityStore.ts'],
  ['opportunities', 'src/services/opportunityStore.ts'],
  ['accounts', 'src/services/accountStore.ts'],
  ['quotes', 'src/services/quoteStore.ts'],
  ['plan items', 'src/services/planItemStore.ts'],
  ['order milestones', 'src/services/orderMilestoneStore.ts'],
  ['outcomes', 'src/services/opportunityOutcomeStore.ts'],
  ['stakeholders', 'src/services/stakeholderStore.ts'],
  ['objections', 'src/services/objectionStore.ts'],
  ['commitments', 'src/services/weeklyCommitmentStore.ts'],
  ['pipeline briefs', 'src/utils/pipelineDefenseStorage.ts'],
  ['review packs', 'src/utils/reviewPacks.ts'],
]) {
  const source = readFileSync(file, 'utf8');
  assert.ok(
    /writeLocalRecords\(|writeLocalCollection\(/.test(source),
    `${label} must save through the local write guard (${file})`,
  );
  assert.equal(
    /localStorage\.setItem\(/.test(source),
    false,
    `${label} still has a direct localStorage write (${file})`,
  );
}

// 3. The guard reports rather than swallows.
{
  assert.ok(guard.includes('QuotaExceededError'), 'the guard must recognise a quota refusal');
  assert.ok(guard.includes('LOCAL_WRITE_FAILED_EVENT'), 'a refused write must be announced to the shell');
  assert.ok(guard.includes('LOCAL_WRITE_RECOVERED_EVENT'), 'a recovered write must clear the warning');
  assert.ok(
    guard.includes("eventName: 'local_write_failed'"),
    'a refused write must reach operational telemetry, or nobody learns it happened in production',
  );

  const allowed = readFileSync('api/client-log.ts', 'utf8');
  assert.ok(
    allowed.includes("'local_write_failed'"),
    'the client-log endpoint must accept local_write_failed, or the report is dropped with a 400',
  );
}

// 4. The interface says so, and cannot be dismissed into silence.
{
  const banner = readFileSync('src/components/common/StorageFailureBanner.tsx', 'utf8');
  assert.ok(banner.includes('LOCAL_WRITE_FAILED_EVENT'), 'the banner must listen for the failure');
  assert.ok(banner.includes('role="alert"'), 'unsaved data is an alert, not a note');
  // Comments stripped first: the banner explains in prose why it cannot be
  // dismissed, and a check that trips on its own reasoning is not a check.
  const bannerCode = banner.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.equal(
    /onDismiss|setDismissed|handleDismiss|>\s*Dismiss/.test(bannerCode),
    false,
    'a dismissible warning about unsaved data is a worse lie than no warning',
  );

  const shell = readFileSync('src/components/layout/AppShell.tsx', 'utf8');
  assert.ok(shell.includes('<StorageFailureBanner'), 'the banner must be mounted for every destination');

  const settings = readFileSync('src/features/settings/SettingsPage.tsx', 'utf8');
  assert.ok(settings.includes('<StoragePanel'), 'Settings must show what this workspace is storing');
}

// 5. Every paged read has a total order.
//
//    `fetchAllRows` walks a collection with OFFSET, and OFFSET does not remember
//    the previous page: each request re-runs the sort and counts rows off the
//    top. Order by a column that repeats and the rows tied on it may come back
//    in a different order a moment later, so one straddling the page boundary is
//    returned twice and its neighbour is never returned at all. This is not
//    hypothetical here - 1,080 of this project's 1,086 accounts share an
//    `updated_at` to the microsecond, because they arrived in one import.
//
//    Both pages are a 200 carrying the expected number of rows, so nothing in
//    the app or the test suite can see it. Only this can.
{
  const offenders = serviceFiles.flatMap((file) => {
    // Comments stripped first: the call sites explain in prose why the
    // tiebreaker is there, and prose must not be able to satisfy the check.
    const source = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    return source.split('.range(from, to)').slice(0, -1).flatMap((before) => {
      // One query chain back. Long enough for the longest select here, short
      // enough that it cannot reach the previous query in the same file.
      const chain = before.slice(-700);
      return /\.order\(\s*'id'/.test(chain) ? [] : [file];
    });
  });

  assert.deepEqual(
    offenders,
    [],
    'these paged reads do not end their ordering in a unique column, so a page '
    + `boundary can repeat one row and lose another: ${[...new Set(offenders)].join(', ')}`,
  );

  // And the helper has to keep saying why, because the call sites point at it.
  const paging = readFileSync('src/services/supabasePaging.ts', 'utf8');
  assert.ok(
    paging.includes('unique within the filtered set'),
    'supabasePaging must state that the final order column has to be unique',
  );
}

console.log('Storage safety verified: one guarded write path, a refusal that is reported, a warning that cannot be dismissed, and paged reads that cannot skip a row.');
