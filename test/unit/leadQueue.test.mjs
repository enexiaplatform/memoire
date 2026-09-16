import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLeadQueue,
  buildLeadSignals,
  classifyNurture,
  disqualifiedLeadIds,
  isDisqualifiedLeadOutcome,
  isLeadRecord,
  NURTURE_DUE_LEAD_DAYS,
  outcomeReasonCategoryForLead,
  qualifyLeadEvidence,
  resolveLeadSource,
  selectLeads,
  selectQualifiedPipeline,
} from '../../src/utils/leadQueue.ts';

const TODAY = '2026-09-16';

const deal = (patch = {}) => ({
  id: patch.id || 'o1',
  accountName: 'ABC Pharma',
  opportunityName: 'QC laboratory',
  stage: 'Lead',
  status: 'Active',
  estimatedValue: null,
  currency: 'VND',
  expectedClosePeriod: '',
  productOrSolution: '',
  decisionMaker: '',
  budgetOwner: '',
  procurementPath: '',
  technicalCriteria: '',
  nextAction: '',
  nextActionDate: '',
  evidence: '',
  missingContext: '',
  objectionDebt: '',
  forecastEvidenceCategory: 'Unsupported',
  decisionRecommendation: 'Monitor',
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
  storageMode: 'local',
  ...patch,
});

const touch = (patch = {}) => ({
  id: patch.id || 'a1',
  accountName: 'ABC Pharma',
  opportunityName: 'QC laboratory',
  linkedOpportunityId: 'o1',
  linkedOpportunityName: 'QC laboratory',
  linkedAccountName: 'ABC Pharma',
  linkStatus: 'Linked',
  activityType: 'Meeting',
  summary: 'Met the QA manager',
  nextAction: '',
  dueDate: '',
  tags: [],
  rawNote: 'Met the QA manager',
  activityDate: '2026-09-10',
  createdAt: '2026-09-10T09:00:00.000Z',
  updatedAt: '2026-09-10T09:00:00.000Z',
  storageMode: 'local',
  ...patch,
});

const person = (patch = {}) => ({
  id: 's1', accountId: '', accountName: 'ABC Pharma', opportunityId: 'o1', opportunityName: 'QC laboratory',
  name: 'Minh', roleTitle: 'QA Manager', stakeholderRole: 'Unknown', influenceLevel: 'Unknown',
  relationshipStrength: 'Unknown', stance: 'Unknown', email: '', phone: '', notes: '', tags: [],
  lastInteractionDate: '', createdAt: '', updatedAt: '', storageMode: 'local', ...patch,
});

describe('the lead partition', () => {
  test('a Lead-stage record is a lead, and nothing else is', () => {
    const book = [deal({ id: 'l', stage: 'Lead' }), deal({ id: 'd', stage: 'Discovery' }), deal({ id: 'p', stage: 'Proposal' })];
    assert.deepEqual(selectLeads(book).map((row) => row.id), ['l']);
    assert.deepEqual(selectQualifiedPipeline(book).map((row) => row.id), ['d', 'p']);
  });

  test('every record is on exactly one side', () => {
    const book = [
      deal({ id: 'l', stage: 'Lead' }),
      deal({ id: 'dq', stage: 'Lost', status: 'Lost' }),
      deal({ id: 'lost', stage: 'Lost', status: 'Lost' }),
      deal({ id: 'won', stage: 'Won', status: 'Won' }),
    ];
    const outcomes = [
      { opportunityId: 'dq', outcome: 'Lost', stageBeforeOutcome: 'Lead' },
      { opportunityId: 'lost', outcome: 'Lost', stageBeforeOutcome: 'Negotiation' },
    ];
    const disqualified = disqualifiedLeadIds(outcomes);
    const leads = selectLeads(book, disqualified).map((row) => row.id);
    const pipeline = selectQualifiedPipeline(book, disqualified).map((row) => row.id);
    assert.deepEqual(leads, ['l', 'dq']);
    assert.deepEqual(pipeline, ['lost', 'won']);
    assert.equal(leads.length + pipeline.length, book.length);
  });

  test('a disqualified lead is recognised by its close-out, not its stage', () => {
    assert.equal(isDisqualifiedLeadOutcome({ outcome: 'Lost', stageBeforeOutcome: 'Lead' }), true);
    assert.equal(isDisqualifiedLeadOutcome({ outcome: 'Lost', stageBeforeOutcome: 'Discovery' }), false);
    assert.equal(isDisqualifiedLeadOutcome({ outcome: 'Won', stageBeforeOutcome: 'Lead' }), false);
  });

  test('a lead qualified and later lost is a lost deal, not a lead', () => {
    const record = deal({ id: 'x', stage: 'Lost', status: 'Lost' });
    const disqualified = disqualifiedLeadIds([{ opportunityId: 'x', outcome: 'Lost', stageBeforeOutcome: 'Proposal' }]);
    assert.equal(isLeadRecord(record, disqualified), false);
  });
});

