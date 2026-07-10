import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildActivityStateTrail } from '../src/utils/activityStateTrail.ts';

function makeActivity(patch = {}) {
  return {
    id: 'act-1',
    accountName: 'Summit Diagnostics',
    opportunityName: 'QC workflow',
    contactName: '',
    stakeholderName: '',
    stakeholderRole: '',
    competitors: [],
    buyingSignals: [],
    risks: [],
    timelineSignals: [],
    nextActions: [],
    activityType: 'Meeting',
    summary: 'Touch',
    nextAction: '',
    dueDate: '',
    tags: [],
    linkedOpportunityId: '',
    linkedOpportunityName: '',
    linkedAccountName: '',
    linkStatus: 'Unlinked',
    rawNote: 'Touch',
    activityDate: '2026-07-01',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    storageMode: 'local',
    ...patch,
  };
}

// 1. No captured signals => no chips. The trail never guesses.
assert.deepEqual(buildActivityStateTrail(makeActivity()), []);
assert.deepEqual(
  buildActivityStateTrail(makeActivity({ buyingSignals: ['  ', ''] })),
  [],
  'blank signal strings must not produce chips',
);

// 2. A single signal shows its text; multiple show an honest count.
{
  const chips = buildActivityStateTrail(makeActivity({
    buyingSignals: ['Budget approved for Q3'],
    risks: ['Competitor demo booked', 'Procurement freeze rumored'],
    timelineSignals: ['Decision by end of August'],
    competitors: ['Agilent'],
  }));
  assert.deepEqual(chips.map((chip) => chip.kind), ['buying', 'risk', 'timeline', 'competitor']);
  assert.equal(chips[0].label, 'Buying signal: Budget approved for Q3');
  assert.equal(chips[1].label, '2 risks');
  assert.deepEqual(chips[1].items, ['Competitor demo booked', 'Procurement freeze rumored']);
  assert.equal(chips[2].label, 'Timeline: Decision by end of August');
  assert.equal(chips[3].label, 'Competitor: Agilent');
}

// 3. Long signal text is truncated on the label but kept whole in items.
{
  const long = 'Customer said the CFO already signed off on the full modernization budget';
  const [chip] = buildActivityStateTrail(makeActivity({ buyingSignals: [long] }));
  assert.ok(chip.label.length <= 'Buying signal: '.length + 40, `label too long: ${chip.label}`);
  assert.ok(chip.label.endsWith('…'), 'truncated label must show the ellipsis');
  assert.deepEqual(chip.items, [long], 'full text stays available for the tooltip');
}

// 4. UI contract: the trail renders on Activity Ledger cards.
const page = readFileSync(new URL('../src/features/calendar/SalesActivityCalendarPage.tsx', import.meta.url), 'utf8');
for (const marker of ['buildActivityStateTrail', 'ActivityStateTrail', 'title={chip.items.join']) {
  assert.ok(page.includes(marker), `SalesActivityCalendarPage missing marker: ${marker}`);
}

console.log('Activity state trail contract verified.');
