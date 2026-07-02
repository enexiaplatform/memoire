import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildMeddicStakeholderMap,
  meddicStakeholderRoles,
} from '../src/utils/meddicStakeholderMap.ts';
import { buildProactiveNudges } from '../src/utils/proactiveNudges.ts';

const today = '2026-06-30';
for (const role of ['Champion', 'Economic Buyer', 'Technical Buyer', 'Procurement', 'User', 'Coach', 'Blocker', 'Decision Committee', 'Unknown']) {
  assert.ok(meddicStakeholderRoles.includes(role), `Role model missing ${role}`);
}

const opportunity = {
  id: 'opp-pyme',
  accountName: 'Pymepharco',
  opportunityName: 'DCM comparison',
  stage: 'Proposal',
  estimatedValue: 300_000,
  currency: 'SGD',
  expectedClosePeriod: 'Q3',
  productOrSolution: 'DCM',
  decisionMaker: '',
  budgetOwner: '',
  procurementPath: '',
  technicalCriteria: '',
  nextAction: 'Confirm procurement path',
  nextActionDate: '2026-06-28',
  evidence: 'Customer is evaluating DCM comparison.',
  missingContext: '',
  objectionDebt: '',
  forecastEvidenceCategory: 'Weak but recoverable',
  decisionRecommendation: 'Rescue',
  status: 'Active',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-30T00:00:00.000Z',
  storageMode: 'local',
};

const knownContact = {
  id: 'st-ms-nhu',
  accountId: '',
  accountName: 'Pymepharco',
  opportunityId: opportunity.id,
  opportunityName: opportunity.opportunityName,
  name: 'Ms. Nhu',
  roleTitle: 'QA manager',
  stakeholderRole: 'Unknown',
  influenceLevel: 'Medium',
  relationshipStrength: 'Developing',
  stance: 'Supportive',
  email: '',
  phone: '',
  notes: 'Known contact from meeting.',
  tags: ['from-capture', 'role-needs-confirmation'],
  lastInteractionDate: '2026-06-29',
  createdAt: '2026-06-29T00:00:00.000Z',
  updatedAt: '2026-06-29T00:00:00.000Z',
  storageMode: 'local',
};
const inferredChampion = {
  ...knownContact,
  id: 'st-inferred-champ',
  name: 'Ms. Lan',
  stakeholderRole: 'Champion',
  tags: ['role-inferred'],
};
const confirmedBuyer = {
  ...knownContact,
  id: 'st-buyer',
  name: 'Mr. Minh',
  stakeholderRole: 'Economic Buyer',
  influenceLevel: 'High',
  notes: 'Confirmed: owns budget approval. Next action: Confirm budget signoff',
  tags: ['role-confirmed'],
};
const blocker = {
  ...knownContact,
  id: 'st-blocker',
  name: 'Procurement blocker',
  stakeholderRole: 'Blocker',
  influenceLevel: 'High',
  relationshipStrength: 'Weak',
  stance: 'Resistant',
  tags: ['role-confirmed'],
  notes: 'Confirmed procurement blocker.',
};
const objection = {
  id: 'obj-blocker',
  accountId: '',
  accountName: 'Pymepharco',
  opportunityId: opportunity.id,
  opportunityName: opportunity.opportunityName,
  stakeholderId: blocker.id,
  stakeholderName: blocker.name,
  sourceActivityId: '',
  objectionType: 'Lead time',
  objectionText: 'Lead time proof is missing.',
  impact: 'High',
  status: 'Open',
  requiredProof: 'Send delivery timeline',
  responsePlan: 'Send DCM delivery proof',
  resolutionNote: '',
  dueDate: '2026-06-27',
  resolvedAt: '',
  tags: [],
  createdAt: '2026-06-27T00:00:00.000Z',
  updatedAt: '2026-06-27T00:00:00.000Z',
  storageMode: 'local',
};

const map = buildMeddicStakeholderMap({
  opportunity,
  stakeholders: [knownContact, inferredChampion, confirmedBuyer, blocker],
  objections: [objection],
  activities: [],
  today,
});
assert.equal(map.items.find((item) => item.name === 'Ms. Nhu')?.confidence, 'needs confirmation');
assert.equal(map.items.find((item) => item.name === 'Ms. Lan')?.confidence, 'inferred');
assert.equal(map.hasConfirmedChampion, false, 'inferred champion must not count as confirmed');
assert.equal(map.hasConfirmedEconomicBuyer, true);
assert.ok(map.missingRoles.some((role) => role.role === 'Champion'), 'missing Champion should create missing evidence');
assert.ok(map.missingRoles.some((role) => role.role === 'Procurement'), 'missing Procurement should create missing evidence');
assert.ok(map.relationshipRisks.some((risk) => risk.includes('blocker') || risk.includes('resistant')), 'blocker should create relationship risk');
assert.ok(map.objectionRisks.some((risk) => risk.includes('Lead time proof')), 'open blocker objection should create risk signal');
assert.ok(map.stakeholderNextActions.some((action) => action.overdue), 'stakeholder objection next action should be overdue');

