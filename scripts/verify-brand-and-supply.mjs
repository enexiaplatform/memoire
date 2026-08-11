// Fixtures below are denominated in VND; see the helper for why this is
// pinned rather than rewritten.
import './lib/pin-reporting-currency.mjs';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { buildBrandPerformance } from '../src/utils/brandPerformance.ts';
import { buildCoverageMatrix } from '../src/utils/coverageMatrix.ts';
import {
  buildSupplierCommitments,
  supplierCommitmentsAsOwnObligations,
} from '../src/utils/supplierCommitments.ts';

// An operator carrying several principals' lines runs two relationships at
// once: the customer side the whole product already models, and the supply
// side that decides whether an order can be filled at all. This contract guards
// the three ways that second relationship gets modelled wrongly.

// 1. Brand is a dimension, never a workspace. One customer buys several brands,
//    so grouping happens at read time on the deal's own `brand` field - there is
//    no brand store to keep in step, and none may appear.
{
  const files = readdirSync(new URL('../src/services/', import.meta.url));
  assert.equal(
    files.some((file) => /^brand.*[Ss]tore\.ts$/.test(file)),
    false,
    'brand must stay a dimension on the opportunity, not a stored entity with its own store',
  );

  const report = buildBrandPerformance({
    opportunities: [
      { id: 'a', brand: 'Sartorius', status: 'Active', estimatedValue: 100, currency: 'VND', accountName: 'DP Lab', opportunityName: 'A', stage: 'Demo', pipelineProbability: null },
      { id: 'b', brand: 'Cobetter', status: 'Active', estimatedValue: 300, currency: 'VND', accountName: 'DP Lab', opportunityName: 'B', stage: 'Demo', pipelineProbability: null },
    ],
  });
  // The same customer appears under two brands without being duplicated or split.
  assert.equal(report.brands.length, 2);
  assert.equal(report.leader.brand, 'Cobetter');
  assert.equal(report.totalActiveBase, 400);
}

// 1b. And the rollup is on a page. Brand had a field on every deal, a
//     derivation, a written panel and a contract - and the panel was mounted
//     nowhere, so an operator set Brand on deal after deal and the product
//     never once answered with it. A capability that asks for input and returns
//     nothing is worse than one that was never built: it spends the user's
//     effort and their trust.
{
  const panel = 'src/features/reviews/BrandPerformancePanel.tsx';
  assert.ok(existsSync(panel), 'the brand rollup panel must exist');
  const mounted = ['src/features/reviews/SalesReviewsPage.tsx', 'src/features/reviews/ReviewAnalyticsSection.tsx']
    .some((file) => existsSync(file) && readFileSync(file, 'utf8').includes('<BrandPerformancePanel'));
  assert.ok(mounted, 'the brand rollup must be rendered on Review, not just written');

  const field = readFileSync('src/features/opportunities/OpportunitiesPage.tsx', 'utf8');
  assert.ok(field.includes('Brand / principal'), 'and the deal editor must still be where a brand is set');
}

// 2. Deals with no brand are named, never absorbed. A rollup that quietly hides
//    the unbranded remainder would report a share of pipeline that does not add
//    up to the pipeline.
{
  const report = buildBrandPerformance({
    opportunities: [
      { id: 'a', brand: 'Sartorius', status: 'Active', estimatedValue: 100, currency: 'VND', accountName: 'X', opportunityName: 'A', stage: 'Demo', pipelineProbability: null },
      { id: 'b', brand: '', status: 'Active', estimatedValue: 100, currency: 'VND', accountName: 'Y', opportunityName: 'B', stage: 'Demo', pipelineProbability: null },
    ],
  });

  assert.equal(report.unbrandedActiveCount, 1);
  assert.ok(report.coverageMessage.length > 0, 'the gap must be stated, not implied');
  const shareTotal = report.brands.reduce((sum, row) => sum + row.shareOfActive, 0);
  assert.ok(Math.abs(shareTotal - 1) < 1e-9, 'shares must account for the whole active pipeline');
}

// 3. The supply relationship keeps its two directions apart, and only your own
//    side may ever be counted as an obligation you owe. Folding "they owe me a
//    price" into your own obligations would inflate the one number that is
//    supposed to mean "what have I promised".
{
  const records = [
    { id: 'mine', brand: 'Sartorius', party: 'self', kind: 'Forecast', label: 'Q4 forecast', dueDate: '2026-07-01', status: 'open', createdAt: '', updatedAt: '' },
    { id: 'theirs', brand: 'Sartorius', party: 'supplier', kind: 'Pricing', label: 'Conda tender price', dueDate: '2026-07-01', status: 'open', createdAt: '', updatedAt: '' },
  ];

  const model = buildSupplierCommitments({ records, today: '2026-07-28' });
  assert.equal(model.groups[0].iOwe.length, 1);
  assert.equal(model.groups[0].theyOwe.length, 1);
  assert.equal(model.waitingOnSuppliers.length, 1, 'what a principal owes you must stay visible as a blocker');

  const obligations = supplierCommitmentsAsOwnObligations({ records, today: '2026-07-28' });
  assert.equal(obligations.length, 1, 'only your own side becomes an obligation you owe');
  assert.equal(obligations[0].id, 'obligation-supplier-mine');
  assert.equal(obligations[0].status, 'Overdue');
}

