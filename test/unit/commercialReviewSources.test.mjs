import assert from 'node:assert/strict';
import { test } from 'node:test';
import { indexCommercialReviewSources, resolveCommercialReviewSources } from '../../src/features/threads/commercialReviewSources.ts';

const auxiliarySources = { evidence: [], conditions: [], requirements: [], dependencies: [], timing: [] };

test('review evidence keeps kernel citation order and distinguishes unavailable citations', () => {
  const sources = indexCommercialReviewSources({
    ...auxiliarySources,
    opportunities: [{ id: 'deal', opportunityName: ' Renew contract ' }],
    quotes: [{ id: 'quote', title: '', quoteId: 'Q-42' }],
  }, [{ id: 'thread', title: 'Renewal conversation' }], [{ id: 'commitment', commitmentText: 'Send the terms' }], false);

  assert.deepEqual(resolveCommercialReviewSources(['commitment', 'missing', 'quote', 'deal', 'thread', 'quote'], sources), [
    { id: 'commitment', status: 'available', label: 'Commitment · Send the terms' },
    { id: 'missing', status: 'unavailable' },
    { id: 'quote', status: 'available', label: 'Quote · Q-42' },
    { id: 'deal', status: 'available', label: 'Opportunity · Renew contract' },
    { id: 'thread', status: 'available', label: 'Commercial thread · Renewal conversation' },
  ]);
  assert.deepEqual(resolveCommercialReviewSources(['deal']), [{ id: 'deal', status: 'unavailable' }]);
});

test('foreign, sample and ambiguous labels do not carry over between evidence snapshots', () => {
  const prior = indexCommercialReviewSources({
    ...auxiliarySources,
    opportunities: [{ id: 'deal', opportunityName: 'Prior workspace' }], quotes: [],
  }, [], [], false);
  const current = indexCommercialReviewSources({
    ...auxiliarySources,
    opportunities: [
      { id: 'deal', opportunityName: 'Demo deal', source: 'demo' },
      { id: 'collision', opportunityName: 'Ambiguous deal' },
    ],
    quotes: [{ id: 'collision', title: 'Ambiguous quote' }],
  }, [], [], false);

  assert.equal(prior.get('deal'), 'Opportunity · Prior workspace');
  assert.deepEqual(resolveCommercialReviewSources(['deal', 'collision'], current), [
    { id: 'deal', status: 'unavailable' },
    { id: 'collision', status: 'conflicting' },
  ]);
});
