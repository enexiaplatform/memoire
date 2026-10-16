import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import '../support/reportingCurrency.mjs';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      const url = new URL(specifier + '.ts', context.parentURL);
      if (existsSync(fileURLToPath(url))) return next(url.href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('/lib/supabaseClient.ts')) return { format: 'module', shortCircuit: true,
      source: 'export const supabaseClient=null;export const isPipelineSupabaseConfigured=false;' };
    return next(url, context);
  },
});
const { targetEditorValues, targetEditorChanges } = await import('../../src/utils/targetEditor.ts');
const { buildPlanBoard } = await import('../../src/utils/weeklyPlan.ts');
const { buildPlanCompletionActivity } = await import('../../src/utils/planCompletionLog.ts');
const { parseCapture } = await import('../../src/domain/commercialKernel/parseCapture.ts');
const { quoteAmountError } = await import('../../src/utils/quoteValidation.ts');
const { createQuote, updateQuote, createEmptyQuoteInput } = await import('../../src/services/quoteStore.ts');

test('mixed-currency targets open in editor currency; unchanged and re-formatted saves have no writes', () => {
  const targets = [{ period: 'Q4', fiscalYear: 2026, amount: 2_500_000_000, currency: 'VND', note: 'Original target' }];
  const initial = targetEditorValues(targets, 'USD');
  assert.ok(Math.abs(Number(initial.Q4) - 96153.84615384616) < 1e-8);
  assert.deepEqual(targetEditorChanges(initial, initial), { changes: [], error: '' });
  assert.deepEqual(targetEditorChanges({ ...initial, Q4: '96,153.84615384616' }, initial).changes, []);
  assert.deepEqual(targetEditorChanges({ ...initial, Q4: '100000', Q1: '0' }, initial).changes,
    [{ period: 'Q1', amount: 0 }, { period: 'Q4', amount: 100000 }]);
  assert.equal(targets[0].amount, 2_500_000_000);
  assert.equal(targets[0].currency, 'VND');
  assert.equal(targets[0].note, 'Original target');
  assert.ok(targetEditorChanges({ ...initial, Q1: '25', Q4: '-1' }, initial).error);
  assert.deepEqual(targetEditorChanges({ ...initial, Q1: '25', Q4: 'NaN' }, initial).changes, []);
  assert.equal(targetEditorValues([{ ...targets[0], currency: 'ZZZ' }], 'USD').Q4, '');
});

test('capture task completion carries exact deal identity to the activity writer, independently of history URL', () => {
  const opportunity = { id: 'deal-a', accountName: 'Atlas', opportunityName: 'QC pilot', stage: 'Discovery', status: 'Active' };
  const activity = { id: 'capture-a', accountName: 'Atlas', linkedAccountName: 'Atlas', linkStatus: 'Linked',
    linkedOpportunityId: 'deal-a', nextAction: 'Send protocol', dueDate: '2026-10-16', activityDate: '2026-10-15', tags: [] };
  const board = buildPlanBoard({ periodType: 'week', anchorDate: new Date(2026, 9, 16),
    today: '2026-10-16', opportunities: [opportunity], activities: [activity], obligations: [], records: [] });
  const item = board.days.flatMap(day => day.items).find(item => item.kind === 'capture');
  assert.ok(item);
  assert.match(item.href, /activityId=capture-a/);
  const input = { item, opportunities: [opportunity], note: 'Protocol sent', person: { name: 'Linh' }, activityDate: '2026-10-16' };
  const completion = buildPlanCompletionActivity(input);
  assert.equal(completion.activity.opportunityName, 'QC pilot');
  assert.deepEqual(completion.link, { linkedOpportunityId: 'deal-a', linkedOpportunityName: 'QC pilot', linkedAccountName: 'Atlas' });
  assert.equal(buildPlanCompletionActivity({ ...input, channel: 'Out of office' }).link, undefined);
  assert.equal(buildPlanCompletionActivity({ ...input, item: { ...item, linkedOpportunityId: 'deleted-deal' } }).link, undefined);
  assert.equal(buildPlanCompletionActivity({ ...input, item: { ...item, linkedOpportunityId: undefined } }).link, undefined);
});

test('negative and nonfinite quote values are rejected by create/update before persistence', () => {
  const input = { ...createEmptyQuoteInput(), accountName: 'Atlas', title: 'QC pilot', amount: -10 };
  assert.throws(() => createQuote(input), /zero or more/);
  assert.throws(() => updateQuote({ ...input, id: 'q' }, input), /zero or more/);
  for (const amount of [NaN, Infinity, -Infinity]) assert.ok(quoteAmountError(amount));
  for (const amount of [null, undefined, 0, 10.25]) assert.equal(quoteAmountError(amount), '');
});

test('person facts preserve honorifics, accented endings, and decline a title alone', () => {
  const read = text => parseCapture({ rawCapture: text, captureDate: '2026-10-16', context: {
    accounts: [{ id: 'a', accountName: 'Atlas Lab' }], opportunities: [], stakeholders: [], objections: [],
    openCommitments: [], evidence: [], reportingCurrency: 'USD',
  } }).facts.filter(fact => fact.kind === 'stakeholder');
  assert.equal(read('Met Dr. Linh Simulation at Atlas Lab today.')[0]?.name, 'Dr. Linh Simulation');
  assert.equal(read('Spoke with Ms. José at Atlas Lab today.')[0]?.name, 'Ms. José');
  assert.equal(read('Met Linh Simulation at Atlas Lab today.')[0]?.name, 'Linh Simulation');
  assert.deepEqual(read('Met Dr. at Atlas Lab today.'), []);
  assert.deepEqual(read('Met the team at Atlas Lab today.'), []);
});