const unknownOnlyMap = buildMeddicStakeholderMap({ opportunity, stakeholders: [knownContact], objections: [], activities: [], today });
assert.ok(unknownOnlyMap.missingRoles.some((role) => role.role === 'Economic Buyer'), 'missing Economic Buyer should create missing evidence');

assert.ok(map.briefStatusLines.some((line) => line.includes('Champion: inferred') || line.includes('Champion: needs confirmation')), 'Manager brief should not hallucinate confirmed champion');

const nudgeCenter = buildProactiveNudges({
  opportunities: [opportunity],
  stakeholders: [knownContact, inferredChampion, blocker],
  objections: [objection],
  activities: [],
  revenueActions: [],
  today,
});
assert.equal(nudgeCenter.todayNudges.length <= 5, true, 'Today nudge cap should still apply');
assert.ok(nudgeCenter.allActiveNudges.some((nudge) => nudge.title === 'Champion missing on rescue deal'), 'Missing champion should create MEDDIC nudge');
assert.ok(nudgeCenter.allActiveNudges.some((nudge) => nudge.title === 'Economic buyer unknown'), 'Missing economic buyer should create MEDDIC nudge');
assert.ok(nudgeCenter.allActiveNudges.some((nudge) => nudge.title === 'Procurement path missing'), 'Missing procurement should create MEDDIC nudge');
assert.ok(nudgeCenter.allActiveNudges.some((nudge) => nudge.title === 'Blocker objection unresolved'), 'Blocker objection should create MEDDIC nudge');
assert.ok(nudgeCenter.allActiveNudges.some((nudge) => nudge.title === 'Stakeholder next action overdue'), 'Stakeholder overdue next action should create MEDDIC nudge');

const utility = readFileSync('src/utils/meddicStakeholderMap.ts', 'utf8');
for (const marker of ['formatSafeBusinessDate', 'sanitizeBusinessDate', 'confidence', 'needs confirmation', 'inferred', 'Missing evidence']) {
  assert.ok(utility.includes(marker), `MEDDIC stakeholder map missing ${marker}`);
}

const pipelineMapper = readFileSync('src/utils/opportunityToPipelineBrief.ts', 'utf8');
for (const marker of ['Stakeholder evidence', 'MEDDIC stakeholder map', 'formatStakeholderMapForBrief', 'stakeholderMap.missingRoles']) {
  assert.ok(pipelineMapper.includes(marker), `Pipeline Defense brief integration missing ${marker}`);
}

const opportunityUi = readFileSync('src/features/opportunities/OpportunitiesPage.tsx', 'utf8');
for (const marker of ['MEDDIC Stakeholder Map', 'Stakeholder map is empty', 'Add Champion, Economic Buyer, Technical Buyer, or Procurement owner', 'Mark role missing']) {
  assert.ok(opportunityUi.includes(marker), `Opportunity MEDDIC map UI missing ${marker}`);
}

const stakeholderUi = readFileSync('src/features/stakeholders/StakeholdersPage.tsx', 'utf8');
for (const marker of ['Role confirmed by evidence', 'Stakeholder next action', 'Evidence note']) {
  assert.ok(stakeholderUi.includes(marker), `Stakeholder evidence UI missing ${marker}`);
}

const captureUi = readFileSync('src/features/dailyCapture/DailyCapturePage.tsx', 'utf8');
assert.ok(captureUi.includes('Role starts as Unknown'), 'Capture contact suggestion must not auto-invent role');
assert.ok(captureUi.includes('will not auto-assign Champion or Economic Buyer'), 'Capture must explicitly avoid role hallucination');

const proactive = readFileSync('src/utils/proactiveNudges.ts', 'utf8');
for (const marker of ['Champion missing on rescue deal', 'Economic buyer unknown', 'Procurement path missing', 'Blocker objection unresolved', 'Stakeholder next action overdue']) {
  assert.ok(proactive.includes(marker), `Proactive nudges missing ${marker}`);
}

const sidebar = readFileSync('src/components/layout/Sidebar.tsx', 'utf8');
assert.equal((sidebar.match(/to: '\/app\//g) || []).length, 12, 'A new CRM navigation item was added.');

console.log('MEDDIC stakeholder map regression verified.');
