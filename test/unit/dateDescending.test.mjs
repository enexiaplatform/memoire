import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compareBusinessDateDesc, compareSafeBusinessDate } from '../../src/utils/safeDate.ts';

const rows = [
  { name: 'older', date: '2026-03-01' },
  { name: 'broken', date: 'not a date' },
  { name: 'newest', date: '2026-08-20' },
  { name: 'empty', date: '' },
];

describe('newest first, with unreadable dates last', () => {
  test('reversing the ascending comparator puts broken dates first', () => {
    // This is the shape the bug had, kept as the reason the helper exists.
    const reversed = [...rows].sort((a, b) => compareSafeBusinessDate(b.date, a.date));
    assert.equal(reversed[0].name, 'broken');
  });

  test('the descending comparator puts the newest first', () => {
    const sorted = [...rows].sort((a, b) => compareBusinessDateDesc(a.date, b.date));
    assert.equal(sorted[0].name, 'newest');
    assert.equal(sorted[1].name, 'older');
  });

  test('unreadable dates go last, whichever way it is sorted', () => {
    const sorted = [...rows].sort((a, b) => compareBusinessDateDesc(a.date, b.date));
    const tail = sorted.slice(2).map((row) => row.name).sort();
    assert.deepEqual(tail, ['broken', 'empty']);
  });

  test('two unreadable dates are equal rather than unstable', () => {
    assert.equal(compareBusinessDateDesc('', 'nonsense'), 0);
  });

  test('a valid date always beats an unreadable one, in both argument orders', () => {
    assert.ok(compareBusinessDateDesc('2026-01-01', 'nonsense') < 0);
    assert.ok(compareBusinessDateDesc('nonsense', '2026-01-01') > 0);
  });
});
