import assert from 'node:assert/strict';
import {
  buildCommercialCommandActions,
  buildTodayCommandCenter,
  commercialRiskPriority,
} from '../src/utils/salesCommandCenter.ts';

function revenueAction(overrides = {}) {
  return {
    id: 'quote-q1',
    accountName: 'Example Account',
    label: 'Renewal quote',
    amount: 500_000_000,
    currency: 'VND',
    status: 'Pending payment',
    risk: 'Payment overdue',
    nextAction: 'Confirm payment date and collection owner.',
    href: '/app/quotes',
    source: 'Quote',
    ...overrides,
  };
}

assert.equal(commercialRiskPriority('Payment overdue'), 'Critical');
assert.equal(commercialRiskPriority('Delivery overdue'), 'Critical');
assert.equal(commercialRiskPriority('Quote expired'), 'Critical');
assert.equal(commercialRiskPriority('Quote expiring'), 'High');
assert.equal(commercialRiskPriority('Waiting on PO'), 'Medium');

const [paymentAction] = buildCommercialCommandActions([revenueAction()]);
assert.equal(paymentAction.source, 'Quote');
assert.equal(paymentAction.priority, 'Critical');
assert.equal(paymentAction.href, '/app/quotes');
assert.match(paymentAction.reason, /500M VND/);

const commandCenter = buildTodayCommandCenter({
  activities: [],
  opportunities: [],
  accounts: [],
  briefs: [],
  commercialActions: [revenueAction()],
});

assert.equal(commandCenter.hasAnyData, true);
for (const blockId of ['morning-triage', 'pipeline-defense', 'customer-execution']) {
  const block = commandCenter.dailyTimeblocks.find((item) => item.id === blockId);
  assert.equal(block?.actions[0]?.source, 'Quote', `${blockId} should surface the overdue payment first`);
  assert.equal(block?.priority, 'Critical', `${blockId} should become critical`);
  assert.equal(block?.href, '/app/quotes', `${blockId} should open the quote workspace`);
}

const waitingPoCenter = buildTodayCommandCenter({
  activities: [],
  opportunities: [],
  accounts: [],
  briefs: [],
  commercialActions: [revenueAction({ risk: 'Waiting on PO', status: 'Pending PO' })],
});
const waitingPoExecution = waitingPoCenter.dailyTimeblocks.find((item) => item.id === 'customer-execution');
const waitingPoDefense = waitingPoCenter.dailyTimeblocks.find((item) => item.id === 'pipeline-defense');
assert.equal(waitingPoExecution?.actions[0]?.source, 'Quote');
assert.equal(waitingPoExecution?.priority, 'Medium');
assert.equal(waitingPoDefense?.actions.length, 0, 'non-urgent PO follow-up should not replace Pipeline Defense');

console.log('Daily commercial priority verification passed.');
