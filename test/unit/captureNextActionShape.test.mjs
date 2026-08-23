import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { extractNextActions } from '../../src/utils/salesActivityClassifier.ts';

const ANCHOR = '2026-04-14';

describe('a promise reaches the Plan saying what was promised', () => {
  test('a compound promise keeps the half that carries the work', () => {
    // This reached Today as a commitment called "Send". Six weeks later the
    // operator has no way to know what they owed.
    const actions = extractNextActions(
      'Need to reprice as two phases of three hotels and send by 20 April.',
      ANCHOR,
    );
    assert.equal(actions.length, 1);
    assert.equal(actions[0].title, 'Reprice as two phases of three hotels');
    assert.equal(actions[0].dueDate, '2026-04-20');
  });

  test('a verb the list has never heard of is still a promise when it is cued', () => {
    const actions = extractNextActions('Next action: answer the procurement questionnaire.', ANCHOR);
    assert.equal(actions[0].title, 'Answer the procurement questionnaire');
  });

  test('a lone bare verb keeps its date rather than becoming a word', () => {
    const actions = extractNextActions('Send by 20 April.', ANCHOR);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].dueDate, '2026-04-20');
  });

  test('two real promises both survive', () => {
    const actions = extractNextActions(
      'Need to confirm the audit dates and share the two reference cases.',
      ANCHOR,
    );
    assert.equal(actions.length, 2);
    assert.deepEqual(actions.map((action) => action.title), [
      'Confirm the audit dates',
      'Share the two reference cases',
    ]);
  });

  test('a note with no cue still finds the promise by its verb', () => {
    const actions = extractNextActions('Good call. Send the phasing plan by 18 May.', '2026-05-11');
    assert.equal(actions[0].title, 'Send the phasing plan');
    assert.equal(actions[0].dueDate, '2026-05-18');
  });

  test('a negated verb is still not a promise', () => {
    assert.equal(extractNextActions('No reply yet from their side.', ANCHOR).length, 0);
  });
});

describe('a note about what already happened is not a promise about it', () => {
  test('the opening sentence of a write-up does not become the next step', () => {
    // "Intro call with Sodexo France in Issy-les-Moulineaux" arrived on Today
    // as a commitment to make a call that had already been made.
    const actions = extractNextActions(
      'Intro call with Sodexo France in Issy-les-Moulineaux. The regional director wants a pilot site. Agree the pilot scope by 15 September.',
      '2026-08-19',
    );
    assert.deepEqual(actions.map((action) => action.title), ['Agree the pilot scope']);
    assert.equal(actions[0].dueDate, '2026-09-15');
  });

  test('a verb inside a compliment is not a commitment', () => {
    assert.deepEqual(extractNextActions('Good call today, nothing outstanding.', ANCHOR), []);
  });

  test('a promise behind "I will" is still a promise', () => {
    const actions = extractNextActions('They asked about lead times. I will send the schedule by 30 April.', ANCHOR);
    assert.equal(actions[0].title, 'Send the schedule');
    assert.equal(actions[0].dueDate, '2026-04-30');
  });
});
