import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The ruler must not change between baselines.
 *
 * This report exists to be run now and again in several weeks, and compared.
 * That only works while the metric definitions hold still - so what is pinned
 * here is the arithmetic and the honesty gates, not the prose around them.
 *
 * It runs the real command against a fixture archive rather than importing the
 * script, because the thing worth protecting is what `npm run
 * report:product-validation` prints, and a test that reached inside it could
 * pass while the command was broken.
 */

const scratch = mkdtempSync(join(tmpdir(), 'memoire-report-'));

const stamp = (day) => `${day}T00:00:00.000Z`;

const activity = (id, patch = {}) => ({
  id, accountName: 'Account A', opportunityName: '', activityType: 'Customer meeting',
  activityChannel: '', summary: 'A touch', nextAction: '', dueDate: '', tags: [], rawNote: '',
  activityDate: '2026-08-01', linkedOpportunityId: '', linkedOpportunityName: '',
  linkedAccountName: 'Account A', linkStatus: 'Unlinked', createdAt: stamp('2026-08-01'),
  updatedAt: stamp('2026-08-01'), storageMode: 'local', ...patch,
});

const opportunity = (id, patch = {}) => ({
  id, accountName: 'Account A', opportunityName: `Deal ${id}`, stage: 'Proposal',
  estimatedValue: 1, currency: 'VND', expectedClosePeriod: 'Q3 2026', productOrSolution: '',
  decisionMaker: '', budgetOwner: '', procurementPath: '', technicalCriteria: '',
  nextAction: '', nextActionDate: '', evidence: '', missingContext: '', objectionDebt: '',
  forecastEvidenceCategory: 'Defensible', decisionRecommendation: 'Monitor', status: 'Active',
  createdAt: stamp('2026-01-01'), updatedAt: stamp('2026-08-01'), storageMode: 'local', ...patch,
});

function writeArchive(name, localBrowserData) {
  const path = join(scratch, `${name}.json`);
  writeFileSync(path, JSON.stringify({
    exportedAt: stamp('2026-09-06'),
    formatVersion: 1,
    mode: 'local-only',
    cloudData: {},
    localBrowserData,
  }));
  return path;
}

function run(archivePath, jsonPath) {
  const args = ['scripts/report-product-validation.mjs', '--export', archivePath];
  if (jsonPath) args.push('--json', jsonPath);
  return execFileSync(process.execPath, args, { encoding: 'utf8', cwd: process.cwd() });
}

