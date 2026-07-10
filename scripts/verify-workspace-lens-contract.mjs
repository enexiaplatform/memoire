import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  onboardingEmphasisForLens,
  orderCockpitForLens,
  orderReviewSectionsForLens,
  orderTemplatesForLens,
  workspaceLenses,
  workspaceLensLabel,
} from '../src/utils/workspaceLens.ts';

// 1. Lenses are a closed set with human labels.
assert.deepEqual([...workspaceLenses], ['combined', 'b2b', 'solo']);
assert.equal(workspaceLensLabel('solo'), 'Solo business');

// 2. Lens re-orders, never adds or removes - one data model guaranteed.
{
  const templates = [
    { id: 'customer-meeting' }, { id: 'proposal-sent' }, { id: 'payment-update' },
    { id: 'content-published' }, { id: 'internal-review' },
  ];
  const solo = orderTemplatesForLens(templates, 'solo');
  assert.deepEqual(solo.map((t) => t.id), ['payment-update', 'content-published', 'customer-meeting', 'proposal-sent', 'internal-review']);
  assert.equal(solo.length, templates.length, 'no template may be added or hidden');
  assert.deepEqual(orderTemplatesForLens(templates, 'b2b').map((t) => t.id), templates.map((t) => t.id));
  assert.deepEqual(orderTemplatesForLens(templates, 'combined').map((t) => t.id), templates.map((t) => t.id));
}
{
  const answers = [{ id: 'money' }, { id: 'deals' }, { id: 'follow-ups' }, { id: 'initiatives' }, { id: 'capture' }];
  assert.deepEqual(orderCockpitForLens(answers, 'b2b').map((a) => a.id), ['deals', 'money', 'follow-ups', 'initiatives', 'capture']);
  assert.deepEqual(orderCockpitForLens(answers, 'solo').map((a) => a.id), answers.map((a) => a.id));
  assert.equal(orderCockpitForLens(answers, 'b2b').length, 5);
}

// 3. Review sections re-order by lens (direction 7.7: review format follows
// the lens) - same reorder-only guarantee: every section survives, unknown
// ids keep their relative order after the known ones.
{
  const sections = [
    { id: 'money' }, { id: 'outcomes' }, { id: 'initiatives' },
    { id: 'signals' }, { id: 'commitments' }, { id: 'priorities' },
  ];
  assert.deepEqual(
    orderReviewSectionsForLens(sections, 'combined').map((s) => s.id),
    ['money', 'outcomes', 'initiatives', 'signals', 'commitments', 'priorities'],
  );
  assert.deepEqual(
    orderReviewSectionsForLens(sections, 'b2b').map((s) => s.id),
    ['outcomes', 'commitments', 'money', 'signals', 'initiatives', 'priorities'],
    'B2B review must open on deals closed and promises kept',
  );
  assert.deepEqual(
    orderReviewSectionsForLens(sections, 'solo').map((s) => s.id),
    ['money', 'initiatives', 'signals', 'outcomes', 'commitments', 'priorities'],
    'Solo review must open on where the money sits',
  );
  for (const lens of workspaceLenses) {
    assert.equal(orderReviewSectionsForLens(sections, lens).length, sections.length, `${lens} lens may not add or hide a review section`);
  }
  const withUnknown = orderReviewSectionsForLens([...sections, { id: 'future-section' }], 'b2b');
  assert.equal(withUnknown.length, 7, 'unknown section ids must survive the reorder');
  assert.equal(withUnknown[6].id, 'future-section');
}

// 4. Onboarding emphasis per lens: copy only, distinct per lens, and every
// lens still describes the same Capture-first workflow.
{
  const intros = workspaceLenses.map((lens) => onboardingEmphasisForLens(lens).intro);
  assert.equal(new Set(intros).size, workspaceLenses.length, 'each lens must have its own onboarding intro');
  for (const lens of workspaceLenses) {
    const emphasis = onboardingEmphasisForLens(lens);
    assert.ok(emphasis.workflowLine.toLowerCase().includes('capture'), `${lens} onboarding must still lead with capture`);
  }
  assert.ok(onboardingEmphasisForLens('solo').workflowLine.toLowerCase().includes('money'), 'solo onboarding must speak the money-spine language');
  assert.ok(onboardingEmphasisForLens('b2b').workflowLine.toLowerCase().includes('pipeline'), 'b2b onboarding must speak the pipeline language');
}

// 5. UI wiring: Settings selector, capture template ordering, cockpit
// ordering, review section ordering, onboarding emphasis.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
assert.ok(read('src/features/settings/SettingsPage.tsx').includes('Workspace lens'), 'Settings must expose the lens selector');
assert.ok(read('src/features/settings/SettingsPage.tsx').includes('switching is always safe'), 'lens copy must state the one-data-model guarantee');
assert.ok(read('src/features/dailyCapture/DailyCapturePage.tsx').includes('orderTemplatesForLens'), 'capture templates must honor the lens');
assert.ok(read('src/features/dashboard/DashboardPage.tsx').includes('orderCockpitForLens'), 'cockpit must honor the lens');
assert.ok(read('src/features/reviews/WeeklyBusinessReviewPanel.tsx').includes('orderReviewSectionsForLens'), 'the Weekly Business Review must honor the lens');
assert.ok(read('src/components/layout/OnboardingModal.tsx').includes('onboardingEmphasisForLens'), 'onboarding must honor the lens');

console.log('Workspace lens contract verified.');
