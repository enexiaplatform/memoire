import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initiativeDecisions,
  listInitiativeActivities,
  readInitiativeExperiment,
  writeInitiativeExperiment,
} from '../src/utils/initiativeExperiment.ts';

// 1. Round-trip on the existing payload column - no schema change involved.
{
  const fields = {
    hypothesis: 'Northern distributors will onboard faster with a checklist.',
    expectedSignal: 'First distributor active within 3 weeks.',
    currentSignal: 'One distributor responded, meeting booked.',
    decision: 'continue',
    decisionNote: 'Signal matches expectation.',
  };
  const payload = writeInitiativeExperiment({ imported: 'kept' }, fields);
  assert.equal(payload.imported, 'kept', 'existing payload keys must survive');
  assert.deepEqual(readInitiativeExperiment(payload), fields);
}

// 2. Legacy payloads read as safe empties; junk decision falls back to undecided.
{
  const empty = readInitiativeExperiment({});
  assert.equal(empty.hypothesis, '');
  assert.equal(empty.decision, 'undecided');
  assert.equal(readInitiativeExperiment({ experiment: { decision: 'nonsense' } }).decision, 'undecided');
  assert.equal(readInitiativeExperiment(null).decision, 'undecided');
}

// 3. Clearing every field removes the experiment key entirely.
{
  const cleared = writeInitiativeExperiment(
    { experiment: { hypothesis: 'old' }, other: 1 },
    { hypothesis: '', expectedSignal: '', currentSignal: '', decision: 'undecided', decisionNote: '' },
  );
  assert.equal('experiment' in cleared, false);
  assert.equal(cleared.other, 1);
}

// 4. Related activities: token match, newest first, capped.
{
  const make = (id, note, date) => ({
    id, accountName: '', opportunityName: '', activityType: 'Meeting', summary: note,
    nextAction: '', dueDate: '', tags: [], linkedOpportunityId: '', linkedOpportunityName: '',
    linkedAccountName: '', linkStatus: 'Unlinked', rawNote: note, activityDate: date,
    createdAt: '', updatedAt: '', storageMode: 'local',
  });
  const related = listInitiativeActivities('Distributor onboarding program', [
    make('a', 'Called the distributor about onboarding steps', '2026-07-05'),
    make('b', 'Unrelated customer meeting', '2026-07-06'),
    make('c', 'Sent the onboarding checklist', '2026-07-08'),
  ]);
  assert.deepEqual(related.map((item) => item.id), ['c', 'a'], 'newest first, unrelated excluded');
  assert.equal(listInitiativeActivities('', []).length, 0);
}

// 5. Decisions are a closed set.
assert.deepEqual([...initiativeDecisions], ['undecided', 'continue', 'adjust', 'stop']);

// 6. UI contract: the operating page exposes all four context types, the
// experiment section, and related activity - user-editable, nothing auto-set.
const page = readFileSync(new URL('../src/features/operatingSystem/OperatingSystemPage.tsx', import.meta.url), 'utf8');
for (const marker of [
  "'initiative', 'play', 'offer', 'experiment'",
  'Experiment & learning',
  'What am I testing? (hypothesis)',
  'RelatedActivitiesSection',
  'writeInitiativeExperiment',
]) {
  assert.ok(page.includes(marker), `OperatingSystemPage missing marker: ${marker}`);
}

console.log('Initiative experiment contract verified.');
