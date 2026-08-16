import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  daysFromOrder,
  describeInstallment,
  installmentAmount,
  installmentDueDate,
  parsePaymentTerm,
  sanitizeInstallments,
  weightedCreditDays,
} from '../../src/utils/paymentTerms.ts';

/**
 * The parser is allowed to be wrong. It is not allowed to be confidently wrong.
 *
 * Every assertion about `confidence` below is really an assertion about a
 * collection call: a due date this product inferred and a due date the customer
 * agreed to are different kinds of fact, and the screen has to be able to tell
 * them apart before anybody picks up the phone.
 */

describe('payment terms: reading what the operator wrote', () => {
  test('a deposit and a balance', () => {
    const parsed = parsePaymentTerm('30% deposit, 70% on delivery');

    assert.equal(parsed.confidence, 'stated');
    assert.equal(parsed.installments.length, 2);
    assert.deepEqual(
      parsed.installments.map((i) => [i.percent, i.trigger, i.offsetDays]),
      [[30, 'order', 0], [70, 'delivery', 0]],
    );
  });

  test('net days attach to the slice that is waiting, not to the deposit', () => {
    const parsed = parsePaymentTerm('30% deposit, 70% net 45');

    assert.equal(parsed.confidence, 'stated');
    assert.deepEqual(
      parsed.installments.map((i) => [i.percent, i.trigger, i.offsetDays]),
      [[30, 'order', 0], [70, 'invoice', 45]],
    );
  });

  test('plain net terms are one payment from the invoice', () => {
    const parsed = parsePaymentTerm('Net 30');

    assert.equal(parsed.confidence, 'stated');
    assert.deepEqual(parsed.installments.map((i) => [i.percent, i.trigger, i.offsetDays]), [[100, 'invoice', 30]]);
  });

  test('50/50 is read without percent signs', () => {
    const parsed = parsePaymentTerm('50/50');

    assert.equal(parsed.confidence, 'stated');
    assert.deepEqual(parsed.installments.map((i) => [i.percent, i.trigger]), [[50, 'order'], [50, 'delivery']]);
  });

  test('terms that state one slice are completed rather than dropped', () => {
    const parsed = parsePaymentTerm('30% deposit');

    // "30% deposit" leaves the rest understood. A schedule covering 30% of the
    // order would under-report every receivable in the workspace.
    assert.equal(parsed.confidence, 'partial');
    assert.equal(parsed.installments.length, 2);
    assert.equal(parsed.installments[1].percent, 70);
    assert.equal(
      parsed.installments.reduce((sum, i) => sum + i.percent, 0),
      100,
    );
  });

  test('cash on delivery and payment in advance are both recognised', () => {
    assert.deepEqual(
      parsePaymentTerm('COD').installments.map((i) => [i.trigger, i.offsetDays]),
      [['delivery', 0]],
    );
    assert.deepEqual(
      parsePaymentTerm('100% in advance').installments.map((i) => [i.trigger, i.offsetDays]),
      [['order', 0]],
    );
    // How an export invoice writes it. Without these the term fell through to
    // the assumed schedule - "on delivery", the opposite of what was agreed, on
    // the one term that protects the seller.
    for (const stated of ['CIA', 'PIA', 'cash in advance']) {
      const parsed = parsePaymentTerm(stated);
      assert.equal(parsed.confidence, 'stated', `${stated} is a stated term, not an assumption`);
      assert.deepEqual(parsed.installments.map((i) => [i.trigger, i.offsetDays]), [['order', 0]], stated);
    }
  });

  test('an unreadable sentence is assumed, not guessed', () => {
    const parsed = parsePaymentTerm('as per contract annex B');

    assert.equal(parsed.confidence, 'assumed');
    assert.equal(parsed.installments.length, 1);
    assert.equal(parsed.installments[0].percent, 100);
    assert.equal(parsed.sourceText, 'as per contract annex B');
  });

  test('empty terms still produce a schedule that covers the order', () => {
    const parsed = parsePaymentTerm('');

    assert.equal(parsed.confidence, 'assumed');
    assert.equal(parsed.installments[0].percent, 100);
  });

  test('percentages that overshoot are a misread, not confident terms', () => {
    // "70% ... 80%" cannot both be true. Reporting a stated schedule from it
    // would put a wrong number on a collection call.
    assert.equal(parsePaymentTerm('70% deposit, 80% on delivery').confidence, 'assumed');
  });

  test('retention and acceptance get their own names', () => {
    const parsed = parsePaymentTerm('50% deposit, 40% on acceptance, 10% retention');

    assert.deepEqual(parsed.installments.map((i) => i.label), ['Deposit', 'On acceptance', 'Retention']);
  });
});

describe('payment terms: how long the money is out', () => {
  test('credit days are weighted by how much of the order each slice is worth', () => {
    const parsed = parsePaymentTerm('30% deposit, 70% net 60');

    // 30% waits 0 days, 70% waits 60. Unweighted this reads as 60 and
    // overstates the financing cost by nearly half.
    assert.equal(weightedCreditDays(parsed.installments), 42);
  });

  test('paying up front costs no credit at all', () => {
    assert.equal(weightedCreditDays(parsePaymentTerm('100% in advance').installments), 0);
  });

  test('time spent waiting for delivery is credit too', () => {
    const parsed = parsePaymentTerm('100% on delivery');

    // Terms say "on delivery" and the goods take 45 days. The customer has had
    // 45 days of the operator's money whatever the sentence says.
    assert.equal(weightedCreditDays(parsed.installments), 0);
    assert.equal(weightedCreditDays(parsed.installments, { deliveryLagDays: 45 }), 45);
  });

  test('a deposit shields its own share from the delivery lag', () => {
    const parsed = parsePaymentTerm('50% deposit, 50% on delivery');

    assert.equal(weightedCreditDays(parsed.installments, { deliveryLagDays: 40 }), 20);
  });

  test('days from order account for the trigger', () => {
    const deposit = { id: 'a', label: 'Deposit', percent: 30, amount: null, trigger: 'order', offsetDays: 0 };
    const balance = { id: 'b', label: 'Balance', percent: 70, amount: null, trigger: 'invoice', offsetDays: 30 };

    assert.equal(daysFromOrder(deposit, 20, 25), 0);
    assert.equal(daysFromOrder(balance, 20, 25), 55);
  });
});

