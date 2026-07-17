import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPostWonCustomers } from '../src/utils/postWonCustomers.ts';

// The pivot promise turned on existing customers: a won deal that goes quiet is
// exactly the silence the app exists to catch. These assertions pin the rule:
// won + no active deal + no touch for the window = a reconnect nudge; anything
// still active or recently touched is not surfaced.

const wonOutcome = (accountName, outcomeDate, finalAmount = 100_000_000) => ({
  outcome: 'Won', accountName, outcomeDate, finalAmount, currency: 'VND', opportunityName: 'Deal',
});
const activeOpp = (accountName) => ({ accountName, status: 'Active' });
const activity = (accountName, activityDate) => ({ accountName, linkedAccountName: accountName, activityDate });

// 1. A won customer with no active deal and no touch for the window is surfaced.
{
  const model = buildPostWonCustomers({
    opportunities: [],
    opportunityOutcomes: [wonOutcome('Delta Nutrition', '2026-05-01', 320_000_000)],
    quotes: [],
    activities: [],
    today: '2026-07-17',
  });
  assert.equal(model.wonCustomerCount, 1);
  assert.equal(model.quietCustomers.length, 1);
  assert.equal(model.quietCustomers[0].accountName, 'Delta Nutrition');
  assert.equal(model.quietCustomers[0].wonValueBase, 320_000_000);
  assert.ok(model.quietCustomers[0].daysSinceTouch >= 45);
}

// 2. A won customer with a deal currently in flight is NOT dormant - pipeline
//    already tracks them.
{
  const model = buildPostWonCustomers({
    opportunities: [activeOpp('Delta Nutrition')],
    opportunityOutcomes: [wonOutcome('Delta Nutrition', '2026-05-01')],
    quotes: [],
    activities: [],
    today: '2026-07-17',
  });
  assert.equal(model.wonCustomerCount, 1);
  assert.equal(model.quietCustomers.length, 0, 'an active deal keeps a won customer off the quiet list');
}

// 3. A recent touch resets the clock - a customer contacted last week is not quiet.
{
  const model = buildPostWonCustomers({
    opportunities: [],
    opportunityOutcomes: [wonOutcome('Delta Nutrition', '2026-01-01')],
    quotes: [],
    activities: [activity('Delta Nutrition', '2026-07-14')],
    today: '2026-07-17',
  });
  assert.equal(model.quietCustomers.length, 0, 'a recent touch resets the quiet clock');
}

// 4. A deal won yesterday is not "quiet" - the clock starts at the win, not zero.
{
  const model = buildPostWonCustomers({
    opportunities: [],
    opportunityOutcomes: [wonOutcome('Fresh Win Co', '2026-07-16')],
    quotes: [],
    activities: [],
    today: '2026-07-17',
  });
  assert.equal(model.quietCustomers.length, 0, 'a just-won customer is not yet quiet');
}

// 5. A fully-collected quote counts as a won relationship even without an outcome.
{
  const model = buildPostWonCustomers({
    opportunities: [],
    opportunityOutcomes: [],
    quotes: [{
      __deleted: false, accountName: 'Paid Co', deliveryStatus: 'Delivered', paymentStatus: 'Paid',
      amount: 80_000_000, currency: 'VND', quoteDate: '2026-04-01', paymentDueDate: '2026-04-15',
    }],
    activities: [],
    today: '2026-07-17',
  });
  assert.equal(model.quietCustomers.length, 1);
  assert.equal(model.quietCustomers[0].accountName, 'Paid Co');
}

// 6. The nudge is wired into Today (as a Customer action) and the Accounts page.
{
  const today = readFileSync('src/utils/todayCommandCenter.ts', 'utf8');
  assert.ok(today.includes('buildPostWonCustomers'), 'Today must build post-won nudges');
  assert.ok(today.includes("source: 'Customer'"), 'post-won actions must carry the Customer source');
  assert.ok(today.includes("| 'Customer'"), 'the action-source union must include Customer');

  const accounts = readFileSync('src/features/accounts/AccountsPage.tsx', 'utf8');
  assert.ok(accounts.includes('QuietWonCustomersCard'), 'Accounts must render the quiet-won-customers card');
}

// 7. The demo seeds a genuinely dormant won customer so the nudge shows in demo.
{
  const sample = readFileSync('src/utils/sampleData.ts', 'utf8');
  assert.ok(sample.includes("accountName: 'Delta Nutrition'"), 'demo must include a dormant won customer');
}

console.log('Post-won customer nudge contract verified.');
