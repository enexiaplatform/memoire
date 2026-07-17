import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCompactSharedBrief,
  encodeSharedBriefFragment,
  decodeSharedBriefFragment,
  buildSharedBriefUrl,
} from '../../src/utils/shareableBriefLink.ts';

const input = (salesOwner = 'Seller') => ({
  brief: { id: 'b1', title: 'Weekly Review', weekLabel: 'Week 26', salesOwner, scope: 'Active pipeline', deals: [] },
  shareable: {
    generatedAt: '2026-07-17T09:00:00.000Z',
    managerSummary: 'Manager summary: 2 deals reviewed.',
    executiveSummary: {
      totalDeals: 2, defendableDeals: 1, rescueDeals: 1, downgradeDeals: 0,
      totalPipelineValueLabel: '750M VND (Base: VND)', topRiskThemes: [{ label: 'Champion not confirmed', count: 2, accounts: ['A', 'B'] }],
    },
    dealRows: Array.from({ length: 60 }, (_, i) => ({ id: `d${i}`, account: `Acct ${i}`, opportunity: 'Opp', value: '10M VND', currentStage: 'Proposal', forecastCategory: 'Defensible', defenseStatus: 'Defend', mainEvidence: 'e', mainGap: 'g', nextDefenseAction: 'a' })),
    nextDefenseActions: Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, account: `Acct ${i}`, opportunity: 'Opp', title: 'Do it', detail: 'x', priority: 'High', source: 'Deal recommendation' })),
    qualityChecklist: [{ id: 'c1', label: 'Champion identified', status: 'pass', detail: 'ok' }],
  },
});

describe('shareableBriefLink', () => {
  test('round-trips a brief through the hash fragment', () => {
    const compact = buildCompactSharedBrief(input());
    const decoded = decodeSharedBriefFragment(encodeSharedBriefFragment(compact));
    assert.ok(decoded);
    assert.equal(decoded.title, 'Weekly Review');
    assert.equal(decoded.summary.defendableDeals, 1);
  });

  test('preserves unicode in the sales owner name', () => {
    const compact = buildCompactSharedBrief(input('Trần Thị B'));
    const decoded = decodeSharedBriefFragment(encodeSharedBriefFragment(compact));
    assert.equal(decoded.salesOwner, 'Trần Thị B');
  });

  test('caps deal rows and next actions to keep the URL bounded', () => {
    const compact = buildCompactSharedBrief(input());
    assert.ok(compact.dealRows.length <= 40, 'deal rows are capped');
    assert.ok(compact.nextActions.length <= 12, 'next actions are capped');
  });

  test('rejects malformed or wrong-version payloads', () => {
    assert.equal(decodeSharedBriefFragment('#b=@@@notbase64@@@'), null);
    assert.equal(decodeSharedBriefFragment(encodeSharedBriefFragment({ v: 42, dealRows: [], summary: {} })), null);
  });

  test('builds a URL on the public route with the data in the fragment', () => {
    const compact = buildCompactSharedBrief(input());
    const url = buildSharedBriefUrl(compact, 'https://memoire.app');
    assert.ok(url.startsWith('https://memoire.app/share/brief#b='));
    assert.ok(!url.split('#')[0].includes('b='), 'no brief data in the path or query');
  });
});
