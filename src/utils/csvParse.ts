/**
 * One CSV reader, because there were three and all three were wrong the same way.
 *
 * `opportunityCsvImport.ts`, `accountCsvImport.ts` and
 * `importPipelineDefenseBrief.ts` each carried a copy. The account one even said
 * why: "Duplicated here rather than shared because the opportunity module keeps
 * it private, and reaching into it to export a helper would tie two import paths
 * together that should be free to diverge." They did not diverge. They shared a
 * bug instead, and nobody could fix it once.
 *
 * **The bug: a quote was treated as a delimiter wherever it appeared.**
 *
 *     if (char === '"') { inQuotes = !inQuotes; continue; }
 *
 * In real CSV a double quote only opens a field at the *start* of that field.
 * Anywhere else it is an ordinary character - and the character an industrial
 * distributor writes constantly, because it means inches. `5" butterfly valve`
 * is a product name, not a syntax error.
 *
 * Measured against the old parser, this file:
 *
 *     Account,Opportunity,Amount,Currency
 *     Truong Son,5" butterfly valve,85000,EUR
 *     Beinco,Standard pump,42000,EUR
 *
 * produced exactly one row. The stray quote opened a quoted field that never
 * closed, so every comma and every newline after it became data: the deal name
 * came out as `5 butterfly valve,85000,EUR\nBeinco,Standard pump,42000,EUR`, the
 * 85,000 EUR was lost, the currency fell back to the workspace default, and the
 * second customer disappeared from the import entirely. The row was marked
 * `isValid: true` and the parse returned no errors and no warnings.
 *
 * That is the shape that matters. It is not that the import fails - it is that
 * the import succeeds, quietly, with fewer customers than the file had, on the
 * first thing a paying customer does with this product. One inch mark anywhere
 * in a two-hundred-row export swallows every row beneath it.
 *
 * The rules here are RFC 4180 with the leniency real exports need:
 *
 *   - A quote opens a field only when the field is still empty.
 *   - Inside a quoted field, `""` is a literal quote and a lone `"` closes it.
 *   - Anywhere else a quote is just a character.
 *   - CR, LF and CRLF all end a row; a newline inside quotes does not.
 */

/** Splits a whole CSV document into rows of raw, untrimmed cells. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;
  // Whether the field being built was opened with a quote. A closing quote must
  // not let a later stray one re-open it: `"a" b " c` is one field, not two.
  let fieldWasQuoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes) {
        if (next === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else if (current.trim() === '' && !fieldWasQuoted) {
        // Whitespace before the quote, not content: `a, "b, c"` is three
        // characters of padding around a quoted field, which hand-edited and
        // pretty-printed exports both produce. Strict RFC 4180 would call that
        // an unquoted field starting with a space; being lenient here cannot
        // resurrect the inch-mark bug, because `5"` has a digit in front of it.
        current = '';
        inQuotes = true;
        fieldWasQuoted = true;
      } else {
        // Mid-field, or after this field's quoted part already closed. This is
        // the inch mark, and it is content.
        current += '"';
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
      fieldWasQuoted = false;
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(current);
      rows.push(row);
      row = [];
      current = '';
      fieldWasQuoted = false;
      continue;
    }

    current += char;
  }

  row.push(current);
  rows.push(row);
  return rows.filter((cells) => cells.length > 0);
}

/**
 * One line's worth, with each value trimmed.
 *
 * Kept separate because its caller pastes a single line at a time and wants the
 * whitespace gone; it must not be built on `text.split('\n')`, which is the
 * other half of the same class of bug.
 */
export function splitCsvLine(line: string): string[] {
  const [cells] = parseCsvRows(line);
  return (cells || ['']).map((value) => value.trim());
}
