import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyDigest } from '../../src/utils/dailyDigest.ts';

const overdueExpense = () => ({ __deleted: false, id: 'e1', label: 'Supplier invoice', category: 'Cost of goods', amount: 48_000_000, currency: 'VND', status: 'Upcoming', expenseDate: '2026-07-01', dueDate: '2026-07-10', vendor: 'Distributor', linkedAccountName: '' });
const wonOutcome = () => ({ outcome: 'Won', accountName: 'Delta Nutrition', opportunityName: 'QC', outcomeDate: '2026-05-01', finalAmount: 320_000_000, currency: 'VND' });

describe('buildDailyDigest', () => {
  test('names silence signals in the headline and body', () => {
    const digest = buildDailyDigest({
      opportunities: [], quotes: [], expenses: [overdueExpense()], activities: [], opportunityOutcomes: [wonOutcome()],
      today: '2026-07-17',
    });
    assert.ok(digest.hasSignal);
    assert.match(digest.headline, /overdue|quiet/i);
    assert.ok(digest.plainText.includes('Supplier invoice'));
    assert.ok(digest.plainText.includes('Delta Nutrition'));
  });

  test('gives an honest all-clear when nothing is silent', () => {
    const digest = buildDailyDigest({ opportunities: [], quotes: [], expenses: [], activities: [], opportunityOutcomes: [], today: '2026-07-17' });
    assert.equal(digest.hasSignal, false);
    assert.match(digest.headline, /nothing going silent/i);
  });

  test('always includes the money section', () => {
    const digest = buildDailyDigest({ opportunities: [], quotes: [], expenses: [], activities: [], opportunityOutcomes: [], today: '2026-07-17' });
    assert.ok(digest.sections.some((section) => section.title === 'Money'));
  });

  test('carries the owner name when provided', () => {
    const digest = buildDailyDigest({ opportunities: [], quotes: [], expenses: [], activities: [], opportunityOutcomes: [], ownerName: 'Trần B', today: '2026-07-17' });
    assert.ok(digest.plainText.includes('Trần B'));
  });
});
