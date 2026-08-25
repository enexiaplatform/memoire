import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import {
  answerFromRecordFind,
  detectInsightQuestion,
  findRecords,
} from '../../src/features/v31/askMemoireInsightAnswers.ts';

const deal = (id, accountName, opportunityName, status = 'Active', nextAction = '') => ({
  id, accountName, opportunityName,
  stage: status === 'Won' ? 'Won' : 'Proposal', status,
  estimatedValue: 120_000, currency: 'EUR', expectedClosePeriod: '',
  productOrSolution: '', decisionMaker: '', budgetOwner: '', procurementPath: '',
  technicalCriteria: '', nextAction, nextActionDate: '', evidence: '',
  missingContext: '', objectionDebt: '',
  forecastEvidenceCategory: 'Weak but recoverable', decisionRecommendation: 'Monitor',
  createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-08-23T00:00:00.000Z',
  storageMode: 'local',
});

const BOOK = [
  deal('d1', 'Grupo Calvo', 'Cold store retrofit', 'Active', 'Confirm the phasing'),
  deal('d2', 'Grupo Calvo', 'Chiller replacement', 'Won'),
  deal('d3', 'Luis Simoes Logistica', 'Warehouse LED retrofit', 'Active'),
];

describe('the Search half of Search & Insights', () => {
  test('a bare customer name finds that customer', () => {
    // It used to fall through to a summary of the whole workspace that never
    // mentioned the name typed.
    const found = findRecords('Grupo Calvo', BOOK);
    assert.ok(found);
    assert.equal(found.accounts.length, 1);
    assert.equal(found.accounts[0].deals.length, 2);
  });

  test('the answer names the customer and separates open from closed', () => {
    const result = answerFromRecordFind(findRecords('Grupo Calvo', BOOK));
    assert.match(result.answer, /^Grupo Calvo: 2 deals on record, 1 still open/);
    const labels = result.cards[0].fields.map((field) => field.label);
    assert.ok(labels.includes('Open deals'));
    assert.ok(labels.includes('Closed'));
  });

  test('accents and case fold, so a differently written name still lands', () => {
    assert.ok(findRecords('LUÍS SIMÕES LOGÍSTICA', BOOK));
    assert.ok(findRecords('luis simoes logistica', BOOK));
  });

  test('a deal name finds the deal', () => {
    const found = findRecords('Warehouse LED retrofit', BOOK);
    assert.ok(found);
    assert.equal(found.deals.length, 1);
    assert.equal(found.deals[0].id, 'd3');
  });

  test('a question is never hijacked into a lookup', () => {
    // "What changed at Grupo Calvo this week?" belongs to the change engine.
    assert.equal(findRecords('What changed at Grupo Calvo this week?', BOOK), null);
    assert.equal(findRecords('Which deals may go silent?', BOOK), null);
    assert.equal(findRecords('Where is the money?', BOOK), null);
    assert.equal(findRecords('Summarize this account.', BOOK), null);
  });

  test('a name nobody has is not invented into a match', () => {
    assert.equal(findRecords('Bahri Ship Management', BOOK), null);
  });

  test('too short to be a name is refused', () => {
    assert.equal(findRecords('a', BOOK), null);
    assert.equal(findRecords('', BOOK), null);
  });

  test('lookup runs after the question engines, never instead of them', () => {
    // The engines are consulted first; these still route as questions.
    assert.equal(detectInsightQuestion('Where is the money?'), 'money_state');
    assert.equal(detectInsightQuestion('What do I owe today?'), 'own_obligations');
  });
});
