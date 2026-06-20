import assert from 'node:assert/strict';
import {
  getCommercialCheckpointRisk,
  getQuoteCommercialStage,
} from '../src/utils/commercialFulfillment.ts';

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

console.log('Commercial fulfillment verification passed.');
