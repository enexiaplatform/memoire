import assert from 'node:assert/strict';
import {
  applyDailyExecutionDecision,
  createDailyExecutionState,
  normalizeDailyExecutionState,
  removeDailyExecutionDecision,
} from '../src/utils/dailyExecution.ts';
import { buildTodayCommandCenter } from '../src/utils/salesCommandCenter.ts';

const now = new Date('2026-06-20T09:00:00+07:00');
const tomorrow = new Date('2026-06-21T09:00:00+07:00');
const actionId = 'commercial-quote-payment';

const emptyState = createDailyExecutionState(now);
const doneState = applyDailyExecutionDecision(emptyState, actionId, 'Done', now);
assert.equal(doneState.decisions[0]?.status, 'Done');
assert.equal(removeDailyExecutionDecision(doneState, actionId, now).decisions.length, 0);
assert.equal(normalizeDailyExecutionState(doneState, tomorrow).decisions.length, 0);

const commercialActions = [
  {
    id: 'quote-payment',
    accountName: 'Example Account',
    label: 'Payment quote',
    amount: 650_000_000,
    currency: 'VND',
    status: 'Pending payment',
    risk: 'Payment overdue',
    nextAction: 'Confirm payment date.',
    href: '/app/quotes',
    source: 'Quote',
  },
  {
    id: 'quote-expiring',
    accountName: 'Second Account',
    label: 'Expiring quote',
    amount: 250_000_000,
    currency: 'VND',
    status: 'Quoted',
    risk: 'Quote expiring',
    nextAction: 'Confirm approval before expiry.',
    href: '/app/quotes',
    source: 'Quote',
  },
];

function commandCenter(executionDecisions = []) {
  return buildTodayCommandCenter({
    activities: [],
    opportunities: [],
    accounts: [],
    briefs: [],
    commercialActions,
    executionDecisions,
  });
}

const initial = commandCenter();
assert.equal(initial.dailyTimeblocks.find((block) => block.id === 'customer-execution')?.actions[0]?.id, actionId);

const afterDone = commandCenter(doneState.decisions);
assert.equal(afterDone.priorityActions.some((action) => action.id === actionId), false);
assert.equal(afterDone.dailyExecution.doneCount, 1);
assert.equal(afterDone.dailyExecution.deferredCount, 0);
assert.equal(afterDone.dailyExecution.items[0]?.action.title, 'Confirm payment date.');
assert.equal(afterDone.dailyExecution.items[0]?.status, 'Done');
assert.equal(
  afterDone.dailyTimeblocks.find((block) => block.id === 'customer-execution')?.actions[0]?.id,
  'commercial-quote-expiring',
);
assert.equal(
  afterDone.dailyTimeblocks.find((block) => block.id === 'morning-triage')?.actions[0]?.id,
  'commercial-quote-expiring',
);

const deferredState = applyDailyExecutionDecision(emptyState, actionId, 'Deferred', now);
const afterDeferred = commandCenter(deferredState.decisions);
const closeout = afterDeferred.dailyTimeblocks.find((block) => block.id === 'capture-closeout');
assert.equal(afterDeferred.dailyExecution.doneCount, 0);
assert.equal(afterDeferred.dailyExecution.deferredCount, 1);
assert.equal(afterDeferred.dailyExecution.items[0]?.action.executionStatus, 'Deferred');
assert.equal(closeout?.actions[0]?.id, actionId);
assert.equal(closeout?.actions[0]?.executionStatus, 'Deferred');
assert.equal(closeout?.href, '/app/quotes');
assert.equal(
  afterDeferred.dailyTimeblocks.find((block) => block.id === 'customer-execution')?.actions[0]?.id,
  'commercial-quote-expiring',
);

console.log('Daily execution loop verification passed.');
