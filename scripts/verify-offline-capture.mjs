import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Capture where there is no signal.
 *
 * Capture is the one thing this product asks people to do away from a desk -
 * in a car park, in a lobby, walking out of a hospital - which is exactly where
 * the connection is worst. Two things were broken there before 2026-08-03, and
 * the second one was serious:
 *
 * 1. The app could not be opened at all with no network. The installed icon
 *    produced the browser's offline page, and the note went into the operator's
 *    memory instead - the exact failure this product exists to end.
 *
 * 2. A capture that was made offline while signed in disappeared when the
 *    connection came back. It was written to this device, then the next cloud
 *    load returned the server's answer alone and the record was gone from every
 *    surface, still sitting in localStorage with nothing pointing at it and
 *    nothing that would ever send it.
 *
 * This contract is about the second one mostly. A product whose promise is that
 * nothing goes silent must not be the thing that swallows the note.
 */

const store = readFileSync('src/services/salesActivityStore.ts', 'utf8');
const banner = readFileSync('src/components/common/OfflineCaptureBanner.tsx', 'utf8');
const shell = readFileSync('src/components/layout/AppShell.tsx', 'utf8');
const worker = readFileSync('public/sw.js', 'utf8');
const main = readFileSync('src/main.tsx', 'utf8');

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
  clear: () => values.clear(),
  key: (index) => [...values.keys()][index] ?? null,
  get length() { return values.size; },
};

const {
  SALES_ACTIVITY_STORAGE_KEY,
  flushPendingSalesActivities,
  listPendingSalesActivities,
  mergePendingIntoCloud,
} = await import('../src/services/salesActivityStore.ts');

const activity = (id, overrides = {}) => ({
  id, accountName: `Account ${id}`, opportunityName: '', contactName: '', stakeholderName: '', stakeholderRole: '',
  competitors: [], buyingSignals: [], risks: [], timelineSignals: [], nextActions: [], activityType: 'Meeting',
  summary: `Note ${id}`, nextAction: '', dueDate: '', tags: [], linkedOpportunityId: '', linkedOpportunityName: '',
  linkedAccountName: '', linkStatus: 'Unlinked', rawNote: `Note ${id}`, activityDate: '2026-08-01',
  createdAt: '2026-08-01T09:00:00.000Z', updatedAt: '2026-08-01T09:00:00.000Z', storageMode: 'local', ...overrides,
});

// 1. A capture the cloud has not accepted is still owed to it, and the record
//    itself carries that fact. A separate outbox would be a second source of
//    truth, and the bug it produces is a note that never arrives with nothing
//    anywhere saying so.
{
  assert.match(store, /pendingSync\?: boolean/, 'a record knows it is owed to the cloud');
  // Matched on the marking rather than on the exact call text. This used to pin
  // `createLocalActivity(activity)` character for character and broke the day
  // that function took a second argument, which told us nothing about whether
  // the guarantee still held - and a contract that fails for a reason it does
  // not care about is one people learn to edit rather than read.
  assert.match(
    store,
    /const record = \{ \.\.\.createLocalActivity\([^)]*\), pendingSync: true \};/,
    'a capture that could not reach the cloud is marked, not merely saved locally',
  );
  assert.match(store, /pendingSync: item\.pendingSync === true/, 'and the mark survives a reload');

  values.clear();
  values.set(SALES_ACTIVITY_STORAGE_KEY, JSON.stringify([
    activity('waiting', { pendingSync: true }),
    activity('sent'),
  ]));
  assert.deepEqual(
    listPendingSalesActivities().map((record) => record.id),
    ['waiting'],
    'only what is owed is counted as waiting',
  );

  // A demo capture is not owed to anybody's account. Without this the offline
  // queue becomes the back door the sample/live separation closes at the front:
  // a touch made in the demo sandbox would sit marked as pending and upload
  // itself into the first real workspace that signs in on this browser.
  values.clear();
  values.set(SALES_ACTIVITY_STORAGE_KEY, JSON.stringify([
    activity('real-waiting', { pendingSync: true }),
    activity('demo-waiting', { pendingSync: true, source: 'demo', isSample: true }),
  ]));
  assert.deepEqual(
    listPendingSalesActivities().map((record) => record.id),
    ['real-waiting'],
    'a sample capture is never queued for the cloud',
  );
}

// 2. The capture stays visible while it waits. This is the regression that
//    matters: a cloud load that answers on its own erases it from the interface
//    while leaving it on the disk.
{
  assert.match(
    store,
    /return mergePendingIntoCloud\(cloud, listPendingSalesActivities\(\)\)/,
    'the cloud answer is merged with what this device still owes, never returned alone',
  );

  const cloud = [activity('from-cloud', { storageMode: 'cloud', updatedAt: '2026-08-02T09:00:00.000Z' })];
  const pending = [activity('offline', { pendingSync: true, updatedAt: '2026-08-03T09:00:00.000Z' })];
  const merged = mergePendingIntoCloud(cloud, pending);
  assert.deepEqual(merged.map((record) => record.id), ['offline', 'from-cloud'], 'the offline capture is still there');

  const both = mergePendingIntoCloud(
    [activity('same', { storageMode: 'cloud' })],
    [activity('same', { pendingSync: true })],
  );
  assert.equal(both.length, 1, 'and a capture the cloud has since accepted is shown once, not twice');
  assert.equal(both[0].pendingSync, true, 'the copy the operator typed wins the clash');
}

