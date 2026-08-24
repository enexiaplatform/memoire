import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { deriveStakeholderCandidateFromCapture } from '../../src/utils/stakeholderGraph.ts';

const capture = (overrides = {}) => ({
  id: 'act-1',
  accountName: 'Grupo Pestana Hoteis',
  opportunityName: 'Heat recovery retrofit - 6 hotels Algarve',
  contactName: 'Sofia Marques',
  stakeholderName: 'Sofia Marques',
  stakeholderRole: 'Head of Engineering',
  competitors: [], buyingSignals: [], risks: [], timelineSignals: [], nextActions: [],
  activityType: 'Customer meeting',
  summary: 'Site visit with Sofia Marques, Head of Engineering.',
  nextAction: '', dueDate: '', tags: [], rawNote: '',
  activityDate: '2026-03-05',
  linkedOpportunityId: '', linkedOpportunityName: '', linkedAccountName: '',
  linkStatus: 'Unlinked',
  createdAt: '2026-03-05T00:00:00.000Z', updatedAt: '2026-03-05T00:00:00.000Z',
  storageMode: 'local',
  ...overrides,
});

describe('the job title a note gave survives into the stakeholder', () => {
  test('the title is carried, not dropped', () => {
    // Parsed, shown in the confirm panel, confirmed, saved - and then the
    // candidate dropped it, so "Create stakeholder" wrote an empty roleTitle
    // and the hardest fact about that person was gone.
    const candidate = deriveStakeholderCandidateFromCapture(capture());
    assert.equal(candidate.name, 'Sofia Marques');
    assert.equal(candidate.roleTitle, 'Head of Engineering');
  });

  test('a note with no title carries none, rather than something invented', () => {
    const candidate = deriveStakeholderCandidateFromCapture(capture({ stakeholderRole: '' }));
    assert.equal(candidate.roleTitle, '');
  });

  test('whitespace is not a title', () => {
    const candidate = deriveStakeholderCandidateFromCapture(capture({ stakeholderRole: '   ' }));
    assert.equal(candidate.roleTitle, '');
  });

  test('a note naming nobody produces no candidate at all', () => {
    assert.equal(deriveStakeholderCandidateFromCapture(capture({ contactName: '', stakeholderName: '' })), null);
  });
});

const dealFor = (id, status) => ({
  id, accountName: `Account ${id}`, opportunityName: `Deal ${id}`, stage: 'Proposal',
  estimatedValue: 100_000, currency: 'EUR', expectedClosePeriod: 'Q4 2026',
  productOrSolution: '', decisionMaker: '', budgetOwner: '', procurementPath: '',
  technicalCriteria: '', nextAction: '', nextActionDate: '', evidence: '', missingContext: '',
  objectionDebt: '', forecastEvidenceCategory: 'Weak but recoverable',
  decisionRecommendation: 'Monitor', status,
  createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z', storageMode: 'local',
});

describe('deals with nobody named counts the deals still running', () => {
  test('a deal won or lost months ago is not outstanding work', async () => {
    const { summarizeStakeholderCoverage } = await import('../../src/utils/stakeholderGraph.ts');
    // The tile read "DEALS WITH NOBODY NAMED 27" beside "ACCOUNTS MISSING A
    // CHAMPION 18" - same function, two universes, one of them counting deals
    // that closed in March.
    const summary = summarizeStakeholderCoverage([], [
      dealFor('a', 'Active'),
      dealFor('b', 'Active'),
      dealFor('c', 'Won'),
      dealFor('d', 'Lost'),
      dealFor('e', 'On hold'),
    ]);
    assert.equal(summary.opportunitiesWithStakeholderRisk, 2);
  });

  test('it agrees with the champion count on the same book', async () => {
    const { summarizeStakeholderCoverage } = await import('../../src/utils/stakeholderGraph.ts');
    const summary = summarizeStakeholderCoverage([], [
      dealFor('a', 'Active'), dealFor('b', 'Active'), dealFor('c', 'Won'),
    ]);
    assert.equal(summary.opportunitiesWithStakeholderRisk, summary.accountsWithMissingChampion);
  });
});
