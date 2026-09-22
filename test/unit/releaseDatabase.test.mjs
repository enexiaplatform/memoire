import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  NEXT_GEN_FIRST_MIGRATION,
  NEXT_GEN_MIGRATIONS,
  OWNER_A,
  OWNER_B,
  applyMigrations,
  asDatabaseOwner,
  createSupabaseCompatibleDatabase,
  productionMigrations,
  seedAuthUsers,
  setAuthenticatedOwner,
} from '../../scripts/release-database-harness.mjs';

const expectedTables = [
  'commercial_conditions',
  'commercial_outcome_requirements',
  'commercial_dependencies',
  'commercial_timing_assertions',
  'commercial_decisions',
  'commercial_history_coverage',
  'commercial_state_revisions',
  'commercial_money_gates',
  'commercial_decision_observations',
];
const coveredTables = [
  'opportunities',
  'commercial_conditions',
  'commercial_evidence',
  'commercial_outcome_requirements',
  'commercial_dependencies',
  'commercial_timing_assertions',
  'commercial_commitments',
  'commercial_money_gates',
];

async function scalar(db, sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows[0];
}

describe('R1 production migration chain', () => {
  let fresh;
  before(async () => {
    fresh = await createSupabaseCompatibleDatabase();
    await applyMigrations(fresh);
    await seedAuthUsers(fresh);
  });
  after(async () => fresh?.close());

  test('fresh database applies every production migration and exposes final schema contracts', async () => {
    assert.deepEqual(productionMigrations().slice(-NEXT_GEN_MIGRATIONS.length), NEXT_GEN_MIGRATIONS);
    const tables = await fresh.query(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1) ORDER BY tablename`,
      [expectedTables],
    );
    assert.deepEqual(tables.rows.map(row => row.tablename), [...expectedTables].sort());

    const rls = await fresh.query(
      `SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY($1) ORDER BY relname`,
      [expectedTables],
    );
    assert.equal(rls.rows.length, expectedTables.length);
    assert.ok(rls.rows.every(row => row.relrowsecurity === true));

    const revisionTriggers = await fresh.query(
      `SELECT DISTINCT event_object_table FROM information_schema.triggers
       WHERE trigger_name='capture_commercial_state_revision' ORDER BY event_object_table`,
    );
    assert.deepEqual(revisionTriggers.rows.map(row => row.event_object_table), [...coveredTables].sort());

    for (const routine of ['activate_commercial_history', 'restore_commercial_history', 'capture_commercial_state_revision']) {
      assert.equal((await scalar(fresh, 'SELECT count(*)::int AS count FROM pg_proc WHERE proname=$1', [routine])).count, 1);
    }
    for (const index of [
      'commercial_dependencies_active_pair_idx',
      'commercial_timing_one_active_target_idx',
      'commercial_money_gates_active_link_idx',
      'commercial_state_revisions_user_cutoff_idx',
      'commercial_decision_observations_user_decision_idx',
    ]) {
      assert.equal((await scalar(fresh, 'SELECT count(*)::int AS count FROM pg_indexes WHERE indexname=$1', [index])).count, 1);
    }
  });

  test('final RLS policies enforce an explicit two-owner read and write matrix', async () => {
    for (const fixture of [
      { owner: OWNER_A, account: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', opportunity: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', condition: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', label: 'A' },
      { owner: OWNER_B, account: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', opportunity: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', condition: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5', label: 'B' },
    ]) {
      await setAuthenticatedOwner(fresh, fixture.owner);
      await fresh.query(
        `INSERT INTO public.accounts(id,user_id,name,account_name,created_at,updated_at)
         VALUES($1,$2,$3,$3,now(),now())`,
        [fixture.account, fixture.owner, `${fixture.label} account`],
      );
      await fresh.query(
        `INSERT INTO public.opportunities(id,user_id,account_id,title,opportunity_name,stage,status,created_at,updated_at)
         VALUES($1,$2,$3,$4,$4,'Qualification','Active',now(),now())`,
        [fixture.opportunity, fixture.owner, fixture.account, `${fixture.label} opportunity`],
      );
      await fresh.query(
        `INSERT INTO public.commercial_conditions(id,user_id,account_id,opportunity_id,statement,condition_category,intent,lifecycle,created_at,updated_at,source_type,evidence_links)
         VALUES($1,$2,$3,$4,$5,'commercial','assumed','active',now(),now(),'manual','[]')`,
        [fixture.condition, fixture.owner, fixture.account, fixture.opportunity, `${fixture.label} condition`],
      );
    }
    await setAuthenticatedOwner(fresh, OWNER_A);
    assert.deepEqual((await fresh.query('SELECT user_id FROM commercial_conditions')).rows.map(row => row.user_id), [OWNER_A]);
    assert.equal((await fresh.query("UPDATE commercial_conditions SET statement='forged' WHERE user_id=$1 RETURNING id", [OWNER_B])).rows.length, 0);
    await assert.rejects(
      fresh.query(
        `INSERT INTO commercial_conditions(id,user_id,account_id,opportunity_id,statement,condition_category,intent,lifecycle,created_at,updated_at,source_type,evidence_links)
         VALUES(gen_random_uuid(),$1,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3','forged','commercial','assumed','active',now(),now(),'manual','[]')`,
        [OWNER_B],
      ),
    );
  });
});

