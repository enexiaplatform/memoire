import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { buildOrderBook } from '../src/utils/orderToCash.ts';
import {
  buildOrderMargins,
  createOrderCostRecord,
  DEFAULT_TARGET_MARGIN_PCT,
  marginTone,
  rollupMarginByMonth,
  rollupOrderMargins,
} from '../src/utils/orderMargin.ts';

// The order book knows what every order sells for and nothing about what it
// cost. That gap is why a distributor could read this page all day and still not
// know whether the work was worth doing.
//
// Closing it is easy to do dishonestly, and this contract exists to pin the
// three ways it goes wrong: reporting a margin over revenue whose cost is
// unknown, letting the cost the operator typed leak into what the customer is
// charged, and putting the whole apparatus in front of someone who never asked
// for it.

const opportunity = (id, overrides = {}) => ({
  id,
  accountName: 'DP Lab',
  opportunityName: `Order ${id}`,
  stage: 'Negotiation',
  status: 'Won',
  estimatedValue: 1_000_000,
  currency: 'VND',
  pipelineProbability: null,
  ...overrides,
});

const bookOf = (opportunities) => buildOrderBook({
  opportunities,
  quotes: [],
  milestoneRecords: [],
  today: '2026-08-05',
});

// 1. Nothing exists until the operator says it does.
//
// This is the founder's constraint, and it is a product decision rather than a
// default: plenty of operators cannot see purchase price at all, and a margin
// column permanently reading "—" tells them the product is unfinished. `tracked`
// is the single gate every surface reads.
{
  const empty = buildOrderMargins({ orders: bookOf([opportunity('a')]).orders, costRecords: [] });
  assert.equal(empty.tracked, false, 'a workspace with no purchase cost does not track margin');
  assert.equal(empty.coveredCount, 0);
  assert.equal(empty.marginPct, null, 'no cost means no margin percentage, not zero');

  // A cost row with no number in it is not a priced order.
  const unpriced = buildOrderMargins({
    orders: bookOf([opportunity('a')]).orders,
    costRecords: [createOrderCostRecord({ opportunityId: 'a', amount: null, currency: 'VND' })],
  });
  assert.equal(unpriced.tracked, false, 'an empty cost field does not switch the feature on');

  const panel = readFileSync(new URL('../src/features/revenue/CostAnalysisPanel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /!margins\.tracked \? \(\s*<StartHere/, 'the module offers to start rather than drawing an empty analysis');
  assert.match(panel, /\{margins\.tracked && \(/, 'the headline figures are gated on tracked');
}

// 1b. Cost analysis is its own module, and the order book stays about orders.
//
// The founder's call, 2026-08-05, after seeing margin columns land inside the
// order table: Orders answers "where is my money", cost answers "was it worth
// it", and one table doing both makes the chasing job - the one people open the
// page for - harder to read. So the split is a contract, not a layout choice.
{
  const orderBook = readFileSync(new URL('../src/features/revenue/OrderBookPanel.tsx', import.meta.url), 'utf8');
  for (const leak of ['orderMargin', 'orderCostStore', 'buildOrderMargins', 'purchase cost', 'Margin']) {
    assert.equal(
      orderBook.includes(leak),
      false,
      `the order book must stay about orders - found "${leak}". Cost analysis is its own module.`,
    );
  }

  // The module always renders its own heading. It used to `return null` when
  // the book held no committed order, so a workspace below the commitment
  // threshold saw the order book explain its emptiness and saw nothing at all
  // where cost analysis should be - which reads as a feature that never
  // shipped, and sent the founder hunting the nav for a page that does not
  // exist. A section with nothing to say still says which section it is.
  const costPanel = readFileSync(new URL('../src/features/revenue/CostAnalysisPanel.tsx', import.meta.url), 'utf8');
  assert.equal(
    /if \(orders\.length === 0\) return null;/.test(costPanel),
    false,
    'cost analysis must not vanish on a workspace with no committed orders - it must say why it is empty',
  );
  assert.match(costPanel, /function NoCommittedOrders/, 'the empty state must exist');

  // Cost analysis is its own destination from 2026-08-06. It first shipped as a
  // block under the order book, which was defensible and lost to what the
  // operator actually did: they looked for it in the rail, found nothing, and
  // reported the feature missing while it sat one scroll below them. Orders is
  // therefore back to a single job, and this page is the other one.
  const page = readFileSync(new URL('../src/features/revenue/RevenueViewPage.tsx', import.meta.url), 'utf8');
  assert.equal(
    page.includes('CostAnalysisPanel'),
    false,
    'cost analysis has its own destination - rendering it on Orders too would be two doors onto one module',
  );

  const costPage = readFileSync(new URL('../src/features/revenue/CostAnalysisPage.tsx', import.meta.url), 'utf8');
  assert.match(costPage, /<CostAnalysisPanel/, 'the cost analysis page must render the module');
  assert.match(costPage, /eyebrow="Records"/, 'it sits in the Records group and must say so');

  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /<Route path="cost-analysis"/, 'cost analysis needs a route');

  const registry = readFileSync(new URL('../src/config/featureRegistry.ts', import.meta.url), 'utf8');
  assert.match(registry, /id: 'cost-analysis'/, 'the rail renders from the registry, so the destination must be declared there');
}

// 1c. Margin does not depend on milestone ticks, which is why the module can
//     read the order book without loading them a second time.
//
//     A tick decides where an order is stuck. It cannot change which orders are
//     committed or what they are worth, so the two derivations are provably the
//     same set - asserted here rather than trusted to a comment, because the day
//     that stops being true is the day this page starts disagreeing with itself.
{
  const opportunities = [opportunity('a', { estimatedValue: 1_000_000 })];
  const costRecords = [createOrderCostRecord({ opportunityId: 'a', amount: 400_000, currency: 'VND' })];
  const withoutTicks = buildOrderMargins({ orders: bookOf(opportunities).orders, costRecords });
  const withTicks = buildOrderMargins({
    orders: buildOrderBook({
      opportunities,
      quotes: [],
      milestoneRecords: [{
        id: 'om-a-deposit', opportunityId: 'a', milestone: 'deposit', done: true,
        createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      }],
      today: '2026-08-05',
    }).orders,
    costRecords,
  });

  assert.equal(withTicks.revenueBase, withoutTicks.revenueBase, 'a milestone tick must not move revenue');
  assert.equal(withTicks.grossMarginBase, withoutTicks.grossMarginBase, 'a milestone tick must not move margin');
  assert.equal(withTicks.coveredCount, withoutTicks.coveredCount);

  const panel = readFileSync(new URL('../src/features/revenue/CostAnalysisPanel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /milestoneRecords: \[\]/, 'the module reads the same order book without a second milestone load');
}

// 2. The totals count only orders that have both halves.
//
// The failure this prevents: four orders priced out of thirty, revenue summed
// across all thirty, cost across four, and a gross margin of 94% that an
// operator would believe. The denominator is always reported alongside.
{
  const orders = bookOf([
    opportunity('priced', { estimatedValue: 1_000_000 }),
    opportunity('unpriced', { estimatedValue: 9_000_000 }),
  ]).orders;
  const margins = buildOrderMargins({
    orders,
    costRecords: [createOrderCostRecord({ opportunityId: 'priced', amount: 600_000, currency: 'VND' })],
  });

  assert.equal(margins.tracked, true);
  assert.equal(margins.coveredCount, 1);
  assert.equal(margins.totalCount, 2, 'the book size is reported so coverage can be read');
  assert.equal(margins.revenueBase, 1_000_000, 'the unpriced order contributes no revenue either');
  assert.equal(margins.costBase, 600_000);
  assert.equal(margins.grossMarginBase, 400_000);
  assert.equal(margins.marginPct, 40);

  const unpriced = margins.byOrder.get('unpriced');
  assert.equal(unpriced.hasCost, false);
  assert.equal(unpriced.marginBase, null, 'an order with no cost has no margin, not a margin equal to its value');
}

// 3. Cost is read, never written back. The order's value stays whatever the
//    quote or the deal says - the same contract the plan board has with deals.
{
  const orders = bookOf([opportunity('a', { estimatedValue: 1_000_000 })]).orders;
  const before = { amount: orders[0].amount, amountBase: orders[0].amountBase };
  buildOrderMargins({
    orders,
    costRecords: [createOrderCostRecord({ opportunityId: 'a', amount: 750_000, currency: 'VND' })],
  });
  assert.deepEqual({ amount: orders[0].amount, amountBase: orders[0].amountBase }, before, 'pricing the buy side must not move the sell side');

  const model = readFileSync(new URL('../src/utils/orderMargin.ts', import.meta.url), 'utf8');
  for (const writer of ['updateOpportunity', 'saveOpportunity', 'saveQuote', 'updateQuote']) {
    assert.equal(model.includes(writer), false, `the margin model must not write records - found ${writer}`);
  }
}

// 4. An order sold below cost is the reason this is worth the screen space, so
//    it is a counted fact rather than a colour someone has to notice.
{
  const margins = buildOrderMargins({
    orders: bookOf([opportunity('a', { estimatedValue: 1_000_000 })]).orders,
    costRecords: [createOrderCostRecord({ opportunityId: 'a', amount: 1_200_000, currency: 'VND' })],
  });
  assert.equal(margins.losingCount, 1);
  assert.equal(margins.grossMarginBase, -200_000);
  assert.equal(margins.marginPct, -20);
  assert.equal(marginTone(margins.marginPct), 'loss');
  assert.equal(marginTone(5), 'thin');
  assert.equal(marginTone(35), 'healthy');
  assert.equal(marginTone(null), 'unknown', 'an unpriced order is unknown, never healthy');

  // Amber is the operator's own target from 2026-08-06, not a fixed 10%. That is
  // a deliberate distinction and not a softening of the rule below: below cost
  // stays a fact nobody has to agree with, and below target is a judgement made
  // by the one person who knows what their trade keeps. What neither line does
  // is move on its own.
  assert.equal(marginTone(15, 20), 'thin', 'the amber line is the declared target');
  assert.equal(marginTone(15, 10), 'healthy', 'a lower target passes the same order');
  assert.equal(marginTone(-1, 0), 'loss', 'below cost is a loss at any target');

  // Both thresholds are printed on the surface. An operator cannot argue with a
  // colour whose rule is not written down, and a rule that moves with the data
  // is worse - a thin order and a shifted definition look the same.
  const panel = readFileSync(new URL('../src/features/revenue/CostAnalysisPanel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /under the \{targetPct\}% you set as your target/i, 'the amber threshold must be stated on the surface');
  assert.match(panel, /below what it cost/i, 'the red threshold must be stated on the surface');
  assert.match(panel, /Neither line is learned from your data/i, 'the surface must say the thresholds are not adaptive');
  const model = readFileSync(new URL('../src/utils/orderMargin.ts', import.meta.url), 'utf8');
  assert.equal(
    /percentile|median|average|adaptive/i.test(model.slice(model.indexOf('export function marginTone'))),
    false,
    'margin thresholds are fixed lines, never learned from the workspace',
  );
}

// 5. A cost typed in the currency it was bought in is converted before it is
//    subtracted. Buying in USD and selling in VND is the ordinary case for a
//    distributor, and subtracting the raw numbers would report a margin of
//    roughly 100%.
{
  const margins = buildOrderMargins({
    orders: bookOf([opportunity('a', { estimatedValue: 1_000_000, currency: 'VND' })]).orders,
    costRecords: [createOrderCostRecord({ opportunityId: 'a', amount: 20, currency: 'USD' })],
  });
  const margin = margins.byOrder.get('a');
  assert.ok(margin.costBase > 100_000, `a USD cost must be converted before it is subtracted, got ${margin.costBase}`);
  assert.equal(margin.costCurrency, 'USD', 'the currency it was bought in is preserved for display');
  assert.ok(margin.marginBase < 1_000_000);
}

// 6. One cost per order, keyed by the order, so re-entering it edits the same
//    row instead of stacking a second buy side under the first.
{
  const first = createOrderCostRecord({ opportunityId: 'a', amount: 100, currency: 'VND' });
  const second = createOrderCostRecord({ opportunityId: 'a', amount: 200, currency: 'VND', existing: first });
  assert.equal(second.id, first.id, 'editing a cost rewrites the same record');
  assert.equal(second.createdAt, first.createdAt, 'the original creation time survives an edit');

  // Tagged at birth like every other record the demo sandbox can create: a cost
  // entered against sample data must never merge into a live workspace.
  const demo = createOrderCostRecord({ opportunityId: 'a', amount: 1, currency: 'VND', source: 'demo', isSample: true });
  assert.equal(demo.source, 'demo');
  assert.equal(demo.isSample, true);

  const store = readFileSync(new URL('../src/services/orderCostStore.ts', import.meta.url), 'utf8');
  assert.match(store, /candidate\.isSample === true/, 'the store carries the sample flag');
  const panel = readFileSync(new URL('../src/features/revenue/CostAnalysisPanel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /source: sampleDataActive \? 'demo' : 'user'/, 'the module tags cost records by workspace mode');
}

// 6b. Margin gathered by customer and by line - the half a per-order figure
//     cannot give you. Groups report their own coverage, and a group with no
//     costed order at all is unknown rather than zero: a customer you have never
//     priced must never appear as one you make nothing on.
{
  const orders = bookOf([
    opportunity('rich', { accountName: 'Apex', estimatedValue: 1_000_000 }),
    opportunity('thin', { accountName: 'Apex', estimatedValue: 1_000_000 }),
    opportunity('unknown', { accountName: 'Orion', estimatedValue: 5_000_000 }),
  ]).orders;
  const margins = buildOrderMargins({
    orders,
    costRecords: [
      createOrderCostRecord({ opportunityId: 'rich', amount: 500_000, currency: 'VND' }),
      createOrderCostRecord({ opportunityId: 'thin', amount: 950_000, currency: 'VND' }),
    ],
  });
  const groups = rollupOrderMargins({
    margins,
    entries: orders.map((order) => ({ opportunityId: order.opportunityId, key: order.accountName, label: order.accountName })),
  });

  const apex = groups.find((group) => group.key === 'Apex');
  assert.equal(apex.orderCount, 2);
  assert.equal(apex.coveredCount, 2);
  assert.equal(apex.revenueBase, 2_000_000);
  assert.equal(apex.grossMarginBase, 550_000);
  assert.equal(apex.marginPct, 28);

  const orion = groups.find((group) => group.key === 'Orion');
  assert.equal(orion.unknown, true, 'a customer with no costed order has an unknown margin');
  assert.equal(orion.marginPct, null, 'unknown is never reported as zero percent');
  assert.equal(orion.revenueBase, 0, 'its revenue is not counted against a cost that does not exist');
  assert.equal(groups[groups.length - 1].key, 'Orion', 'unknown groups sort last rather than being hidden');
}

// 6c. Landed cost, not the invoice from the principal.
//
//     The failure this closes is the most expensive one on the page and the
//     hardest to see: a distributor pays the principal in USD and then pays a
//     forwarder, a customs broker and an engineer in dong, and a margin worked
//     out on the goods price alone reads healthy on an order that lost money.
//     The two currencies are separate by design - one currency across the whole
//     record forces a hand conversion, and a hand conversion is a stale rate
//     baked into a number nobody can audit.
{
  const orders = bookOf([opportunity('a', { estimatedValue: 1_000_000, currency: 'VND' })]).orders;
  const goodsOnly = buildOrderMargins({
    orders,
    costRecords: [createOrderCostRecord({ opportunityId: 'a', amount: 700_000, currency: 'VND' })],
  }).byOrder.get('a');
  assert.equal(goodsOnly.marginPct, 30);
  assert.equal(goodsOnly.hasExtras, false);
  assert.equal(goodsOnly.extrasBase, 0, 'no extras recorded means none counted, never an estimate');
  assert.equal(goodsOnly.goodsMarginPct, goodsOnly.marginPct, 'with no extras the two readings are the same number');

  const landed = buildOrderMargins({
    orders,
    costRecords: [createOrderCostRecord({
      opportunityId: 'a',
      amount: 700_000,
      currency: 'VND',
      freightAmount: 100_000,
      dutyAmount: 80_000,
      otherAmount: 20_000,
      extrasCurrency: 'VND',
    })],
  }).byOrder.get('a');
  assert.equal(landed.extrasBase, 200_000);
  assert.equal(landed.costBase, 900_000, 'landed cost is goods plus freight plus duty plus other');
  assert.equal(landed.marginPct, 10, 'the margin an operator acts on is the landed one');
  assert.equal(landed.goodsMarginPct, 30, 'what the goods price alone would have said is kept, because that gap is the finding');

  // Extras in a second currency are converted before they are added. Domestic
  // freight in dong against goods in USD is the ordinary import, not an edge.
  const mixed = buildOrderMargins({
    orders,
    costRecords: [createOrderCostRecord({
      opportunityId: 'a',
      amount: 20,
      currency: 'USD',
      freightAmount: 50_000,
      extrasCurrency: 'VND',
    })],
  }).byOrder.get('a');
  assert.equal(mixed.extrasBase, 50_000, 'extras convert from their own currency, not from the goods currency');
  assert.ok(mixed.goodsBase > 100_000, 'the goods still convert from theirs');
  assert.equal(mixed.costBase, mixed.goodsBase + mixed.extrasBase);

  // A record with only freight against it is still a priced order. Refusing to
  // count it would lose the one cost the operator actually knew.
  const extrasOnly = buildOrderMargins({
    orders,
    costRecords: [createOrderCostRecord({ opportunityId: 'a', amount: null, currency: 'VND', freightAmount: 50_000 })],
  });
  assert.equal(extrasOnly.tracked, true);
  assert.equal(extrasOnly.byOrder.get('a').hasCost, true);

  // Records written before landed cost existed still read. Their extras are
  // absent rather than zero-with-a-currency-nobody-chose.
  const legacy = buildOrderMargins({
    orders,
    costRecords: [{
      id: 'oc-a',
      opportunityId: 'a',
      amount: 400_000,
      currency: 'VND',
      supplier: '',
      note: '',
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    }],
  }).byOrder.get('a');
  assert.equal(legacy.hasCost, true, 'a cost recorded before this change still counts');
  assert.equal(legacy.extrasBase, 0);
  assert.equal(legacy.marginPct, 60, 'and reads exactly as it did before');
}

// 6d. A margin is graded against a number the operator states, and the shortfall
//     is money rather than points.
//
//     "You kept 14%" is trivia. "14% against the 20% you aim for, and the gap is
//     340m" is a decision about who gets the next quote. The target-back
//     arithmetic exists for the same reason: a target is only actionable as a
//     price or a purchase price, never as a percentage.
{
  const orders = bookOf([opportunity('a', { estimatedValue: 1_000_000, currency: 'VND' })]).orders;
  const costRecords = [createOrderCostRecord({ opportunityId: 'a', amount: 900_000, currency: 'VND' })];

  const atDefault = buildOrderMargins({ orders, costRecords });
  assert.equal(atDefault.targetPct, DEFAULT_TARGET_MARGIN_PCT, 'a stated default, not a learned one');

  const graded = buildOrderMargins({ orders, costRecords, targetPct: 20 });
  const margin = graded.byOrder.get('a');
  assert.equal(margin.marginPct, 10);
  assert.equal(margin.meetsTarget, false);
  assert.equal(margin.targetGapBase, 100_000, 'the shortfall is money: 20% of 1m is 200k, it kept 100k');
  assert.equal(margin.priceForTargetBase, 1_125_000, 'at a 900k cost, 20% needs a 1.125m price');
  assert.equal(margin.costForTargetBase, 800_000, 'at a 1m price, 20% needs an 800k landed cost');
  assert.equal(graded.belowTargetCount, 1);
  assert.equal(graded.targetGapBase, 100_000);

  const easier = buildOrderMargins({ orders, costRecords, targetPct: 5 });
  assert.equal(easier.byOrder.get('a').meetsTarget, true, 'the same order passes a lower target');
  assert.equal(easier.targetGapBase, 0, 'a met target leaves no gap, never a negative one');
  assert.equal(easier.belowTargetCount, 0);

  // An unpriced order is not a pass. Unknown must never read as met.
  const unpriced = buildOrderMargins({
    orders: bookOf([opportunity('a'), opportunity('b')]).orders,
    costRecords,
  });
  assert.equal(unpriced.byOrder.get('b').meetsTarget, false);
  assert.equal(unpriced.byOrder.get('b').targetGapBase, 0, 'an unknown order contributes no shortfall either');
}

// 6e. The blind spot is stated in money.
//
//     Coverage as a count is easy to read past. The value flowing through the
//     orders nobody has costed is the sentence that gets them costed, and it is
//     the number that decides whether any figure above is worth acting on.
{
  const margins = buildOrderMargins({
    orders: bookOf([
      opportunity('priced', { estimatedValue: 1_000_000 }),
      opportunity('blind-a', { estimatedValue: 4_000_000 }),
      opportunity('blind-b', { estimatedValue: 5_000_000 }),
    ]).orders,
    costRecords: [createOrderCostRecord({ opportunityId: 'priced', amount: 600_000, currency: 'VND' })],
  });
  assert.equal(margins.uncoveredCount, 2);
  assert.equal(margins.uncoveredRevenueBase, 9_000_000, 'what the blind spot is worth, not just how many rows it has');
  assert.equal(margins.revenueBase, 1_000_000, 'and it still contributes nothing to the totals');
}

// 6f. Margin by month, so the direction is visible.
//
//     A book that kept 24% last quarter and 12% this one reads as healthy in a
//     single total. A month with nothing costed must read as nothing recorded
//     and never as zero margin - that is the whole reason this returns a null
//     percentage rather than a zero.
{
  // `orderDate` is the freshest quote's date, else when the deal last moved.
  const orders = bookOf([
    opportunity('july', { estimatedValue: 1_000_000, updatedAt: '2026-07-12T00:00:00.000Z' }),
    opportunity('august', { estimatedValue: 2_000_000, updatedAt: '2026-08-02T00:00:00.000Z' }),
    opportunity('undated', { estimatedValue: 9_000_000 }),
  ]).orders;
  const margins = buildOrderMargins({
    orders,
    costRecords: [
      createOrderCostRecord({ opportunityId: 'july', amount: 600_000, currency: 'VND' }),
      createOrderCostRecord({ opportunityId: 'august', amount: 1_000_000, currency: 'VND' }),
      createOrderCostRecord({ opportunityId: 'undated', amount: 1_000_000, currency: 'VND' }),
    ],
  });
  const months = rollupMarginByMonth({ orders, margins, monthCount: 6, today: '2026-08-05' });

  assert.equal(months.length, 6, 'the window is the window, empty months included');
  assert.equal(months[months.length - 1].key, '2026-08', 'it ends with the current month');
  assert.equal(months[0].key, '2026-03');

  const empty = months[0];
  assert.equal(empty.marginPct, null, 'a month with nothing costed is unknown, never 0%');
  assert.equal(empty.coveredCount, 0);

  const july = months.find((month) => month.key === '2026-07');
  assert.equal(july.revenueBase, 1_000_000);
  assert.equal(july.marginPct, 40);
  const august = months.find((month) => month.key === '2026-08');
  assert.equal(august.revenueBase, 2_000_000);
  assert.equal(august.marginPct, 50);

  // An order with no date at all belongs to no month, and is left out rather
  // than swept into the current one - a bar that never happened is worse than a
  // bar that is missing, because only one of them is arguable.
  const placed = months.reduce((sum, month) => sum + month.revenueBase, 0);
  assert.equal(placed, 3_000_000, 'an undated order is not folded into the newest month');
  assert.equal(margins.revenueBase, 12_000_000, 'though it still counts in the book totals');
}

// 7. Storage contract: another JSON collection with a real table behind it, and
//    no new API function - the Hobby cap is a hard ceiling.
{
  const cloudStore = readFileSync(new URL('../src/services/cloudJsonCollectionStore.ts', import.meta.url), 'utf8');
  assert.match(cloudStore, /'order_costs'/, 'order_costs is a registered JSON collection');

  const migrations = readdirSync(new URL('../supabase/migrations/', import.meta.url))
    .filter((file) => file.endsWith('.sql'))
    .map((file) => readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
    .join('\n');
  assert.match(migrations, /create table public\.order_costs/i, 'the collection has a table to sync into');

  const apiFunctions = readdirSync(new URL('../api/', import.meta.url))
    .filter((file) => /\.(ts|js)$/.test(file) && !file.startsWith('_'));
  assert.ok(apiFunctions.length <= 12, `api/ must stay within the Hobby function cap (found ${apiFunctions.length})`);
}

// 8. This is not the accounting P&L, and the two must not be confused into one.
//
// utils/pnl.ts is a cash-basis statement for a period - money collected against
// money paid - and it sits behind an off-by-default flag because Memoire is not
// a bookkeeping product. Order margin answers a commercial question about one
// order, needs no expense ledger, and is therefore not behind that flag. If it
// ever starts reading expenses, it has become the other thing.
{
  const model = readFileSync(new URL('../src/utils/orderMargin.ts', import.meta.url), 'utf8');
  assert.equal(model.includes('expenseStore'), false, 'order margin must not read the expense ledger');
  assert.equal(model.includes('buildCashPosition'), false, 'order margin is not a cash statement');
  assert.equal(model.includes('BUSINESS_ACCOUNTING_ENABLED'), false, 'order margin activates on data, not on the accounting flag');

  const flags = readFileSync(new URL('../src/config/featureFlags.ts', import.meta.url), 'utf8');
  assert.match(flags, /VITE_ENABLE_BUSINESS_ACCOUNTING === 'true'/, 'the accounting flag still defaults to off');
}

console.log('Order margin contract verified: silent until costed, counted only where both halves exist, never writes back.');
