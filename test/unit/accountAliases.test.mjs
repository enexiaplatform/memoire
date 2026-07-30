import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAccountAliasIndex,
  resolveAccountName,
  resolvedAccountKey,
} from '../../src/utils/accountAliases.ts';
import { buildCoverageMatrix } from '../../src/utils/coverageMatrix.ts';
import { buildActivityInsights } from '../../src/utils/activityInsights.ts';
import { buildOperatorProfile } from '../../src/utils/operatorProfile.ts';

const merge = (canonical, mergedNames, extra = {}) => ({
  id: `merge-${canonical}`,
  kind: 'merge',
  canonicalAccountName: canonical,
  mergedNames,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  ...extra,
});

const opp = (patch = {}) => ({
  id: `o-${Math.random().toString(36).slice(2)}`, accountName: 'DP Lab', opportunityName: 'Deal',
  stage: 'Proposal', estimatedValue: 100, currency: 'VND', status: 'Active',
  brand: 'Tailin', createdAt: '2026-01-01', updatedAt: '2026-01-01',
  ...patch,
});

const activity = (patch = {}) => ({
  id: `a-${Math.random().toString(36).slice(2)}`, accountName: 'DP Lab', linkedAccountName: 'DP Lab',
  linkedOpportunityId: '', activityType: 'Customer meeting', activityDate: '2026-06-01',
  nextAction: '', dueDate: '', nextActions: [], summary: '', tags: [], rawNote: '',
  ...patch,
});

describe('buildAccountAliasIndex', () => {
  test('maps every merged-away spelling to the surviving name', () => {
    const index = buildAccountAliasIndex([merge('DP Lab', ['DPLab', 'DP  Lab.'])]);
    assert.equal(resolveAccountName('DPLab', index), 'DP Lab');
    assert.equal(resolveAccountName('dp lab.', index), 'DP Lab');
    assert.equal(resolveAccountName('Euvipharm', index), 'Euvipharm', 'an unmerged name is returned as typed');
  });

  test('a dismissal is not a merge', () => {
    const index = buildAccountAliasIndex([
      { ...merge('DP Lab', []), kind: 'dismissal', pairKey: 'dp lab|dplab' },
    ]);
    assert.equal(index.size, 0);
  });

  test('a deleted merge stops resolving', () => {
    const index = buildAccountAliasIndex([merge('DP Lab', ['DPLab'], { __deleted: true })]);
    assert.equal(resolveAccountName('DPLab', index), 'DPLab');
  });

  test('follows a chain: A folded into B, then B into C', () => {
    const index = buildAccountAliasIndex([
      merge('B Corp', ['A Corp']),
      merge('C Corp', ['B Corp']),
    ]);
    assert.equal(resolveAccountName('A Corp', index), 'C Corp');
  });

  test('a cycle the user could create in two clicks does not hang', () => {
    const index = buildAccountAliasIndex([
      merge('A Corp', ['B Corp']),
      merge('B Corp', ['A Corp']),
    ]);
    // Whatever it settles on, it has to settle - and on one of the two names.
    assert.ok(['A Corp', 'B Corp'].includes(resolveAccountName('A Corp', index)));
    assert.ok(['A Corp', 'B Corp'].includes(resolveAccountName('B Corp', index)));
  });

  test('a name merged into itself resolves to itself rather than looping', () => {
    const index = buildAccountAliasIndex([merge('DP Lab', ['dp lab', 'DP Lab'])]);
    assert.equal(resolveAccountName('DP Lab', index), 'DP Lab');
  });

  test('every spelling of the surviving account is displayed the way the user kept it', () => {
    const index = buildAccountAliasIndex([merge('DP Lab', ['DPLab'])]);
    assert.equal(resolveAccountName('dp lab.', index), 'DP Lab');
    assert.equal(resolveAccountName('DPLab', index), 'DP Lab');
  });

  test('resolvedAccountKey is the grouping key after merges', () => {
    const index = buildAccountAliasIndex([merge('DP Lab', ['DPLab'])]);
    assert.equal(resolvedAccountKey('DPLab', index), resolvedAccountKey('DP Lab', index));
  });

  test('no merges at all costs nothing and changes nothing', () => {
    assert.equal(resolveAccountName('DP Lab'), 'DP Lab');
    assert.equal(resolveAccountName('  DP Lab  ', buildAccountAliasIndex([])), 'DP Lab');
  });
});

