import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { applyMigrations, createSupabaseCompatibleDatabase, OWNER_A, OWNER_B, seedAuthUsers, setAuthenticatedOwner } from '../../scripts/release-database-harness.mjs';
import { reportTemplate } from '../../src/domain/reports/reportDefinition.ts';

const sourceAccount = 'aaaaaaaa-1111-4111-8111-111111111111';
const originalDeal = 'aaaaaaaa-2222-4222-8222-222222222222';
const secondAccount = 'bbbbbbbb-2222-4222-8222-222222222222';
const emptyId = 'aaaaaaaa-3333-4333-8333-333333333333';
const copyId = 'aaaaaaaa-4444-4444-8444-444444444444';
let db;

async function setWorkspace(id) {
  await db.query("SELECT set_config('request.headers', $1, false)", [JSON.stringify(id === null ? {} : { 'x-memoire-workspace': id })]);
}
async function create(id, name, source = null, categories = []) {
  return db.query('SELECT (public.memoire_create_personal_workspace($1,$2,$3,$4)).id AS id', [id, name, source, categories]);
}

before(async () => {
  db = await createSupabaseCompatibleDatabase();
  await applyMigrations(db);
  await seedAuthUsers(db);
  // The hosted schema has owner policies for stakeholders that predate the
  // checked-in chain. Reproduce its select/insert behavior in this fixture.
  await db.exec(`CREATE POLICY fixture_stakeholders_owner ON public.stakeholders
    FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id)`);
  for (const [user, id, name] of [[OWNER_A, sourceAccount, 'Alpha Lab'], [OWNER_B, secondAccount, 'Private Beta']]) {
    await setAuthenticatedOwner(db, user);
    await db.query('INSERT INTO accounts(id,user_id,account_name,name,notes) VALUES ($1,$2,$3,$3,$4)', [id, user, name, 'Legacy commercial note']);
  }
  await setAuthenticatedOwner(db, OWNER_A);
  await db.query("INSERT INTO opportunities(id,user_id,account_id,title,opportunity_name,stage,status) VALUES ($1,$2,$3,'Original Deal','Original Deal','Qualification','Active')", [originalDeal, OWNER_A, sourceAccount]);
  await db.query("INSERT INTO stakeholders(user_id,account_id,account_name,name,email,notes) VALUES ($1,$2,'Alpha Lab','Example Person','person@example.test','Legacy contact note')", [OWNER_A, sourceAccount]);
  await db.query("INSERT INTO quotes(user_id,id,payload) VALUES ($1,'original-quote','{}')", [OWNER_A]);
  const template = { id: 'report', schemaVersion: 1, source: 'user', isSample: false, archived: false, version: 1, history: [], definition: { ...reportTemplate('portfolio'), filters: [{ field: 'account', operator: 'equals', value: 'Alpha Lab' }] } };
  await db.query('INSERT INTO report_definitions(user_id,id,payload) VALUES ($1,$2,$3)', [OWNER_A, template.id, template]);
  const dashboard = { ...template, id: 'dashboard', definition: { schemaVersion: 1, name: 'Example dashboard', description: 'Original note', filters: [], widgets: [{ id: 'widget', title: 'Pipeline', reportId: template.id, type: 'metric', metric: 'pipeline' }] } };
  await db.query('INSERT INTO dashboard_definitions(user_id,id,payload) VALUES ($1,$2,$3)', [OWNER_A, dashboard.id, dashboard]);
});
after(async () => { await db?.close(); });

test('empty creation and retry leave existing source, deals and quotes intact', async () => {
  assert.equal((await create(emptyId, 'Fresh')).rows[0].id, emptyId);
  assert.equal((await create(emptyId, 'Fresh')).rows[0].id, emptyId);
  await assert.rejects(create(emptyId, 'Different'), /identity is already in use/);
  await setWorkspace(emptyId);
  assert.deepEqual((await db.query('SELECT id FROM memoire_personal_workspace_records')).rows, []);
  assert.equal((await db.query('SELECT id FROM opportunities')).rows[0].id, originalDeal);
  assert.equal((await db.query('SELECT id FROM quotes')).rows[0].id, 'original-quote');
});

test('copies only selected records, reattaches contacts and leaves source references out of reports', async () => {
  await create(copyId, 'Selected copy', null, ['contacts', 'templates']);
  await create(copyId, 'Selected copy', null, ['templates', 'contacts']);
  await setWorkspace(copyId);
  const { rows } = await db.query('SELECT id, name, category, account_id, details FROM memoire_personal_workspace_records ORDER BY category, name');
  assert.deepEqual(rows.map(row => row.category), ['accounts','contacts','templates','templates']);
  assert.equal(rows[0].name, 'Alpha Lab');
  assert.notEqual(rows[0].id, sourceAccount);
  assert.equal(rows[1].account_id, rows[0].id);
  assert.equal(rows[1].details.email, 'person@example.test');
  assert.equal(rows[1].details.notes, undefined);
  assert.deepEqual(rows[2].details.layout.filters, []);
  assert.equal(rows[2].details.layout.widgets[0].reportId, rows[3].id);
  assert.deepEqual(rows[3].details.layout.filters, []);
  await db.query("UPDATE memoire_personal_workspace_records SET name = 'Edited copy' WHERE id = $1", [rows[0].id]);
  assert.equal((await db.query('SELECT account_name FROM accounts WHERE id = $1', [sourceAccount])).rows[0].account_name, 'Alpha Lab');
  await setWorkspace(emptyId);
  assert.deepEqual((await db.query('SELECT id FROM memoire_personal_workspace_records')).rows, []);
  await assert.rejects(db.query("INSERT INTO memoire_personal_workspace_records(workspace_id, category, name, account_id) VALUES($1,'contacts','Invalid',$2)", [emptyId, rows[0].id]), /foreign key/);
  await assert.rejects(db.query("INSERT INTO memoire_personal_workspace_records(workspace_id, category, name) VALUES($1,'accounts','Invalid')", [copyId]), /row-level security/);
  const nextId = 'aaaaaaaa-5555-4555-8555-555555555555';
  await create(nextId, 'Copy again', copyId, ['accounts']);
  await setWorkspace(nextId);
  assert.deepEqual((await db.query('SELECT name, category FROM memoire_personal_workspace_records')).rows, [{ name: 'Edited copy', category: 'accounts' }]);
});

