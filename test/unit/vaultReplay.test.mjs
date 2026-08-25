import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  REPLAY_MIN_MOMENTS,
  buildReplayTimeline,
  boardMoments,
  canReplay,
  replayLabel,
  revealedAt,
} from '../../src/utils/vaultReplay.ts';

const TODAY = '2026-08-25';

const memory = new Map([
  ['a', [{ date: '2026-03-04' }, { date: '2026-07-11' }]],
  ['b', [{ date: '2026-05-20' }]],
  ['c', [{ date: '2026-07-11' }]],
  ['undatedOne', [{ date: 'whenever' }]],
  ['noMemory', []],
]);
const ids = ['a', 'b', 'c', 'undatedOne', 'noMemory'];

describe('when each thing entered your memory', () => {
  test('a node is first seen at its earliest dated memory, not its latest', () => {
    const timeline = buildReplayTimeline(memory, ids, TODAY);
    assert.equal(timeline.firstSeen.get('a'), '2026-03-04');
  });

  test('two things learned the same day are one moment', () => {
    // The story is the days something was learned, not the calendar between.
    const timeline = buildReplayTimeline(memory, ids, TODAY);
    assert.deepEqual(timeline.steps, ['2026-03-04', '2026-05-20', '2026-07-11']);
  });

  test('nothing dated behind it is held constant, not guessed into place', () => {
    // A record with no readable date is not from the beginning of time, and it
    // is not from today either.
    const timeline = buildReplayTimeline(memory, ids, TODAY);
    assert.deepEqual(timeline.undated.sort(), ['noMemory', 'undatedOne']);
    assert.ok(!timeline.firstSeen.has('undatedOne'));
  });

  test('the scrubber reaches a record dated ahead of today', () => {
    const ahead = new Map([['x', [{ date: '2026-09-30' }]], ['y', [{ date: '2026-01-02' }]]]);
    const timeline = buildReplayTimeline(ahead, ['x', 'y'], TODAY);
    assert.equal(timeline.end, '2026-09-30');
  });

  test('an empty book produces an empty story rather than throwing', () => {
    const timeline = buildReplayTimeline(new Map(), [], TODAY);
    assert.deepEqual(timeline.steps, []);
    assert.equal(timeline.start, '');
    assert.equal(canReplay(timeline), false);
  });
});

describe('what exists yet, at a point in the replay', () => {
  const timeline = buildReplayTimeline(memory, ids, TODAY);

  test('the first frame holds only what was known then', () => {
    const revealed = revealedAt(timeline, '2026-03-04');
    assert.ok(revealed.has('a'));
    assert.ok(!revealed.has('b'));
    assert.ok(!revealed.has('c'));
  });

  test('the undated are present throughout', () => {
    const first = revealedAt(timeline, '2026-03-04');
    const last = revealedAt(timeline, '2026-07-11');
    for (const set of [first, last]) {
      assert.ok(set.has('undatedOne'));
      assert.ok(set.has('noMemory'));
    }
  });

  test('the last frame holds everything', () => {
    const revealed = revealedAt(timeline, '2026-07-11');
    for (const id of ids) assert.ok(revealed.has(id), `${id} must be revealed by the end`);
  });

  test('the label counts moments, not days', () => {
    assert.match(replayLabel(timeline, '2026-05-20'), /^2 of 3 moments$/);
  });
});

describe('when a replay is worth offering', () => {
  test('a book that arrived on one day has no story to play', () => {
    // An imported pipeline carries the import date on every record; a replay of
    // it is a single frame that reveals everything and says nothing.
    const imported = new Map([
      ['a', [{ date: '2026-08-23' }]],
      ['b', [{ date: '2026-08-23' }]],
      ['c', [{ date: '2026-08-24' }]],
    ]);
    const timeline = buildReplayTimeline(imported, ['a', 'b', 'c'], TODAY);
    assert.equal(timeline.steps.length, 2);
    assert.equal(canReplay(timeline), false);
  });

  test('a book built over months does', () => {
    const captured = new Map(
      ['2026-03-04', '2026-04-15', '2026-05-20', '2026-06-02', '2026-07-11']
        .map((date, index) => [`n${index}`, [{ date }]]),
    );
    const timeline = buildReplayTimeline(captured, [...captured.keys()], TODAY);
    assert.ok(timeline.steps.length >= REPLAY_MIN_MOMENTS);
    assert.equal(canReplay(timeline), true);
  });
});

describe('the gate asks about the board, not the workspace', () => {
  test('a workspace with dates but a board without them is refused', () => {
    // Ten distinct dates existed on the book this was built against - from
    // captured activity - while the cards the board draws were almost all
    // stamped with the import date. The replay opened on six cards and held
    // them for nine of its ten frames.
    const spread = new Map(
      ['2026-03-04', '2026-04-15', '2026-05-20', '2026-06-02', '2026-07-11']
        .map((date, index) => [`elsewhere-${index}`, [{ date }]]),
    );
    spread.set('board-a', [{ date: '2026-08-23' }]);
    spread.set('board-b', [{ date: '2026-08-23' }]);
    const timeline = buildReplayTimeline(spread, [...spread.keys()], TODAY);
    assert.ok(canReplay(timeline), 'the workspace itself has enough moments');
    assert.equal(boardMoments(timeline, ['board-a', 'board-b']), 1);
    assert.equal(canReplay(timeline, ['board-a', 'board-b']), false, 'but this board never changes');
  });

  test('a board that does change is offered', () => {
    const spread = new Map(
      ['2026-03-04', '2026-04-15', '2026-05-20', '2026-06-02', '2026-07-11']
        .map((date, index) => [`n${index}`, [{ date }]]),
    );
    const timeline = buildReplayTimeline(spread, [...spread.keys()], TODAY);
    assert.equal(canReplay(timeline, [...spread.keys()]), true);
  });
});
