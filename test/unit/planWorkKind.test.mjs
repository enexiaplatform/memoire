import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPlanWork,
  readDomain,
  summarisePlanWork,
} from '../../src/utils/planWorkKind.ts';
import { buildPlanBoard, createPersonalPlanRecord } from '../../src/utils/weeklyPlan.ts';

const context = {
  brands: ['Sartorius', 'Cobetter', 'Conda'],
  accountNames: ['DP Lab', 'Bidiphar', 'Euvipharm'],
};

describe('plan work: three tiers, not two', () => {
  test('an explicit link always beats anything read out of the text', () => {
    assert.equal(
      classifyPlanWork({ tag: 'Sartorius', linkedAccountName: 'DP Lab' }, context).kind,
      'customer',
      'the operator said who this is for; the tag must not argue',
    );
    assert.equal(classifyPlanWork({ linkedOpportunityId: 'opp-1' }, context).kind, 'customer');
    assert.equal(classifyPlanWork({ linkedBrand: 'Conda' }, context).kind, 'principal');
  });

  test('a tag naming a line you carry is principal work, not admin', () => {
    const result = classifyPlanWork({ tag: 'Sartorius', label: 'Research market & product' }, context);
    assert.equal(result.kind, 'principal');
    assert.equal(result.brand, 'Sartorius');
  });

  test('a tag naming a customer stays customer work', () => {
    assert.equal(classifyPlanWork({ tag: 'DP Lab', label: 'Pricing for Conda' }, context).kind, 'customer');
  });

  test('a tag matching nobody is your own machinery', () => {
    const result = classifyPlanWork({ tag: 'Internal', label: 'Submit KPI' }, context);
    assert.equal(result.kind, 'internal');
    assert.equal(result.brand, '');
    assert.equal(result.domain, 'Internal');
  });

  test('brands and accounts match without diacritics or case', () => {
    assert.equal(classifyPlanWork({ tag: 'sartorius' }, context).kind, 'principal');
    assert.equal(
      classifyPlanWork({ tag: 'DP LAB' }, context).kind,
      'customer',
    );
  });

  test('a workspace with no brands classifies exactly as it did before', () => {
    const bare = { brands: [], accountNames: ['DP Lab'] };
    assert.equal(classifyPlanWork({ tag: 'Sartorius' }, bare).kind, 'internal');
    assert.equal(classifyPlanWork({ tag: 'DP Lab' }, bare).kind, 'customer');
  });
});

describe('plan work: internal work borrows the ledger vocabulary', () => {
  test('the seven domains are read from the words already written', () => {
    assert.equal(readDomain('Research market & product'), 'Learning');
    assert.equal(readDomain('Make the presentation deck'), 'Marketing');
    assert.equal(readDomain('Process the data'), 'Internal');
    assert.equal(readDomain('Submit expense claim'), 'Money');
  });

  test('Vietnamese reads the same as English, with or without tone marks', () => {
    assert.equal(readDomain('Nghiên cứu hãng mới'), 'Learning');
    assert.equal(readDomain('nghien cuu hang moi'), 'Learning');
    assert.equal(readDomain('Xử lý số liệu'), 'Internal');
    assert.equal(readDomain('Thuyết trình cho khách'), 'Marketing');
  });

  test('work with no signal is admin rather than a fourth unnamed bucket', () => {
    assert.equal(readDomain('Sort the thing out'), 'Internal');
  });
});

describe('plan work: the week reports its own shape', () => {
  test('the split counts each tier and breaks internal down by domain', () => {
    const split = summarisePlanWork([
      { kind: 'customer', brand: '', domain: null },
      { kind: 'customer', brand: '', domain: null },
      { kind: 'principal', brand: 'Sartorius', domain: null },
      { kind: 'internal', brand: '', domain: 'Learning' },
      { kind: 'internal', brand: '', domain: 'Internal' },
      { kind: 'internal', brand: '', domain: 'Internal' },
    ]);

    assert.equal(split.customer, 2);
    assert.equal(split.principal, 1);
    assert.equal(split.internal, 3);
    assert.equal(split.total, 6);
    assert.deepEqual(split.internalByDomain, [
      { domain: 'Internal', count: 2 },
      { domain: 'Learning', count: 1 },
    ]);
  });
});

describe('plan work: the board classifies a real week', () => {
  test('a hand-typed week splits itself the moment brands exist', () => {
    const records = [
      createPersonalPlanRecord({ date: '2026-07-28', label: '[Sartorius] Research market & product' }),
      createPersonalPlanRecord({ date: '2026-07-28', label: '[DP Lab] Booking meeting for Isolator' }),
      createPersonalPlanRecord({ date: '2026-07-29', label: '[Internal] Submit KPI report' }),
    ];

    const board = buildPlanBoard({
      periodType: 'week',
      anchorDate: new Date(2026, 6, 28),
      opportunities: [{
        id: 'o1', accountName: 'DP Lab', opportunityName: 'Isolator', brand: 'Sartorius',
        status: 'Active', stage: 'Demo', estimatedValue: 100, currency: 'VND',
        nextAction: '', nextActionDate: '', pipelineProbability: null,
      }],
      obligations: [],
      records,
      brands: ['Sartorius'],
      today: '2026-07-28',
    });

    assert.equal(board.workSplit.principal, 1, 'the Sartorius line is principal work');
    assert.equal(board.workSplit.customer, 1, 'the DP Lab line is customer work');
    assert.equal(board.workSplit.internal, 1, 'the KPI report is internal');

    const items = board.days.flatMap((day) => day.items);
    const research = items.find((item) => item.label.includes('Research market'));
    assert.equal(research.workKind, 'principal');
    assert.equal(research.workBrand, 'Sartorius');

    const kpi = items.find((item) => item.label.includes('KPI'));
    assert.equal(kpi.workKind, 'internal');
    assert.equal(kpi.workDomain, 'Internal');
  });

  test('the same week with no brands recorded reads as it always did', () => {
    const board = buildPlanBoard({
      periodType: 'week',
      anchorDate: new Date(2026, 6, 28),
      opportunities: [],
      obligations: [],
      records: [createPersonalPlanRecord({ date: '2026-07-28', label: '[Sartorius] Research market & product' })],
      today: '2026-07-28',
    });

    assert.equal(board.workSplit.principal, 0);
    assert.equal(board.workSplit.internal, 1);
  });
});