// 3. It sends by itself, one record at a time, and a record only leaves this
//    device once the cloud has confirmed it. A batch would be faster and would
//    lose every note in it on one bad row.
{
  assert.match(store, /export async function flushPendingSalesActivities/, 'there is something that sends what is waiting');
  assert.match(
    store,
    /await createCloudActivity\(record, userId as string, \{\s*createdAt: record\.createdAt/,
    'a capture that waited three days keeps the date it was made',
  );
  assert.match(store, /created_at: timestamps\?\.createdAt \|\| timestamp/, 'and the insert honours it');
  const flushBody = store.slice(store.indexOf('export async function flushPendingSalesActivities'));
  assert.ok(
    flushBody.indexOf('deleteLocalActivity(record.id)') > flushBody.indexOf('await createCloudActivity'),
    'the local copy is deleted after the cloud confirms, never before',
  );

  values.clear();
  values.set(SALES_ACTIVITY_STORAGE_KEY, JSON.stringify([activity('waiting', { pendingSync: true })]));
  const noAccount = await flushPendingSalesActivities(null);
  assert.deepEqual(noAccount, { synced: 0, remaining: 1 }, 'with nowhere to send it, it stays');
  assert.equal(listPendingSalesActivities().length, 1, 'and it is still on the device');
}

// 4. The operator is told, in the one register that is true: safe here, not in
//    the account yet. And they never have to remember to press anything.
{
  assert.match(shell, /<OfflineCaptureBanner \/>/, 'the state is reported in the shell, on every page');
  assert.match(banner, /window\.addEventListener\('online', onOnline\)/, 'the send happens when the browser says the network is back');
  assert.match(banner, /waiting to sync/, 'the banner says waiting');
  assert.doesNotMatch(banner, /failed to save|could not be saved/i, 'and never says the capture was lost, because it was not');
  assert.match(
    store,
    /warning: 'Saved on this device\. Memoire will send it when the connection is back\.'/,
    'the capture screen says the same thing',
  );
}

// 5. The shell opens with no network, and the service worker touches nothing it
//    has any business caching. A cached answer to "what is in my account" is
//    stale commercial data presented as current.
{
  assert.match(main, /navigator\.serviceWorker\.register\('\/sw\.js'\)/, 'the worker is registered');
  assert.match(main, /import\.meta\.env\.PROD/, 'but not in dev, where it would serve a stale module graph');

  assert.match(worker, /if \(url\.origin !== self\.location\.origin\) return;/, 'cross-origin requests are never intercepted');
  assert.match(worker, /if \(url\.pathname\.startsWith\('\/api\/'\)\) return;/, 'the API is never cached');
  assert.match(worker, /if \(request\.method !== 'GET'\) return;/, 'and nothing that writes is ever replayed');
  assert.match(worker, /networkFirstShell/, 'HTML is network-first, so an online operator runs what was deployed');
  assert.match(worker, /caches\.match\(APP_SHELL\)/, 'with the cached shell as the offline fallback');

  // Which document the shell IS was never pinned, and that is how it drifted.
  // The prerender step made dist/index.html the marketing landing page and moved
  // the SPA shell to spa-fallback.html; the worker kept precaching '/index.html'
  // and served the sales pitch to operators with no signal. Naming the file is
  // the whole assertion - `caches.match(APP_SHELL)` above was true either way.
  assert.match(
    worker,
    /const APP_SHELL = '\/spa-fallback\.html';/,
    'the offline shell is the SPA fallback, the one document correct for every route',
  );
  assert.doesNotMatch(
    worker,
    /APP_SHELL = '\/index\.html'/,
    'and never index.html, which the prerender step turned into the landing page',
  );
  // The shell must be refreshed from its own URL. Writing the current
  // navigation's response under the shell key made the offline fallback
  // "whatever page you looked at last" - land on / once and marketing is the app.
  assert.match(
    worker,
    /void fetch\(APP_SHELL\)/,
    'the cached shell is refreshed from the shell URL, not from the page being navigated to',
  );
  assert.match(
    worker,
    /keys\.filter\(\(key\) => key !== CACHE\)\.map\(\(key\) => caches\.delete\(key\)\)/,
    'a deploy clears every older cache, so a bad shell cannot outlive it',
  );
}

console.log('Offline capture verified: the app opens with no network, the note stays visible, and it sends itself when the connection returns.');
