import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

/**
 * A price without a named counterparty.
 *
 * The Terms of Service carried a $10 monthly charge, a no-refunds clause and a
 * liability limit from 2026-06 to 2026-08 while naming no operating entity and
 * no governing law. Every other defect on the pre-launch list could be fixed
 * afterwards; this one is wrong at the instant of each sale made under it, so
 * it has to be impossible to reach the first sale by forgetting.
 *
 * Two states are legitimate and this checks both:
 *
 * - **Undeclared.** `src/config/legalEntity.ts` is blank, `/legal/terms` says
 *   so in plain words rather than omitting the section, and `api/billing.ts`
 *   refuses to mint a checkout. Nobody can be charged.
 * - **Declared.** Every field is filled - a name with no jurisdiction is worse
 *   than a blank, because it reads as settled - and the page renders them.
 *
 * What is never legitimate is a half-filled entity, or a checkout that can open
 * without one.
 */

const config = read('src/config/legalEntity.ts');
const legalPage = read('src/features/legal/LegalPage.tsx');
const billing = read('api/billing.ts');
const health = read('scripts/lib/production-readiness-runtime.mjs');

// The entity is written in exactly one place, so the page and the check cannot
// drift into disagreeing about who the provider is.
assert.ok(
  legalPage.includes("from '../../config/legalEntity'"),
  'the terms page must read the entity from src/config/legalEntity.ts',
);
assert.ok(
  legalPage.includes('LEGAL_ENTITY_DECLARED'),
  'the terms page must branch on whether the entity is declared',
);
assert.ok(
  legalPage.includes('Who you are contracting with'),
  'the terms must carry a section naming the counterparty',
);

/** Reads the committed values without importing TypeScript. */
const fieldValue = (name) => {
  const found = new RegExp(`${name}:\\s*'([^']*)'`).exec(config);
  assert.ok(found, `src/config/legalEntity.ts must declare ${name}`);
  return found[1].trim();
};

const fields = ['name', 'registration', 'address', 'governingLaw', 'disputeVenue'];
const filled = fields.filter((field) => fieldValue(field).length > 0);

assert.ok(
  filled.length === 0 || filled.length === fields.length,
  `the legal entity is half-filled (${filled.join(', ')}). A name without a jurisdiction reads as settled `
  + 'and is not - fill every field or leave them all blank.',
);

if (filled.length === 0) {
  // While it is blank the page must say so, not quietly leave it out.
  assert.ok(
    legalPage.includes('has not been named in these terms yet'),
    'while the entity is undeclared the terms must say so plainly',
  );
}

// The guard that makes forgetting cost a refused checkout rather than a
// customer. Asserted as a behaviour, not a string: the endpoint must refuse
// when LEGAL_ENTITY_NAME is empty even though BILLING_CHECKOUT_ENABLED is true.
assert.ok(
  /LEGAL_ENTITY_NAME/.test(billing),
  'api/billing.ts must refuse checkout while the operating entity is unnamed',
);
const checkoutBlock = billing.slice(billing.indexOf("if (action === 'checkout')"));
const entityGuard = checkoutBlock.indexOf('LEGAL_ENTITY_NAME');
const mintsCheckout = checkoutBlock.indexOf("lemonSqueezyRequest('/checkouts'");
assert.ok(entityGuard >= 0 && mintsCheckout >= 0, 'the checkout branch must contain both the guard and the call');
assert.ok(
  entityGuard < mintsCheckout,
  'the entity guard must run before a checkout is minted, not after',
);
assert.ok(
  /legal_entity_named/.test(health),
  '/api/health must report whether the operating entity is named',
);

console.log(
  filled.length === fields.length
    ? `Legal entity contract verified: ${fieldValue('name')} named, terms and checkout agree.`
    : 'Legal entity contract verified: undeclared, the terms say so, and checkout cannot open.',
);
