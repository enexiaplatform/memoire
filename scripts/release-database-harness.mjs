import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';

export const MIGRATION_DIRECTORY = resolve('supabase/migrations');
export const NEXT_GEN_FIRST_MIGRATION = '20260918143518_commercial_conditions.sql';
export const NEXT_GEN_MIGRATIONS = [
  '20260918143518_commercial_conditions.sql',
  '20260919022734_commercial_outcome_requirements.sql',
  '20260919064803_commercial_dependencies.sql',
  '20260919122702_commercial_timing_assertions.sql',
  '20260919150000_commercial_decisions.sql',
  '20260920120000_commercial_state_revisions.sql',
  '20260920130000_commercial_history_restore.sql',
  '20260921190000_commercial_money_gates.sql',
  '20260921220000_commercial_decision_observations.sql',
];

export const OWNER_A = '11111111-1111-4111-8111-111111111111';
export const OWNER_B = '22222222-2222-4222-8222-222222222222';

export function productionMigrations() {
  return readdirSync(MIGRATION_DIRECTORY)
    .filter(name => name.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));
}

export async function createSupabaseCompatibleDatabase() {
  const db = new PGlite({ extensions: { vector } });
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (
      id uuid PRIMARY KEY,
      email text,
      raw_user_meta_data jsonb DEFAULT '{}'::jsonb
    );
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  `);
  return db;
}

export async function applyMigrations(db, names = productionMigrations()) {
  for (const name of names) {
    const sql = readFileSync(resolve(MIGRATION_DIRECTORY, name), 'utf8');
    try {
      await db.exec(sql);
    } catch (error) {
      error.message = `${name}: ${error.message}`;
      throw error;
    }
  }
}

export async function setAuthenticatedOwner(db, ownerId) {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [ownerId]);
  await db.exec('SET ROLE authenticated');
}

export async function asDatabaseOwner(db) {
  await db.exec('RESET ROLE');
}

export async function seedAuthUsers(db) {
  await db.query(
    `INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
      ($1,'owner-a@example.test','{"display_name":"Owner A"}'),
      ($2,'owner-b@example.test','{"display_name":"Owner B"}')`,
    [OWNER_A, OWNER_B],
  );
}

