import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const files = execFileSync('git', ['ls-files', 'src'], { cwd: root, encoding: 'utf8' })
  .split(/\r?\n/)
  .filter((file) => /\.(ts|tsx|js|jsx|css)$/.test(file));

const mojibakePatterns = [
  { pattern: /\u00e2[\u20ac\u0160\u0161\u0152\u0090-\u009d][^\s'"`<)]*/g, label: 'mojibake smart punctuation or symbol' },
  { pattern: /\u00c3[\u0080-\u00bfA-Za-z]/g, label: 'mojibake accented character' },
  { pattern: /\u00f0[\u0178\u009f][^\s'"`<)]*/g, label: 'mojibake emoji' },
  { pattern: /\uFFFD/g, label: 'replacement character' },
];

const discouragedVisibleText = [
  { pattern: /Open dashboard/g, label: 'deprecated dashboard CTA; use Open Today' },
  { pattern: /\balert\s*\(/g, label: 'browser alert popup; use inline UI state' },
  { pattern: /Loading\.\.\./g, label: 'generic loading copy; use contextual loading text' },
  { pattern: /Upgrade to Personal/g, label: 'paid upgrade copy before checkout is enabled' },
  { pattern: /Memoire Personal/g, label: 'old paid-plan copy before pricing decision' },
  { pattern: /Personal Plan/g, label: 'old paid-plan label before pricing decision' },
  { pattern: /Team Plan/g, label: 'old paid-team label before team billing is enabled' },
  { pattern: /All limits removed/g, label: 'paid-upgrade success copy before checkout is enabled' },
  { pattern: /\$19/g, label: 'fixed paid price copy before pricing decision' },
  { pattern: /hiring signal/g, label: 'old career-record boundary copy; use current trust boundary language' },
  { pattern: /career sales record/g, label: 'old career-record copy; use private sales memory language' },
];

const failures = [];

for (const file of files) {
  const text = readFileSync(resolve(root, file), 'utf8');
  for (const { pattern, label } of mojibakePatterns) {
    const matches = text.match(pattern);
    if (!matches) continue;
    failures.push(`${file}: ${label}: ${Array.from(new Set(matches)).join(', ')}`);
  }
  for (const { pattern, label } of discouragedVisibleText) {
    const matches = text.match(pattern);
    if (!matches) continue;
    failures.push(`${file}: ${label}: ${Array.from(new Set(matches)).join(', ')}`);
  }
}

if (failures.length > 0) {
  console.error('UI text polish verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('UI text polish verification passed.');
