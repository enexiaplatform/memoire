import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRoleCoverageMatrix,
  describeCoveragePerson,
  COVERAGE_ROLES,
} from '../../src/utils/stakeholderRoleCoverage.ts';

const person = (patch = {}) => ({
  id: `s-${Math.random().toString(36).slice(2)}`,
  accountId: '', accountName: 'Delta Labs', opportunityId: '', opportunityName: '',
  name: 'A Person', roleTitle: '', stakeholderRole: 'Unknown', influenceLevel: 'Unknown',
  relationshipStrength: 'Unknown', stance: 'Unknown', email: '', phone: '', notes: '', tags: [],
  lastInteractionDate: '', createdAt: '2026-09-01', updatedAt: '2026-09-01', storageMode: 'local',
  ...patch,
});

const deal = (patch = {}) => ({
  id: `o-${Math.random().toString(36).slice(2)}`, accountName: 'Delta Labs', opportunityName: 'Deal',
  stage: 'Proposal', estimatedValue: 100, currency: 'USD', status: 'Active',
  createdAt: '2026-01-01', updatedAt: '2026-01-01',
  ...patch,
});

describe('role coverage matrix', () => {
  test('an account with a live deal and nobody named is a row of five gaps, not a missing row', () => {
    const matrix = buildRoleCoverageMatrix({ stakeholders: [], opportunities: [deal({ accountName: 'Quiet Pharma' })] });
    assert.equal(matrix.rows.length, 1);
    assert.equal(matrix.rows[0].accountName, 'Quiet Pharma');
    assert.equal(matrix.rows[0].gaps, COVERAGE_ROLES.length);
    assert.equal(matrix.missingEconomicBuyer, 1);
  });

  test('a closed deal does not put its customer on the page', () => {
    const matrix = buildRoleCoverageMatrix({ stakeholders: [], opportunities: [deal({ status: 'Won' })] });
    assert.equal(matrix.rows.length, 0);
  });

  test('legacy role spellings land in the column they mean', () => {
    const matrix = buildRoleCoverageMatrix({
      stakeholders: [person({ name: 'Old Import', stakeholderRole: 'Decision maker' })],
      opportunities: [],
    });
    const economicBuyer = matrix.rows[0].cells.find((cell) => cell.role === 'Economic Buyer');
    assert.equal(economicBuyer.people.length, 1);
    assert.equal(matrix.missingEconomicBuyer, 0);
  });

  test('one customer spelled with and without diacritics is one row', () => {
    const matrix = buildRoleCoverageMatrix({
      stakeholders: [
        person({ accountName: 'CÔNG TY DƯỢC PHẨM CỬU LONG', stakeholderRole: 'Champion' }),
        person({ accountName: 'Cong ty Duoc Pham Cuu Long', stakeholderRole: 'Procurement' }),
      ],
      opportunities: [],
    });
    assert.equal(matrix.rows.length, 1);
    assert.equal(matrix.rows[0].covered, 2);
  });

  test('live money first, so the missing name that costs something is on top', () => {
    const matrix = buildRoleCoverageMatrix({
      stakeholders: [person({ accountName: 'Small Co', stakeholderRole: 'Champion' })],
      opportunities: [
        deal({ accountName: 'Small Co', estimatedValue: 10 }),
        deal({ accountName: 'Big Co', estimatedValue: 900 }),
      ],
    });
    assert.deepEqual(matrix.rows.map((row) => row.accountName), ['Big Co', 'Small Co']);
  });

  test('unknown roles and unattached people are counted, never dropped', () => {
    const matrix = buildRoleCoverageMatrix({
      stakeholders: [
        person({ stakeholderRole: 'Unknown' }),
        person({ stakeholderRole: 'Champion' }),
        person({ accountName: '', stakeholderRole: 'Unknown' }),
      ],
      opportunities: [],
    });
    assert.equal(matrix.totalPeople, 3);
    assert.equal(matrix.unknownRoles, 2);
    assert.equal(matrix.unattached, 1);
    assert.equal(matrix.rows[0].unknownRoles, 1);
  });

  test('the name shown in a cell is the person spoken to most recently', () => {
    const matrix = buildRoleCoverageMatrix({
      stakeholders: [
        person({ name: 'Earlier', stakeholderRole: 'Champion', lastInteractionDate: '2026-08-01' }),
        person({ name: 'Later', stakeholderRole: 'Champion', lastInteractionDate: '2026-09-10' }),
      ],
      opportunities: [],
    });
    assert.equal(matrix.rows[0].cells[0].people[0].name, 'Later');
  });
});

describe('the half-line under a name', () => {
  const today = '2026-09-15';

  test('a person gone quiet says so instead of describing themselves', () => {
    assert.deepEqual(
      describeCoveragePerson(person({ roleTitle: 'Buyer', lastInteractionDate: '2026-08-29' }), today),
      { text: 'Quiet 17d', quiet: 'quiet' },
    );
    assert.equal(describeCoveragePerson(person({ lastInteractionDate: '2026-08-01' }), today).quiet, 'silent');
  });

  test('one qualifier, the most telling one present', () => {
    assert.equal(
      describeCoveragePerson(person({ roleTitle: 'Plant director', influenceLevel: 'High', stance: 'Supportive' }), today).text,
      'Plant director · High influence',
    );
    assert.equal(
      describeCoveragePerson(person({ roleTitle: 'Buyer', stance: 'Supportive' }), today).text,
      'Buyer · Supportive',
    );
    assert.equal(describeCoveragePerson(person({ roleTitle: '' }), today).text, '');
  });

  test('an unreadable interaction date is no date, not a silence alarm', () => {
    assert.equal(describeCoveragePerson(person({ lastInteractionDate: 'next week' }), today).quiet, 'none');
  });
});