test('commercial entries can be created and edited in the selected workspace only', async () => {
  await setWorkspace(emptyId);
  const account = await db.query("INSERT INTO memoire_personal_workspace_records(workspace_id,category,name) VALUES($1,'accounts','New research lab') RETURNING id", [emptyId]);
  const accountId = account.rows[0].id;
  for (const [category, status] of [['opportunities','qualified'],['quotes','sent'],['orders','invoiced']]) {
    await db.query('INSERT INTO memoire_personal_workspace_records(workspace_id,category,name,account_id,details) VALUES($1,$2,$2,$3,$4)', [emptyId,category,accountId,{ status, currency:'VND', amount:500000, date:'2026-11-14' }]);
  }
  await db.query("INSERT INTO memoire_personal_workspace_records(workspace_id,category,name,account_id,details) VALUES($1,'activities','Call',$2,$3)", [emptyId,accountId,{ date:'2026-11-14' }]);
  await assert.rejects(db.query("INSERT INTO memoire_personal_workspace_records(workspace_id,category,name) VALUES($1,'orders','Invalid amount')", [emptyId]), /check constraint/);
  assert.equal((await db.query("UPDATE memoire_personal_workspace_records SET name='Edited quote' WHERE category='quotes' RETURNING name")).rows[0].name,'Edited quote');
  await setWorkspace(copyId);
  assert.deepEqual((await db.query("SELECT name FROM memoire_personal_workspace_records WHERE category IN ('opportunities','quotes','orders','activities')")).rows,[]);
  assert.equal((await db.query('SELECT id FROM opportunities')).rows[0].id, originalDeal);
  assert.equal((await db.query('SELECT id FROM quotes')).rows[0].id, 'original-quote');
});

test('other accounts, anonymous requests and missing workspace selectors cannot read scoped records', async () => {
  await setWorkspace(null);
  assert.deepEqual((await db.query('SELECT id FROM memoire_personal_workspace_records')).rows, []);
  await setAuthenticatedOwner(db, OWNER_B);
  await setWorkspace(copyId);
  assert.deepEqual((await db.query('SELECT id FROM memoire_personal_workspaces')).rows, []);
  assert.deepEqual((await db.query('SELECT id FROM memoire_personal_workspace_records')).rows, []);
  await assert.rejects(create('bbbbbbbb-3333-4333-8333-333333333333', 'Forbidden copy', copyId, ['accounts']), /Source workspace is unavailable/);
  await db.exec('RESET ROLE; SET ROLE anon');
  await assert.rejects(db.query('SELECT id FROM memoire_personal_workspace_records'), /permission denied/);
});

test('copies production-sized legacy contacts by unique account name and preserves explicit links', async () => {
  await setAuthenticatedOwner(db, OWNER_A);
  await db.query(`INSERT INTO accounts(user_id, account_name, name)
    SELECT $1, 'Scale Lab ' || n, 'Scale Lab ' || n FROM generate_series(1, 2500) n`, [OWNER_A]);
  await db.query(`INSERT INTO stakeholders(user_id, account_name, name)
    SELECT $1, ' scale lab ' || (1 + (n - 1) % 2500) || ' ', 'Scale Contact ' || n
    FROM generate_series(1, 4000) n`, [OWNER_A]);
  await db.query(`INSERT INTO accounts(user_id, account_name, name)
    VALUES ($1,'Ambiguous Lab','Ambiguous first'), ($1,' ambiguous lab ','Ambiguous second')`, [OWNER_A]);
  await db.query(`INSERT INTO stakeholders(user_id, account_name, name)
    VALUES ($1,'Ambiguous Lab','Ambiguous contact'), ($1,'Missing Lab','Unmatched contact')`, [OWNER_A]);
  await db.query(`INSERT INTO stakeholders(user_id, account_id, account_name, name)
    VALUES ($1,$2,'Stale account name','Explicit contact')`, [OWNER_A, sourceAccount]);

  const largeCopy = 'aaaaaaaa-6666-4666-8666-666666666666';
  await db.exec("SET statement_timeout = '8s'");
  try {
    await create(largeCopy, 'Production-sized copy', null, ['accounts', 'contacts', 'templates']);
  } finally {
    await db.exec('RESET statement_timeout');
  }
  await setWorkspace(largeCopy);
  const { rows: counts } = await db.query('SELECT category, count(*)::int AS total FROM memoire_personal_workspace_records GROUP BY category ORDER BY category');
  assert.deepEqual(counts, [{ category: 'accounts', total: 2503 }, { category: 'contacts', total: 4002 }, { category: 'templates', total: 2 }]);
  const { rows: links } = await db.query(`SELECT c.name, a.name AS account FROM memoire_personal_workspace_records c
    JOIN memoire_personal_workspace_records a ON a.id=c.account_id WHERE c.name IN ('Explicit contact','Scale Contact 2501') ORDER BY c.name`);
  assert.deepEqual(links, [{ name: 'Explicit contact', account: 'Alpha Lab' }, { name: 'Scale Contact 2501', account: 'Scale Lab 1' }]);
});
