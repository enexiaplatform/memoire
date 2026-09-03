import type { CsvMappingReviewRow, OpportunityCsvPreviewRow } from './opportunityCsvImport.ts';
import { checkOpportunityIntegrity } from './recordIntegrity.ts';

/**
 * What an import assumed, and what was already wrong with the file.
 *
 * An import that reports only "142 rows imported" is telling the truth and
 * withholding the part that matters. Every import of a real book makes
 * decisions - it reads a column heading it was not told about, picks a stage
 * from a word it half recognises, defaults a currency, drops a column nothing
 * maps to - and it inherits problems that were in the file before it arrived.
 * Both sets are invisible the moment the import succeeds, and they surface
 * months later as figures nobody can explain.
 *
 * The shape is taken from a distributor's rebuilt tracking workbook, which
 * opens with two lists nobody asked it to write:
 *
 *   *Assumptions introduced during the rebuild - please confirm.* The stage
 *   ladder, the stage percentages, the dropdown contents, the worked example
 *   rows. Each one named, each one flagged as a decision rather than a fact.
 *
 *   *Known data problems carried over from the previous file.* A row where the
 *   columns had shifted, four rows converted at the wrong exchange rate, two
 *   subtotal formulas summing the wrong range, win percentages typed
 *   independently of the stage.
 *
 * That second list is the braver one and the more useful. It says: this is
 * wrong, we know, we did not silently fix it, here is where to look.
 *
 * Memoire has the specific reason to do this: a single inch mark in a product
 * name once swallowed every row beneath it and the import still reported
 * success. A receipt would have said so.
 */

export type ReceiptEntry = {
  /** One line, in the operator's words. */
  text: string;
  /** How many rows it affects. 0 for a file-level note. */
  rows: number;
};

export type ImportReceipt = {
  /** Rows that will be written. */
  accepted: number;
  /** Rows skipped as invalid or duplicate. */
  skipped: number;
  /**
   * Decisions the import made that nobody confirmed. Each is a thing that could
   * reasonably have gone another way.
   */
  assumptions: ReceiptEntry[];
  /** Faults that were in the file before it got here. Not fixed, just named. */
  problems: ReceiptEntry[];
  /** True when there is nothing to confirm and nothing to warn about. */
  clean: boolean;
};

/**
 * Builds the receipt for a deal import.
 *
 * Reads the same preview the operator is looking at, so the receipt can never
 * describe a different import from the one about to run.
 */
export function buildOpportunityImportReceipt(input: {
  rows: OpportunityCsvPreviewRow[];
  mapping: CsvMappingReviewRow[];
  /** Customers already in the workspace, for spotting deals that will land on nothing. */
  knownAccountNames: string[];
  /** Parser-level errors, e.g. a quote that never closed. */
  errors?: string[];
}): ImportReceipt {
  const valid = input.rows.filter((row) => row.isValid && !row.isDuplicate);
  const skipped = input.rows.length - valid.length;

  const assumptions: ReceiptEntry[] = [];
  const problems: ReceiptEntry[] = [];

  /*
   * Column mapping. An auto-detected column is a guess the app made about a
   * heading it was not told the meaning of, and it is the single most common
   * way an import lands the right values in the wrong field.
   */
  const autoMapped = input.mapping.filter((row) => row.confidence === 'Auto-detected' && row.mappedField);
  if (autoMapped.length > 0) {
    assumptions.push({
      text: `${autoMapped.length} column${autoMapped.length === 1 ? '' : 's'} matched by name, not by a saved mapping: ${
        autoMapped.map((row) => `"${row.csvColumn}" → ${row.mappedField}`).join(', ')
      }.`,
      rows: 0,
    });
  }

  const unmapped = input.mapping.filter((row) => !row.mappedField);
  if (unmapped.length > 0) {
    problems.push({
      // A dropped column is a problem rather than an assumption: nothing was
      // decided, something was lost, and the operator may not have noticed the
      // file had it.
      text: `${unmapped.length} column${unmapped.length === 1 ? '' : 's'} in the file reach no field and will not be imported: ${
        unmapped.map((row) => `"${row.csvColumn}"`).join(', ')
      }.`,
      rows: 0,
    });
  }

  // Per-row warnings, grouped. One line per kind of warning rather than per row:
  // ninety identical warnings is one fact about the file, not ninety findings.
  const warningCounts = new Map<string, number>();
  input.rows.forEach((row) => {
    row.warnings.forEach((warning) => warningCounts.set(warning, (warningCounts.get(warning) || 0) + 1));
  });
  [...warningCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .forEach(([warning, rows]) => {
      // A warning about a value the import chose is an assumption; one about a
      // value the file got wrong is a problem. The wording of the warning is
      // what separates them.
      const chosen = /default|assum|inferred|fell back|guessed/i.test(warning);
      (chosen ? assumptions : problems).push({ text: warning, rows });
    });

  if (skipped > 0) {
    problems.push({
      text: `${skipped} row${skipped === 1 ? '' : 's'} will not be imported — either incomplete or already in the workspace.`,
      rows: skipped,
    });
  }

  (input.errors || []).forEach((error) => problems.push({ text: error, rows: 0 }));

  /*
   * Deals whose customer does not exist yet.
   *
   * Not an error - the accounts are usually created by the same import session,
   * a few clicks later - but it is the one thing that decides whether the book
   * hangs together afterwards, so it belongs on the receipt where it can be
   * acted on rather than discovered.
   */
  const orphans = valid.filter((row) => {
    const integrity = checkOpportunityIntegrity({
      opportunity: { ...row.input, id: row.id, createdAt: '', updatedAt: '', storageMode: 'local' },
      accountNames: input.knownAccountNames,
    });
    return integrity.brokenLinks.length > 0;
  });
  if (orphans.length > 0) {
    problems.push({
      text: `${orphans.length} deal${orphans.length === 1 ? '' : 's'} name a customer with no account record. Create those accounts and every deal has a customer behind it.`,
      rows: orphans.length,
    });
  }

  return {
    accepted: valid.length,
    skipped,
    assumptions,
    problems,
    clean: assumptions.length === 0 && problems.length === 0,
  };
}

/**
 * The receipt as text, for pasting into a note or an email.
 *
 * Plain and boring on purpose: this is the thing somebody quotes back in six
 * months to work out where a number came from.
 */
export function formatImportReceipt(receipt: ImportReceipt): string {
  const lines = [`Imported ${receipt.accepted} rows, skipped ${receipt.skipped}.`];
  if (receipt.assumptions.length > 0) {
    lines.push('', 'Assumed — please confirm:');
    receipt.assumptions.forEach((entry) => {
      lines.push(`- ${entry.text}${entry.rows > 0 ? ` (${entry.rows} rows)` : ''}`);
    });
  }
  if (receipt.problems.length > 0) {
    lines.push('', 'Problems in the file — named, not fixed:');
    receipt.problems.forEach((entry) => {
      lines.push(`- ${entry.text}${entry.rows > 0 ? ` (${entry.rows} rows)` : ''}`);
    });
  }
  if (receipt.clean) lines.push('', 'Nothing was assumed and nothing looked wrong.');
  return lines.join('\n');
}
