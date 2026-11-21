import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  applyMigrations, createSupabaseCompatibleDatabase, OWNER_A, OWNER_B, productionMigrations, seedAuthUsers, setAuthenticatedOwner,
} from '../../scripts/release-database-harness.mjs';

const migration = '20261118053205_plan_completion_receipts.sql';
const stamp = '2026-11-17T12:00:00.000Z';
const activity = randomUUID();
const second = randomUUID();
const foreign = randomUUID();
const session = randomUUID();
const book = randomUUID();
const sibling = randomUUID();
const foreignBook = randomUUID();
const note = { id: 'personal', date: '2026-11-18', label: 'Original task', done: false, createdAt: stamp, updatedAt: stamp, legacyField: { value: 1 } };
const sql = 'SELECT public.memoire_confirm_plan_completion($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS result';

test('Plan completion migration preserves populated rows and atomically scopes, fences, retries and reopens links', async t => {
  const db = await createSupabaseCompatibleDatabase();
  t.after(() => db.close());
  await applyMigrations(db, productionMigrations().filter(name => name !== migration));
  await seedAuthUsers(db);
  await db.exec('CREATE TABLE auth.sessions(id uuid PRIMARY KEY, user_id uuid NOT NULL, not_after timestamptz)');
  await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)', [session, OWNER_A]);
  for (const [id, owner] of [[book, OWNER_A], [sibling, OWNER_A], [foreignBook, OWNER_B]]) {
    await setAuthenticatedOwner(db, owner);
    await db.query("SELECT public.memoire_create_native_workspace($1,$2,NULL,'{}')", [id, 'Book ' + id]);
  }
  await db.exec('RESET ROLE');
  const owners = (await db.query('SELECT workspace_id,data_owner_id FROM memoire_private.workspace_data_owners')).rows;
  const named = owners.find(row => row.workspace_id === book).data_owner_id;
  for (const [id, owner] of [[activity, named], [second, named], [foreign, OWNER_B]]) {
    await db.query("INSERT INTO sales_activities(id,user_id,raw_note,activity_type,next_action,due_date) VALUES($1,$2,'Note','Call','Follow up','2026-11-18')", [id, owner]);
  }
  await db.query('INSERT INTO plan_items(user_id,id,payload,updated_at) VALUES($1,$2,$3,$4),($5,$2,$3,$4)', [named, note.id, JSON.stringify(note), stamp, OWNER_A]);
  const snapshot = async () => (await db.query('SELECT to_jsonb(p) AS row FROM plan_items p ORDER BY user_id,id')).rows;
  const before = await snapshot();
  await applyMigrations(db, [migration]);
  assert.deepEqual(await snapshot(), before);
  const request = randomUUID();
  const args = [OWNER_A, session, book, request, activity, note.id, null, stamp, null, null];
  const confirm = async (overrides = {}) => (await db.query(sql, args.map((value, index) => Object.hasOwn(overrides, index) ? overrides[index] : value))).rows[0].result;

  await t.test('anonymous, authenticated and foreign workspaces or sessions cannot complete an item', async () => {
    await db.exec('SET ROLE anon');
    await assert.rejects(db.query(sql, args), /permission denied/);
    await setAuthenticatedOwner(db, OWNER_A);
    await assert.rejects(db.query(sql, args), /permission denied/);
    await db.exec('RESET ROLE');
    assert.equal((await confirm({ 0: OWNER_B })).status, 'unauthorized');
    assert.equal((await confirm({ 1: randomUUID() })).status, 'unauthorized');
    assert.equal((await confirm({ 2: foreignBook })).status, 'unavailable');
    for (const scope of [null, sibling]) assert.equal((await confirm({ 2: scope })).status, 'activity_unavailable');
    assert.equal((await confirm({ 4: foreign })).status, 'activity_unavailable');
    assert.deepEqual(await snapshot(), before);
  });

  await t.test('an injected receipt failure rolls back the Plan write', async () => {
    await db.exec(`CREATE FUNCTION memoire_private.test_receipt_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'injected receipt failure'; END; $$;
      CREATE TRIGGER test_receipt_failure BEFORE INSERT ON memoire_private.plan_completion_receipts
        FOR EACH ROW EXECUTE FUNCTION memoire_private.test_receipt_failure();`);
    await assert.rejects(confirm(), /injected receipt failure/);
    assert.deepEqual(await snapshot(), before);
    await db.exec('DROP TRIGGER test_receipt_failure ON memoire_private.plan_completion_receipts');
  });

  let first;
  await t.test('original request, lost acknowledgement and equivalent other request converge', async () => {
    await db.exec('SET ROLE service_role');
    first = await confirm();
    assert.equal(first.status, 'confirmed');
    assert.equal(first.transitioned, true);
    assert.equal(first.record.completionActivityId, activity);
    assert.deepEqual(first.record.legacyField, note.legacyField);
    for (const override of [{}, { 3: randomUUID() }]) {
      const retry = await confirm(override);
      assert.deepEqual(retry, { ...first, transitioned: false });
    }
    assert.equal((await confirm({ 4: second })).status, 'conflict');
    assert.equal((await confirm({ 3: randomUUID(), 4: second })).status, 'conflict');
    await db.exec('RESET ROLE');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM sales_activities')).rows[0].n, 3);
  });

  await t.test('legacy collection write cannot regress a managed link; current reopen/move and new completion work', async () => {
    await setAuthenticatedOwner(db, named);
    await db.query('UPDATE plan_items SET payload=$1,updated_at=clock_timestamp() WHERE user_id=$2 AND id=$3', [JSON.stringify(note), named, note.id]);
    const read = async () => (await db.query('SELECT payload FROM plan_items WHERE user_id=$1 AND id=$2', [named, note.id])).rows[0].payload;
    assert.deepEqual(await read(), first.record);
    const updatedAt = new Date(Date.parse(first.record.updatedAt) + 1000).toISOString();
    const reopened = { ...first.record, done: false, date: '2026-11-19', updatedAt };
    delete reopened.doneAt;
    await db.query('UPDATE plan_items SET payload=$1,updated_at=$2 WHERE user_id=$3 AND id=$4',
      [JSON.stringify(reopened), reopened.updatedAt, named, note.id]);
    assert.deepEqual(await read(), reopened);
    await db.exec('RESET ROLE');
    assert.equal((await confirm()).record, null);
    assert.equal((await confirm({3: randomUUID(), 7: stamp})).status, 'conflict');
    assert.equal((await confirm({3: randomUUID(), 7: reopened.updatedAt})).status, 'confirmed');
  });

  await t.test('replay follows current edits, and stale modern sync cannot reverse reopen or deletion', async () => {
    await db.query('INSERT INTO plan_items(user_id,id,payload,updated_at) VALUES($1,$2,$3,$4)',
      [named, 'lifecycle', JSON.stringify({ ...note, id: 'lifecycle' }), stamp]);
    const requestId = randomUUID();
    const complete = () => confirm({3: requestId, 5: 'lifecycle'});
    const result = await complete();
    const sync = async payload => {
      await setAuthenticatedOwner(db, named);
      await db.query('INSERT INTO plan_items(user_id,id,payload,updated_at) VALUES($1,$2,$3,$4) ON CONFLICT (user_id,id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at',
        [named, 'lifecycle', JSON.stringify(payload), payload.updatedAt]);
      await db.exec('RESET ROLE');
    };
    const at = offset => new Date(Date.parse(result.record.updatedAt) + offset).toISOString();
    await sync({ ...result.record, label: 'Edited label', updatedAt: at(1000) });
    assert.equal((await complete()).record.label, 'Edited label');
    await sync({ ...result.record, done: false, updatedAt: at(2000) });
    assert.equal((await complete()).record, null);
    await sync({ ...result.record, label: 'Stale tab edit', updatedAt: at(3000) });
    assert.equal((await complete()).record, null, 'A stale tab re-closed the reopened Plan item');
    await sync({ ...result.record, done: false, __deleted: true, updatedAt: at(4000) });
    await sync({ ...result.record, done: false, label: 'Stale tab edit', updatedAt: at(5000) });
    const state = (await db.query('SELECT payload FROM plan_items WHERE user_id=$1 AND id=$2', [named, 'lifecycle'])).rows[0].payload;
    assert.equal(state.__deleted, true, 'A stale edit removed the Plan tombstone');
    const replay = await complete();
    assert.equal(replay.receiptId, result.receiptId);
    assert.equal(replay.transitioned, false);
    assert.equal(replay.record, null);
  });

  await t.test('typed derived activities and linked groups resolve against current source ownership and due date', async () => {
    const key = 'capture:' + activity + ':2026-11-18:main';
    const wrong = 'capture:' + foreign + ':2026-11-18:main';
    const stale = 'capture:' + activity + ':2026-11-17:main';
    for (const value of [wrong, stale]) {
      assert.equal((await confirm({3: randomUUID(), 5: 'plan-done-' + value, 6: value, 7: null, 8: 'Follow up', 9: ''})).status, 'conflict');
    }
    assert.equal((await confirm({3: randomUUID(), 5: 'plan-done-' + key, 6: key, 7: null, 8: 'Follow up', 9: ''})).status, 'confirmed');
    await db.query('INSERT INTO plan_items(user_id,id,payload,updated_at) VALUES($1,$2,$3,$4)',
      [named, 'group', JSON.stringify({ ...note, id: 'group', linkedDerivedKeys: [key] }), stamp]);
    const group = await confirm({3: randomUUID(), 5: 'group', 6: key});
    assert.deepEqual(group.record.linkedDerivedKeys, [key]);
    assert.equal(group.record.completionActivityId, activity);
  });
});