describe('payment terms: when each slice falls due', () => {
  test('due dates are counted from the order when nothing has happened yet', () => {
    const parsed = parsePaymentTerm('30% deposit, 70% net 30');

    assert.equal(installmentDueDate(parsed.installments[0], '2026-08-01'), '2026-08-01');
    assert.equal(
      installmentDueDate(parsed.installments[1], '2026-08-01', { deliveryLagDays: 10 }),
      '2026-09-10',
    );
  });

  test('a real delivery date beats the assumed lag', () => {
    const parsed = parsePaymentTerm('100% on delivery');

    assert.equal(
      installmentDueDate(parsed.installments[0], '2026-08-01', { deliveryLagDays: 30, deliveryDate: '2026-08-20' }),
      '2026-08-20',
    );
  });

  test('an unreadable order date produces no due date rather than a wrong one', () => {
    const parsed = parsePaymentTerm('Net 30');
    assert.equal(installmentDueDate(parsed.installments[0], 'not-a-date'), '');
  });

  test('an installment is worth its share of the order', () => {
    const parsed = parsePaymentTerm('30% deposit, 70% on delivery');

    assert.equal(installmentAmount(parsed.installments[0], 1_000_000), 300_000);
    assert.equal(installmentAmount(parsed.installments[1], 1_000_000), 700_000);
  });

  test('a flat amount wins over a percentage', () => {
    const fixed = { id: 'a', label: 'Retention', percent: 10, amount: 50_000, trigger: 'delivery', offsetDays: 0 };
    assert.equal(installmentAmount(fixed, 1_000_000), 50_000);
  });
});

describe('payment terms: a schedule the operator corrected', () => {
  test('a hand-written schedule is bounded before it is stored', () => {
    const cleaned = sanitizeInstallments([
      { id: ' dep ', label: '  Deposit  ', percent: 140, trigger: 'order', offsetDays: -5 },
      { label: '', percent: 60, trigger: 'not-a-trigger', offsetDays: 900 },
      'not an installment',
      null,
    ]);

    assert.equal(cleaned.length, 2);
    assert.equal(cleaned[0].id, 'dep');
    assert.equal(cleaned[0].label, 'Deposit');
    assert.equal(cleaned[0].percent, 100, 'a share over 100% is clamped');
    assert.equal(cleaned[0].offsetDays, 0, 'days cannot run backwards');
    assert.equal(cleaned[1].trigger, 'delivery', 'an unknown trigger falls back rather than being stored');
    assert.equal(cleaned[1].offsetDays, 365, 'days are capped at a year');
  });

  test('nothing sensible in means nothing out', () => {
    assert.deepEqual(sanitizeInstallments(null), []);
    assert.deepEqual(sanitizeInstallments('30% deposit'), []);
  });
});

describe('payment terms: saying it out loud', () => {
  test('each slice reads as a sentence', () => {
    const parsed = parsePaymentTerm('30% deposit, 70% net 45');

    assert.equal(describeInstallment(parsed.installments[0]), '30% on order');
    assert.equal(describeInstallment(parsed.installments[1]), '70% net 45 from invoice');
  });
});

describe('payment terms: naming a slice for what it waits on', () => {
  test('a slice is named by its trigger, not by its position', () => {
    // "Deposit / Balance" hides that the second half is waiting on a delivery
    // that has not happened - the one thing somebody chasing it needs to know.
    const parsed = parsePaymentTerm('50% with PO, 50% after delivery');
    assert.deepEqual(parsed.installments.map((i) => i.label), ['Deposit', 'On delivery']);
    assert.deepEqual(parsed.installments.map((i) => i.trigger), ['order', 'delivery']);
  });

  test('Balance is kept for the remainder the parser completed itself', () => {
    // Nothing was stated about this slice, so nothing is claimed about it.
    const parsed = parsePaymentTerm('40% deposit');
    assert.equal(parsed.confidence, 'partial');
    assert.deepEqual(parsed.installments.map((i) => i.label), ['Deposit', 'Balance']);
  });
});

describe('an order on net terms has no deposit', () => {
  test('net terms produce no order-triggered installment', () => {
    for (const term of ['Net 30', 'net 45 days', 'payment within 14 days of invoice']) {
      assert.equal(
        parsePaymentTerm(term).installments.some((part) => part.trigger === 'order'),
        false,
        `${term} must not imply a deposit`,
      );
    }
  });

  test('deposit terms still do', () => {
    for (const term of ['50% deposit, balance net 60', '30% with order', 'CIA']) {
      assert.equal(
        parsePaymentTerm(term).installments.some((part) => part.trigger === 'order'),
        true,
        `${term} is money owed before delivery`,
      );
    }
  });
});
