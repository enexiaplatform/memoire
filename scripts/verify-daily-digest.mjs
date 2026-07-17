import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDailyDigest, buildDigestMailtoLink } from '../src/utils/dailyDigest.ts';

// The digest is the app's outbound voice - it composes the day's silence signals
// into one plain-text brief the seller can copy or mail to themselves. It builds
// the message; it does not send. These pin the content and the mailto shape.

const activeOpp = (accountName, nextActionDate) => ({
  id: `opp-${accountName}`, accountName, opportunityName: 'Deal', stage: 'Proposal', status: 'Active',
  estimatedValue: 500_000_000, currency: 'VND', nextAction: 'Follow up', nextActionDate,
  forecastEvidenceCategory: 'Defensible', evidence: 'x',
});
const paidQuote = (amount) => ({ __deleted: false, accountName: 'Paid Co', title: 'Order', status: 'Accepted', poStatus: 'Received', deliveryStatus: 'Delivered', paymentStatus: 'Paid', amount, currency: 'VND', quoteDate: '2026-07-01', paymentDueDate: '2026-07-05' });
const overdueExpense = () => ({ __deleted: false, id: 'e1', label: 'Supplier invoice', category: 'Cost of goods', amount: 48_000_000, currency: 'VND', status: 'Upcoming', expenseDate: '2026-07-01', dueDate: '2026-07-10', vendor: 'Distributor', linkedAccountName: '' });
const wonOutcome = () => ({ outcome: 'Won', accountName: 'Delta Nutrition', opportunityName: 'QC', outcomeDate: '2026-05-01', finalAmount: 320_000_000, currency: 'VND' });

// 1. A digest with signals names them in its headline and sections.
{
  const digest = buildDailyDigest({
    opportunities: [activeOpp('Acme', '2026-06-01')],
    quotes: [paidQuote(180_000_000)],
    expenses: [overdueExpense()],
    activities: [],
    opportunityOutcomes: [wonOutcome()],
    ownerName: 'Seller',
    today: '2026-07-17',
  });
  assert.ok(digest.hasSignal, 'a workspace with stuck money / obligations / quiet customers has signal');
  assert.ok(/overdue|quiet|stuck/i.test(digest.headline), `headline should name the risk: ${digest.headline}`);
  assert.ok(digest.plainText.includes('MONEY'), 'the money section is always present');
  assert.ok(digest.plainText.includes('OBLIGATIONS YOU OWE'), 'the overdue supplier obligation appears');
  assert.ok(digest.plainText.includes('Delta Nutrition'), 'the quiet won customer appears');
  assert.ok(digest.plainText.startsWith('Memoire daily digest'), 'the digest is labelled');
  assert.ok(digest.subject.startsWith('Memoire digest'), 'the subject is set for email');
}

// 2. A calm workspace produces an honest all-clear, not a fabricated alarm.
{
  const digest = buildDailyDigest({
    opportunities: [], quotes: [], expenses: [], activities: [], opportunityOutcomes: [], today: '2026-07-17',
  });
  assert.equal(digest.hasSignal, false);
  assert.ok(/nothing going silent/i.test(digest.headline), `calm headline expected: ${digest.headline}`);
}

// 3. The mailto link carries the subject and body for send-to-self.
{
  const digest = buildDailyDigest({ opportunities: [], quotes: [], expenses: [], activities: [], opportunityOutcomes: [], today: '2026-07-17' });
  const link = buildDigestMailtoLink(digest);
  assert.ok(link.startsWith('mailto:?'), 'mailto with no fixed recipient');
  assert.ok(link.includes('subject='), 'subject is prefilled');
  assert.ok(link.includes('body='), 'body is prefilled');
}

// 4. Wiring: the Dashboard renders the digest card with copy + email.
{
  const dashboard = readFileSync('src/features/dashboard/MasterDashboardPage.tsx', 'utf8');
  assert.ok(dashboard.includes('buildDailyDigest'), 'Dashboard must build the digest');
  assert.ok(dashboard.includes('DigestCard'), 'Dashboard must render the digest card');
  assert.ok(dashboard.includes('Email to myself'), 'the digest card must offer email-to-self');
}

console.log('Daily digest contract verified.');
