import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildUnifiedTodayCommandCenter } from '../src/utils/todayCommandCenter.ts';

// The first real user's Top 3 all read "Define the next customer-confirmed
// action" - the same fallback sentence from many deals with no next action.
// These assertions pin the merge and the provenance.

const opp = (patch = {}) => ({
  id: `o-${Math.random().toString(36).slice(2)}`, accountName: 'Acct', opportunityName: 'Deal',
  stage: 'Proposal', estimatedValue: 1_000_000, currency: 'VND', expectedClosePeriod: 'Q3',
  productOrSolution: '', decisionMaker: 'Buyer', budgetOwner: '', procurementPath: '', technicalCriteria: '',
  nextAction: '', nextActionDate: '2026-06-01', evidence: 'Proof', missingContext: '', objectionDebt: '',
  forecastEvidenceCategory: 'Defensible', decisionRecommendation: 'Monitor', status: 'Active',
  createdAt: '', updatedAt: '', storageMode: 'local', ...patch,
});

// 1. Many deals sharing the same fallback action collapse into ONE Top-3 card.
{
  const opportunities = Array.from({ length: 12 }, (_, index) =>
    opp({ id: `overdue-${index}`, accountName: `Account ${index}`, opportunityName: `Deal ${index}` }));
  const center = buildUnifiedTodayCommandCenter({
    briefs: [], revenueActions: [], opportunities, activities: [], today: '2026-07-16',
  });
  // All 12 are overdue with no next action -> identical title "Confirm overdue
  // next action". The Top 3 must not repeat it.
  const titles = center.topActions.map((action) => action.title);
  assert.equal(new Set(titles).size, titles.length, 'no title may repeat in the Top 3');

  const merged = center.topActions.find((action) => (action.mergedCount || 0) > 1);
  assert.ok(merged, 'the shared fallback must collapse into one merged card');
  assert.ok(merged.mergedCount >= 2, 'the merged card counts the deals it stands for');
  assert.ok(/deals need this/.test(merged.reason), 'the merged card restates itself for the group');
  assert.ok(/Start with/.test(merged.reason), 'it points at the first deal to work');
}

// 2. Distinct actions are NOT merged - real per-deal work stays separate.
{
  const opportunities = [
    opp({ id: 'a', accountName: 'Alpha', nextAction: 'Send the revised quote', nextActionDate: '2026-06-01' }),
    opp({ id: 'b', accountName: 'Beta', nextAction: 'Book the site visit', nextActionDate: '2026-06-01' }),
  ];
  const center = buildUnifiedTodayCommandCenter({
    briefs: [], revenueActions: [], opportunities, activities: [], today: '2026-07-16',
  });
  const merged = center.topActions.filter((action) => (action.mergedCount || 0) > 1);
  assert.equal(merged.length, 0, 'distinct titles must not be merged');
  assert.ok(center.topActions.length >= 2, 'both distinct actions survive');
}

// 3. Every surfaced action carries a "why" basis naming its rule.
{
  const center = buildUnifiedTodayCommandCenter({
    briefs: [], revenueActions: [], opportunities: [opp({ nextAction: 'Send quote' })], activities: [], today: '2026-07-16',
  });
  const action = center.topActions[0];
  assert.ok(action, 'there is a top action');
  assert.ok(action.basis && action.basis.length > 0, 'it exposes a basis');
  assert.ok(action.basis.includes(action.source), 'the basis names the source rule');
}

// 4. The card renders the provenance and the merge count.
{
  const page = readFileSync('src/features/dashboard/DashboardPage.tsx', 'utf8');
  assert.ok(page.includes('Why am I seeing this?'), 'the Top-3 card must expose the provenance');
  assert.ok(page.includes('action.basis'), 'it must render the basis');
  assert.ok(page.includes('action.mergedCount'), 'it must show how many deals a merged card stands for');
}

console.log('Recommendation dedupe + provenance contract verified.');
