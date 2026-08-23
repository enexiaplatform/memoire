import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { resolveCaptureEntities } from '../../src/utils/captureEntityResolution.ts';

// A customer Enexia has sold to twice: one heat recovery job delivered in
// March, one heat recovery proposal still live. Both carry the same product
// line, which is what made the old rule pick the wrong one.
const PESTANA = [
  {
    id: 'opp-madeira',
    accountName: 'Grupo Pestana Hoteis',
    opportunityName: 'Laundry heat recovery - Madeira',
    productOrSolution: 'Heat recovery',
    stage: 'Won',
  },
  {
    id: 'opp-algarve',
    accountName: 'Grupo Pestana Hoteis',
    opportunityName: 'Heat recovery retrofit - 6 hotels Algarve',
    productOrSolution: 'Heat recovery + solar thermal',
    stage: 'Proposal',
  },
];

const LACTOGAL = [
  {
    id: 'opp-cip',
    accountName: 'Lactogal',
    opportunityName: 'CIP water reuse study',
    productOrSolution: 'Water reuse study',
    stage: 'Won',
  },
  {
    id: 'opp-vsd',
    accountName: 'Lactogal',
    opportunityName: 'VSD retrofit - Modivas dairy line 3',
    productOrSolution: 'Variable speed drives',
    stage: 'Negotiation',
  },
];

const resolve = (rawNote, opportunities) => resolveCaptureEntities({
  rawNote,
  accounts: [],
  opportunities,
});

describe('a note about a customer you have sold to twice lands on the live deal', () => {
  test('the delivered job does not take a note about the open proposal', () => {
    // The exact note that failed: it repeats the delivered job's product line
    // ("heat recovery") but the only deal it actually names is the live one,
    // by the word "Algarve". The old rule ranked on title length and never
    // looked at whether a deal was finished, so the March job won and the
    // 286,000 EUR proposal stayed on nought touches.
    const result = resolve(
      'Site visit at Grupo Pestana Hoteis in Lisboa. They want heat recovery across 6 Algarve hotels.',
      PESTANA,
    );
    assert.equal(result.opportunityName, 'Heat recovery retrofit - 6 hotels Algarve');
    assert.equal(result.suggestedOpportunityId, 'opp-algarve');
  });

  test('a word the note never uses cannot carry the link', () => {
    const result = resolve(
      'Call with Grupo Pestana Hoteis. They want the Algarve rollout split into two phases of three hotels.',
      PESTANA,
    );
    assert.equal(result.suggestedOpportunityId, 'opp-algarve');
  });

  test('a closed deal still wins when the note is plainly about it', () => {
    // The other half of the rule. Repeat business starts with a conversation
    // about the job you already did, and that note has to reach it.
    const result = resolve(
      'Lactogal called: the CIP water reuse study is finished and they want the same at Vila do Conde.',
      LACTOGAL,
    );
    assert.equal(result.suggestedOpportunityId, 'opp-cip');
  });

  test('the live deal wins on its own distinctive words', () => {
    const result = resolve(
      'Lactogal procurement pushed back on retention for the Modivas line.',
      LACTOGAL,
    );
    assert.equal(result.suggestedOpportunityId, 'opp-vsd');
  });

  test('a note naming nothing distinctive links to nothing', () => {
    const result = resolve('Quick catch-up call, nothing new to report.', PESTANA);
    assert.equal(result.opportunityName, '');
  });
});
