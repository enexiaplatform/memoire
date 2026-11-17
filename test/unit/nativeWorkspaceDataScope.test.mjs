import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyMigrations, createSupabaseCompatibleDatabase, OWNER_A, OWNER_B, seedAuthUsers, setAuthenticatedOwner } from '../../scripts/release-database-harness.mjs';

const workspace = 'bbbbbbbb-1111-4111-8111-111111111111';
const otherWorkspace = 'bbbbbbbb-1111-4111-8111-111111111112';
const unattachedWorkspace = 'bbbbbbbb-1111-4111-8111-111111111113';
const accountId = 'aaaaaaaa-1111-4111-8111-111111111111';
const contactId = 'aaaaaaaa-2222-4222-8222-222222222222';

test('native data scope preserves copied links and isolates the existing Memoire stores', async () => {
  const db = await createSupabaseCompatibleDatabase();
  try {
    await applyMigrations(db);
    await db.exec(`CREATE POLICY fixture_hosted_stakeholders_owner ON public.stakeholders
      FOR ALL TO authenticated USING ((SELECT auth.uid())=user_id) WITH CHECK ((SELECT auth.uid())=user_id)`);
    await seedAuthUsers(db);
    const original = await db.query("INSERT INTO accounts(user_id, name, account_name) VALUES($1, 'Original Medtec', 'Original Medtec') RETURNING id", [OWNER_A]);
    const originalAccountId = original.rows[0].id;
    await db.query("INSERT INTO memoire_personal_workspaces(id,user_id,name) VALUES($1,$2,'Servicebio'),($3,$2,'Pending'),($4,$5,'Foreign')",
      [workspace, OWNER_A, unattachedWorkspace, otherWorkspace, OWNER_B]);
    await db.query(`INSERT INTO memoire_personal_workspace_records(id,user_id,workspace_id,category,name,account_id,details)
      VALUES($1,$2,$3,'accounts','Copied account',NULL,'{"industry":"Lab"}'),
       ($4,$2,$3,'contacts','Copied contact',$1,'{"role":"PI"}')`, [accountId, OWNER_A, workspace, contactId]);
    await setAuthenticatedOwner(db, OWNER_A);
    await assert.rejects(db.query('SELECT public.memoire_prepare_native_workspace($1)', [otherWorkspace]), /Workspace access unavailable/);
    const prepared = await db.query('SELECT public.memoire_prepare_native_workspace($1) AS id', [workspace]);
    const dataOwner = prepared.rows[0].id;
    assert.notEqual(dataOwner, OWNER_A);
    assert.equal((await db.query('SELECT public.memoire_prepare_native_workspace($1) AS id', [workspace])).rows[0].id, dataOwner);
    await db.exec('RESET ROLE');
    assert.equal((await db.query('SELECT banned_until::text AS blocked FROM auth.users WHERE id=$1', [dataOwner])).rows[0].blocked, 'infinity');

    await setAuthenticatedOwner(db, OWNER_B);
    assert.deepEqual((await db.query('SELECT * FROM public.memoire_get_native_workspace_scope($1)', [workspace])).rows, []);
    await db.query("SELECT set_config('request.jwt.claims', $1, false), set_config('request.headers', $2, false)", [
      JSON.stringify({ sub: OWNER_B, role: 'authenticated' }), JSON.stringify({ 'x-memoire-data-workspace': workspace }),
    ]);
    await assert.rejects(db.exec('SELECT memoire_private.apply_workspace_data_scope()'), /Workspace access unavailable/);

    await setAuthenticatedOwner(db, OWNER_A);
    assert.deepEqual((await db.query('SELECT * FROM public.memoire_get_native_workspace_scope($1)', [workspace])).rows,
      [{ data_owner_id: dataOwner, name: 'Servicebio' }]);
    assert.deepEqual((await db.query('SELECT name FROM accounts')).rows, [{ name: 'Original Medtec' }]);
    await db.exec('BEGIN');
    await db.query("SELECT set_config('request.jwt.claims', $1, true), set_config('request.headers', $2, true)", [
      JSON.stringify({ sub: OWNER_A, role: 'authenticated' }), JSON.stringify({ 'x-memoire-data-workspace': workspace }),
    ]);
    await db.exec('SELECT memoire_private.apply_workspace_data_scope()');
    assert.equal((await db.query('SELECT public.memoire_active_data_owner() AS id')).rows[0].id, dataOwner);
    assert.deepEqual((await db.query('SELECT id, name FROM accounts')).rows, [{ id: accountId, name: 'Copied account' }]);
    const contacts = await db.query('SELECT account_id, name FROM stakeholders WHERE user_id=auth.uid()');
    assert.deepEqual(contacts.rows, [{ account_id: accountId, name: 'Copied contact' }]);
    await db.exec("INSERT INTO opportunities(user_id, account_id, title, opportunity_name, stage, status) VALUES(auth.uid(), 'aaaaaaaa-1111-4111-8111-111111111111', 'Servicebio deal', 'Servicebio deal', 'Qualification', 'Active')");
    assert.equal((await db.query('SELECT count(*)::int AS total FROM opportunities')).rows[0].total, 1);
    await db.query("UPDATE accounts SET name='Renamed native account', account_name='Renamed native account' WHERE id=$1", [accountId]);
    await db.exec('COMMIT');
    assert.equal((await db.query('SELECT auth.uid() AS id')).rows[0].id, OWNER_A);
    assert.equal((await db.query('SELECT count(*)::int AS total FROM opportunities')).rows[0].total, 0);
    assert.deepEqual((await db.query('SELECT name FROM accounts')).rows, [{ name: 'Original Medtec' }]);
    const nextId = 'bbbbbbbb-1111-4111-8111-111111111114';
    await db.query('SELECT public.memoire_create_native_workspace($1,$2,$3,$4)', [nextId, 'Copied native workspace', workspace, ['contacts']]);
    await db.query("SELECT set_config('request.headers', $1, false)", [JSON.stringify({ 'x-memoire-workspace': nextId })]);
    assert.equal((await db.query("SELECT name FROM memoire_personal_workspace_records WHERE category='accounts'")).rows[0].name, 'Renamed native account');
    await db.query("SELECT set_config('request.headers', $1, false)", [JSON.stringify({ 'x-memoire-workspace': workspace })]);
    await assert.rejects(db.query("UPDATE memoire_personal_workspace_records SET name='Stale mutation' WHERE id=$1", [accountId]), /Open the full workspace/);
    await assert.rejects(db.query("INSERT INTO opportunities(user_id, account_id, title, opportunity_name, stage, status) VALUES(auth.uid(), $1, 'Invalid link', 'Invalid link', 'Qualification', 'Active')", [accountId]), /link must stay within its workspace/);

    await db.query("SELECT set_config('request.jwt.claims', $1, false), set_config('request.headers', $2, false)", [
      JSON.stringify({ sub: OWNER_A, role: 'authenticated' }), JSON.stringify({ 'x-memoire-data-workspace': unattachedWorkspace }),
    ]);
    await assert.rejects(db.exec('SELECT memoire_private.apply_workspace_data_scope()'), /Workspace access unavailable/);
    await db.query("SELECT set_config('request.headers', $1, false)", [JSON.stringify({ 'x-memoire-data-workspace': workspace })]);
    await db.exec('BEGIN');
    await db.exec('SELECT memoire_private.apply_workspace_data_scope()');
    await assert.rejects(db.query("INSERT INTO opportunities(user_id, account_id, title, opportunity_name, stage, status) VALUES(auth.uid(), $1, 'Invalid link', 'Invalid link', 'Qualification', 'Active')", [originalAccountId]), /link must stay within its workspace/);
    await db.exec('ROLLBACK');
  } finally {
    await db.close();
  }
});

