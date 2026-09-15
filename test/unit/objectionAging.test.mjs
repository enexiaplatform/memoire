import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ageObjections,
  compareByDebtAge,
  objectionAgeDays,
  summariseObjectionTypes,
  valueAtStake,
} from '../../src/utils/objectionAging.ts';

const today = '2026-09-15';

const objection = (patch = {}) => ({
  id: `x-${Math.random().toString(36).slice(2)}`,
  accountId: '', accountName: 'Delta Labs', opportunityId: '', opportunityName: '',
  stakeholderId: '', stakeholderName: '', sourceActivityId: '',
  objectionType: 'Price', objectionText: 'Too expensive', impact: 'High', status: 'Open',
  requiredProof: '', responsePlan: '', resolutionNote: '', dueDate: '', resolvedAt: '', tags: [],
  createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T09:00:00.000Z', storageMode: 'local',
  ...patch,
});

const deal = (patch = {}) => ({
  id: `o-${Math.random().toString(36).slice(2)}`, accountName: 'Delta Labs', opportunityName: 'Filters',
  stage: 'Proposal', estimatedValue: 1000, currency: 'USD', status: 'Active',
  createdAt: '2026-01-01', updatedAt: '2026-01-01',
  ...patch,
});

describe('objection aging', () => {
  test('age is counted in whole local days from when it was raised', () => {
    assert.equal(objectionAgeDays({ createdAt: '2026-09-01' }, today), 14);
    assert.equal(objectionAgeDays({ createdAt: 'not a date' }, today), null);
  });

  test('tone climbs from new to urgent, and a missed due date is urgent at any age', () => {
    const [fresh, aging, urgent, late, brandNew] = ageObjections({
      objections: [
        objection({ createdAt: '2026-09-08' }),
        objection({ createdAt: '2026-08-30' }),
        objection({ createdAt: '2026-08-20' }),
        objection({ createdAt: '2026-09-12', dueDate: '2026-09-14' }),
        objection({ createdAt: '2026-09-15' }),
      ],
      opportunities: [],
      today,
    });
    assert.equal(fresh.tone, 'fresh');
    assert.equal(aging.tone, 'aging');
    assert.equal(urgent.tone, 'urgent');
    assert.equal(late.tone, 'urgent');
    assert.equal(late.pastDue, true);
    assert.equal(brandNew.tone, 'new');
  });

  test('a resolved objection is never past due', () => {
    const [resolved] = ageObjections({
      objections: [objection({ status: 'Resolved', dueDate: '2026-09-01' })],
      opportunities: [],
      today,
    });
    assert.equal(resolved.pastDue, false);
  });

  test('the deal is found by id, then by account and deal name with diacritics folded', () => {
    const byId = deal({ id: 'deal-1' });
    const byName = deal({ id: 'deal-2', accountName: 'CÔNG TY CỬU LONG', opportunityName: 'Máy lọc' });
    const aged = ageObjections({
      objections: [
        objection({ opportunityId: 'deal-1' }),
        objection({ accountName: 'Cong ty Cuu Long', opportunityName: 'May loc' }),
      ],
      opportunities: [byId, byName],
      today,
    });
    assert.equal(aged[0].opportunity.id, 'deal-1');
    assert.equal(aged[1].opportunity.id, 'deal-2');
  });

  test('oldest debt first, with undated records last rather than first', () => {
    const aged = ageObjections({
      objections: [
        objection({ id: 'young', createdAt: '2026-09-10' }),
        objection({ id: 'undated', createdAt: '' }),
        objection({ id: 'old', createdAt: '2026-08-01' }),
      ],
      opportunities: [],
      today,
    });
    assert.deepEqual([...aged].sort(compareByDebtAge).map((item) => item.objection.id), ['old', 'young', 'undated']);
  });

  test('type cards rank by how long a kind has been left, not by how many there are', () => {
    const aged = ageObjections({
      objections: [
        objection({ objectionType: 'Price', createdAt: '2026-09-12' }),
        objection({ objectionType: 'Price', createdAt: '2026-09-13' }),
        objection({ objectionType: 'Price', createdAt: '2026-09-14' }),
        objection({ objectionType: 'Lead time', createdAt: '2026-08-10' }),
        objection({ objectionType: 'Competitor', status: 'Resolved', createdAt: '2026-06-01' }),
      ],
      opportunities: [],
      today,
    });
    const cards = summariseObjectionTypes(aged);
    assert.deepEqual(cards.map((card) => card.type), ['Lead time', 'Price']);
    assert.equal(cards[1].count, 3);
  });

  test('value at stake counts a deal once however many objections hang on it', () => {
    const shared = deal({ id: 'shared', estimatedValue: 500 });
    const aged = ageObjections({
      objections: [
        objection({ opportunityId: 'shared' }),
        objection({ opportunityId: 'shared', status: 'Addressed' }),
        objection({ opportunityId: 'shared', status: 'Resolved' }),
      ],
      opportunities: [shared],
      today,
    });
    assert.deepEqual(valueAtStake(aged), { total: 500, deals: 1 });
  });
});
