import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  orderCockpitForLens,
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

// 3. UI wiring: Settings selector, capture template ordering, cockpit ordering.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
assert.ok(read('src/features/settings/SettingsPage.tsx').includes('Workspace lens'), 'Settings must expose the lens selector');
assert.ok(read('src/features/settings/SettingsPage.tsx').includes('switching is always safe'), 'lens copy must state the one-data-model guarantee');
assert.ok(read('src/features/dailyCapture/DailyCapturePage.tsx').includes('orderTemplatesForLens'), 'capture templates must honor the lens');
assert.ok(read('src/features/dashboard/DashboardPage.tsx').includes('orderCockpitForLens'), 'cockpit must honor the lens');

console.log('Workspace lens contract verified.');
