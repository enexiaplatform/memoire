import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  listInitiativeActivityLinks,
  readLinkedActivityIds,
  toggleLinkedActivity,
  writeLinkedActivityIds,
} from '../src/utils/initiativeActivityLink.ts';
import { classifyInitiativeHealth } from '../src/utils/proactiveNudges.ts';

function makeActivity(patch = {}) {
  return {
    id: `act-${Math.random().toString(36).slice(2)}`,
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

function makeContext(patch = {}) {
  return {
    id: 'ctx-1',
    contextType: 'initiative',
    title: 'Coastal accounts revival',
    status: 'Active',
    period: '',
    owner: '',
    valueAtStake: null,
    nextAction: '',
    nextDate: '',
    summary: '',
    payload: {},
    sourceSystem: '',
    externalSourceKey: '',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...patch,
  };
}

// 1. Link ids live on the existing payload column and survive round-trips.
//    Derive-don't-migrate: other payload keys are never disturbed.
{
  const base = { experiment: { hypothesis: 'H' } };
  const withLinks = writeLinkedActivityIds(base, ['act-1', 'act-1', '  ', 'act-2']);
  assert.deepEqual(readLinkedActivityIds(withLinks), ['act-1', 'act-2'], 'dupes and blanks must be dropped');
  assert.deepEqual(withLinks.experiment, { hypothesis: 'H' }, 'other payload keys must survive');

  const toggledOff = toggleLinkedActivity(withLinks, 'act-1');
  assert.deepEqual(readLinkedActivityIds(toggledOff), ['act-2']);
  const emptied = toggleLinkedActivity(toggledOff, 'act-2');
  assert.equal('linkedActivityIds' in emptied, false, 'an empty link list must remove the payload key');
  assert.deepEqual(emptied.experiment, { hypothesis: 'H' });
  assert.deepEqual(readLinkedActivityIds(null), []);
  assert.deepEqual(readLinkedActivityIds({ linkedActivityIds: 'not-an-array' }), []);
}

// 2. Read-model: explicit links come first and are never dropped by the cap;
//    token mentions fill the rest; a linked activity is not listed twice.
{
  const linked = makeActivity({ id: 'act-linked', summary: 'Called the DKSH distributor', activityDate: '2026-06-01' });
  const mentionedNew = makeActivity({ id: 'act-mention-new', summary: 'Coastal accounts mapping session', activityDate: '2026-07-02' });
  const mentionedOld = makeActivity({ id: 'act-mention-old', summary: 'Coastal accounts kickoff', activityDate: '2026-06-10' });
  const unrelated = makeActivity({ id: 'act-unrelated', summary: 'Paid the office rent' });

  const links = listInitiativeActivityLinks(
    { title: 'Coastal accounts revival', payload: { linkedActivityIds: ['act-linked', 'act-mention-new'] } },
    [unrelated, mentionedOld, mentionedNew, linked],
    2,
  );
  assert.deepEqual(
    links.map((item) => [item.activity.id, item.source]),
    [['act-mention-new', 'linked'], ['act-linked', 'linked']],
    'explicit links fill the cap first, newest first, no duplicate mention rows',
  );

  const roomy = listInitiativeActivityLinks(
    { title: 'Coastal accounts revival', payload: { linkedActivityIds: ['act-linked'] } },
    [unrelated, mentionedOld, mentionedNew, linked],
  );
  assert.deepEqual(
    roomy.map((item) => [item.activity.id, item.source]),
    [['act-linked', 'linked'], ['act-mention-new', 'mentioned'], ['act-mention-old', 'mentioned']],
  );
}

// 3. The stall detector honors explicit links: a linked activity is a touch
//    even when the capture never names the initiative.
{
  const quietContext = makeContext();
  const touch = makeActivity({ id: 'act-touch', summary: 'Called the DKSH distributor', activityDate: '2026-07-08' });
  const withoutLink = classifyInitiativeHealth(quietContext, [touch], '2026-07-10');
  assert.equal(withoutLink.status, 'quiet', 'an unrelated capture must not count as a touch');

  const linkedContext = makeContext({ payload: { linkedActivityIds: ['act-touch'] } });
  const withLink = classifyInitiativeHealth(linkedContext, [touch], '2026-07-10');
  assert.equal(withLink.status, 'active', 'a linked activity must keep the initiative out of the stalled list');
  assert.equal(withLink.lastMention, '2026-07-08');
}

// 4. UI contract: link/unlink ships on the operating page.
const page = readFileSync(new URL('../src/features/operatingSystem/OperatingSystemPage.tsx', import.meta.url), 'utf8');
for (const marker of ['listInitiativeActivityLinks', 'toggleLinkedActivity', "'linked' ? 'Unlink' : 'Link'", 'Link another activity']) {
  assert.ok(page.includes(marker), `OperatingSystemPage missing marker: ${marker}`);
}

console.log('Initiative activity link contract verified.');
