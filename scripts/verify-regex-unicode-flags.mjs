import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/**
 * A `\p{...}` escape without the `u` flag is the literal text "p{...}".
 *
 * This nearly shipped on 2026-08-25. Five capture patterns were rewritten from
 * `[A-Z][A-Za-z]` to `\p{Lu}[\p{L}]` and kept their original flags, so they
 * matched nothing at all - and every test stayed green, because a pattern that
 * matches nothing produces exactly what a note with no customer in it produces.
 * There is no failure mode here that looks like a failure.
 *
 * So it is checked mechanically rather than remembered. The scanner is
 * deliberately crude about what a regex literal is: it over-reports rather than
 * under-reports, and anything it flags is either a real bug or a line worth
 * rewriting so a scanner can read it.
 */

const REGEX_LITERAL = new RegExp(
  // /  ...body...  /flags   where the body is any run of non-slash characters,
  // escapes, or character classes.
  '/((?:[^/\\\\\\n\\[]|\\\\.|\\[(?:[^\\]\\\\]|\\\\.)*\\])+)/([gimsuyd]*)',
  'g',
);

const offenders = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    const source = readFileSync(full, 'utf8');
    source.split('\n').forEach((line, index) => {
      // Comment lines describe the rule; they are not the rule.
      if (/^\s*(\/\/|\*)/.test(line)) return;
      for (const match of line.matchAll(REGEX_LITERAL)) {
        if (!match[1].includes('\\p{')) continue;
        if (match[2].includes('u')) continue;
        offenders.push(`${full}:${index + 1} ${match[0].slice(0, 100)}`);
      }
    });
  }
}

walk('src');

assert.deepEqual(
  offenders,
  [],
  `\\p{...} without the u flag matches the literal text "p{...}" and silently matches nothing:\n${offenders.join('\n')}`,
);

console.log('Unicode regex flags verified: every \\p{...} pattern in src/ carries the u flag.');
