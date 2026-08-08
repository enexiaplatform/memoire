/**
 * Reads every row of a query, not the first thousand.
 *
 * PostgREST answers an unbounded `select` with at most `db-max-rows` rows and
 * says nothing about it - no error, no flag, a 200 and a short array. This
 * project's default is 1000, and the workspace it was measured against holds
 * 1,738 stakeholders and 1,086 accounts. So the app showed exactly 1000
 * stakeholders and treated that as the whole book: 738 people silently absent
 * from the coverage matrix, from MISSING CHAMPION, from every count on every
 * surface. A cap that arrives as a successful response is worse than a failure,
 * because nothing downstream can tell.
 *
 * The fix is to keep asking. `range(from, to)` is inclusive on both ends, and a
 * page shorter than the page size is the last one.
 */

/** Comfortably under any sane `db-max-rows`, and few enough round trips to not matter. */
const PAGE_SIZE = 1000;

/**
 * A stop the loop cannot run past. At 1000 rows a page this allows 100,000 rows
 * per collection, which is far beyond anything this product holds; it exists so
 * that a query returning a full page forever - a server misconfiguration, a
 * range header stripped by a proxy - fails loudly instead of hanging the tab.
 */
const MAX_PAGES = 100;

type PageResult<Row> = { data: Row[] | null; error: { message: string } | null };

/**
 * `fetchPage` is handed the inclusive row range to read and returns whatever the
 * query builder produced. Callers pass a closure so the whole query - columns,
 * filters, ordering - stays in one place at the call site.
 *
 * The ordering matters and is the caller's job: paging over an unordered query
 * is not stable, and rows can be seen twice or not at all. Every caller here
 * already ordered by `updated_at`, which is enough.
 */
export async function fetchAllRows<Row>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<Row>>,
  pageSize = PAGE_SIZE,
): Promise<Row[]> {
  const rows: Row[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * pageSize;
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);

    const batch = data || [];
    rows.push(...batch);
    // A short page is the last page. An exactly-full one is ambiguous, so it
    // costs one more request to find out - the alternative is guessing.
    if (batch.length < pageSize) return rows;
  }

  throw new Error(
    `Reading this collection did not finish after ${MAX_PAGES} pages of ${pageSize}. `
    + 'Refusing to keep going rather than show a partial list as if it were complete.',
  );
}
