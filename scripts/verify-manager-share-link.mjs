import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildCompactSharedBrief,
  buildSharedBriefUrl,
  encodeSharedBriefFragment,
  decodeSharedBriefFragment,
  SHARE_BRIEF_ROUTE,
} from '../src/utils/shareableBriefLink.ts';

// A manager can OPEN a link, not just receive a pasted brief. The brief rides in
// the URL hash fragment (never sent to a server), so the viewing route is public
// but the data stays client-side. These pin the round-trip and the privacy shape.
// A minimal shareable literal stands in for buildShareablePipelineDefenseBrief's
// output (importing that builder pulls a browser-only dependency chain).

const shareableFor = (salesOwner = 'Seller') => ({
  brief: { id: 'b1', title: 'Weekly Review', weekLabel: 'Week 26', salesOwner, scope: 'Active pipeline', deals: [] },
  shareable: {
    generatedAt: '2026-07-17T09:00:00.000Z',
    managerSummary: 'Manager summary: 1 deals reviewed; 0 defendable, 1 rescue, 0 downgrade.',
    executiveSummary: {
      totalDeals: 1, defendableDeals: 0, rescueDeals: 1, downgradeDeals: 0,
      totalPipelineValueLabel: '300,000 SGD', topRiskThemes: [{ label: 'Decision timeline', count: 1, accounts: ['Pymepharco'] }],
    },
    dealRows: [{ id: 'deal-1', account: 'Pymepharco', opportunity: 'DCM comparison', value: '300,000 SGD', currentStage: 'Proposal', forecastCategory: 'Weak but recoverable', defenseStatus: 'Rescue', mainEvidence: 'Customer requested comparison.', mainGap: 'Economic buyer', nextDefenseAction: 'Send DCM comparison quote' }],
    nextDefenseActions: [{ id: 'a1', account: 'Pymepharco', opportunity: 'DCM comparison', title: 'Send DCM comparison quote', detail: 'x', priority: 'High', source: 'Deal recommendation' }],
    qualityChecklist: [{ id: 'economic-buyer', label: 'Economic buyer identified', status: 'warning', detail: '1 key deal still mentions buyer gaps.' }],
  },
});

// 1. A built compact brief carries the manager-facing essentials.
{
  const compact = buildCompactSharedBrief(shareableFor());
  assert.equal(compact.v, 1);
  assert.equal(compact.title, 'Weekly Review');
  assert.equal(compact.summary.totalDeals, 1);
  assert.equal(compact.dealRows[0].account, 'Pymepharco');
  assert.ok(compact.managerSummary.includes('Manager summary'));
}

// 2. Encode -> decode is a faithful round-trip, even with unicode content.
{
  const compact = buildCompactSharedBrief(shareableFor('Nguyễn Văn A'));
  const fragment = encodeSharedBriefFragment(compact);
  assert.ok(fragment.startsWith('#b='), 'the payload rides in the b hash param');
  const decoded = decodeSharedBriefFragment(fragment);
  assert.ok(decoded, 'a valid fragment decodes');
  assert.equal(decoded.salesOwner, 'Nguyễn Văn A', 'unicode survives the round-trip');
  assert.equal(decoded.summary.totalDeals, compact.summary.totalDeals);
  assert.equal(decoded.dealRows.length, compact.dealRows.length);
}

// 3. A full URL points at the public route and puts the data in the fragment.
{
  const compact = buildCompactSharedBrief(shareableFor());
  const url = buildSharedBriefUrl(compact, 'https://memoire.app/');
  assert.ok(url.startsWith(`https://memoire.app${SHARE_BRIEF_ROUTE}#b=`), `share URL malformed: ${url}`);
  // Privacy: everything after the # is a fragment browsers never send to a server.
  const [path, fragment] = url.split('#');
  assert.equal(path, `https://memoire.app${SHARE_BRIEF_ROUTE}`);
  assert.ok(fragment.length > 0);
}

// 4. Garbage and version mismatches decode to null, never a half-brief.
{
  assert.equal(decodeSharedBriefFragment('#b=not-valid-base64!!!'), null);
  assert.equal(decodeSharedBriefFragment(''), null);
  assert.equal(decodeSharedBriefFragment('#b='), null);
  const wrongVersion = encodeSharedBriefFragment({ v: 99, dealRows: [], summary: {} });
  assert.equal(decodeSharedBriefFragment(wrongVersion), null, 'a future version is rejected, not mis-rendered');
}

// 5. Wiring: a public route, the viewer page, and the copy-link button exist.
{
  const app = readFileSync('src/App.tsx', 'utf8');
  assert.ok(app.includes('path="/share/brief"'), 'the public share route must be registered');

  const page = readFileSync('src/features/pipeline/SharedBriefPage.tsx', 'utf8');
  assert.ok(page.includes('decodeSharedBriefFragment'), 'the shared page must decode from the hash');

  const briefPage = readFileSync('src/features/pipeline/PipelineReviewDefenseBriefPage.tsx', 'utf8');
  assert.ok(briefPage.includes('Copy manager link'), 'the brief page must offer a copy-manager-link button');
  assert.ok(briefPage.includes('buildSharedBriefUrl'), 'the brief page must build the share URL');
}

console.log('Manager share-link contract verified.');
