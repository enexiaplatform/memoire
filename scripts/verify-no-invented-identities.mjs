import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { planItemEditChangesAnything, buildPlanItemEditDraft } from '../src/utils/planItemEdit.ts';
import { ACCOUNT_CSV_TEMPLATE } from '../src/utils/accountCsvImport.ts';
import { OPPORTUNITY_CSV_TEMPLATE } from '../src/utils/opportunityCsvImport.ts';

/*
 * Two rules, both learned from the same screenshot.
 *
 * 1. The app never suggests a person or a company that does not exist.
 *
 *    A form field carrying "Mr. Phuoc" as its placeholder reads as somebody's
 *    real contact leaking out of another record. It is not - it was typed into
 *    the source months ago as a friendly example - but the operator cannot know
 *    that, and a product that keeps their book has to be obviously incapable of
 *    showing them a name they did not enter. The same applies to invented
 *    companies, and more sharply to *real* third-party brands: suggesting a
 *    competitor's name in a supplier field is worse than suggesting nothing.
 *
 *    Say what to type instead. "Their name" is a shorter placeholder than
 *    "Mr. Phuoc" and nobody has to stop and check it.
 *
 * 2. A field the operator can edit must be able to arm Save.
 *
 *    `planItemEditChangesAnything` listed seven fields by hand. An eighth was
 *    added, the operator picked a value from the new control, and Save stayed
 *    grey with nothing on screen saying why - a form full of their answer, and
 *    an app that believed nothing had changed.
 */

const root = fileURLToPath(new URL('../src', import.meta.url));

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });
}

/**
 * Files that are allowed to hold invented people.
 *
 * The demo sandbox *is* a fabricated book, and it says so in a banner across
 * the top of every page it appears on. Emptying it would not protect anybody;
 * it would remove the only way to look at a full workspace before having one.
 */
const FABRICATION_ALLOWED = [
  'features/v31/localStore.ts',
  'utils/sampleData.ts',
  'utils/pipelineDefenseStorage.ts',
];

/** Strips comments: a comment naming the bug it fixed is not a suggestion. */
const codeOf = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const files = walk(root)
  .map((full) => ({ path: relative(root, full).replace(/\\/g, '/'), full }))
  .filter((file) => !FABRICATION_ALLOWED.includes(file.path));

// 1. No honorific-plus-name anywhere the operator can read it.
{
  const offenders = [];
  files.forEach((file) => {
    const code = codeOf(readFileSync(file.full, 'utf8'));
    // Only inside a quoted string: a variable called `mrRate` is not a person.
    const matches = code.match(/["'`][^"'`]*\b(?:Mr|Ms|Mrs)\.?\s+\p{Lu}\p{L}+[^"'`]*["'`]/gu) || [];
    matches.forEach((match) => offenders.push(`${file.path}: ${match.trim().slice(0, 90)}`));
  });
  assert.deepEqual(
    offenders, [],
    `No user-visible string may name a person who does not exist. Say what to type instead:\n${offenders.join('\n')}`,
  );
}

// 2. Placeholders never invent an identity.
//
//    Two capitalised words in a row is what a person's name and a company name
//    both look like. A handful of real labels have that shape too, so they are
//    listed rather than pattern-matched - a list somebody has to extend on
//    purpose is the point.
{
  const ALLOWED_TWO_WORD_PLACEHOLDERS = new Set([
    'Import duty',
    'Bank transfer',
    'Shipping in',
    'Not captured',
    'Auto if blank',
    'Canonical account',
    'Mapping profile name',
  ]);

  const offenders = [];
  files.forEach((file) => {
    const code = codeOf(readFileSync(file.full, 'utf8'));
    const matches = code.match(/placeholder="([^"]*)"/g) || [];
    matches.forEach((raw) => {
      const value = raw.slice('placeholder="'.length, -1);
      if (ALLOWED_TWO_WORD_PLACEHOLDERS.has(value)) return;
      // A name-shaped run: two or more capitalised words with nothing between
      // them but a space, not preceded by a lower-case word that makes it a
      // sentence ("Import duty" is fine; "Jane Smith" is not).
      if (/^\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+)+$/u.test(value.trim())) {
        offenders.push(`${file.path}: placeholder="${value}"`);
      }
    });
  });
  assert.deepEqual(
    offenders, [],
    `A placeholder must describe the answer, not invent one:\n${offenders.join('\n')}`,
  );
}

// 3. The CSV templates describe their columns rather than filling them in.
{
  [
    ['ACCOUNT_CSV_TEMPLATE', ACCOUNT_CSV_TEMPLATE],
    ['OPPORTUNITY_CSV_TEMPLATE', OPPORTUNITY_CSV_TEMPLATE],
  ].forEach(([name, template]) => {
    const [, example] = template.split('\n');
    const fields = example.split(',');

    // The customer column specifically, not "the row contains a slot
    // somewhere": one templated column while the company name stayed invented
    // is the version that shipped, and it passed a looser check than this.
    assert.match(
      fields[0], /^<.+>$/,
      `${name}'s first column must be a slot, not an invented company`,
    );
    assert.doesNotMatch(example, /\b(?:Mr|Ms|Mrs)\.?\s/, `${name} names no person`);

    // Every remaining free-text column is a slot too. The fixed-vocabulary
    // ones - a stage, a currency, an amount, a relationship - keep real values,
    // because those are the columns an operator actually gets wrong.
    const FIXED_VOCABULARY = /^(?:High|Low|Medium|Developing|Established|New|Technical discussion|VND|USD|EUR|SGD|Next quarter|[0-9]+)$/;
    fields.forEach((field, index) => {
      const value = field.replace(/^"|"$/g, '').trim();
      if (!value || value.startsWith('<') || FIXED_VOCABULARY.test(value)) return;
      assert.match(
        value, /</,
        `${name} column ${index + 1} ("${value}") must be a slot or a fixed vocabulary value`,
      );
    });
  });
}

// 4. Every editable field can arm Save.
//
//    Derived from the draft's own keys rather than a hand-written list, so this
//    holds for the next field added as well as the ones present today.
{
  const item = {
    id: 'p1', kind: 'personal', date: '2026-09-02', tag: '', label: 'Holiday',
    done: false, href: '', overdue: false, workKind: 'internal', workBrand: '', workDomain: 'Internal',
  };
  const sources = { records: [], opportunities: [], activities: [] };
  const opened = buildPlanItemEditDraft(item, sources);

  Object.keys(opened).forEach((key) => {
    // A value guaranteed different from whatever the draft opened with.
    const changed = { ...opened, [key]: `${opened[key] || ''}x` };
    assert.equal(
      planItemEditChangesAnything(opened, changed),
      true,
      `changing "${key}" must arm Save - a control that writes nowhere is worse than no control`,
    );
  });

  // And an unchanged draft still arms nothing.
  assert.equal(planItemEditChangesAnything(opened, { ...opened }), false);
  // Trailing space is not an edit.
  assert.equal(planItemEditChangesAnything(opened, { ...opened, label: `${opened.label} ` }), false);
}

console.log('No-invented-identities and editable-field contract OK');
