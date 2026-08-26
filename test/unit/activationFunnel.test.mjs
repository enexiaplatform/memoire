import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVATION_EVENTS, ACTIVATION_OF } from '../../src/utils/activationEvents.ts';
import { buildFirstWeekPath } from '../../src/utils/firstWeekPath.ts';

/**
 * The onboarding path can be measured at every step.
 *
 * The taxonomy declared five activation events, one per step of
 * `buildFirstWeekPath` - the single path the welcome screen, the strip on Today
 * and the corner coach all read from. A contract checked that all three copies
 * of the taxonomy agreed with each other. Nothing checked that any event was
 * ever *sent*, and three of the five never were: `first_capture_saved`,
 * `first_thread_linked` and `first_review_completed` had no emitter anywhere in
 * the app.
 *
 * So the product could report how many people kept a promise, and could not
 * report how many had ever captured anything - step one, and the step every
 * later step is conditional on. Onboarding nobody can measure is onboarding
 * nobody can fix, which is what makes this a launch defect rather than a
 * reporting one.
 *
 * `scripts/verify-product-analytics-contract.mjs` proves each of the five has a
 * real emitter in `src/`. What is left for here is the shape of the pairing
 * itself, which is pure data and is the part that will drift when somebody adds
 * a sixth step.
 */

describe('every step of the first week has an event behind it', () => {
  const steps = buildFirstWeekPath({ activities: [], opportunities: [], briefs: [] }).steps.map((step) => step.id);

  test('the path is still the five steps these events were written for', () => {
    assert.deepEqual(steps, ['capture', 'link', 'commit', 'close', 'review']);
  });

  test('one activation event per step, and no spare ones', () => {
    assert.equal(
      ACTIVATION_EVENTS.length,
      steps.length,
      'a step was added or removed without an event to measure it - the funnel would report a rate over the wrong denominator',
    );
  });

  test('the four steps a core event can prove are paired', () => {
    assert.deepEqual(Object.entries(ACTIVATION_OF).sort(), [
      ['capture_saved', 'first_capture_saved'],
      ['commitment_completed', 'first_commitment_completed'],
      ['commitment_created', 'first_commitment_created'],
      ['review_completed', 'first_review_completed'],
    ]);
  });

  test('every paired value is one of the five, and step 2 is the only unpaired one', () => {
    const paired = new Set(Object.values(ACTIVATION_OF));
    for (const event of paired) {
      assert.ok(ACTIVATION_EVENTS.includes(event), `${event} is paired but is not an activation event`);
    }
    const unpaired = ACTIVATION_EVENTS.filter((event) => !paired.has(event));
    assert.deepEqual(
      unpaired,
      ['first_thread_linked'],
      'linking is written by five call sites across three pages, so it is emitted from the activity store rather than paired to a core event',
    );
  });

  test('the pairing cannot recurse', () => {
    // Recording an event fires its pair once. A first_* that was itself a key
    // would fire a pair of its own, and so on.
    for (const event of ACTIVATION_EVENTS) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(ACTIVATION_OF, event),
        false,
        `${event} is an activation event and must never also be a trigger`,
      );
    }
  });

  test('no core event claims two activation events', () => {
    const values = Object.values(ACTIVATION_OF);
    assert.equal(new Set(values).size, values.length, 'two triggers share one activation event, so the count would double');
  });
});
