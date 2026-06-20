import assert from 'node:assert/strict';
import {
  getCommercialCheckpointRisk,
  getNextCommercialProgressAction,
  getQuoteCommercialStage,
} from '../src/utils/commercialFulfillment.ts';
import { formatCompactCurrencyAmount } from '../src/utils/currency.ts';

const base = {
  status: 'Accepted',
  poStatus: 'Pending',
  deliveryStatus: 'Not scheduled',
  expectedDeliveryDate: '',
  paymentStatus: 'Not due',
  paymentDueDate: '',
};

assert.equal(getQuoteCommercialStage(base), 'Pending PO');
assert.equal(getQuoteCommercialStage({ ...base, poStatus: 'Received' }), 'Pending delivery');
assert.equal(getQuoteCommercialStage({ ...base, poStatus: 'Received', deliveryStatus: 'Delivered' }), 'Pending payment');
assert.equal(getQuoteCommercialStage({ ...base, poStatus: 'Received', deliveryStatus: 'Delivered', paymentStatus: 'Paid' }), 'Paid');

assert.equal(getCommercialCheckpointRisk(base, '2026-06-20'), 'PO follow-up');
assert.equal(getCommercialCheckpointRisk({ ...base, poStatus: 'Received', deliveryStatus: 'Scheduled', expectedDeliveryDate: '2026-06-19' }, '2026-06-20'), 'Delivery overdue');
assert.equal(getCommercialCheckpointRisk({ ...base, poStatus: 'Received', deliveryStatus: 'Delivered', paymentStatus: 'Due', paymentDueDate: '2026-06-19' }, '2026-06-20'), 'Payment overdue');
assert.equal(getCommercialCheckpointRisk({ ...base, poStatus: 'Received', deliveryStatus: 'Delivered', paymentStatus: 'Paid', paymentDueDate: '2026-06-19' }, '2026-06-20'), null);

assert.equal(getNextCommercialProgressAction(base)?.kind, 'receive-po');
assert.equal(getNextCommercialProgressAction({ ...base, poStatus: 'Received', deliveryStatus: 'Not scheduled' }), null);
assert.equal(getNextCommercialProgressAction({ ...base, poStatus: 'Received', deliveryStatus: 'Scheduled' })?.kind, 'mark-delivered');
assert.equal(getNextCommercialProgressAction({ ...base, poStatus: 'Received', deliveryStatus: 'Delivered' })?.kind, 'mark-paid');
assert.equal(getNextCommercialProgressAction({ ...base, poStatus: 'Received', deliveryStatus: 'Delivered', paymentStatus: 'Paid' }), null);
assert.equal(formatCompactCurrencyAmount(4_400_000_000, 'VND').endsWith(' VND'), true);
assert.equal(formatCompactCurrencyAmount(4_400_000_000, 'VND').length < '4,400,000,000 VND'.length, true);

console.log('Commercial fulfillment verification passed.');
