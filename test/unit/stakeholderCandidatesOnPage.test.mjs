import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deriveStakeholderCandidatesFromActivities } from '../../src/utils/stakeholderGraph.ts';

/**
 * The Stakeholders page calls itself "the whole book".
 *
 * It was the book of what somebody typed into its own form. A person named in a
 * capture got exactly one chance to become a record - the prompt shown straight
 * after that capture saved - and if it was dismissed, or the capture predated
 * the prompt, the person was never offered again. Meanwhile the Vault, reading
 * the same workspace, listed them with their job titles.
 *
 * `deriveStakeholderCandidatesFromActivities` was written and tested for this
 * and had no caller anywhere in the app.
 */
const capture = (over = {}) => ({
  id: `a-${Math.random().toString(36).slice(2)}`,
  activityDate: '2026-08-01',
  activityType: 'Meeting',
  summary: 'Site walkthrough',
  rawNote: '',
  contactName: 'Sofia Marques',
  stakeholderName: '',
  stakeholderRole: 'Head of Engineering',
  accountName: 'Grupo Pestana Hotéis',
  linkedAccountName: '',
  opportunityName: 'Heat recovery retrofit',
  linkedOpportunityName: '',
  linkedOpportunityId: 'opp-1',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

describe('people named in captures who have no record', () => {
  test('a captured contact is offered as a candidate', () => {
    const candidates = deriveStakeholderCandidatesFromActivities([capture()]);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].name, 'Sofia Marques');
  });

  test('the job title the note gave comes with them', () => {
    // The hardest fact about a person, and the one most often lost.
    const candidates = deriveStakeholderCandidatesFromActivities([capture()]);
    assert.equal(candidates[0].roleTitle, 'Head of Engineering');
  });

  test('an accented name survives, now that capture can read one', () => {
    const candidates = deriveStakeholderCandidatesFromActivities([
      capture({ contactName: 'João Ribeiro', accountName: 'Luís Simões Logística Integrada' }),
    ]);
    assert.equal(candidates[0].name, 'João Ribeiro');
    assert.match(candidates[0].accountName, /Luís Simões/);
  });

  test('the same person captured twice is offered once', () => {
    const candidates = deriveStakeholderCandidatesFromActivities([capture(), capture()]);
    assert.equal(candidates.length, 1);
  });

  test('a note naming nobody offers nobody', () => {
    const candidates = deriveStakeholderCandidatesFromActivities([
      capture({ contactName: '', stakeholderName: '' }),
    ]);
    assert.deepEqual(candidates, []);
  });

  test('the page can tell a candidate from someone already recorded', () => {
    // The page filters on folded name + folded account, which is what makes
    // "Sofia Marques" at one customer distinct from the same name at another.
    const candidates = deriveStakeholderCandidatesFromActivities([
      capture(),
      capture({ contactName: 'Sofia Marques', accountName: 'Grupo Calvo' }),
    ]);
    assert.equal(candidates.length, 2);
    assert.notEqual(candidates[0].accountName, candidates[1].accountName);
  });
});