describe('product validation report - the ruler', () => {
  test('a rate below its observation floor is refused rather than printed', () => {
    // Four captures is not an acceptance rate, whatever the arithmetic says.
    const output = run(writeArchive('thin', {
      'memoire.captureFactMetrics.v1': {
        captures: 4, capturesWithNoFacts: 1, reviewsSaved: 3, factsSaved: 6, unsupported: 1,
        saveFailures: 0, proposed: { objection: 4, commitment: 4 }, accepted: { objection: 3 },
        edited: {}, ignored: { commitment: 4 }, alreadyRecorded: {},
        scopeResolution: { strong_match: 3, unresolved: 1 },
        opportunityScopedFacts: 3, accountOnlyFacts: 5, updatedAt: stamp('2026-09-06'),
      },
    }));
    assert.match(output, /acceptance rate\s+not enough observation yet \(8\/20\)/);
    assert.match(output, /correction rate\s+not enough observation yet \(4\/20\)/);
    // The raw counts are still shown - a floor withholds the ratio, not the data.
    assert.match(output, /captures\s+4/);
    assert.match(output, /facts proposed\s+8/);
  });

  test('a rate above its floor is printed, and computed the way it is labelled', () => {
    const output = run(writeArchive('thick', {
      'memoire.captureFactMetrics.v1': {
        captures: 40, capturesWithNoFacts: 10, reviewsSaved: 30, factsSaved: 45, unsupported: 3,
        saveFailures: 0, proposed: { objection: 60, commitment: 40 },
        accepted: { objection: 45, commitment: 30 }, edited: { objection: 15 },
        ignored: { commitment: 10 }, alreadyRecorded: {},
        scopeResolution: { exact: 10, strong_match: 20, multiple_matches: 5, unresolved: 10, corrected: 5 },
        opportunityScopedFacts: 60, accountOnlyFacts: 40, updatedAt: stamp('2026-09-06'),
      },
    }));
    // accepted 75 / proposed 100
    assert.match(output, /acceptance rate\s+75%/);
    // edited 15 / accepted 75
    assert.match(output, /edit rate\s+20%/);
    // ignored 10 / proposed 100
    assert.match(output, /ignore rate\s+10%/);
    // captures with facts 30 / captures 40
    assert.match(output, /useful capture rate\s+75%/);
    // exact + strong_match 30 / 50
    assert.match(output, /automatic resolution rate\s+60%/);
    // corrected 5 / 50
    assert.match(output, /correction rate\s+10%/);
  });

  test('opportunity link rate uses the linkable denominator, not every activity', () => {
    const output = run(writeArchive('linkage', {
      'memoire.opportunities.v1': [opportunity('o1')],
      'memoire.salesActivities.v1': [
        activity('a1', { linkStatus: 'Linked', linkedOpportunityId: 'o1' }),
        activity('a2'),
        // On a customer with no deal at all: cannot be linked, must not count.
        activity('a3', { accountName: 'Account B', linkedAccountName: 'Account B' }),
        activity('a4', { accountName: 'Account B', linkedAccountName: 'Account B' }),
      ],
    }));
    assert.match(output, /activities\s+4/);
    assert.match(output, /on accounts that have a deal\s+2/);
    assert.match(output, /opportunity-linked\s+1/);
    assert.match(output, /opportunity-link rate\s+50%/);
  });

  test('learning strength counts come from the learning engine, unchanged', async () => {
    const archive = writeArchive('learning', {
      'memoire.opportunities.v1': [opportunity('o1'), opportunity('o2')],
      'memoire.salesActivities.v1': [],
    });
    const jsonPath = join(scratch, 'out.json');
    run(archive, jsonPath);
    const report = JSON.parse(readFileSync(jsonPath, 'utf8'));

    const { derivePersonalLearning } = await import('../../src/domain/commercialLearning/derivePersonalLearning.ts');
    const direct = derivePersonalLearning({
      opportunities: [opportunity('o1'), opportunity('o2')],
      opportunityOutcomes: [], activities: [], stakeholders: [], objections: [],
      quotes: [], commitments: [], evidence: [],
    });
    assert.equal(report.learning.patterns.length, direct.patterns.length);
    assert.equal(report.learning.strengthCounts.insufficient, direct.patterns.length);
    assert.equal(report.learning.strengthCounts.developing, 0);
  });

  test('the four review gates are present, and none fires on an empty workspace', () => {
    const jsonPath = join(scratch, 'gates.json');
    run(writeArchive('gates', {}), jsonPath);
    const report = JSON.parse(readFileSync(jsonPath, 'utf8'));

    assert.deepEqual(
      report.gates.map((gate) => gate.id).sort(),
      ['commercial_learning_review', 'focus_planner_review', 'linkage_review', 'llm_capture_review'],
    );
    for (const gate of report.gates) assert.equal(gate.ready, false, `${gate.id} fired on nothing`);
    assert.equal(report.suggestedDecision, 'continue_usage_collection');

    // Focus Planner is not inferable from pipeline data and must say so rather
    // than be answered from records that cannot answer it.
    const planner = report.gates.find((gate) => gate.id === 'focus_planner_review');
    assert.match(planner.because, /needs real usage observation/i);
  });

  test('the learning gate fires only when a pattern actually reaches developing', () => {
    // Twelve exposed (10W/2L) against twelve comparison (3W/9L) on customer
    // commitments: the shape Phase 4 tests as `developing`.
    const deals = [];
    const outcomes = [];
    const commitments = [];
    const push = (index, won, exposed) => {
      const id = `d${index}`;
      deals.push(opportunity(id, { status: won ? 'Won' : 'Lost' }));
      outcomes.push({
        id: `out-${id}`, opportunityId: id, accountName: 'Account A', opportunityName: 'Deal',
        outcome: won ? 'Won' : 'Lost', outcomeDate: '2026-08-10', finalAmount: 1, currency: 'VND',
        forecastEvidenceCategoryBeforeOutcome: 'Defensible',
        decisionRecommendationBeforeOutcome: 'Defend', stageBeforeOutcome: 'Proposal',
        pipelineProbabilityBeforeOutcome: null, reasonCategory: 'Technical fit', reasonText: '',
        createdAt: stamp('2026-08-10'), updatedAt: stamp('2026-08-10'), storageMode: 'local',
      });
      if (exposed) {
        commitments.push({
          id: `c-${id}`, userId: null, threadId: '', accountId: '', accountName: 'Account A',
          opportunityId: id, commitmentParty: 'customer', ownerLabel: 'Purchasing',
          commitmentText: 'Decide', originalDueDate: '2026-08-01', currentDueDate: '2026-08-01',
          silenceThresholdDays: 3, status: 'open', impactType: 'none', dueDateHistory: [],
          sourceType: 'manual', createdAt: stamp('2026-07-01'), updatedAt: stamp('2026-07-01'),
        });
      }
    };
    let index = 0;
    for (let i = 0; i < 10; i += 1) push(index++, true, true);
    for (let i = 0; i < 2; i += 1) push(index++, false, true);
    for (let i = 0; i < 3; i += 1) push(index++, true, false);
    for (let i = 0; i < 9; i += 1) push(index++, false, false);

    const jsonPath = join(scratch, 'developing.json');
    run(writeArchive('developing', {
      'memoire.opportunities.v1': deals,
      'memoire.opportunityOutcomes.v1': outcomes,
      'memoire.commercialCommitments.v1': commitments,
    }), jsonPath);
    const report = JSON.parse(readFileSync(jsonPath, 'utf8'));

    assert.equal(report.learning.strengthCounts.developing, 1);
    const gate = report.gates.find((item) => item.id === 'commercial_learning_review');
    assert.equal(gate.ready, true, 'one developing pattern is the Phase 4 gate');
  });

  test('the artifact carries counts and categories, never commercial content', () => {
    const jsonPath = join(scratch, 'privacy.json');
    run(writeArchive('privacy', {
      'memoire.opportunities.v1': [opportunity('o1', {
        accountName: 'Rohto Vietnam', opportunityName: 'PMM media rollout',
      })],
      'memoire.salesActivities.v1': [activity('a1', {
        accountName: 'Rohto Vietnam', linkedAccountName: 'Rohto Vietnam',
        rawNote: 'Met Lan about the trial', summary: 'Met Lan about the trial',
        stakeholderName: 'Lan',
      })],
      'memoire.stakeholders.v1': [{
        id: 'p1', accountId: '', accountName: 'Rohto Vietnam', opportunityId: '',
        opportunityName: '', name: 'Lan', roleTitle: 'QC', stakeholderRole: 'Unknown',
        influenceLevel: 'Unknown', relationshipStrength: 'Developing', stance: 'Unknown',
        email: '', phone: '', notes: '', tags: [], lastInteractionDate: '2026-08-01',
        createdAt: stamp('2026-08-01'), updatedAt: stamp('2026-08-01'), storageMode: 'local',
      }],
    }), jsonPath);

    const raw = readFileSync(jsonPath, 'utf8');
    for (const secret of ['Rohto', 'PMM media rollout', 'Lan', 'Met Lan about the trial']) {
      assert.equal(raw.includes(secret), false, `the artifact leaked commercial content: ${secret}`);
    }
    // And the console output is held to the same rule.
    const output = run(writeArchive('privacy', {
      'memoire.opportunities.v1': [opportunity('o1', {
        accountName: 'Rohto Vietnam', opportunityName: 'PMM media rollout',
      })],
    }));
    assert.equal(output.includes('Rohto'), false);
    assert.equal(output.includes('PMM media rollout'), false);
  });

  test('recommendation action tracking reports itself as unmeasurable rather than guessing', () => {
    const jsonPath = join(scratch, 'nba.json');
    const output = run(writeArchive('nba', {
      'memoire.opportunities.v1': [opportunity('o1')],
    }), jsonPath);
    assert.match(output, /Not currently measurable/);
    const report = JSON.parse(readFileSync(jsonPath, 'utf8'));
    assert.equal(report.nba.userActionTracking, 'not_currently_measurable');
  });

  test('the same archive produces the same numbers twice', () => {
    const archive = writeArchive('determinism', {
      'memoire.opportunities.v1': [opportunity('o1')],
      'memoire.salesActivities.v1': [activity('a1', { linkStatus: 'Linked', linkedOpportunityId: 'o1' })],
    });
    const first = join(scratch, 'first.json');
    const second = join(scratch, 'second.json');
    run(archive, first);
    run(archive, second);
    const strip = (path) => {
      const parsed = JSON.parse(readFileSync(path, 'utf8'));
      // The baseline date is the one thing that legitimately moves.
      delete parsed.baselineDate;
      return parsed;
    };
    assert.deepEqual(strip(first), strip(second));
  });
});
