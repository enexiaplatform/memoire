import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Every collection the app syncs must have a table to sync into.
//
// This contract exists because five of nine did not. quotes, weekly_commitments
// and plan_items had migrations written but never applied; nudges and
// account_merges had no migration at all. Each upsert threw, was caught, and
// showed the user a generic "cloud sync unavailable" - so a paying customer's
// plan items, quotes and commitments lived only in one browser. Signing in on a
// second device, or clearing site data, lost them.
//
// A missing table is invisible in the app and invisible in the test suite. It is
// only visible here, by reading the type and the migrations together.

const store = readFileSync('src/services/cloudJsonCollectionStore.ts', 'utf8');
const typeLine = store.slice(
  store.indexOf('export type CloudJsonCollectionTable'),
  store.indexOf(';', store.indexOf('export type CloudJsonCollectionTable')),
);
const collections = [...typeLine.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
assert.ok(collections.length >= 9, `expected the full collection list, found ${collections.length}`);

const migrationsDir = 'supabase/migrations';
const migrationSql = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .map((file) => readFileSync(`${migrationsDir}/${file}`, 'utf8'))
  .join('\n')
  .toLowerCase();

// Revokes and grants are written both one-table-per-statement and as a
// comma-separated list, so the check is "is this table named in such a
// statement", not "is it named alone".
const anonRevokes = [...migrationSql.matchAll(/revoke[\s\S]{0,400}?from anon/g)].map((match) => match[0]);
const authenticatedPolicies = [...migrationSql.matchAll(/create policy[\s\S]{0,400}?to authenticated/g)].map((match) => match[0]);

for (const collection of collections) {
  const created = new RegExp(`create table (if not exists )?public\\.${collection}[\\s(]`).test(migrationSql);
  assert.ok(created, `no migration creates public.${collection} - the app syncs to a table that does not exist`);

  // Every collection carries one user's commercial history, so the row-level
  // guarantees are part of the contract, not an implementation detail.
  const rls = new RegExp(`alter table public\\.${collection} enable row level security`).test(migrationSql);
  assert.ok(rls, `public.${collection} must enable row level security`);

  assert.ok(
    anonRevokes.some((statement) => statement.includes(`public.${collection}`)),
    `public.${collection} must have its anon access revoked`,
  );

  assert.ok(
    authenticatedPolicies.some((statement) => statement.includes(`public.${collection}`)),
    `public.${collection} needs a policy scoped to authenticated`,
  );
}

// And every one of them has to be in the file the user is told is their backup.
//
// `knowledge_notes` shipped on 2026-08-09 and was not added to `exportTables`.
// Nothing failed: the table was simply never queried, so no warning was raised,
// and the manifest went on saying `complete: true` over an export with none of
// the operator's own written notes in it. That is the second time this list has
// drifted behind the collections - the money tables went the same way - and both
// times the only symptom was a backup that looked fine until it was restored.
{
  const exportSource = readFileSync('api/export.ts', 'utf8');
  const listStart = exportSource.indexOf('export const exportTables');
  assert.ok(listStart >= 0, 'api/export.ts must declare exportTables');
  const list = exportSource.slice(listStart, exportSource.indexOf('] as const;', listStart));

  for (const collection of collections) {
    assert.ok(
      new RegExp(`table: '${collection}'`).test(list),
      `public.${collection} syncs to the cloud but api/export.ts never reads it, `
      + 'so a backup of this account silently leaves it out',
    );
  }
}

console.log(`Cloud collection table contract verified for ${collections.length} collections, all of them exported.`);