// 4. Supplier commitments are their own records, not commitment-ledger rows. A
//    ledger commitment hangs off a customer thread; a forecast owed to a
//    principal has no customer, and inventing one would corrupt every
//    thread-level answer in the product.
{
  const kernelTypes = readFileSync(new URL('../src/domain/commercialKernel/types.ts', import.meta.url), 'utf8');
  const parties = kernelTypes.match(/export const commitmentParties = \[([\s\S]*?)\] as const;/);
  assert.ok(parties, 'the kernel must declare its commitment parties');
  assert.equal(
    parties[1].includes('supplier'),
    false,
    'a supplier is not a party to a customer thread - it has its own record type',
  );

  const supply = readFileSync(new URL('../src/utils/supplierCommitments.ts', import.meta.url), 'utf8');
  assert.match(supply, /export const supplierCommitmentParties/, 'the supply side declares its own parties');
}

// 5. The week shows what you owe a principal, and the surface that owns those
//    records says so - a dated promise living in two places with no link is how
//    an operator ends up keeping two calendars again.
{
  const plan = readFileSync(new URL('../src/features/plan/WeeklyPlanPage.tsx', import.meta.url), 'utf8');
  assert.match(plan, /supplierCommitmentsAsOwnObligations/, 'the week must include what you owe your principals');
  assert.match(
    plan,
    /includes\(SUPPLIER_OBLIGATION_MARKER\)/,
    'the board must recognise a supplier obligation with includes - the board wraps its own prefix on, so startsWith reads false',
  );

  const money = readFileSync(new URL('../src/features/revenue/RevenueViewPage.tsx', import.meta.url), 'utf8');
  assert.match(money, /<SupplierCommitmentsPanel/, 'Orders & Cash owns the supply relationship');
}

// 6. The customer x line grid survives, wherever it lives.
//
//    It was the Business Vault until 2026-08-09 and it is now Portfolio
//    Coverage under Accounts. The move is a product decision recorded in
//    `verify-business-vault-knowledge.mjs`; what this contract cares about is
//    the capability, which is real and must not be lost in a rename. The empty
//    squares have to stay legible, because they are the entire message.
//
//    History worth keeping: this block used to ban a node graph outright, after
//    the Vault's first version drew accounts and deals as a force-directed map
//    that was accurate and worthless. That ban is lifted - the Vault now draws a
//    contextual knowledge map with named relations and derived gaps, which is a
//    different thing answering a different question - and the conditions that
//    made the old graph worthless are pinned in its own contract instead.
{
  const coverage = readFileSync(new URL('../src/features/coverage/PortfolioCoveragePage.tsx', import.meta.url), 'utf8');
  assert.match(coverage, /buildCoverageMatrix/, 'the coverage page renders the coverage matrix');
  assert.match(coverage, /Never taken to them/, 'the empty square keeps a label of its own');

  const vault = readFileSync(new URL('../src/features/vault/BusinessVaultPage.tsx', import.meta.url), 'utf8');
  assert.equal(
    vault.includes('buildCoverageMatrix'),
    false,
    'the Vault is business memory now; the grid has its own surface and must not be drawn twice',
  );

  const matrix = buildCoverageMatrix({
    opportunities: [
      { id: 'a', accountName: 'DP Lab', opportunityName: 'A', brand: 'Sartorius', status: 'Active', estimatedValue: 100, currency: 'VND', stage: 'Demo', pipelineProbability: null },
      { id: 'b', accountName: 'Rohto', opportunityName: 'B', brand: 'Cobetter', status: 'Active', estimatedValue: 100, currency: 'VND', stage: 'Demo', pipelineProbability: null },
    ],
  });
  assert.equal(matrix.totalCells, 4, 'every customer is measured against every line');
  assert.equal(matrix.filledCells, 2);
  assert.equal(matrix.gaps.length, 2, 'a partly-covered paying customer is a named gap');
}

// 7. Storage contract: another JSON collection with a real table behind it, and
//    no new API function.
{
  const cloudStore = readFileSync(new URL('../src/services/cloudJsonCollectionStore.ts', import.meta.url), 'utf8');
  assert.match(cloudStore, /'supplier_commitments'/, 'supplier_commitments is a registered JSON collection');

  const migrations = readdirSync(new URL('../supabase/migrations/', import.meta.url))
    .filter((file) => file.endsWith('.sql'))
    .map((file) => readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
    .join('\n');
  assert.match(migrations, /create table public\.supplier_commitments/i, 'the collection has a table to sync into');

  const apiFunctions = readdirSync(new URL('../api/', import.meta.url))
    .filter((file) => /\.(ts|js)$/.test(file) && !file.startsWith('_'));
  assert.ok(apiFunctions.length <= 12, `api/ must stay within the Hobby function cap (found ${apiFunctions.length})`);
}

console.log('Brand and supply contract verified: brand is a dimension, and the two sides of a principal stay apart.');
