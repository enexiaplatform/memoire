import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// The Commercial Kernel is the part of Memoire that cannot be allowed to drift.
// Every other concept in the product is a view of these records; if a kernel
// table loses its RLS, its indexes, or its relational shape, the damage is
// invisible in the app and invisible in the unit tests. It is only visible here.

const KERNEL_TABLES = [
  'commercial_threads',
  'commercial_commitments',
  'commercial_events',
  'commercial_value_outcomes',
];

const migrationsDir = 'supabase/migrations';
const migrationFiles = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql'));
const migrationSql = migrationFiles
  .map((file) => readFileSync(`${migrationsDir}/${file}`, 'utf8'))
  .join('\n')
  .toLowerCase();

// 1. Relational, not another opaque JSON collection. This is the rule the
// kernel exists to hold: a record with a lifecycle gets columns.
{
  const kernelMigration = readFileSync(`${migrationsDir}/20260726140000_commercial_kernel.sql`, 'utf8').toLowerCase();

  for (const table of KERNEL_TABLES) {
    assert.ok(
      new RegExp(`create table if not exists public\\.${table}`).test(kernelMigration),
      `migration must create public.${table} idempotently`,
    );
  }

  // A kernel table whose only content column is `payload jsonb` would be the
  // JSON pattern wearing a new name.
  const threadBlock = kernelMigration.slice(
    kernelMigration.indexOf('create table if not exists public.commercial_threads'),
    kernelMigration.indexOf('create table if not exists public.commercial_commitments'),
  );
  assert.equal(
    /payload jsonb/.test(threadBlock),
    false,
    'commercial_threads must be relational, not a payload blob',
  );
  for (const column of ['status', 'current_money_state', 'current_waiting_party', 'last_activity_at']) {
    assert.ok(threadBlock.includes(column), `commercial_threads missing column: ${column}`);
  }

  const commitmentBlock = kernelMigration.slice(
    kernelMigration.indexOf('create table if not exists public.commercial_commitments'),
    kernelMigration.indexOf('create table if not exists public.commercial_events'),
  );
  for (const column of [
    'commitment_party',
    'owner_label',
    'original_due_date',
    'current_due_date',
    'silence_threshold_days',
    'due_date_history',
    'last_renegotiated_at',
    'completion_evidence',
    'completion_event_id',
    'impact_type',
    'impact_amount',
  ]) {
    assert.ok(commitmentBlock.includes(column), `commercial_commitments missing column: ${column}`);
  }
  // A permanent 'rescheduled' status would make "how many promises did I keep"
  // unanswerable: a promise moved twice and then kept is neither open nor done.
  // The check reads the status constraint itself, since the surrounding comment
  // names the rejected status in order to forbid it.
  const statusConstraint = commitmentBlock.match(/status text not null default 'open'[\s\S]{0,200}?\)/);
  assert.ok(statusConstraint, 'commercial_commitments must constrain its status');
  assert.deepEqual(
    [...statusConstraint[0].matchAll(/'([a-z]+)'/g)].map((match) => match[1]),
    ['open', 'open', 'completed', 'cancelled'],
    'a rescheduled commitment is still open - it must not become a third status',
  );

  const eventBlock = kernelMigration.slice(
    kernelMigration.indexOf('create table if not exists public.commercial_events'),
    kernelMigration.indexOf('create table if not exists public.commercial_value_outcomes'),
  );
  for (const column of ['occurred_at', 'recorded_at', 'idempotency_key', 'structured_payload']) {
    assert.ok(eventBlock.includes(column), `commercial_events missing column: ${column}`);
  }
  assert.ok(
    kernelMigration.includes('create unique index if not exists commercial_events_idempotency_idx'),
    'imported and derived events need an idempotency guard',
  );
}

