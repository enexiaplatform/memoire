import { createClient } from '@supabase/supabase-js';
import { verifyUserToken } from './_auth.js';
import { getSupabaseAnonKey, getSupabaseUrl } from './_env.js';

interface ApiRequest {
  method?: string;
  body?: { userId?: unknown; authToken?: unknown };
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  end: () => void;
}

export type ExportResult = {
  table: string;
  ownerColumn: 'id' | 'user_id';
  data: unknown[];
  warning: string;
};

/**
 * Every table this account's data lives in.
 *
 * This list had drifted from the database in both directions, and both hurt.
 *
 * It named `deals`, a table the schema never got and no code has ever read.
 * Every cloud export therefore came back with a warning for it and a manifest
 * that said `complete: false` - on every export, for every user, since the
 * table was listed. Nothing surfaced that, so the one signal an export has for
 * "this backup is missing something" had been stuck on for months and meant
 * nothing by the time it might have mattered.
 *
 * More seriously, it had stopped at the thirteen collections that existed when
 * it was written. Ten more had shipped since, and they are not marginal: quotes,
 * expenses, order costs, order milestones, supplier commitments and outcomes are
 * the entire money side of the product. A distributor who exported their
 * workspace before changing laptops got their pipeline and none of what it cost
 * them.
 *
 * Adding a cloud collection now means adding it here. Anything owned by a user
 * and stored on the account belongs in the file they are told is their backup.
 */
export const exportTables = [
  { table: 'user_profiles', ownerColumn: 'id' },
  { table: 'usage_monthly', ownerColumn: 'user_id' },
  { table: 'sales_activities', ownerColumn: 'user_id' },
  { table: 'accounts', ownerColumn: 'user_id' },
  { table: 'opportunities', ownerColumn: 'user_id' },
  { table: 'stakeholders', ownerColumn: 'user_id' },
  { table: 'objections', ownerColumn: 'user_id' },
  { table: 'pipeline_defense_briefs', ownerColumn: 'user_id' },
  { table: 'review_packs', ownerColumn: 'user_id' },
  { table: 'sales_assets', ownerColumn: 'user_id' },
  { table: 'action_outcomes', ownerColumn: 'user_id' },
  { table: 'weekly_commitments', ownerColumn: 'user_id' },
  { table: 'plan_items', ownerColumn: 'user_id' },
  // Commercial Kernel. An export that omitted these would hand the user a
  // backup missing every promise, every thread and the whole event history -
  // which is most of what the product is for.
  { table: 'commercial_threads', ownerColumn: 'user_id' },
  { table: 'commercial_commitments', ownerColumn: 'user_id' },
  { table: 'commercial_events', ownerColumn: 'user_id' },
  { table: 'commercial_value_outcomes', ownerColumn: 'user_id' },
  // The money side. A backup of a distributor's workspace that carries what they
  // sold and not what it cost them is not a backup of their business.
  { table: 'quotes', ownerColumn: 'user_id' },
  { table: 'opportunity_outcomes', ownerColumn: 'user_id' },
  { table: 'expenses', ownerColumn: 'user_id' },
  { table: 'order_costs', ownerColumn: 'user_id' },
  { table: 'order_receivables', ownerColumn: 'user_id' },
  { table: 'order_milestones', ownerColumn: 'user_id' },
  { table: 'supplier_commitments', ownerColumn: 'user_id' },
  { table: 'commercial_targets', ownerColumn: 'user_id' },
  // What the operator wrote down themselves. The Business Vault's notes are the
  // only records here that were typed rather than derived, which makes them the
  // ones a backup can least afford to lose. This table shipped on 2026-08-09 and
  // was not added here, so every export taken since carried a `complete: true`
  // manifest over a file with no notes in it - the same drift, in the same
  // direction, that this list was already rewritten once to fix.
  { table: 'knowledge_notes', ownerColumn: 'user_id' },
  // Judgements the operator made that no other row records: which names are the
  // same customer, which nudges they have already answered, how they work.
  { table: 'account_merges', ownerColumn: 'user_id' },
  { table: 'nudges', ownerColumn: 'user_id' },
  { table: 'operating_context', ownerColumn: 'user_id' },
  { table: 'captures', ownerColumn: 'user_id' },
  { table: 'entities', ownerColumn: 'user_id' },
  { table: 'relationships', ownerColumn: 'user_id' },
  { table: 'contacts', ownerColumn: 'user_id' },
  { table: 'interactions', ownerColumn: 'user_id' },
  { table: 'actions', ownerColumn: 'user_id' },
  { table: 'activity_log', ownerColumn: 'user_id' },
] as const;