describe('merges reach the surfaces that group by account', () => {
  test('the coverage matrix draws a merged customer as one row', () => {
    const opportunities = [
      opp({ accountName: 'DP Lab', brand: 'Tailin' }),
      opp({ accountName: 'DPLab', brand: 'Biomedia' }),
    ];

    const split = buildCoverageMatrix({ opportunities });
    assert.equal(split.rows.length, 2, 'without the merge they are two customers');

    const merged = buildCoverageMatrix({
      opportunities,
      accountAliases: buildAccountAliasIndex([merge('DP Lab', ['DPLab'])]),
    });
    assert.equal(merged.rows.length, 1);
    assert.equal(merged.rows[0].accountName, 'DP Lab');
    assert.equal(merged.rows[0].brandsTouched, 2, 'both lines belong to the one customer');
    assert.deepEqual(merged.rows[0].missingBrands, []);
  });

  test('two spellings of one name are one row even without a merge', () => {
    // The cells always grouped on the normalized key; the row list did not, so
    // "VNVC" and "vnvc." produced two rows carrying the same squares.
    const matrix = buildCoverageMatrix({
      opportunities: [
        opp({ accountName: 'VNVC', brand: 'Tailin' }),
        opp({ accountName: 'vnvc.', brand: 'Biomedia' }),
      ],
    });
    assert.equal(matrix.rows.length, 1);
    assert.equal(matrix.rows[0].brandsTouched, 2);
  });

  test('activity insights count a merged customer once', () => {
    const activities = [
      activity({ accountName: 'DP Lab', linkedAccountName: 'DP Lab', activityDate: '2026-06-01' }),
      activity({ accountName: 'DPLab', linkedAccountName: 'DPLab', activityDate: '2026-06-02' }),
    ];
    const range = { start: '2026-06-01', end: '2026-06-07' };

    const split = buildActivityInsights({ activities, planRecords: [], range, today: '2026-06-03' });
    assert.equal(split.coverage.accountsTouched, 2);

    const merged = buildActivityInsights({
      activities,
      planRecords: [],
      range,
      today: '2026-06-03',
      accountAliases: buildAccountAliasIndex([merge('DP Lab', ['DPLab'])]),
    });
    assert.equal(merged.coverage.accountsTouched, 1);
    assert.equal(merged.topAccount.account, 'DP Lab');
    assert.equal(merged.topAccount.count, 2);
  });

  test('a merged customer has one contact rhythm, not two calmer ones', () => {
    // Touched every two days, under two spellings. Read apart, each spelling
    // looks like a four-day rhythm that has only just gone quiet.
    const activities = ['2026-06-01', '2026-06-05', '2026-06-09', '2026-06-13'].map((date, index) => activity({
      id: `a${index}`,
      accountName: index % 2 === 0 ? 'DP Lab' : 'DPLab',
      linkedAccountName: index % 2 === 0 ? 'DP Lab' : 'DPLab',
      activityDate: date,
    }));

    const profile = buildOperatorProfile({
      opportunities: [], opportunityOutcomes: [], activities, quotes: [],
      today: '2026-07-01',
      accountAliases: buildAccountAliasIndex([merge('DP Lab', ['DPLab'])]),
    });

    assert.equal(profile.unusuallyQuiet.length, 1);
    assert.equal(profile.unusuallyQuiet[0].account, 'DP Lab');
    assert.equal(profile.unusuallyQuiet[0].touches, 4);
    assert.equal(profile.unusuallyQuiet[0].normalGapDays, 4);
  });
});
