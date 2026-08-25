import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import {
  answerFromAwaitingCustomer,
  answerFromOwnObligations,
} from '../../src/features/v31/askMemoireInsightAnswers.ts';
import { buildMoneyFlow } from '../../src/utils/moneyFlow.ts';
import { buildOrderBook } from '../../src/utils/orderToCash.ts';
import { buildOwnObligations } from '../../src/utils/ownObligations.ts';

const TODAY = '2026-08-24';

const deal = (id, status, value, closedOn) => ({
  id, accountName: `Account ${id}`, opportunityName: `Deal ${id}`,
  stage: status === 'Won' ? 'Won' : 'Proposal', status,
  estimatedValue: value, currency: 'VND', expectedClosePeriod: '',
  productOrSolution: '', decisionMaker: '', budgetOwner: '', procurementPath: '',
  technicalCriteria: '', nextAction: '', nextActionDate: '', evidence: '',
  missingContext: '', objectionDebt: '',
  forecastEvidenceCategory: 'Weak but recoverable', decisionRecommendation: 'Monitor',
  createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-08-23T00:00:00.000Z',
  storageMode: 'local', ...(closedOn ? { closedOn } : {}),
});

const waiting = (opportunities) => answerFromAwaitingCustomer(
  buildOrderBook({ opportunities, quotes: [], milestoneRecords: [], today: TODAY }),
  buildMoneyFlow({ opportunities, quotes: [], today: TODAY }),
);

describe('"What am I waiting for from customers?" - the ball on their side', () => {
  test('committed money that has not arrived is named with its age', () => {
    const result = waiting([deal('w', 'Won', 164_000, '2026-03-06')]);
    assert.match(result.answer, /committed and not yet collected/);
    assert.match(result.answer, /oldest untouched for \d+ days/);
  });

  test('a decision wait and a payment wait are kept apart', () => {
    // They are different phone calls: one chases an answer, one chases money
    // that is already yours.
    const result = waiting([deal('a', 'Active', 300_000), deal('w', 'Won', 164_000, '2026-03-06')]);
    const fields = result.cards[0].fields.map((field) => field.label);
    assert.ok(fields.includes('Awaiting payment'));
    assert.ok(result.cards[0].fields.some((field) => /waiting on a decision/.test(String(field.value))));
  });

  test('nothing on their side says so instead of inventing a wait', () => {
    const result = waiting([]);
    assert.match(result.answer, /Everything open is waiting on you/);
    assert.equal(result.cards, undefined);
  });

  test('it reads both engines, and says so', () => {
    const result = waiting([deal('w', 'Won', 164_000, '2026-03-06')]);
    assert.ok(result.contextUsed.includes('Order book'));
    assert.ok(result.contextUsed.some((source) => source.startsWith('Money flow')));
  });
});

const expense = (id, label, dueDate, status = 'Upcoming') => ({
  id, label, vendor: `Vendor ${id}`, linkedAccountName: '', category: 'Operations',
  amount: 1_000, currency: 'VND', dueDate, status,
  createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
});

const commitment = (accountName, action, date, status) => ({
  accountName, opportunityName: `${accountName} deal`, action, date, status,
});

describe('"What do I owe today?" - silence detection pointed at the operator', () => {
  test('an overdue payment is reported, not rounded away', () => {
    const result = answerFromOwnObligations(
      buildOwnObligations({ expenses: [expense('e1', 'Warehouse rent', '2026-08-01')], quotes: [], today: TODAY }),
      [],
    );
    assert.match(result.answer, /1 obligation is already overdue/);
  });

  test('missed promises to customers count as things you owe', () => {
    const result = answerFromOwnObligations(
      buildOwnObligations({ expenses: [], quotes: [], today: TODAY }),
      [commitment('Grupo Calvo', 'Send the revised phasing', '2026-08-10', 'missed')],
    );
    assert.match(result.answer, /missed 1 promise to customers/);
  });

  test('an empty answer says what it could not check', () => {
    // "Nothing overdue" over undated obligations would be a false all-clear.
    const result = answerFromOwnObligations(
      buildOwnObligations({ expenses: [], quotes: [], today: TODAY }),
      [],
    );
    assert.match(result.answer, /anything undated is invisible here rather than clear/);
    assert.ok(result.missingContext.length > 0);
  });

  test('both debts are reported rather than one standing in for the other', () => {
    const result = answerFromOwnObligations(
      buildOwnObligations({ expenses: [expense('e1', 'Warehouse rent', '2026-08-01')], quotes: [], today: TODAY }),
      [commitment('Grupo Calvo', 'Send the revised phasing', '2026-08-10', 'missed')],
    );
    assert.match(result.answer, /overdue/);
    assert.match(result.answer, /promise/);
    const labels = result.cards[0].fields.map((field) => field.label);
    assert.ok(labels.includes('Overdue'));
    assert.ok(labels.includes('Promises missed'));
  });
});