// 2. Every kernel table is user-scoped, RLS-protected, anon-revoked and indexed.
{
  const anonRevokes = [...migrationSql.matchAll(/revoke[\s\S]{0,400}?from anon/g)].map((match) => match[0]);
  // The policy body continues past "to authenticated" into the USING clause,
  // which is where the auth.uid() scoping actually lives.
  const authPolicies = [...migrationSql.matchAll(/create policy[\s\S]{0,600}?with check[^;]*;/g)].map((match) => match[0]);

  for (const table of KERNEL_TABLES) {
    assert.ok(
      new RegExp(`user_id uuid not null references auth\\.users\\(id\\) on delete cascade`).test(migrationSql),
      'kernel tables must cascade-delete with the user',
    );
    assert.ok(
      new RegExp(`alter table public\\.${table} enable row level security`).test(migrationSql),
      `public.${table} must enable row level security`,
    );
    assert.ok(
      anonRevokes.some((statement) => statement.includes(`public.${table}`)),
      `public.${table} must have anon access revoked`,
    );
    assert.ok(
      authPolicies.some((policy) => policy.includes(`public.${table}`) && policy.includes('auth.uid()')),
      `public.${table} needs an authenticated-only policy scoped to auth.uid()`,
    );
    assert.ok(
      new RegExp(`create index if not exists ${table}_user_`).test(migrationSql),
      `public.${table} must be indexed by user`,
    );
  }

  // The queries the product actually runs, every render.
  for (const index of [
    'commercial_commitments_user_due_idx',
    'commercial_commitments_user_party_idx',
    'commercial_threads_user_activity_idx',
    'commercial_events_user_occurred_idx',
  ]) {
    assert.ok(migrationSql.includes(index), `missing index for a hot query: ${index}`);
  }
}

