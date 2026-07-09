import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { businessDomains, classifyBusinessDomain } from '../src/utils/businessDomain.ts';
import { classifySalesActivity } from '../src/utils/salesActivityClassifier.ts';

// 1. Every activity type maps to a domain; specific types are never overridden by keywords.
assert.equal(classifyBusinessDomain({ activityType: 'Payment / invoice' }), 'Money');
assert.equal(classifyBusinessDomain({ activityType: 'Delivery / fulfillment' }), 'Delivery');
assert.equal(classifyBusinessDomain({ activityType: 'Marketing / content' }), 'Marketing');
assert.equal(classifyBusinessDomain({ activityType: 'Product / build' }), 'Product');
assert.equal(classifyBusinessDomain({ activityType: 'Learning / research' }), 'Learning');
assert.equal(classifyBusinessDomain({ activityType: 'Partnership' }), 'Sales');
assert.equal(classifyBusinessDomain({ activityType: 'Quote / proposal' }), 'Money');
assert.equal(classifyBusinessDomain({ activityType: 'Customer meeting' }), 'Sales');
assert.equal(classifyBusinessDomain({ activityType: 'Admin / CRM' }), 'Internal');
assert.equal(
  classifyBusinessDomain({ activityType: 'Payment / invoice', rawNote: 'published a linkedin post' }),
  'Money',
  'a specific type must not be overridden by keywords',
);

// 2. Legacy records (generic types) get keyword rescue - derive, don't migrate.
assert.equal(
  classifyBusinessDomain({ activityType: 'Other', rawNote: 'Invoice sent, payment due Friday' }),
  'Money',
);
assert.equal(
  classifyBusinessDomain({ activityType: 'Customer meeting', summary: 'Installation completed at the lab, delivery confirmed' }),
  'Delivery',
);
assert.equal(
  classifyBusinessDomain({ activityType: 'Other', rawNote: 'General note with no signals' }),
  'Internal',
);

// 3. The classifier types whole-business notes correctly.
assert.equal(classifySalesActivity('Payment received from Northstar for the audit invoice.', '2026-07-09').activityType, 'Payment / invoice');
assert.equal(classifySalesActivity('Shipment delivered and installation scheduled for Monday.', '2026-07-09').activityType, 'Delivery / fulfillment');
assert.equal(classifySalesActivity('Partner call about a distributor agreement for the north region.', '2026-07-09').activityType, 'Partnership');
assert.equal(classifySalesActivity('Published a LinkedIn case study on validation workflows.', '2026-07-09').activityType, 'Marketing / content');
assert.equal(classifySalesActivity('Customer discovery interviewed two lab managers about QC pain.', '2026-07-09').activityType, 'Learning / research');

// 4. Ledger page: domain filter + badges wired; both routes live.
const ledger = readFileSync(new URL('../src/features/calendar/SalesActivityCalendarPage.tsx', import.meta.url), 'utf8');
for (const marker of ['Activity Ledger', 'classifyBusinessDomain', 'businessDomains.map', 'domainFilter']) {
  assert.ok(ledger.includes(marker), `Activity Ledger missing marker: ${marker}`);
}
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
assert.ok(app.includes('path="activity"'), 'App must route /app/activity');
assert.ok(app.includes('path="calendar"'), '/app/calendar alias must stay live');

// 5. Navigation: Business Activity OS brand, Activity primary, Money reachable.
const sidebar = readFileSync(new URL('../src/components/layout/Sidebar.tsx', import.meta.url), 'utf8');
for (const marker of ["label: 'Business Activity OS'", "to: '/app/activity', label: 'Activity'", "to: '/app/revenue', label: 'Money'"]) {
  assert.ok(sidebar.includes(marker), `Sidebar missing pivot marker: ${marker}`);
}

// 6. Positioning: hero and strategy doc carry the money-spine framing, and the
// hard rules that keep this from becoming a generic productivity app.
const hero = readFileSync(new URL('../src/components/marketing/HeroSection.tsx', import.meta.url), 'utf8');
assert.ok(hero.includes('Nothing in your business goes silent.'), 'Hero must carry the generalized silence wedge');
assert.ok(hero.includes('Business Activity OS'), 'Hero must name the category');
const pivotDoc = readFileSync(new URL('../docs/product/pivot-business-activity-os-2026-07-09.md', import.meta.url), 'utf8');
for (const marker of ['money-spine rule', 'no persona modes', "Derive, don't migrate", 'Kill / keep criteria']) {
  assert.ok(pivotDoc.includes(marker), `Pivot doc missing hard rule: ${marker}`);
}

// 7. Demo: the ledger has non-sales activity to show.
const sampleData = readFileSync(new URL('../src/utils/sampleData.ts', import.meta.url), 'utf8');
assert.ok(sampleData.includes("activityType: 'Payment / invoice' as const"), 'Demo needs a Money-domain activity');
assert.ok(sampleData.includes("activityType: 'Marketing / content' as const"), 'Demo needs a Marketing-domain activity');

// 8. Domain list is closed and ordered for stable ledger lanes.
assert.deepEqual([...businessDomains], ['Sales', 'Money', 'Delivery', 'Marketing', 'Product', 'Learning', 'Internal']);

console.log('Business Activity OS pivot contract verified.');
