import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

const requiredFiles = [
  'docs/product/cohort-release-evidence-packet-2026-06-17.md',
  'docs/product/commercial-release-gate-2026-06-16.md',
  'docs/product/commercialization-roadmap-2026-06-16.md',
];

const checks = [
  {
    name: 'cohort release packet defaults to hold',
    file: 'docs/product/cohort-release-evidence-packet-2026-06-17.md',
    assert: (text) => text.includes('Current cohort invite decision: HOLD.') && text.includes('Current decision: HOLD.'),
  },
  {
    name: 'cohort release packet covers A1 through A10',
    file: 'docs/product/cohort-release-evidence-packet-2026-06-17.md',
    assert: (text) => Array.from({ length: 10 }, (_, index) => `| A${index + 1} |`).every((gate) => text.includes(gate)),
  },
  {
    name: 'cohort release packet keeps checkout disabled before invite',
    file: 'docs/product/cohort-release-evidence-packet-2026-06-17.md',
    assert: (text) => text.includes('BILLING_CHECKOUT_ENABLED=false') && text.includes('paid checkout inactive'),
  },
  {
    name: 'cohort release packet keeps noindex active',
    file: 'docs/product/cohort-release-evidence-packet-2026-06-17.md',
    assert: (text) => text.includes('Keep noindex active') && text.includes('Confirm noindex remains active'),
  },
  {
    name: 'cohort release packet blocks high-risk invite failures',
    file: 'docs/product/cohort-release-evidence-packet-2026-06-17.md',
    assert: (text) =>
      text.includes('Any known or suspected cross-account data exposure') &&
      text.includes('Production `/api/health` is failing required checks') &&
      text.includes('Demo/sample data appears in a signed-in account workspace'),
  },
  {
    name: 'release gate references cohort release packet',
    file: 'docs/product/commercial-release-gate-2026-06-16.md',
    assert: (text) => text.includes('docs/product/cohort-release-evidence-packet-2026-06-17.md'),
  },
  {
    name: 'roadmap references cohort release packet',
    file: 'docs/product/commercialization-roadmap-2026-06-16.md',
    assert: (text) => text.includes('docs/product/cohort-release-evidence-packet-2026-06-17.md'),
  },
];

const failures = [];

for (const file of requiredFiles) {
  try {
    readFileSync(resolve(root, file), 'utf8');
  } catch {
    failures.push(`missing required file (${file})`);
  }
}

for (const check of checks) {
  const path = resolve(root, check.file);
  const text = readFileSync(path, 'utf8');
  if (!check.assert(text)) {
    failures.push(`${check.name} (${check.file})`);
  }
}

if (failures.length > 0) {
  console.error('Cohort release packet verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Cohort release packet verification passed (${checks.length} checks).`);