/**
 * The columns each table is paged over, where `id` is not one of them.
 *
 * Paging needs a stable total order, and almost every table here has a single
 * `id` primary key to supply it. `commercial_targets` does not: it is keyed on
 * (user_id, period, fiscal_year), so ordering it by `id` would ask PostgREST
 * for a column that does not exist, and every export would come back carrying a
 * warning for it - the same silent `complete: false` this file was already
 * burned by once.
 *
 * Within one user, (fiscal_year, period) is unique, which is what makes the
 * order total for the rows this query can see.
 */
export const exportOrderColumns: Record<string, readonly string[]> = {
  commercial_targets: ['fiscal_year', 'period'],
};

function orderColumnsFor(table: string) {
  return exportOrderColumns[table] ?? ['id'];
}

/**
 * Comfortably under any sane `db-max-rows`, matching src/services/supabasePaging.ts.
 * A stop at 100 pages allows 100,000 rows per table, far beyond anything this
 * product holds; it exists so a query that returns a full page forever fails
 * loudly instead of holding the function open until it times out.
 */
const PAGE_SIZE = 1000;
const MAX_PAGES = 100;

/**
 * Reads every row of a table, not the first thousand.
 *
 * PostgREST answers an unbounded `select` with at most `db-max-rows` rows and
 * says nothing about it: no error, no flag, a 200 and a short array. This
 * project's default is 1000, and the workspace this was measured against holds
 * 1,739 stakeholders and 1,083 accounts - so the file the user was told is
 * their backup contained exactly 1000 of each, and the manifest said
 * `complete: true` on top of it. A backup that is silently missing 739 people
 * is worse than an export that fails, because nothing about it looks wrong
 * until the day it is restored.
 *
 * The browser has fixed this since `src/services/supabasePaging.ts` was written;
 * this endpoint never got the same treatment. The logic is deliberately
 * duplicated rather than imported: `api/` is bundled separately from the app,
 * and the export must not start depending on the client bundle to be correct.
 *
 * The ordering is not decoration: paging over an unordered query is not stable,
 * and rows can be seen twice or not at all. `orderColumnsFor` supplies a total
 * order for every table.
 */
async function fetchAllRows(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<unknown[]> {
  const rows: unknown[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    // A short page is the last page. An exactly-full one is ambiguous, so it
    // costs one more request to find out - the alternative is guessing.
    if (batch.length < PAGE_SIZE) return rows;
  }

  throw new Error(
    `did not finish after ${MAX_PAGES} pages of ${PAGE_SIZE} rows; `
    + 'refusing to return a partial table as if it were the whole one',
  );
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { userId, authToken } = req.body || {};
  if (typeof userId !== 'string' || typeof authToken !== 'string') {
    return res.status(400).json({ error: 'Authentication required.' });
  }

  const user = await verifyUserToken(authToken, userId);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = createClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    { global: { headers: { Authorization: `Bearer ${authToken}` } } },
  );

  const results = await Promise.all(exportTables.map(async ({ table, ownerColumn }) => {
    try {
      return {
        table,
        ownerColumn,
        data: await fetchAllRows((from, to) => orderColumnsFor(table)
          .reduce(
            (query, column) => query.order(column, { ascending: true }),
            supabase.from(table).select('*').eq(ownerColumn, userId),
          )
          .range(from, to)),
        warning: '',
      };
    } catch (error) {
      return {
        table,
        ownerColumn,
        data: [] as unknown[],
        warning: `${table}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }));

  const contamination = findExportContamination(results, userId);
  if (contamination.length > 0) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'Export contamination guard blocked response',
      userId,
      contamination,
    }));
    return res.status(500).json({ error: 'Export failed integrity checks. Please contact support before using this export.' });
  }

  const warnings = results.map((result) => result.warning).filter(Boolean);
  const data = Object.fromEntries(results.map((result) => [result.table, result.data]));
  const manifest = {
    complete: warnings.length === 0,
    table_count: results.length,
    row_count: results.reduce((total, result) => total + result.data.length, 0),
    tables: Object.fromEntries(results.map((result) => [result.table, {
      owner_column: result.ownerColumn,
      rows: result.data.length,
      warning: result.warning || undefined,
    }])),
  };

  return res.status(200).json({
    exported_at: new Date().toISOString(),
    user_id: userId,
    manifest,
    data,
    warnings,
  });
}

export function findExportContamination(
  results: ExportResult[],
  userId: string,
) {
  return results.flatMap((result) => {
    if (result.warning) return [];
    return result.data.flatMap((row, index) => {
      if (!row || typeof row !== 'object') {
        return [{ table: result.table, index, reason: 'row_not_object' }];
      }
      const owner = (row as Record<string, unknown>)[result.ownerColumn];
      return owner === userId ? [] : [{
        table: result.table,
        index,
        ownerColumn: result.ownerColumn,
        reason: 'owner_mismatch',
      }];
    });
  });
}