// 3. The canonical vocabulary and state machines are declared once.
{
  const types = readFileSync('src/domain/commercialKernel/types.ts', 'utf8');
  for (const marker of [
    'threadStatuses',
    'commitmentParties',
    'commitmentStatuses',
    'moneyStates',
    'commercialEventTypes',
    'valueOutcomeTypes',
    'valueAssessments',
    'sourceTypes',
    'opportunityStages',
    'accountStatuses',
    'canTransitionThread',
    'canTransitionCommitment',
    'canTransitionOpportunity',
    'toCanonicalOpportunityStage',
  ]) {
    assert.ok(types.includes(marker), `canonical vocabulary missing: ${marker}`);
  }

  // Future-proofing without building the future: a scope object, not a
  // currentUserId read scattered through the domain.
  assert.ok(types.includes('CommercialScope'), 'domain rules must take a scope, not a global current user');
  assert.equal(
    /workspaces?\s*\(/i.test(types),
    false,
    'no speculative workspace table - prepare interfaces, not unfinished features',
  );

  // Integration source types exist in the contract before any integration does.
  for (const source of ['email', 'calendar', 'crm', 'erp']) {
    assert.ok(types.includes(`'${source}'`), `source type contract missing: ${source}`);
  }
}

// 4. Business transitions live in commands, not in page components.
{
  const commands = readFileSync('src/domain/commercialKernel/commands.ts', 'utf8');
  for (const command of [
    'recordCommercialEvent',
    'createCommercialThread',
    'linkEventToThread',
    'createCommitment',
    'completeCommitment',
    'cancelCommitment',
    'rescheduleCommitment',
    'markThreadWaiting',
    'advanceMoneyCheckpoint',
    'recordValueOutcome',
    'changeThreadStatus',
    'archiveThread',
  ]) {
    assert.ok(commands.includes(`export function ${command}`), `application command missing: ${command}`);
  }

  // Commands return a typed result. Throwing inside a click handler is how a
  // record the user just typed disappears behind a blank screen.
  assert.ok(commands.includes('CommandResult'), 'commands must return a typed result');
  assert.equal(/\bthrow new Error\(/.test(commands), false, 'commands report failure, they do not throw');

  // A reschedule must never overwrite the promise as made.
  assert.ok(
    commands.includes('dueDateHistory: [') && commands.includes('lastRenegotiatedAt: timestamp'),
    'rescheduling must append history rather than rewrite the original promise',
  );
}

// 5. The policy engine is deterministic, explainable and non-destructive.
{
  const engine = readFileSync('src/domain/commercialKernel/policyEngine.ts', 'utf8');
  for (const field of [
    'reasonCode',
    'reasonText',
    'sourceRecordIds',
    'threshold',
    'severity',
    'recommendedAction',
    'calculatedAt',
  ]) {
    assert.ok(engine.includes(field), `every recommendation must carry ${field}`);
  }
  for (const code of [
    'CUSTOMER_COMMITMENT_OVERDUE',
    'SELF_COMMITMENT_OVERDUE',
    'COMMITMENT_REPEATEDLY_RESCHEDULED',
    'THREAD_SILENT',
    'THREAD_WITHOUT_NEXT_COMMITMENT',
    'OPPORTUNITY_WITHOUT_STAGE_EVIDENCE',
    'OPPORTUNITY_WITHOUT_FUTURE_ACTION',
    'QUOTE_EXPIRING',
    'MONEY_CHECKPOINT_STUCK',
  ]) {
    assert.ok(engine.includes(code), `policy engine missing rule: ${code}`);
  }

  // Rules read; the user decides. A rule that writes would let a recommendation
  // silently change a stage or close a commitment.
  for (const writer of ['saveCommitment', 'saveThread', 'appendEvent', 'updateOpportunity', 'localStorage']) {
    assert.equal(engine.includes(writer), false, `the policy engine must not write: ${writer}`);
  }
  assert.equal(/\buseState|useMemo|useEffect\b/.test(engine), false, 'rules live outside React');

  // Thresholds are configurable and inspectable - the substrate for
  // deterministic personalisation from the user's own history.
  assert.ok(engine.includes('export const policyThresholds'), 'thresholds must be declared centrally');
  assert.ok(engine.includes('thresholds?: Partial<PolicyThresholds>'), 'thresholds must be overridable');
}

// 6. Threads are derived, not migrated. Existing workspaces must not need a
// destructive backfill to see their commercial threads.
{
  const derive = readFileSync('src/domain/commercialKernel/deriveThreads.ts', 'utf8');
  assert.ok(derive.includes('export function resolveCommercialThreads'), 'thread resolution must exist');
  assert.ok(derive.includes('derived: boolean'), 'a derived thread must say so');
  assert.ok(
    migrationSql.includes('insert into public.commercial_threads') === false,
    'threads must be derived at read time, never backfilled by a migration',
  );
}

// 7. Sample and demo records never reach the cloud.
{
  const repository = readFileSync('src/services/commercialKernel/kernelRepository.ts', 'utf8');
  assert.ok(repository.includes('isSyncableRecord'), 'the repository must gate what syncs');
  assert.ok(repository.includes('record.isSample !== true'), 'sample records must never sync');
  assert.ok(
    repository.includes('filter(isSyncableRecord)'),
    'the sync path must apply the sample gate',
  );
}

// 8. Every surface that asks "what is promised?" reads both ledgers.
//
// `createCommitment` has one caller - the "Record a commitment" composer - so
// the kernel ledger only ever held promises somebody typed twice. A capture
// with a due date lands on the Plan instead, and while the two were read apart,
// Today, Plan, the account card and the policy engine all answered "nothing is
// promised" over a workspace that had promises in it. The merge is what keeps
// them one voice, so both read sites must go through it.
{
  const derive = readFileSync('src/domain/commercialKernel/derivePlanCommitments.ts', 'utf8');
  assert.ok(
    derive.includes('getDatedCaptureActions'),
    'derived promises must come from the same function the Plan board derives its days from',
  );
  // Calls, not mentions: the module's own comment names `createCommitment` when
  // it explains why this file exists.
  assert.equal(
    /\b(?:createCommitment|writeLocal|syncRecordsForCurrentUser)\s*\(/.test(derive),
    false,
    'derived, not migrated: a promise read off the Plan must never be written into the ledger',
  );

  for (const [file, label] of [
    ['src/features/commitments/useCommitmentLedger.ts', 'the Commitments panel'],
    ['src/features/threads/useCommercialThreads.ts', 'threads and the policy engine'],
  ]) {
    const source = readFileSync(file, 'utf8');
    assert.ok(
      source.includes('mergePlanCommitments('),
      `${label} must read the Plan's promises alongside the recorded ledger`,
    );
  }
}

console.log('Commercial Kernel contract verified: relational, RLS-protected, explainable, derived not migrated.');
