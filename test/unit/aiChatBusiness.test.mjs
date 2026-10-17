import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import { businessAnswer } from '../../src/features/aiChat/businessAnswers.ts';

const now = new Date(2026, 9, 16, 12);
const deal = (id, more = {}) => ({ id, accountId: 'a1', accountName: 'Fictional customer', opportunityName: id, estimatedValue: 100, currency: 'VND', stage: 'Proposal', status: 'Active', expectedClosePeriod: 'Q4 2026', nextAction: 'Confirm demo scope', nextActionDate: '2026-10-15', evidence: 'Demo requested', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-15T00:00:00Z', ...more });
const workspace = (more = {}) => ({ accounts: [], opportunities: [deal('d1')], activities: [], quotes: [], commitments: [], threads: [], opportunityOutcomes: [], portfolioRecords: [], ...more });

test('Vietnamese meeting question uses the full Plan engine and never invents a visit channel', () => {
  const result = businessAnswer(workspace({ opportunities: Array.from({ length: 12 }, (_, index) => deal(`d-${index}`)) }), 'Tuần này cần đi gặp KH nào?', [], now);
  assert.equal(result.source.id, 'weekly-actions');
  assert.match(result.facts.join(' '), /12 open plan\/follow-up items/);
  assert.match(result.facts.join(' '), /channel not recorded/);
  assert.match(result.limitations.join(' '), /not a confirmed face-to-face visit/);
});

test('weekly detail retrieval follows actual Plan items rather than older overdue deal dates', () => {
  const result = businessAnswer(workspace({ opportunities: [deal('this-week'), deal('old-backlog', {nextActionDate:'2026-08-18'})] }), 'Tuần này gặp KH nào?', [{id:'completed-old',date:'2026-08-18',derivedKey:'deal:old-backlog:2026-08-18',label:'Completed',tag:'',done:true,createdAt:'2026-08-18',updatedAt:'2026-08-18'}], now);
  assert.ok(result.preferredIds.includes('this-week'));
  assert.equal(result.preferredIds.includes('old-backlog'), false);
  assert.match(result.facts.join(' '), /in-person visit channels in this week: 0/);
});
test('Q4 includes every qualified active contributor, excludes leads, and honors imported quarter splits', () => {
  const data = workspace({ opportunities: [deal('a'), deal('b', { quarterValues: { Q3: 50, Q4: 200 }, fy26Value: 250 }), deal('lead', { stage: 'Lead', estimatedValue: 9999 }), deal('next-year', { expectedClosePeriod: 'Q4 2027', estimatedValue: 700 })] });
  const result = businessAnswer(data, 'Deal nào forcast Q4 2026?', [], now);
  assert.match(result.facts.join(' '), /open pipeline 300 VND/);
  assert.ok(result.preferredIds.includes('a') && result.preferredIds.includes('b'));
  assert.equal(result.preferredIds.includes('lead'), false);
  assert.equal(result.preferredIds.includes('next-year'), false);
});
test('brand trend is a dated metric comparison and preserves missing historical pipeline evidence', () => {
  const result = businessAnswer(workspace({ opportunities: [deal('won-current', { stage: 'Won', status: 'Won', closedOn: '2026-10-10' }), deal('won-prev', { stage: 'Won', status: 'Won', closedOn: '2026-09-10', estimatedValue: 60 }), deal('undated', { stage: 'Won', status: 'Won', closedOn: '' })] }), 'Brand nào đang tăng giảm?', [], now);
  assert.equal(result.source.id, 'brand-performance');
  assert.match(result.facts.join(' '), /100 vs previous matched MTD 60 VND; change 40 VND/);
  assert.match(result.facts.join(' '), /Unassigned brand/);
  assert.match(result.limitations.join(' '), /1 Won deals have no confirmed close date/);
  assert.match(result.limitations.join(' '), /do not claim that current pipeline increased/);
});


test('preparing an empty next week proposes unfinished work instead of asking for known details', () => {
  const data = workspace({opportunities:[deal('overdue'),deal('lead',{stage:'Lead',nextActionDate:'2026-09-23'}),deal('undated',{nextActionDate:''}),deal('future',{nextActionDate:'2026-11-01'}),deal('won',{status:'Won'})]});
  const result = businessAnswer(data, 'Chuẩn bị plan tuần sau cho tôi', [], now);
  const facts = result.facts.join(' ');
  assert.match(facts, /0 open plan\/follow-up items/);
  assert.match(facts, /3 active opportunity\/Lead work candidates/);
  assert.match(facts, /opportunity:overdue:.*original due 2026-10-15; suggested date 2026-10-20/);
  assert.match(facts, /opportunity:lead:.*suggested date 2026-10-19/);
  assert.match(facts, /opportunity:undated:.*suggested date 2026-10-21/);
  assert.match(facts, /not a confirmed appointment/);
  assert.deepEqual(result.preferredIds, ['lead','overdue','undated']);
});

test('Plan preparation honors canonical completion and does not recreate already scheduled tasks', () => {
  const data=workspace({opportunities:[deal('done'),deal('scheduled',{stage:'Lead',nextActionDate:'2026-10-21'}),deal('blank',{nextAction:'',nextActionDate:'2026-11-01'}),deal('held',{status:'On hold'})]});
  const result=businessAnswer(data,'Prepare my plan for next week',[{id:'completion',derivedKey:'deal:done:2026-10-15',date:'2026-10-15',label:'Done',tag:'',done:true,createdAt:'2026-10-15',updatedAt:'2026-10-15'}],now);
  assert.match(result.facts.join(' '),/0 active opportunity\/Lead work candidates/);
  assert.match(result.facts.join(' '),/1 open plan\/follow-up items/);
  assert.equal(result.facts.some(fact=>fact.startsWith('DRAFT CANDIDATE')),false);
});

test('a question about existing next-week work stays a calendar query', () => {
  const result=businessAnswer(workspace(),'Tuần sau có việc gì đã lên lịch?',[],now);
  assert.equal(result.facts.some(fact=>fact.startsWith('DRAFT PLANNING MODE:')),false);
});


test('missing next actions become explicit review proposals without inventing customer promises',()=>{
  const result=businessAnswer(workspace({opportunities:[deal('needs-step',{nextAction:'',nextActionDate:''})]}),'Chuẩn bị plan tuần sau cho tôi',[],now);
  assert.match(result.facts.join(' '),/1 active opportunity\/Lead work candidates/);
  assert.match(result.facts.join(' '),/Rà soát cơ hội và xác nhận bước tiếp theo/);
  assert.match(result.facts.join(' '),/no recorded next action/);
  assert.match(result.facts.join(' '),/suggested date 2026-10-19/);
  assert.deepEqual(result.preferredIds,['needs-step']);
});
