import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { fetchAllRows } from '../../src/services/supabasePaging.ts';

/**
 * PostgREST answers an unbounded select with at most `db-max-rows` rows and says
 * nothing about it - a 200 and a short array. This project's cap is 1000 and the
 * workspace holds 1,738 stakeholders, so the app showed exactly 1000 of them and
 * treated that as the whole book: 738 people absent from the coverage matrix,
 * from MISSING CHAMPION, from every count on every surface.
 */

function serverHolding(total, pageSize = 1000) {
  const requests = [];
  const rows = Array.from({ length: total }, (_, index) => ({ id: index }));
  return {
    requests,
    fetchPage(from, to) {
      requests.push([from, to]);
      return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + pageSize)), error: null });
    },
  };
}

describe('reading a collection that is larger than one page', () => {
  test('reads past the cap instead of stopping at it', async () => {
    const server = serverHolding(1738);
    const rows = await fetchAllRows(server.fetchPage);

    assert.equal(rows.length, 1738);
    assert.deepEqual(server.requests, [[0, 999], [1000, 1999]]);
  });

  test('a short first page is the only request', async () => {
    const server = serverHolding(126);
    const rows = await fetchAllRows(server.fetchPage);

    assert.equal(rows.length, 126);
    assert.equal(server.requests.length, 1);
  });

  test('an exactly-full page costs one more request rather than a guess', async () => {
    const server = serverHolding(1000);
    const rows = await fetchAllRows(server.fetchPage);

    assert.equal(rows.length, 1000);
    // 1000 rows and a 1000-row page are indistinguishable from a cap without
    // asking again. Guessing here is the original bug.
    assert.equal(server.requests.length, 2);
  });

  test('an empty collection is an empty list, not an error', async () => {
    const server = serverHolding(0);
    assert.deepEqual(await fetchAllRows(server.fetchPage), []);
  });

  test('an error on a later page fails the read rather than truncating it', async () => {
    let call = 0;
    const failOnSecond = (from, to) => {
      call += 1;
      if (call === 1) {
        return Promise.resolve({ data: Array.from({ length: to - from + 1 }, (_, i) => ({ id: i })), error: null });
      }
      return Promise.resolve({ data: null, error: { message: 'connection reset' } });
    };

    await assert.rejects(() => fetchAllRows(failOnSecond), /connection reset/);
  });

  test('a server that never returns a short page is stopped, not followed forever', async () => {
    const always = (from, to) => Promise.resolve({
      data: Array.from({ length: to - from + 1 }, (_, i) => ({ id: i })),
      error: null,
    });

    await assert.rejects(() => fetchAllRows(always, 10), /did not finish/);
  });
});
