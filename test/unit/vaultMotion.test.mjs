import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  FADING_DAYS,
  FRESH_DAYS,
  MOTION_RING_LIMIT,
  edgeMotionFor,
  memoryAgeFor,
  memoryAgeLabels,
  memoryAgeOpacity,
  motionLegend,
  nodeMotionFor,
} from '../../src/utils/vaultMotion.ts';

const TODAY = '2026-08-25';

describe('how old the map says a memory is', () => {
  test('a touch this week is fresh', () => {
    assert.equal(memoryAgeFor('2026-08-20', TODAY), 'fresh');
    assert.equal(memoryAgeFor(`2026-08-${25 - FRESH_DAYS}`, TODAY), 'fresh');
  });

  test('the bands run in order and do not overlap', () => {
    assert.equal(memoryAgeFor('2026-07-25', TODAY), 'settling');
    assert.equal(memoryAgeFor('2026-06-01', TODAY), 'fading');
    assert.equal(memoryAgeFor('2026-01-01', TODAY), 'cold');
  });

  test('a date in the future is a touch, not an error', () => {
    // Booking next week's site visit is contact with that customer today.
    assert.equal(memoryAgeFor('2026-09-10', TODAY), 'fresh');
  });

  test('an unreadable date is not drawn as the coldest thing on the map', () => {
    // "No readable date" is not "nobody has touched this since March", and
    // fading it would state something the record does not support.
    assert.equal(memoryAgeFor('not a date', TODAY), 'undated');
    assert.equal(memoryAgeFor('', TODAY), 'undated');
    assert.equal(memoryAgeFor(undefined, TODAY), 'undated');
    assert.equal(memoryAgeOpacity.undated, 1);
    assert.ok(memoryAgeOpacity.cold < memoryAgeOpacity.undated);
  });

  test('every band says what it means in words', () => {
    for (const band of ['fresh', 'settling', 'fading', 'cold', 'undated']) {
      assert.ok(memoryAgeLabels[band], `${band} needs a spoken label`);
    }
    assert.match(memoryAgeLabels.undated, /no readable date/i);
  });

  test('the faintest band is still readable', () => {
    // Decay that fades a card to nothing hides the record it is warning about.
    assert.ok(memoryAgeOpacity.cold >= 0.5, 'a cold card must still be legible');
  });

  test('the bands are ordered by how faded they are', () => {
    assert.ok(memoryAgeOpacity.fresh > memoryAgeOpacity.settling);
    assert.ok(memoryAgeOpacity.settling > memoryAgeOpacity.fading);
    assert.ok(memoryAgeOpacity.fading > memoryAgeOpacity.cold);
    assert.ok(FRESH_DAYS < FADING_DAYS);
  });
});

describe('what the marks on a card say', () => {
  test('completeness is the count, not a guess', () => {
    const motion = nodeMotionFor({ updatedAt: TODAY, ring: 0 }, { known: 1, total: 11 }, TODAY);
    assert.equal(motion.known, 1);
    assert.equal(motion.total, 11);
    assert.ok(Math.abs(motion.completeness - 1 / 11) < 1e-9);
  });

  test('a node the graph has not measured draws nothing', () => {
    // An empty row of marks would say "nothing known", which is a different
    // claim from "not measured".
    const motion = nodeMotionFor({ updatedAt: TODAY, ring: 0 }, undefined, TODAY);
    assert.equal(motion.total, 0);
    assert.equal(motion.searching, false);
  });

  test('a complete file stops asking', () => {
    const motion = nodeMotionFor({ updatedAt: TODAY, ring: 0 }, { known: 9, total: 9 }, TODAY);
    assert.equal(motion.completeness, 1);
    assert.equal(motion.searching, false);
  });

  test('only cards near the focus animate', () => {
    // Forty things breathing at once is a fairground, and the signal is gone.
    const near = nodeMotionFor({ updatedAt: TODAY, ring: MOTION_RING_LIMIT }, { known: 1, total: 9 }, TODAY);
    const far = nodeMotionFor({ updatedAt: TODAY, ring: MOTION_RING_LIMIT + 1 }, { known: 1, total: 9 }, TODAY);
    assert.equal(near.searching, true);
    assert.equal(far.searching, false);
  });

  test('the focus animates however far out the layout put it', () => {
    const focus = nodeMotionFor({ updatedAt: TODAY, ring: 5, focused: true }, { known: 1, total: 9 }, TODAY);
    assert.equal(focus.searching, true);
  });
});

describe('which relations are drawn as live', () => {
  test('only relations touching the focus flow', () => {
    assert.equal(edgeMotionFor({ primary: false, valueBase: 900_000 }).flowing, false);
    assert.equal(edgeMotionFor({ primary: true, valueBase: 0 }).flowing, true);
  });

  test('money makes a relation faster, and it has to be real money', () => {
    const withMoney = edgeMotionFor({ primary: true, valueBase: 554_300 });
    const without = edgeMotionFor({ primary: true, valueBase: 0 });
    assert.equal(withMoney.carriesValue, true);
    assert.equal(without.carriesValue, false);
    assert.ok(withMoney.duration < without.duration, 'money-carrying relations run faster');
  });

  test('an unlinked relation cannot carry money', () => {
    assert.equal(edgeMotionFor({ primary: false, valueBase: 554_300 }).carriesValue, false);
  });
});

describe('the legend', () => {
  test('every motion on the map is written down', () => {
    // A motion the reader cannot decode is decoration wearing a lab coat.
    const ids = motionLegend.map((entry) => entry.id);
    for (const required of ['marks', 'breathing', 'fade', 'flow']) {
      assert.ok(ids.includes(required), `${required} must be explained in the legend`);
    }
    for (const entry of motionLegend) {
      assert.ok(entry.title.length > 0 && entry.meaning.length > 0);
    }
  });
});
