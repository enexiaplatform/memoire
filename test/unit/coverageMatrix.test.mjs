import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildCoverageMatrix, coverageCellLabel } from '../../src/utils/coverageMatrix.ts';

const deal = (id, overrides = {}) => ({
  id,
  accountName: 'DP Lab',
  opportunityName: `Deal ${id}`,
  brand: 'Sartorius',
  stage: 'Negotiation',
  status: 'Active',
  estimatedValue: 100,
  currency: 'VND',
  pipelineProbability: null,
  ...overrides,
});

describe('coverage matrix: the empty squares are the point', () => {
  test('a customer with no deal for a line gets an empty square, not a missing row', () => {
    const matrix = buildCoverageMatrix({
      opportunities: [
        deal('a', { accountName: 'DP Lab', brand: 'Sartorius' }),
        deal('b', { accountName: 'Bidiphar', brand: 'Cobetter' }),
      ],
    });

    assert.deepEqual(matrix.brands.sort(), ['Cobetter', 'Sartorius']);
    assert.equal(matrix.rows.length, 2);
    assert.equal(matrix.totalCells, 4);
    assert.equal(matrix.filledCells, 2);
    assert.equal(matrix.penetration, 0.5);

    const dpLab = matrix.rows.find((row) => row.accountName === 'DP Lab');
    assert.deepEqual(dpLab.missingBrands, ['Cobetter']);
  });

  test('a customer who buys none of the branded lines still gets a row', () => {
    // Dropping them would hide the widest gap on the page.
    const matrix = buildCoverageMatrix({
      opportunities: [
        deal('a', { accountName: 'DP Lab', brand: 'Sartorius' }),
        deal('b', { accountName: 'Rohto', brand: 'Cobetter' }),
        deal('c', { accountName: 'Masan', brand: '' }),
      ],
    });

    const masan = matrix.rows.find((row) => row.accountName === 'Masan');
    assert.ok(masan, 'a customer with only unbranded deals must still appear');
    assert.equal(masan.brandsTouched, 0);
    assert.equal(masan.missingBrands.length, 2);
  });

  test('the strongest truth about a square wins', () => {
    const matrix = buildCoverageMatrix({
      opportunities: [
        deal('lost', { status: 'Lost' }),
        deal('active', { status: 'Active' }),
        deal('won', { status: 'Won' }),
      ],
    });

    assert.equal(matrix.rows[0].cells[0].state, 'won');
    assert.equal(matrix.rows[0].cells[0].dealCount, 3);
  });

  test('tried and lost is not the same square as never tried', () => {
    const matrix = buildCoverageMatrix({
      opportunities: [
        deal('lost', { accountName: 'DP Lab', brand: 'Sartorius', status: 'Lost' }),
        deal('other', { accountName: 'Rohto', brand: 'Cobetter' }),
      ],
    });

    const dpLab = matrix.rows.find((row) => row.accountName === 'DP Lab');
    const sartorius = dpLab.cells.find((cell) => cell.brand === 'Sartorius');
    const cobetter = dpLab.cells.find((cell) => cell.brand === 'Cobetter');

    assert.equal(sartorius.state, 'lost');
    assert.equal(cobetter.state, 'none');
    // A lost square counts as touched: the conversation happened.
    assert.equal(dpLab.brandsTouched, 1);
    assert.deepEqual(dpLab.missingBrands, ['Cobetter']);
  });

  test('a committed order outranks a merely active deal', () => {
    const matrix = buildCoverageMatrix({
      opportunities: [deal('c', { pipelineProbability: 95 })],
    });
    assert.equal(matrix.rows[0].cells[0].state, 'committed');
  });
});

