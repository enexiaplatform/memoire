import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import { buildBusinessLens, QUIET_ACCOUNT_DAYS } from '../../src/utils/businessLens.ts';
import { buildAccountAliasIndex } from '../../src/utils/accountAliases.ts';

const TODAY = '2026-07-31';

let counter = 0;
const opp = (accountName, estimatedValue, patch = {}) => {
  counter += 1;
  return {
    id: `o${counter}`,
    accountName,
    opportunityName: `${accountName} deal`,
    stage: 'Proposal',
    status: 'Active',
    estimatedValue,
    currency: 'VND',
    ...patch,
  };
};

const activity = (accountName, activityDate, patch = {}) => {
  counter += 1;
  return {
    id: `a${counter}`,
    accountName,
    linkedAccountName: accountName,
    linkStatus: 'Linked',
    activityType: 'Customer meeting',
    activityDate,
    tags: [],
    ...patch,
  };
};

const account = (accountName) => ({ id: `acc-${accountName}`, accountName });

const merge = (canonical, mergedNames) => ({
  id: `merge-${canonical}`,
  kind: 'merge',
  canonicalAccountName: canonical,
  mergedNames,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
});

const build = (input) => buildBusinessLens({
  accounts: [],
  opportunities: [],
  activities: [],
  today: TODAY,
  ...input,
});

describe('customer concentration', () => {
  test('ranks customers by open pipeline and gives each a share', () => {
    const lens = build({
      opportunities: [opp('Big', 600), opp('Mid', 300), opp('Small', 100)],
    });

    assert.deepEqual(lens.concentration.rows.map((row) => row.accountName), ['Big', 'Mid', 'Small']);
    assert.equal(lens.concentration.totalOpenBase, 1000);
    assert.equal(lens.concentration.rows[0].share, 0.6);
  });

  // The statement a distributor needs and never checks.
  test('names the risk when the top three hold most of the pipeline', () => {
    const lens = build({
      opportunities: [
        opp('Big', 600), opp('Mid', 200), opp('Third', 100),
        opp('D', 40), opp('E', 30), opp('F', 30),
      ],
    });

    assert.equal(Math.round(lens.concentration.topThreeShare * 100), 90);
    assert.match(lens.concentration.headline, /top 3 customers are 90%/i);
    assert.match(lens.concentration.headline, /Losing one changes the year/);
  });

  // A statistic is not an observation. Spread pipeline should not be alarming.
  test('stays flat when the pipeline is genuinely spread', () => {
    const lens = build({
      opportunities: Array.from({ length: 10 }, (_, index) => opp(`Account ${index}`, 100)),
    });

    assert.equal(Math.round(lens.concentration.topThreeShare * 100), 30);
    assert.doesNotMatch(lens.concentration.headline, /Losing one changes the year/);
    assert.match(lens.concentration.headline, /spread across 10 customers/);
  });

  test('says so plainly when everything sits with a couple of customers', () => {
    const lens = build({ opportunities: [opp('Only', 500), opp('Other', 100)] });
    assert.match(lens.concentration.headline, /All of your open pipeline sits with 2 customers/);
  });

  test('an empty workspace is not a concentration risk', () => {
    const lens = build({});
    assert.deepEqual(lens.concentration.rows, []);
    assert.equal(lens.concentration.topThreeShare, null);
    assert.match(lens.concentration.headline, /nothing concentrated anywhere/);
  });

  // Won and lost deals are history, not exposure.
  test('counts only open pipeline', () => {
    const lens = build({
      opportunities: [opp('Live', 100), opp('Done', 900, { status: 'Won' })],
    });

    assert.equal(lens.concentration.totalOpenBase, 100);
    assert.equal(lens.concentration.rows.length, 1);
  });

  // Two spellings of one customer would otherwise halve their apparent size,
  // which is the exact way a concentration risk hides.
  test('a merged customer is one customer, at their real size', () => {
    const lens = build({
      opportunities: [opp('VNVC', 400), opp('VNVC Vietnam', 400), opp('Other', 200)],
      aliases: buildAccountAliasIndex([merge('VNVC', ['VNVC Vietnam'])]),
    });

    assert.equal(lens.concentration.rows.length, 2);
    assert.equal(lens.concentration.rows[0].accountName, 'VNVC');
    assert.equal(lens.concentration.rows[0].openPipelineBase, 800);
    assert.equal(lens.concentration.rows[0].share, 0.8);
  });

  test('names at most six customers, but counts them all', () => {
    const lens = build({
      opportunities: Array.from({ length: 12 }, (_, index) => opp(`Account ${index}`, 100 - index)),
    });

    assert.equal(lens.concentration.rows.length, 6);
    assert.equal(lens.concentration.accountsWithPipeline, 12);
  });
});

describe('quiet money', () => {
  test('flags open pipeline nobody has touched inside the window', () => {
    const lens = build({
      opportunities: [opp('Quiet', 500), opp('Warm', 300)],
      activities: [
        activity('Quiet', '2026-05-01'), // ~91 days
        activity('Warm', '2026-07-25'),  // 6 days
      ],
    });

    assert.equal(lens.accounts.quiet, 1);
    assert.equal(lens.accounts.quietPipelineBase, 500);
    assert.equal(lens.accounts.active, 1);
  });

  // Pipeline with no touch at all is the quietest kind, not an unknown.
  test('a customer never touched counts as quiet', () => {
    const lens = build({ opportunities: [opp('Never', 200)] });
    assert.equal(lens.accounts.quiet, 1);
    assert.equal(lens.accounts.quietPipelineBase, 200);
  });

  test('a touch exactly on the boundary still counts as active', () => {
    const lens = build({
      opportunities: [opp('Edge', 100)],
      activities: [activity('Edge', '2026-07-01')], // 30 days
    });

    assert.equal(QUIET_ACCOUNT_DAYS, 30);
    assert.equal(lens.accounts.active, 1);
    assert.equal(lens.accounts.quiet, 0);
  });

  test('an unparseable touch date is not evidence of contact', () => {
    const lens = build({
      opportunities: [opp('Broken', 100)],
      activities: [activity('Broken', 'not-a-date')],
    });

    assert.equal(lens.accounts.active, 0);
    assert.equal(lens.accounts.quiet, 1);
  });
});

describe('how many customers there are', () => {
  // Counting account rows alone reports a customer base smaller than the one
  // the seller is actually working.
  test('counts customers known from any source, once each', () => {
    const lens = build({
      accounts: [account('From account')],
      opportunities: [opp('From deal', 100), opp('From account', 50)],
      activities: [activity('From touch', '2026-07-20')],
    });

    assert.equal(lens.accounts.total, 3);
  });

  test('a customer with nothing open is still a customer', () => {
    const lens = build({
      accounts: [account('Dormant')],
      opportunities: [opp('Live', 100)],
    });

    assert.equal(lens.accounts.total, 2);
    assert.equal(lens.accounts.withoutPipeline, 1);
  });
});
