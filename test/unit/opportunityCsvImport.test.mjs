import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseOpportunityCsv } from '../../src/utils/opportunityCsvImport.ts';

/**
 * The import a new operator runs on their first day, on the file their CRM
 * actually exports.
 */
const csv = [
  'Account Name,Opportunity Name,Stage,Status,Estimated Value,Currency,Expected Close Date,Next Action',
  'Kessler Antriebe GmbH,Retrofit line B,Proposal,Active,"85,000",EUR,2026-10-15,Send updated BOM',
  'Nordwind Marine AS,Deck crane spares,Negotiation,Active,340000,NOK,2026-09-30,Confirm delivery slot',
].join('\n');

describe('parseOpportunityCsv', () => {
  test('the money column is read through the mapping, not a hardcoded header name', () => {
    const { rows, errors } = parseOpportunityCsv(csv);
    assert.deepEqual(errors, []);
    assert.equal(rows.length, 2);

    // "Estimated Value" is what Salesforce, HubSpot and most Excel exports call
    // it, and this file auto-detects it. The row builder looked only for a
    // column literally named "value" or "amount", so every deal imported with
    // "Missing value." and a whole pipeline landed worth nothing.
    assert.equal(rows[0].input.estimatedValue, 85000, 'a thousands separator is not a missing value');
    assert.equal(rows[1].input.estimatedValue, 340000);
    for (const row of rows) {
      assert.equal(
        row.warnings.some((warning) => /missing value/i.test(warning)),
        false,
        `value warning on a row that has one: ${row.warnings.join(' ')}`,
      );
    }
  });

  test('an explicit mapping wins over the header name', () => {
    const mapped = parseOpportunityCsv(
      ['Customer,Deal,Weight in EUR', 'Kessler Antriebe GmbH,Retrofit line B,85000'].join('\n'),
      [],
      { Customer: 'accountName', Deal: 'opportunityName', 'Weight in EUR': 'estimatedValue' },
    );
    assert.equal(mapped.rows[0].input.estimatedValue, 85000, 'the confirmed mapping is the operator’s answer');
  });

  test('a currency the rate table cannot price is kept, not rewritten', () => {
    const { rows } = parseOpportunityCsv(csv);
    const nordwind = rows[1];
    // It used to become VND: 340,000 NOK imported as 340,000 Dong, about a
    // hundredth of the money, stated as fact and added to every total.
    assert.equal(nordwind.input.currency, 'NOK');
    assert.ok(
      nordwind.warnings.some((warning) => /NOK is not in the rate table/.test(warning)),
      'the operator is told the row stays out of converted totals',
    );
  });

  test('an export written in the comma-decimal convention keeps its value', () => {
    // "85.000,50" is eighty-five thousand euros in Germany, Austria, the
    // Netherlands, Italy, Spain, the Nordics and most of Latin America. It used
    // to import as 85.0005, and "1.250.000" imported as "Missing value."
    const { rows } = parseOpportunityCsv([
      'Account Name,Opportunity Name,Estimated Value,Currency',
      'Kessler Antriebe GmbH,Retrofit line B,"85.000,50",EUR',
      'Nordwind Marine AS,Deck crane spares,"1.250.000",SEK',
    ].join('\n'));
    assert.equal(rows[0].input.estimatedValue, 85000.5);
    assert.equal(rows[1].input.estimatedValue, 1250000);
  });

  test('supported currencies carry no warning', () => {
    const { rows } = parseOpportunityCsv(csv);
    assert.equal(rows[0].input.currency, 'EUR');
    assert.equal(rows[0].warnings.some((warning) => /rate table/.test(warning)), false);
  });
});
