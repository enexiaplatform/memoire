import assert from 'node:assert/strict';
import { buildTodayCommandCenter } from '../src/utils/salesCommandCenter.ts';
import { buildOpportunitySalesFlowGuidance } from '../src/utils/salesFlowGuidance.ts';

function opportunity(overrides = {}) {
  return {
    id: 'opp-flow-1',
    accountName: 'Example Account',
    opportunityName: 'FY26 expansion',
    stage: 'Discovery',
    estimatedValue: 500_000_000,
    currency: 'VND',
    expectedClosePeriod: '',
    productOrSolution: 'Example solution',
    decisionMaker: '',
    budgetOwner: '',
    procurementPath: '',
    technicalCriteria: '',
    nextAction: '',
    nextActionDate: '',
    evidence: '',
    missingContext: '',
    objectionDebt: '',
    forecastEvidenceCategory: 'Weak but recoverable',
    decisionRecommendation: 'Monitor',
    status: 'Active',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-20T00:00:00.000Z',
    storageMode: 'local',
    ...overrides,
  };
}

const discovery = buildOpportunitySalesFlowGuidance(opportunity());
assert.equal(discovery.step.label, 'Discovery');
assert.equal(discovery.status, 'Needs action');
assert.ok(discovery.missingCheckpoints.includes('customer problem or buying signal'));
assert.ok(discovery.missingCheckpoints.includes('decision owner'));
assert.match(discovery.suggestedAction, /customer problem|decision owner/i);

const validation = buildOpportunitySalesFlowGuidance(opportunity({
  stage: 'Technical discussion',
  technicalCriteria: 'Acceptance criteria confirmed',
  evidence: 'Customer agreed to validation plan',
  nextActionDate: '2026-06-25',
}));
assert.equal(validation.step.label, 'Technical validation');
assert.equal(validation.status, 'Ready to advance');
assert.equal(validation.nextStepLabel, 'Proposal');

const procurement = buildOpportunitySalesFlowGuidance(opportunity({ stage: 'Procurement' }));
assert.equal(procurement.step.label, 'Procurement');
assert.match(procurement.suggestedAction, /procurement owner/i);
assert.ok(procurement.missingCheckpoints.includes('expected PO timing'));

const imported = buildOpportunitySalesFlowGuidance(opportunity({
  stage: 'Proposal',
  isStageInferred: true,
  decisionMaker: 'Decision owner',
  budgetOwner: 'Budget owner',
  nextActionDate: '2026-06-25',
}));
assert.equal(imported.missingCheckpoints[0], 'confirmed current stage');
assert.match(imported.suggestedAction, /confirm the current stage/i);

const commandCenter = buildTodayCommandCenter({
  activities: [],
  opportunities: [opportunity()],
  accounts: [],
  briefs: [],
  commercialActions: [{
    id: 'quote-payment',
    accountName: 'Example Account',
    label: 'Example quote',
    amount: 500_000_000,
    currency: 'VND',
    status: 'Quoted',
    risk: 'Quote expiring',
    nextAction: 'Confirm approval before expiry.',
    href: '/app/quotes',
    source: 'Quote',
  }],
});

const defense = commandCenter.dailyTimeblocks.find((block) => block.id === 'pipeline-defense');
assert.ok(defense?.actions.length);
assert.notEqual(defense?.actions[0]?.source, 'Quote');
assert.ok(defense?.actions.some((action) => action.source === 'Sales Flow'));
assert.match(defense?.actions.find((action) => action.source === 'Sales Flow')?.href || '', /opportunityId=opp-flow-1/);
assert.notEqual(commandCenter.priorityActions[0]?.source, 'Quote', 'deal execution should win equal-priority ordering');

console.log('Sales flow execution verification passed.');