describe('R1 realistic pre-M2 upgrade', () => {
  test('legacy commercial data survives M2-M11 and history starts with one honest baseline', async () => {
    const db = await createSupabaseCompatibleDatabase();
    try {
      const migrations = productionMigrations();
      const split = migrations.indexOf(NEXT_GEN_FIRST_MIGRATION);
      assert.ok(split > 0);
      await applyMigrations(db, migrations.slice(0, split));
      await seedAuthUsers(db);
      await asDatabaseOwner(db);

      const account = 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000b1';
      const qualified = 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000b2';
      const lead = 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000b3';
      const activity = 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000b4';
      const commitment = 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000b5';
      const quote = 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000b6';
      const receivable = 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000b7';
      const capture = 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000b8';
      await db.query("INSERT INTO accounts(id,user_id,name,account_name,created_at,updated_at) VALUES($1,$2,'Legacy account','Legacy account',now(),now())", [account, OWNER_A]);
      await db.query(
        `INSERT INTO opportunities(id,user_id,account_id,title,opportunity_name,stage,status,created_at,updated_at)
         VALUES($1,$3,$4,'Qualified legacy opportunity','Qualified legacy opportunity','Qualification','Active',now(),now()),
               ($2,$3,$4,'Legacy lead','Legacy lead','Lead','Active',now(),now())`,
        [qualified, lead, OWNER_A, account],
      );
      await db.query("UPDATE opportunities SET opportunity_name='Qualified legacy opportunity, edited' WHERE id=$1", [qualified]);
      await db.query(
        `INSERT INTO sales_activities(id,user_id,activity_type,activity_date,raw_note,summary,linked_opportunity_id,account_name,opportunity_name,created_at,updated_at)
         VALUES($1,$2,'Meeting','2026-09-01','Legacy meeting','Legacy meeting',$3,'Legacy account','Qualified legacy opportunity',now(),now())`,
        [activity, OWNER_A, qualified],
      );
      await db.query(
        `INSERT INTO commercial_commitments(id,user_id,account_id,opportunity_id,commitment_text,status,commitment_party,impact_type,source_type,created_at,updated_at)
         VALUES($1,$2,$3,$4,'Send security pack','open','self','none','manual',now(),now())`,
        [commitment, OWNER_A, account, qualified],
      );
      await db.query("INSERT INTO quotes(user_id,id,payload,created_at,updated_at) VALUES($1,$2,$3,now(),now())", [OWNER_A, quote, { id: quote, opportunityId: qualified, amount: 1000, currency: 'USD' }]);
      await db.query("INSERT INTO order_receivables(user_id,id,payload,created_at,updated_at) VALUES($1,$2,$3,now(),now())", [OWNER_A, receivable, { id: receivable, quoteId: quote, amount: 1000, received: 250 }]);
      await db.query("INSERT INTO captures(id,user_id,raw_text,structured_data,status) VALUES($1,$2,'Legacy capture','{}','processed')", [capture, OWNER_A]);

      await applyMigrations(db, migrations.slice(split));
      for (const [table, id] of [
        ['accounts', account], ['opportunities', qualified], ['opportunities', lead], ['sales_activities', activity],
        ['commercial_commitments', commitment], ['quotes', quote], ['order_receivables', receivable], ['captures', capture],
      ]) {
        assert.equal((await scalar(db, `SELECT count(*)::int AS count FROM ${table} WHERE id=$1`, [id])).count, 1, table);
      }
      for (const table of ['commercial_conditions', 'commercial_outcome_requirements', 'commercial_dependencies', 'commercial_timing_assertions', 'commercial_decisions', 'commercial_money_gates', 'commercial_decision_observations']) {
        assert.equal((await scalar(db, `SELECT count(*)::int AS count FROM ${table}`, [])).count, 0, table);
      }

      await setAuthenticatedOwner(db, OWNER_A);
      const activation = await db.query('SELECT public.activate_commercial_history() AS result');
      const repeated = await db.query('SELECT public.activate_commercial_history() AS result');
      assert.equal(new Date(repeated.rows[0].result).toISOString(), new Date(activation.rows[0].result).toISOString());
      const marker = await scalar(db, 'SELECT history_guaranteed_from FROM commercial_history_coverage WHERE user_id=$1', [OWNER_A]);
      assert.equal(new Date(marker.history_guaranteed_from).toISOString(), new Date(activation.rows[0].result).toISOString());
      assert.equal((await scalar(db, "SELECT count(*)::int AS count FROM commercial_state_revisions WHERE operation='baseline' AND entity_type='opportunities'", [])).count, 2);
      assert.equal((await scalar(db, "SELECT count(*)::int AS count FROM commercial_state_revisions WHERE entity_id=$1", [qualified])).count, 1);
    } finally {
      await db.close();
    }
  });
});