test('two named workspaces under one login partition books, currency, reports and automation snapshots', async () => {
  const db = await createSupabaseCompatibleDatabase();
  const namedA = 'bbbbbbbb-1111-4111-8111-111111111121';
  const namedB = 'bbbbbbbb-1111-4111-8111-111111111122';
  const seeded = [];
  try {
    await applyMigrations(db);
    await seedAuthUsers(db);
    await setAuthenticatedOwner(db, OWNER_A);
    for (const [id, name, currency] of [[namedA, 'Bio Lab', 'USD'], [namedB, 'Med Supply', 'VND']]) {
      await db.query('SELECT public.memoire_create_native_workspace($1,$2,NULL,$3)', [id, name, []]);
      const directory = await db.query('SELECT data_owner_id FROM public.memoire_get_native_workspace_scope($1)', [id]);
      const dataOwner = directory.rows[0].data_owner_id;
      await openScope(db, id);
      try {
        const { rows: accounts } = await db.query(
          'INSERT INTO public.accounts(user_id,name,account_name) VALUES(auth.uid(),$1,$1) RETURNING id', [name],
        );
        const { rows: opportunities } = await db.query(
          'INSERT INTO public.opportunities(user_id,account_id,title,opportunity_name) VALUES(auth.uid(),$1,$2,$2) RETURNING id',
          [accounts[0].id, name],
        );
        const opportunityId = opportunities[0].id;
        await db.query("INSERT INTO public.quotes(user_id,id,payload) VALUES(auth.uid(),'same-ref',$1)",
          [{ id: 'same-ref', title: name, opportunityId, amount: 100, currency }]);
        await db.query('INSERT INTO public.order_receivables(user_id,id,payload) VALUES(auth.uid(),$1,$2)',
          [opportunityId, { id: opportunityId, opportunityId, receipts: [{ amount: 25, currency }] }]);
        await db.query('INSERT INTO public.sales_activities(user_id,raw_note,activity_type) VALUES(auth.uid(),$1,$2)',
          [name, 'Meeting']);
        await db.query('UPDATE public.user_profiles SET reporting_currency=$1 WHERE id=auth.uid()', [currency]);
        const reportModule = await import('../../src/domain/reports/reportRecord.ts');
        const { reportTemplate } = await import('../../src/domain/reports/reportDefinition.ts');
        const [report] = reportModule.changeSavedReport([], {
          id: 'regional-report', state: { definition: { ...reportTemplate('portfolio'), name }, archived: false },
          expectedVersion: 0, sample: false, at: '2026-11-17T00:00:00Z',
        });
        await db.query('INSERT INTO public.report_definitions(user_id,id,payload) VALUES(auth.uid(),$1,$2)', [report.id, report]);
        seeded.push({ id, name, currency, dataOwner, opportunityId });
      } finally {
        await db.exec('COMMIT');
      }
    }

    for (const expected of [...seeded, seeded[0]]) {
      await openScope(db, expected.id);
      try {
        const { rows } = await db.query('SELECT public.memoire_preview_automation() AS snapshot');
        const { snapshot } = rows[0];
        assert.deepEqual(snapshot.accounts.map(row => row.name), [expected.name]);
        assert.deepEqual(snapshot.opportunities.map(row => row.id), [expected.opportunityId]);
        assert.deepEqual(snapshot.quotes.map(row => row.payload.title), [expected.name]);
        assert.deepEqual(snapshot.receivables.map(row => row.payload.opportunityId), [expected.opportunityId]);
        assert.deepEqual(snapshot.activities.map(row => row.raw_note), [expected.name]);
        assert.deepEqual(snapshot.reports.map(row => row.payload.definition.name), [expected.name]);
        assert.deepEqual(snapshot.profiles.map(row => row.reporting_currency), [expected.currency]);
        assert.equal((await db.query('SELECT public.memoire_active_data_owner() AS id')).rows[0].id, expected.dataOwner);
        assert.equal((await db.query('SELECT COUNT(*)::int AS total FROM public.quotes')).rows[0].total, 1);
      } finally {
        await db.exec('ROLLBACK');
      }
    }
    assert.equal((await db.query('SELECT public.memoire_active_data_owner() AS id')).rows[0].id, OWNER_A);
    assert.deepEqual((await db.query('SELECT id FROM public.quotes')).rows, []);
  } finally {
    await db.close();
  }
});

async function openScope(db, workspaceId) {
  await db.exec('BEGIN');
  await db.query("SELECT set_config('request.jwt.claims',$1,true), set_config('request.headers',$2,true)", [
    JSON.stringify({ sub: OWNER_A, role: 'authenticated' }),
    JSON.stringify({ 'x-memoire-data-workspace': workspaceId }),
  ]);
  try {
    await db.exec('SELECT memoire_private.apply_workspace_data_scope()');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}
