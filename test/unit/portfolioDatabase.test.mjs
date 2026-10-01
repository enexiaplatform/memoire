import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSupabaseCompatibleDatabase, seedAuthUsers, setAuthenticatedOwner, OWNER_A, OWNER_B, asDatabaseOwner } from '../../scripts/release-database-harness.mjs';
import { changePortfolioRecord } from '../../src/domain/portfolio/portfolioCatalog.ts';
test('portfolio migration denies foreign/demo writes, anonymous reads and divergent revisions', async () => {
  const db = await createSupabaseCompatibleDatabase();
  try {
    await seedAuthUsers(db);
    await db.exec(readFileSync('supabase/migrations/20261001071024_portfolio_records.sql', 'utf8'));
    const state = { kind: 'brand', name: 'Brand', code: '', description: '', status: 'active', parentId: null, brandId: null, groupId: null, aliases: [] };
    const first = changePortfolioRecord({ records: [], id: 'b', state, expectedVersion: 0, at: '2026-10-01T00:00:00.000Z', sample: false })[0];
    await setAuthenticatedOwner(db, OWNER_A);
    await db.query('INSERT INTO portfolio_records(user_id,id,payload) VALUES ($1,$2,$3)', [OWNER_A, 'b', JSON.stringify(first)]);
    await setAuthenticatedOwner(db, OWNER_B);
    assert.equal((await db.query('SELECT * FROM portfolio_records')).rows.length, 0);
    await assert.rejects(db.query('INSERT INTO portfolio_records(user_id,id,payload) VALUES ($1,$2,$3)', [OWNER_A, 'b2', JSON.stringify({ ...first, id: 'b2' })]));
    assert.equal((await db.query("UPDATE portfolio_records SET updated_at=now() WHERE id='b' RETURNING id")).rows.length, 0);
    await assert.rejects(db.query('INSERT INTO portfolio_records(user_id,id,payload) VALUES ($1,$2,$3)', [OWNER_B, 'demo', JSON.stringify({ ...first, id: 'demo', source: 'demo', isSample: true })]));
    await setAuthenticatedOwner(db, OWNER_A);
    const changed = changePortfolioRecord({ records: [first], id: 'b', state: { ...state, name: 'Renamed' }, expectedVersion: 1, at: '2026-10-01T01:00:00.000Z', sample: false })[0];
    await db.query('UPDATE portfolio_records SET payload=$1 WHERE id=$2', [JSON.stringify(changed), 'b']);
    await assert.rejects(db.query('UPDATE portfolio_records SET payload=$1 WHERE id=$2', [JSON.stringify({ ...changed, name: 'Divergent' }), 'b']), /conflict/);
    await assert.rejects(db.query('UPDATE portfolio_records SET user_id=$1 WHERE id=$2', [OWNER_B, 'b']));
    await asDatabaseOwner(db); await db.exec('SET ROLE anon');
    await assert.rejects(db.query('SELECT * FROM portfolio_records'), /permission denied/);
  } finally { await db.close(); }
});
