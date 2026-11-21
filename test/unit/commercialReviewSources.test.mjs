import assert from 'node:assert/strict';
import { test } from 'node:test';
import { indexCommercialReviewSources, resolveCommercialReviewSources } from '../../src/features/threads/commercialReviewSources.ts';

test('review evidence keeps kernel citation order with current-workspace labels and an ID fallback', () => {
  const sources = indexCommercialReviewSources({
    opportunities: [{ id: 'deal', opportunityName: ' Renew contract ' }],
    quotes: [{ id: 'quote', title: '', quoteId: 'Q-42' }],
  }, [{ id: 'thread', title: 'Renewal conversation' }], [{ id: 'commitment', commitmentText: 'Send the terms' }], false);

  assert.deepEqual(resolveCommercialReviewSources(['commitment', 'missing', 'quote', 'deal', 'thread', 'quote'], sources), [
    { id: 'commitment', label: 'Commitment · Send the terms' },
    { id: 'missing', label: null },
    { id: 'quote', label: 'Quote · Q-42' },
    { id: 'deal', label: 'Opportunity · Renew contract' },
    { id: 'thread', label: 'Commercial thread · Renewal conversation' },
  ]);
  assert.deepEqual(resolveCommercialReviewSources(['deal']), [{ id: 'deal', label: null }]);
});

test('foreign, sample and ambiguous labels do not carry over between evidence snapshots', () => {
  const prior = indexCommercialReviewSources({
    opportunities: [{ id: 'deal', opportunityName: 'Prior workspace' }], quotes: [],
  }, [], [], false);
  const current = indexCommercialReviewSources({
    opportunities: [
      { id: 'deal', opportunityName: 'Demo deal', source: 'demo' },
      { id: 'collision', opportunityName: 'Ambiguous deal' },
    ],
    quotes: [{ id: 'collision', title: 'Ambiguous quote' }],
  }, [], [], false);

  assert.equal(prior.get('deal'), 'Opportunity · Prior workspace');
  assert.deepEqual(resolveCommercialReviewSources(['deal', 'collision'], current), [
    { id: 'deal', label: null },
    { id: 'collision', label: null },
  ]);
});
