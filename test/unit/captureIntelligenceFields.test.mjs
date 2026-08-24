import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractBuyingSignals,
  extractCompetitors,
  extractTimelineSignals,
} from '../../src/utils/salesActivityClassifier.ts';
import { classifySalesActivity } from '../../src/utils/salesActivityClassifier.ts';

describe('a rival named by their position, not by the word competitor', () => {
  test('the incumbent', () => {
    // The field's own placeholder reads "e.g. Incumbent Vendor" and this
    // recorded nobody.
    assert.deepEqual(extractCompetitors('Schneider is the incumbent on controls.'), ['Schneider']);
    assert.deepEqual(extractCompetitors('The incumbent supplier is Veolia.'), ['Veolia']);
  });

  test('who else the customer is talking to', () => {
    assert.deepEqual(extractCompetitors('They are also talking to Veolia about the same scope.'), ['Veolia']);
  });

  test('the phrasings that already worked still work', () => {
    assert.deepEqual(extractCompetitors('We are up against Veolia.'), ['Veolia']);
    assert.deepEqual(extractCompetitors('Competing against Baxi on this one.'), ['Baxi']);
  });

  test('a lowercase noun is still not a company', () => {
    // The old bug: /i made the leading [A-Z] meaningless and this recorded a
    // competitor called "the".
    assert.deepEqual(extractCompetitors('Our lead time is 10 weeks versus the local supplier.'), []);
    assert.deepEqual(extractCompetitors('Met the buyer today, nothing new.'), []);
  });
});

describe('the customer saying yes before the money moves', () => {
  test('approved in principle', () => {
    assert.ok(extractBuyingSignals('They approved the LED and HVAC controls programme in principle.')
      .includes('Approved in principle'));
  });

  test('a board that has approved', () => {
    assert.ok(extractBuyingSignals('The board approved it last week.').includes('Approved in principle'));
  });

  test('technically agreed', () => {
    assert.ok(extractBuyingSignals('The waste heat scheme is technically agreed.').includes('Technical approval'));
  });

  test('shortlisted', () => {
    assert.ok(extractBuyingSignals('We are shortlisted for the three Mallorca resorts.').includes('Shortlisted'));
  });

  test('an ordinary note claims no signal', () => {
    assert.deepEqual(extractBuyingSignals('Had a coffee and walked the site.'), []);
  });
});

describe('when they say they will decide', () => {
  test('a decision date', () => {
    assert.ok(extractTimelineSignals('Their board decides on 2 September.')
      .some((signal) => signal.startsWith('Decision')));
  });

  test('a deal deliberately parked', () => {
    // Not neglect - a plan, and the note was the only place it was written.
    assert.ok(extractTimelineSignals('Nothing moves until September because the line runs flat out.')
      .some((signal) => signal.startsWith('Parked until')));
  });
});

describe('what the customer is unhappy about', () => {
  test('a stated concern is a risk', () => {
    const result = classifySalesActivity('They are worried about VAT treatment.', '2026-06-02', {});
    assert.ok(result.risks.includes('Stated concern from the customer'));
  });

  test('a blocker written in plain words', () => {
    const result = classifySalesActivity('No contract vehicle agreed and no budget line yet.', '2026-08-19', {});
    assert.ok(result.risks.includes('Named blocker still open'));
  });

  test('a clean note carries no risk', () => {
    const result = classifySalesActivity('Good call, everything on track.', '2026-08-19', {});
    assert.deepEqual(result.risks, []);
  });
});