describe('lead source', () => {
  test('the controlled field wins, with its detail', () => {
    const resolved = resolveLeadSource({ leadSource: 'Trade show', leadSourceDetail: 'Pharmedi 2026', channel: 'DKSH' });
    assert.deepEqual(resolved, { source: 'Trade show', detail: 'Pharmedi 2026', label: 'Trade show', fromLegacyField: false });
  });

  test('an imported channel is kept, never thrown away', () => {
    const resolved = resolveLeadSource({ leadSource: '', leadSourceDetail: '', channel: 'DKSH' });
    assert.equal(resolved.label, 'DKSH');
    assert.equal(resolved.source, '');
    assert.equal(resolved.fromLegacyField, true);
  });

  test('a channel spelled like a controlled source maps onto it', () => {
    assert.equal(resolveLeadSource({ channel: 'tradeshow' }).source, 'Trade show');
    assert.equal(resolveLeadSource({ channel: 'RFQ' }).source, 'Tender / RFQ');
  });

  test('product line and import batch are not sources', () => {
    // The live book carries "Instrument" in opportunity_type and
    // "founder_core_fy26" in source_system. Neither says where a conversation
    // came from, and the 2026-09-15 Leads tab showed both as the source.
    const resolved = resolveLeadSource({ channel: '', opportunityType: 'Instrument', sourceSystem: 'founder_core_fy26' });
    assert.equal(resolved.label, '');
  });

  test('an unrecognised controlled value is not invented into one', () => {
    assert.equal(resolveLeadSource({ leadSource: 'Webinar' }).source, '');
  });
});

describe('qualification evidence', () => {
  test('a bare lead is New with every piece missing', () => {
    const q = qualifyLeadEvidence({ opportunity: deal(), activities: [], stakeholders: [], objections: [], knownAccount: false });
    assert.equal(q.readiness, 'New');
    assert.equal(q.present, 0);
    assert.deepEqual(q.missing, ['fit', 'contact', 'need', 'engagement', 'nextMove']);
  });

  test('ready means fit, contact, need and a conversation - and says why each is there', () => {
    const q = qualifyLeadEvidence({
      opportunity: deal({ evidence: 'New microbiology lab planned for 2027. Uses Merck today.' }),
      activities: [touch()],
      stakeholders: [person()],
      objections: [],
      knownAccount: true,
    });
    assert.equal(q.readiness, 'Ready to qualify');
    assert.match(q.evidence.find((item) => item.dimension === 'contact').detail, /Minh, QA Manager/);
    assert.match(q.evidence.find((item) => item.dimension === 'need').detail, /microbiology lab/);
  });

  test('a next move is hygiene, not qualification', () => {
    const q = qualifyLeadEvidence({
      opportunity: deal({ evidence: 'Needs rapid testing', nextAction: '' }),
      activities: [touch()], stakeholders: [person()], objections: [], knownAccount: true,
    });
    assert.equal(q.readiness, 'Ready to qualify');
    assert.ok(q.missing.includes('nextMove'));
  });

  test('a contact alone is Engaged, not ready', () => {
    const q = qualifyLeadEvidence({ opportunity: deal(), activities: [], stakeholders: [person()], objections: [], knownAccount: false });
    assert.equal(q.readiness, 'Engaged');
  });

  test('there is no score', () => {
    const q = qualifyLeadEvidence({ opportunity: deal(), activities: [], stakeholders: [], objections: [], knownAccount: false });
    assert.equal('score' in q, false);
  });
});

describe('nurture', () => {
  test('parked until a date, and due a few days before it', () => {
    const far = classifyNurture({ nurturedUntil: '2026-12-01', nurtureReason: 'Budget next FY' }, TODAY);
    assert.equal(far.nurturing, true);
    assert.equal(far.due, false);
    const soon = classifyNurture({ nurturedUntil: '2026-09-19' }, TODAY);
    assert.equal(soon.daysUntilRevisit, NURTURE_DUE_LEAD_DAYS);
    assert.equal(soon.due, true);
    const past = classifyNurture({ nurturedUntil: '2026-09-10' }, TODAY);
    assert.equal(past.due, true);
    assert.ok(past.daysUntilRevisit < 0);
  });

  test('no date means not parked', () => {
    assert.equal(classifyNurture({ nurturedUntil: '' }, TODAY).nurturing, false);
    assert.equal(classifyNurture({ nurturedUntil: 'not a date' }, TODAY).nurturing, false);
  });
});

