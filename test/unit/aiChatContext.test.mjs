import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import { buildChatContext } from '../../src/features/aiChat/chatContext.ts';

const deal = (id, overrides = {}) => ({ id, userId: 'owner-1', source: 'user', accountId: 'a1', accountName: 'Fictional Northstar', opportunityName: `Analyzer ${id}`, estimatedValue: null, currency: 'VND', stage: 'Proposal', status: 'Active', evidence: 'Customer requested a demo.', nextAction: 'Confirm the demo scope.', updatedAt: '2026-10-16T00:00:00Z', ...overrides });
const workspace = (overrides = {}) => ({ accounts: [{ id: 'a1', userId: 'owner-1', accountName: 'Fictional Northstar', industry: 'Research', relationshipStatus: 'Active', notes: 'CONFIDENTIAL-RAW-ACCOUNT-NOTE' }], opportunities: [deal('d1')], activities: [{ id: 'activity-1', userId: 'owner-1', linkedOpportunityId: 'd1', activityDate: '2026-10-15', activityType: 'Customer meeting', summary: 'Requested a demo.', rawNote: 'CONFIDENTIAL-RAW-CAPTURE' }], quotes: [], commitments: [], receivableRecords: [], milestoneRecords: [], ...overrides });

test('context excludes foreign and sample data, full raw notes and unselected accounts', () => {
  const input = workspace({ opportunities: [deal('d1'), deal('foreign', { userId: 'owner-2', accountName: 'PRIVATE-OTHER-OWNER' }), deal('sample', { isSample: true }), deal('demo', { source: 'demo' })] });
  const context = buildChatContext(input, 'owner-1', { kind: 'opportunity', id: 'd1' }, 'demo');
  const text = JSON.stringify(context);
  for (const secret of ['PRIVATE-OTHER-OWNER', 'CONFIDENTIAL-RAW-ACCOUNT-NOTE', 'CONFIDENTIAL-RAW-CAPTURE']) assert.equal(text.includes(secret), false);
  assert.equal(context.sources.some(row => row.id === 'd1'), true);
  assert.equal(context.sources.some(row => row.id === 'activity-1'), true);
  assert.match(context.sources.find(row => row.id === 'd1').detail, /unknown/);
});
test('account scope uses confirmed IDs and cannot silently match a similar name', () => {
  const input = workspace({ opportunities: [deal('linked'), deal('unlinked', { accountId: undefined }), deal('other', { accountId: 'a2' })] });
  const context = buildChatContext(input, 'owner-1', { kind: 'account', id: 'a1' }, 'Analyzer');
  assert.deepEqual(context.sources.filter(row => row.kind === 'opportunity').map(row => row.id), ['linked']);
  assert.match(context.limitations.join(' '), /without a confirmed account ID/);
  assert.throws(() => buildChatContext(input, 'owner-1', { kind: 'account', id: 'absent' }, 'hello'));
});
test('relevant retrieval is bounded and explicitly says selected subset', () => {
  const input = workspace({ opportunities: Array.from({ length: 35 }, (_, index) => deal(`deal-${index}`, { opportunityName: index === 25 ? 'Unique spectrometer' : `Analyzer ${index}` })) });
  const context = buildChatContext(input, 'owner-1', { kind: 'all' }, 'Unique spectrometer');
  assert.equal(context.sources.filter(row => row.kind === 'opportunity').length, 5);
  assert.equal(context.sources.some(row => row.id === 'deal-25'), true);
  assert.match(context.facts[0], /5 of 35/);
  assert.match(context.facts[0], /never a complete pipeline total/);
});
test('money evidence that exceeds the source budget never produces a partial total', () => {
  const input = workspace({ quotes: Array.from({ length: 30 }, (_, index) => ({ id: `quote-${index}`, opportunityId: 'd1', amount: 100, currency: 'VND', title: 'Fictional quote' })) });
  const context = buildChatContext(input, 'owner-1', { kind: 'opportunity', id: 'd1' }, 'money');
  assert.match(context.limitations.join(' '), /No order or collection totals were calculated/);
  assert.equal(context.facts.some(row => row.includes('outstanding:')), false);
  assert.ok(context.sources.length <= 24);
});
test('a won deal with unknown money is not reported as zero outstanding', () => {
  const input = workspace({ opportunities: [deal('d1', { stage: 'Won', status: 'Won', estimatedValue: null })] });
  const context = buildChatContext(input, 'owner-1', { kind: 'opportunity', id: 'd1' }, 'money');
  assert.match(context.limitations.join(' '), /missing money or FX/);
  assert.equal(context.facts.some(row => row.includes('outstanding: 0')), false);
});

test('Q4 forecast uses the full scoped book, beyond the five detailed source records', () => {
  const input = workspace({ opportunities: Array.from({ length: 12 }, (_, index) => deal(`q4-${index}`, { estimatedValue: 100, expectedClosePeriod: `Q4 ${new Date().getFullYear()}`, pipelineProbability: 50, createdAt: '2026-10-01T00:00:00Z' })) });
  const context = buildChatContext(input, 'owner-1', { kind: 'all' }, 'Deal nào forecast Q4?');
  assert.equal(context.sources.filter(row => row.kind === 'opportunity').length, 5);
  assert.ok(context.sources.some(row => row.key === 'analysis:quarter-forecast'));
  assert.match(context.facts.join(' '), /open pipeline 1200 VND/);
  assert.match(context.limitations.join(' '), /All 12 open contributors/);
});

test('weekly context does not reintroduce unrelated old deal snippets', () => {
  const input = workspace({ opportunities: [deal('old-backlog', {nextActionDate:'2020-08-18', evidence:'OLD-UNRELATED-EVIDENCE'})] });
  const context = buildChatContext(input, 'owner-1', {kind:'all'}, 'Tuần này gặp KH nào?');
  assert.equal(context.sources.some(row => row.id === 'old-backlog'), false);
  assert.equal(JSON.stringify(context).includes('OLD-UNRELATED-EVIDENCE'), false);
});