describe('coverage matrix: gaps worth closing', () => {
  test('gaps rank by what the relationship is already worth', () => {
    const matrix = buildCoverageMatrix({
      opportunities: [
        deal('big', { accountName: 'Bidiphar', brand: 'Sartorius', estimatedValue: 900 }),
        deal('small', { accountName: 'Tenamyd', brand: 'Sartorius', estimatedValue: 10 }),
        deal('other', { accountName: 'Rohto', brand: 'Cobetter', estimatedValue: 50 }),
      ],
    });

    assert.equal(matrix.gaps[0].accountName, 'Bidiphar');
    assert.deepEqual(matrix.gaps[0].missingBrands, ['Cobetter']);
  });

  test('a customer with the full range is not a gap', () => {
    const matrix = buildCoverageMatrix({
      opportunities: [
        deal('a', { accountName: 'DP Lab', brand: 'Sartorius' }),
        deal('b', { accountName: 'DP Lab', brand: 'Cobetter' }),
      ],
    });

    assert.equal(matrix.gaps.length, 0);
    assert.equal(matrix.penetration, 1);
  });

  test('the shortlist is capped so it stays a shortlist', () => {
    const opportunities = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((name, index) =>
      deal(name, { accountName: `Account ${name}`, brand: 'Sartorius', estimatedValue: 100 - index }));
    opportunities.push(deal('other', { accountName: 'Elsewhere', brand: 'Cobetter' }));

    const matrix = buildCoverageMatrix({ opportunities, gapLimit: 3 });
    assert.equal(matrix.gaps.length, 3);
  });
});

describe('coverage matrix: when it should not be shown at all', () => {
  test('one line is a list, not a matrix', () => {
    const matrix = buildCoverageMatrix({
      opportunities: [deal('a'), deal('b', { accountName: 'Rohto' })],
    });
    assert.equal(matrix.hasEnoughBrands, false);
  });

  test('no brands at all reports nothing to compare', () => {
    const matrix = buildCoverageMatrix({
      opportunities: [deal('a', { brand: '' })],
    });
    assert.equal(matrix.brands.length, 0);
    assert.equal(matrix.hasEnoughBrands, false);
    assert.equal(matrix.totalCells, 0);
    assert.equal(matrix.penetration, 0);
  });
});

describe('coverage matrix: squares explain themselves', () => {
  test('every state has wording an operator can act on', () => {
    assert.equal(coverageCellLabel('none'), 'Never taken to them');
    assert.equal(coverageCellLabel('lost'), 'Tried and lost');
    assert.equal(coverageCellLabel('won'), 'Won');
  });

  test('a square with deals links to them; an empty one links nowhere', () => {
    const matrix = buildCoverageMatrix({
      opportunities: [
        deal('a', { accountName: 'DP Lab', brand: 'Sartorius' }),
        deal('b', { accountName: 'Rohto', brand: 'Cobetter' }),
      ],
    });

    const dpLab = matrix.rows.find((row) => row.accountName === 'DP Lab');
    assert.match(dpLab.cells.find((cell) => cell.brand === 'Sartorius').href, /account=DP%20Lab&brand=Sartorius/);
    assert.equal(dpLab.cells.find((cell) => cell.brand === 'Cobetter').href, '');
  });
});

describe('a customer whose deals are in an unpriced currency', () => {
  /**
   * The gap list was filtered on `relationshipValueBase > 0`, and that comes
   * from `sumMoneyInBase`, which drops what it cannot convert. So the customer
   * vanished from the list rather than ranking last - while being exactly the
   * "already worth real money, carries only part of the range" case it is for.
   */
  test('still appears in the coverage gaps', () => {
    const matrix = buildCoverageMatrix({
      opportunities: [
        // SEK ships no planning rate, so every figure for this account is 0.
        deal('n1', { accountName: 'Nordic Labs', brand: 'Alpha', estimatedValue: 90_000, currency: 'SEK' }),
        deal('t1', { accountName: 'Truong Son', brand: 'Alpha', estimatedValue: 100_000_000, currency: 'VND' }),
        deal('t2', { accountName: 'Truong Son', brand: 'Beta', estimatedValue: 50_000_000, currency: 'VND' }),
      ],
    });

    const names = matrix.gaps.map((gap) => gap.accountName);
    assert.ok(names.includes('Nordic Labs'), 'it used to be dropped entirely');
  });
});
