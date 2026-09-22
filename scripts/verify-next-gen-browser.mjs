import { chromium } from 'playwright';

const base = process.env.MEMOIRE_BROWSER_BASE || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ timezoneId: 'Asia/Ho_Chi_Minh', viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    const at = '2026-09-01T00:00:00.000Z';
    const opportunity = { id: 'o', userId: null, accountId: 'a', accountName: 'Acme', opportunityName: 'R1 integrated opportunity',
      stage: 'Proposal', status: 'Active', estimatedValue: 1000, currency: 'USD', expectedClosePeriod: '2026-10-15',
      forecastEvidenceCategory: 'Defensible', decisionRecommendation: 'Monitor', createdAt: at, updatedAt: at, storageMode: 'local' };
    const requirement = { id: 'r', userId: null, accountId: 'a', opportunityId: 'o', expectedOutcome: 'QA accepts', question: 'Has QA accepted?',
      conditionId: 'c', role: 'required_now', lifecycle: 'active', sourceType: 'manual', createdAt: at, updatedAt: at };
    const prerequisite = { id: 'r-prerequisite', userId: null, accountId: 'a', opportunityId: 'o', expectedOutcome: 'QA receives the validation pack',
      question: 'Has QA received the validation pack?', conditionId: null, role: 'required_now', lifecycle: 'active', sourceType: 'manual', createdAt: at, updatedAt: at };
    const dependency = { id: 'dependency', userId: null, opportunityId: 'o', dependentRequirementId: 'r', prerequisiteRequirementId: 'r-prerequisite',
      basis: 'QA reviews after receiving the validation pack', lifecycle: 'active', sourceType: 'manual', createdAt: at, updatedAt: at };
    const condition = { id: 'c', userId: null, accountId: 'a', opportunityId: 'o', statement: 'QA acceptance is required', conditionCategory: 'technical',
      intent: 'assumed', lifecycle: 'active', sourceType: 'manual', createdAt: at, updatedAt: at,
      evidenceLinks: [{ evidenceId: 'e', assessment: 'supports', recordedAt: at }] };
    const evidence = { id: 'e', userId: null, accountId: 'a', opportunityId: 'o', category: 'technical_outcome', direction: 'positive',
      summary: 'QA review is scheduled', evidenceText: 'QA review is scheduled', observedAt: '2026-09-01', recordedAt: at, createdAt: at, updatedAt: at, sourceType: 'manual' };
    const timing = { id: 't', userId: null, opportunityId: 'o', requirementId: 'r', kind: 'target_anchor', basis: 'Recorded close target', lifecycle: 'active',
      durationDays: null, durationUnit: null, epistemic: null, sourceKind: null, sourceReference: null, evidenceId: null, commitmentId: null,
      sourceType: 'manual', createdAt: at, updatedAt: at };
    const gate = { id: 'g', userId: null, opportunityId: 'o', moneySourceType: 'opportunity_value', moneySourceId: 'o', requirementId: 'r',
      basisKind: 'customer_process', basis: 'Value waits on QA acceptance', lifecycle: 'active', sourceType: 'manual', createdAt: at, updatedAt: at };
    const makeDecision = (id, decidedAt) => ({ id, userId: null, accountId: 'a', opportunityId: 'o', question: 'How should QA be handled?', context: 'QA is unresolved.',
      basisSnapshot: { version: 1, capturedAt: decidedAt, forecast: { verdict: 'conditional', claim: null, timingEvaluation: 'incomplete', reasonCodes: [] },
        premises: [{ requirementId: 'r', label: 'QA accepts', state: 'unknown', condition: null, evidence: [], evidenceIds: [] }],
        blockers: [{ requirementId: 'r', label: 'QA accepts', state: 'unresolved', sourceRecordIds: ['r'], paths: [] }], openQuestions: [], nextQuestion: null,
        timing: { status: 'incomplete', targetDate: null, lastSafeDate: null, bufferDays: null, assumptionsUsed: false, unknownSegments: [], conflictingSegments: [], sources: [] },
        sourceRecordIds: ['o', 'r'] },
      options: [{ id: `option-${id}`, order: 1, label: 'Ask QA', interventionIntent: 'Contact QA', expectedConsequence: 'QA clarity', tradeoffs: '' }],
      selectedOptionId: `option-${id}`, rationale: 'QA owns the review.', expectedConsequence: 'QA clarity',
      intervention: { id: `intervention-${id}`, intent: 'Contact QA', targetKind: 'requirement', targetRequirementId: 'r', expectedChange: 'QA clarity' },
      executionLinks: id === 'query' ? [{ kind: 'action', recordId: 'plan-action', linkedAt: decidedAt }] : [],
      supersedesDecisionId: null, sourceType: 'manual', decidedAt, createdAt: decidedAt, updatedAt: decidedAt });
    const makeObservation = decisionId => ({ id: `obs-${decisionId}`, userId: null, accountId: 'a', opportunityId: 'o', decisionId,
      observationCutoff: '2026-09-15T00:00:00.000Z', elapsedDays: 14, snapshot: { version: 1, derivedWithCurrentRules: true,
        opportunity: { id: 'o', name: 'R1 integrated opportunity', stage: 'Proposal', status: 'Active', targetDate: '2026-10-15', value: 1000, currency: 'USD' },
        target: { kind: 'requirement', requirementId: 'r', label: 'QA accepts', role: 'required_now', state: 'resolved', conditionState: 'supported', sourceEvidenceIds: ['e'] },
        blockers: [], forecast: { verdict: 'defensible', timingEvaluation: 'supported', reasonCodes: [] }, timing: null,
        money: [{ sourceId: 'o', sourceType: 'opportunity_value', amount: 1000, currency: 'USD', realizationState: 'potential', timingState: 'supported', blockerIds: [], blockerLabels: [] }],
        execution: [], buyerProgress: null, sourceRecordIds: ['o', 'r', 'e'], coverage: { core: 'full', target: 'full', buyerProgress: 'partial', moneyConsequences: 'partial' } },
      operatorNote: 'QA acceptance was recorded by the cutoff.', sourceType: 'manual', finalizedAt: '2026-09-16T00:00:00.000Z', createdAt: '2026-09-16T00:00:00.000Z' });

    localStorage.setItem('memoire_demo_workspace', 'interactive-demo');
    localStorage.setItem('memoire.accounts.v1', JSON.stringify([{ id: 'a', accountName: 'Acme', createdAt: at, updatedAt: at }]));
    localStorage.setItem('memoire.opportunities.v1', JSON.stringify([opportunity]));
    localStorage.setItem('memoire.commercialConditions.v1', JSON.stringify([condition]));
    localStorage.setItem('memoire.commercialEvidence.v1', JSON.stringify([evidence]));
    localStorage.setItem('memoire.outcomeRequirements.v1', JSON.stringify([requirement, prerequisite]));
    localStorage.setItem('memoire.commercialDependencies.v1', JSON.stringify([dependency]));
    localStorage.setItem('memoire.commercialTiming.v1', JSON.stringify([timing]));
    localStorage.setItem('memoire.commercialMoneyGates.v1', JSON.stringify([gate]));
    localStorage.setItem('memoire.planItems.v1', JSON.stringify([{ id: 'plan-action', label: 'Send the validation pack', done: false,
      linkedOpportunityId: 'o', linkedAccountName: 'Acme', createdAt: at, updatedAt: at }]));
    const decisions = [makeDecision('query', '2026-09-02T00:00:00.000Z'), ...['a', 'b', 'c'].map(id => makeDecision(id, at))];
    localStorage.setItem('memoire.commercialDecisions.v1', JSON.stringify(decisions));
    localStorage.setItem('memoire.decisionObservations.v1', JSON.stringify(['a', 'b', 'c'].map(makeObservation)));
  });

  const page = await context.newPage();
  const browserErrors = [];
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.goto(`${base}/app/opportunities?opportunityId=o`);
  const panel = page.getByRole('dialog', { name: 'Opportunity details' });
  await panel.getByRole('heading', { name: 'R1 integrated opportunity', exact: true }).waitFor({ timeout: 15000 });
  for (const label of ['Commercial state', 'Forecast defensibility', 'Commercial decisions', 'Commercial time', 'Counterfactual simulation']) {
    await panel.getByLabel(label, { exact: true }).waitFor({ timeout: 15000 });
  }
  await panel.locator('summary').filter({ hasText: 'QA acceptance is required' }).click();
  await panel.getByText('QA review is scheduled', { exact: true }).first().waitFor();
  await panel.locator('summary').filter({ hasText: 'QA accepts' }).first().click();
  await panel.getByText(/Has QA accepted\?/).first().waitFor();
  await panel.getByText(/Opportunity potential value/).waitFor();

  const canonicalBefore = await page.evaluate(() => Object.fromEntries([
    'memoire.commercialConditions.v1', 'memoire.outcomeRequirements.v1', 'memoire.commercialTiming.v1', 'memoire.commercialMoneyGates.v1',
  ].map(key => [key, localStorage.getItem(key)])));
  await panel.getByRole('button', { name: 'Open simulation' }).click();
  await panel.getByText('CURRENT · captured base', { exact: true }).waitFor();
  await panel.getByText('PROJECTED · under assumptions', { exact: true }).waitFor();
  const scenario = panel.getByLabel('Counterfactual simulation', { exact: true });
  await scenario.locator('select').nth(1).selectOption('r');
  await scenario.getByLabel('Why test this?').fill('Test the recorded QA dependency.');
  await panel.getByRole('button', { name: 'Add assumption' }).click();
  await panel.getByText(/ASSUMPTION · Assume QA accepts is resolved/).waitFor();
  await panel.getByRole('button', { name: 'Exit and discard' }).click();
  const canonicalAfter = await page.evaluate(() => Object.fromEntries([
    'memoire.commercialConditions.v1', 'memoire.outcomeRequirements.v1', 'memoire.commercialTiming.v1', 'memoire.commercialMoneyGates.v1',
  ].map(key => [key, localStorage.getItem(key)])));
  if (JSON.stringify(canonicalAfter) !== JSON.stringify(canonicalBefore)) throw new Error('Scenario mutated canonical browser truth.');

  await panel.getByText('Comparable reviewed Decisions', { exact: true }).click();
  await panel.getByText(/3 of 3 eligible Decisions/).waitFor();
  await panel.getByText(/do not establish that an Intervention caused an outcome/).waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await panel.boundingBox();
  if (!bounds || bounds.x < 0 || bounds.x + bounds.width > 391) throw new Error('Integrated Opportunity drawer overflows a narrow viewport.');
  if (browserErrors.length) throw new Error(`Browser console errors: ${browserErrors.join(' | ')}`);
  console.log('R1 browser flow passed: rich Opportunity, current derivations, non-mutating Scenario, Decision cases, causal copy, console, and narrow viewport.');
} finally {
  await browser.close();
}
