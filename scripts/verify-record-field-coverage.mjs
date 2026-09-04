import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * Every reader that rebuilds a record field by field must write every field the
 * record's type declares.
 *
 * This is the most expensive bug shape in the codebase and it has now happened
 * four times in one year, always the same way: a field is added to a type, the
 * compiler is satisfied because the field is optional, and a hand-written
 * `return { ... }` somewhere silently drops it on every read or write.
 *
 *   - `loadLocalOpportunities` dropped brand, probability and the quarter
 *     split, so the order book saw no committed deals and the brand rollup saw
 *     no brands.
 *   - It then dropped `closedOn`, so Review counted deals from three different
 *     months as "closed this week" and the order book dated a year's business
 *     at the import.
 *   - `sanitizePlanRecord` dropped the activity channel: it saved, survived one
 *     render, and was gone after a reload.
 *   - `sanitizeQuote` and the account-merge sanitizer dropped `__deleted`,
 *     which seven engines read.
 *
 * Nothing in `npm run check` caught any of them. TypeScript cannot: every one
 * of those fields is legitimately optional, so omitting it is a valid object.
 * This is the check that can.
 *
 * It is deliberately a *coverage* test, not a behaviour test. It does not care
 * what a reader does with a field, only that it does not forget it exists.
 */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/**
 * The fields declared on a type or interface body.
 *
 * Reads only top-level members - two spaces of indent - so nested object types
 * inside a field do not leak in as fields of their own.
 */
function declaredFields(source, typeName) {
  const header = new RegExp(`(?:export )?(?:type|interface) ${typeName}\\b[^{]*\\{`).exec(source);
  assert.ok(header, `could not find the declaration of ${typeName}`);

  const start = header.index + header[0].length - 1;
  let depth = 0;
  let end = -1;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  assert.ok(end > start, `could not read the body of ${typeName}`);
  return [...source.slice(start, end).matchAll(/^ {2}([A-Za-z_][\w]*)\??\s*:/gm)].map((m) => m[1]);
}

/**
 * The keys assigned in the `return { ... }` that follows a function.
 *
 * Counts shorthand (`kind,`) as well as `key: value`, because both are ways of
 * carrying a field through and only one of them was being spotted by hand.
 */
function returnedKeys(source, functionName) {
  const at = source.indexOf(`function ${functionName}`);
  assert.ok(at >= 0, `could not find ${functionName}`);

  const after = source.slice(at);
  const retAt = after.indexOf('return {');
  assert.ok(retAt >= 0, `${functionName} does not return an object literal`);

  let depth = 0;
  let end = -1;
  for (let i = retAt + 'return '.length; i < after.length; i += 1) {
    if (after[i] === '{') depth += 1;
    else if (after[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  assert.ok(end > 0, `could not read the returned object of ${functionName}`);

  const body = after.slice(retAt, end + 1);
  const assigned = [...body.matchAll(/^\s{2,10}([A-Za-z_][\w]*)\s*:/gm)].map((m) => m[1]);
  const shorthand = [...body.matchAll(/^\s{2,10}([A-Za-z_][\w]*)\s*,\s*$/gm)].map((m) => m[1]);
  const spread = /\.\.\./.test(body);
  return { keys: new Set([...assigned, ...shorthand]), spread };
}

/**
 * Fields a reader may legitimately omit, with the reason.
 *
 * Every entry is a claim that the omission is correct, not that it is
 * tolerated. Adding one should take a sentence to justify - if it does not,
 * the field probably belongs in the reader.
 */
const ALLOWED_OMISSIONS = {
  // A row read back from the cloud is by definition not waiting to be sent.
  'salesActivityStore.rowToRecord': { pendingSync: 'a cloud row is never pending' },
  // Local records are always local; the cloud reader sets its own.
  'opportunityStore.loadLocalOpportunities': {},
};

const TARGETS = [
  { file: 'src/services/opportunityStore.ts', type: 'CrmLiteOpportunity', fn: 'loadLocalOpportunities' },
  { file: 'src/services/salesActivityStore.ts', type: 'SalesActivityRecord', fn: 'rowToRecord' },
  { file: 'src/services/planItemStore.ts', type: 'PlanRecord', fn: 'sanitizePlanRecord', typeFile: 'src/utils/weeklyPlan.ts' },
  { file: 'src/services/quoteStore.ts', type: 'QuoteRecord', fn: 'sanitizeQuote' },
  { file: 'src/services/expenseStore.ts', type: 'ExpenseRecord', fn: 'sanitizeExpense' },
  { file: 'src/services/accountMergeStore.ts', type: 'AccountMergeRecord', fn: 'sanitize' },
];

for (const target of TARGETS) {
  const source = read(target.file);
  const typeSource = target.typeFile ? read(target.typeFile) : source;
  const key = `${target.file.split('/').pop().replace('.ts', '')}.${target.fn}`;

  const declared = declaredFields(typeSource, target.type);
  assert.ok(declared.length > 4, `${target.type} should declare more than four fields`);

  const { keys, spread } = returnedKeys(source, target.fn);
  // A spread carries everything by construction, so there is nothing to forget.
  if (spread) continue;

  const allowed = ALLOWED_OMISSIONS[key] || {};
  const missing = declared.filter((field) => !keys.has(field) && !(field in allowed));

  assert.deepEqual(
    missing, [],
    `${key} rebuilds ${target.type} field by field and omits: ${missing.join(', ')}.\n`
    + 'A field missing here is deleted on every read or write, with no error anywhere and\n'
    + 'nothing the type checker can say - every one of these fields is optional. Add it to\n'
    + `the reader, or to ALLOWED_OMISSIONS in ${'scripts/verify-record-field-coverage.mjs'} with the reason.`,
  );
}

console.log(`Record field coverage OK (${TARGETS.length} readers)`);