describe('the queue', () => {
  const build = (opportunities, extra = {}) => buildLeadQueue({ opportunities, today: TODAY, ...extra });

  test('a lead nobody has spoken to is New', () => {
    const queue = build([deal()]);
    assert.equal(queue.rows[0].state, 'new');
    assert.equal(queue.counts.new, 1);
  });

  test('a parked lead is Nurture, not going quiet', () => {
    const queue = build(
      [deal({ nurturedUntil: '2026-12-01', createdAt: '2026-06-01T00:00:00.000Z' })],
      { activities: [touch({ activityDate: '2026-06-02' })] },
    );
    assert.equal(queue.rows[0].state, 'nurture');
  });

  test('a nurtured lead comes back on its own when the revisit approaches', () => {
    const queue = build([deal({ nurturedUntil: '2026-09-18' })], { activities: [touch({ activityDate: '2026-06-02' })] });
    assert.equal(queue.rows[0].state, 'needs-action');
    assert.match(queue.rows[0].stateReason, /Revisit/);
  });

  test('contacted once and quiet since is Going quiet', () => {
    const queue = build([deal()], { activities: [touch({ activityDate: '2026-08-20' })] });
    assert.equal(queue.rows[0].state, 'going-quiet');
  });

  test('a booked follow-up is not called silence', () => {
    const queue = build(
      [deal({ nextAction: 'Call QA', nextActionDate: '2026-09-22' })],
      { activities: [touch({ activityDate: '2026-08-20' })] },
    );
    assert.notEqual(queue.rows[0].state, 'going-quiet');
  });

  test('closed leads leave every count but stay readable', () => {
    const queue = build(
      [deal({ id: 'dq', stage: 'Lost', status: 'Lost' }), deal({ id: 'open' })],
      { opportunityOutcomes: [{ opportunityId: 'dq', outcome: 'Lost', stageBeforeOutcome: 'Lead' }] },
    );
    assert.equal(queue.total, 1);
    assert.equal(queue.closedCount, 1);
    assert.equal(Object.values(queue.counts).reduce((sum, count) => sum + count, 0), 1);
    assert.equal(queue.rows.at(-1).closed, true);
  });

  test('qualified deals never enter the queue', () => {
    assert.equal(build([deal({ stage: 'Discovery' })]).rows.length, 0);
  });
});

describe('what Today is told', () => {
  test('exceptions with their rows, not a count of leads', () => {
    const queue = buildLeadQueue({
      today: TODAY,
      opportunities: [
        deal({ id: 'n1', accountName: 'New One', opportunityName: 'Media', createdAt: '2026-09-05T00:00:00.000Z' }),
        deal({ id: 'n2', accountName: 'New Two', opportunityName: 'Filters', createdAt: '2026-09-14T00:00:00.000Z' }),
        deal({ id: 'r1', accountName: 'Revisit', opportunityName: 'Autoclave', nurturedUntil: '2026-09-16' }),
      ],
      activities: [touch({ linkedOpportunityId: 'r1', accountName: 'Revisit', linkedAccountName: 'Revisit', opportunityName: 'Autoclave', linkedOpportunityName: 'Autoclave' })],
    });
    const signals = buildLeadSignals(queue);
    const neverContacted = signals.find((signal) => signal.kind === 'never-contacted');
    assert.equal(neverContacted.rows.length, 2);
    assert.match(neverContacted.headline, /2 new leads have never been contacted/);
    assert.match(neverContacted.detail, /11 days - New One/);
    assert.equal(neverContacted.href, '/app/leads?state=new');
    assert.ok(signals.some((signal) => signal.kind === 'revisit-due'));
  });

  test('a quiet queue tells Today nothing', () => {
    const queue = buildLeadQueue({ today: TODAY, opportunities: [] });
    assert.deepEqual(buildLeadSignals(queue), []);
  });
});

describe('disqualification reasons', () => {
  test('map onto the outcome categories win/loss learning already reads', () => {
    assert.equal(outcomeReasonCategoryForLead('No budget'), 'Budget');
    assert.equal(outcomeReasonCategoryForLead('Competitor locked'), 'Competitor');
    assert.equal(outcomeReasonCategoryForLead('Duplicate'), 'Other');
  });
});
