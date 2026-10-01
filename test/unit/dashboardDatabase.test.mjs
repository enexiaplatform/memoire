import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMigrations, createSupabaseCompatibleDatabase, seedAuthUsers, setAuthenticatedOwner, OWNER_A, OWNER_B } from '../../scripts/release-database-harness.mjs';
import { newDashboard } from '../../src/domain/dashboards/dashboardDefinition.ts';
import { changeSavedDashboard } from '../../src/domain/dashboards/dashboardRecord.ts';
test('dashboard definitions enforce owner, anonymous, demo and accepted revision boundaries', async () => {
  const db = await createSupabaseCompatibleDatabase();
  try {
    await applyMigrations(db); await seedAuthUsers(db);
    const change = (records, name, version = 0) => changeSavedDashboard(records, { id: 'dashboard', state: { definition: { ...newDashboard(), name }, archived: false }, expectedVersion: version, sample: false, at: '2026-10-01T00:00:00.000Z' });
    const first = change([], 'Dashboard');
    await setAuthenticatedOwner(db, OWNER_A);
    await db.query('INSERT INTO dashboard_definitions(user_id,id,payload) VALUES ($1,$2,$3)', [OWNER_A, 'dashboard', JSON.stringify(first[0])]);
    await setAuthenticatedOwner(db, OWNER_B);
    assert.equal((await db.query('SELECT * FROM dashboard_definitions')).rows.length, 0);
    assert.equal((await db.query("UPDATE dashboard_definitions SET updated_at=now() WHERE id='dashboard' RETURNING id")).rows.length, 0);
    assert.equal((await db.query("DELETE FROM dashboard_definitions WHERE id='dashboard' RETURNING id")).rows.length, 0);
    await assert.rejects(db.query('INSERT INTO dashboard_definitions(user_id,id,payload) VALUES ($1,$2,$3)', [OWNER_A, 'other', JSON.stringify({ ...first[0], id: 'other' })]));
    await assert.rejects(db.query('INSERT INTO dashboard_definitions(user_id,id,payload) VALUES ($1,$2,$3)', [OWNER_B, 'dashboard', JSON.stringify({ ...first[0], source: 'demo', isSample: true })]));
    await setAuthenticatedOwner(db, OWNER_A);
    const changed = change(first, 'Changed', 1);
    await db.query('UPDATE dashboard_definitions SET payload=$1 WHERE id=$2', [JSON.stringify(changed[0]), 'dashboard']);
    await assert.rejects(db.query('UPDATE dashboard_definitions SET payload=$1 WHERE id=$2', [JSON.stringify(change(first, 'Divergent', 1)[0]), 'dashboard']), /conflict/);
    await assert.rejects(db.query('UPDATE dashboard_definitions SET user_id=$1 WHERE id=$2', [OWNER_B, 'dashboard']));
    await db.exec('RESET ROLE; SET ROLE anon'); await assert.rejects(db.query('SELECT * FROM dashboard_definitions'), /permission denied/);
  } finally { await db.close(); }
});
