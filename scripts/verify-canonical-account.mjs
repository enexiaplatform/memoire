import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeEntityName, accountKey, sameAccount } from '../src/utils/accountIdentity.ts';
import { buildAccountMemory } from '../src/utils/accountMemory.ts';

// The first real user saw VNVC deals in Opportunities while Account Memory
// reported 0 active opportunities: the two surfaces resolved the same name
// differently. These assertions pin the one canonical resolver.

// 1. The key is diacritic- and punctuation-insensitive.
{
  assert.equal(normalizeEntityName('Công ty VNVC.'), 'cong ty vnvc');
  assert.equal(accountKey('VNVC'), accountKey('vnvc.'));
  assert.equal(sameAccount('VNVC', 'vnvc.'), true);
  assert.equal(sameAccount('VNVC', 'DHG Pharma'), false);
  assert.equal(sameAccount('', 'VNVC'), false, 'a blank name matches nothing');
}

const account = { id: 'acc-vnvc', accountName: 'VNVC', accountPotential: 'High' };
const opp = (patch = {}) => ({
  id: `o-${Math.random().toString(36).slice(2)}`, accountName: 'VNVC.', opportunityName: 'Cold chain',
  stage: 'Proposal', estimatedValue: 1_000_000, currency: 'VND', expectedClosePeriod: 'Q3',
  productOrSolution: '', decisionMaker: '', budgetOwner: '', procurementPath: '', technicalCriteria: '',
  nextAction: 'Send quote', nextActionDate: '2026-07-20', evidence: '', missingContext: '', objectionDebt: '',
  forecastEvidenceCategory: 'Defensible', decisionRecommendation: 'Defend', status: 'Active',
  createdAt: '', updatedAt: '', storageMode: 'local', ...patch,
});
const activity = (patch = {}) => ({
  id: `a-${Math.random().toString(36).slice(2)}`, accountName: 'vnvc.', opportunityName: '',
  activityType: 'Meeting', summary: 'Met the team', nextAction: '', dueDate: '', tags: [],
  buyingSignals: [], risks: [], timelineSignals: [], competitors: [],
  linkedOpportunityId: '', linkedOpportunityName: '', linkedAccountName: '', linkStatus: 'Unlinked',
  rawNote: '', activityDate: '2026-07-15', createdAt: '', updatedAt: '', storageMode: 'local', ...patch,
});

// 2. A deal on "VNVC." counts for the "VNVC" account - the reported bug.
{
  const memory = buildAccountMemory(account, [opp(), opp({ status: 'Won' })], []);
  assert.equal(memory.opportunities.length, 2, 'punctuation variant must still match the account');
  assert.equal(memory.activeOpportunityCount, 1, 'the active deal is counted, not reported as 0');
}

// 3. An unlinked activity naming the account (punctuation variant) is attributed.
{
  const memory = buildAccountMemory(account, [], [activity()]);
  assert.equal(memory.matchingActivities.length, 1, 'a punctuation name variant must attribute to the account');
  assert.equal(memory.latestActivityDate, '2026-07-15');
}

// 3b. Diacritics are folded too: a "Café Pharma" account owns a "cafe pharma." deal.
{
  const cafe = { id: 'acc-cafe', accountName: 'Café Pharma', accountPotential: 'Medium' };
  const memory = buildAccountMemory(cafe, [opp({ accountName: 'cafe pharma.' })], []);
  assert.equal(memory.activeOpportunityCount, 1, 'diacritic + punctuation variance must still match');
}

// 4. The core invariant: an account with a matching deal is never empty.
{
  const memory = buildAccountMemory(account, [opp()], [activity()]);
  assert.ok(memory.activeOpportunityCount > 0, 'an account with a matching active deal cannot read 0');
  assert.ok(memory.opportunities.length > 0 && memory.latestActivityDate,
    'both the deal and the activity resolve to the account');
}

// 5. A genuinely different account is not swept in.
{
  const memory = buildAccountMemory(account, [opp({ accountName: 'DHG Pharma' })], [activity({ accountName: 'DHG Pharma' })]);
  assert.equal(memory.opportunities.length, 0);
  assert.equal(memory.matchingActivities.length, 0);
}

// 6. Structural: the weak matchers are gone and the shared resolver is used.
for (const [file, gone] of [
  ['src/utils/accountMemory.ts', 'value.toLowerCase().trim()'],
  ['src/utils/accountHygiene.ts', 'value.trim().toLowerCase()'],
]) {
  const source = readFileSync(file, 'utf8');
  assert.equal(source.includes(gone), false, `${file} must not keep its own weak normalizer`);
  assert.ok(/from '\.\/accountIdentity/.test(source), `${file} must use the shared resolver`);
}
const capture = readFileSync('src/utils/captureEntityResolution.ts', 'utf8');
assert.ok(capture.includes("from './accountIdentity.ts'"), 'Capture must share the one normalizer');

console.log('Canonical account resolver contract verified.');
