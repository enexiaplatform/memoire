import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../support/reportingCurrency.mjs';
import {
  advertisedQuestions,
  answerFromMemory,
  attentionEmptyAnswers,
  attentionFocusFor,
  attentionHeadings,
  attentionWhyLabels,
  hasSingleSubject,
  isAttentionQuestion,
  isWhatChangedQuestion,
} from '../../src/features/v31/askMemoireContext.ts';
import { detectInsightQuestion } from '../../src/features/v31/askMemoireInsightAnswers.ts';

/**
 * "Summarize this account." is answered by the memory fallback on purpose -
 * summarizing IS its job. Every other advertised question must reach a named
 * engine, because the fallback knows nothing about money, orders or promises.
 */
const FALLBACK_BY_DESIGN = new Set(['Summarize this account.']);

function routeFor(question) {
  if (isAttentionQuestion(question)) return 'attention';
  if (isWhatChangedQuestion(question)) return 'changes';
  return detectInsightQuestion(question);
}

describe('the "What this can answer" panel is a promise, not decoration', () => {
  test('every advertised question reaches a named engine', () => {
    const unrouted = advertisedQuestions
      .filter((question) => !FALLBACK_BY_DESIGN.has(question))
      .filter((question) => routeFor(question) === null);
    assert.deepEqual(unrouted, [], `advertised but unrouted: ${unrouted.join(' | ')}`);
  });

  test('each one lands on the engine that actually answers it', () => {
    assert.equal(routeFor('Who needs follow-up?'), 'attention');
    assert.equal(routeFor('Where is money stuck?'), 'money_state');
    assert.equal(routeFor('What changed this week?'), 'changes');
    assert.equal(routeFor('Which opportunities have no next action?'), 'attention');
    assert.equal(routeFor('Which commitments are overdue?'), 'commitments');
    assert.equal(routeFor('What am I waiting for from customers?'), 'awaiting_customer');
    assert.equal(routeFor('What do I owe today?'), 'own_obligations');
  });

  test('the new matchers do not swallow the questions next to them', () => {
    // "customers" appears in both; the signals question must keep its own answer.
    assert.equal(routeFor('What are customers telling me?'), 'customer_signals');
    assert.equal(routeFor('Which customers should I check back with?'), 'retention_check');
    assert.equal(routeFor('Where is the money?'), 'money_state');
    assert.equal(routeFor('Did my follow-ups work?'), 'follow_up_impact');
  });
});

const account = (id, name) => ({ id, name, summary: `${name} summary` });
const opportunity = (id, accountId, title) => ({
  id, account_id: accountId, title, stage: 'proposal', blocker: '', next_action_text: '',
});
const interaction = (id, accountId, summary) => ({
  id, account_id: accountId, summary, occurred_at: '2026-08-20T09:00:00.000Z', objection: '',
});

function contextWith(accounts, opportunities, interactions, actions = []) {
  return {
    scope: 'all',
    includedData: { accounts, opportunities, interactions, actions, objections: [] },
    missingContext: [],
  };
}

describe('the fallback does not put one customer over another customer evidence', () => {
  test('several customers in scope means no account heading', () => {
    // The live failure: "Account: Grupo Calvo" printed over an interaction
    // belonging to Luis Simoes and a deal belonging to a third customer.
    const result = answerFromMemory('Which opportunities have no next action?', contextWith(
      [account('a1', 'Grupo Calvo'), account('a2', 'Luis Simoes Logistica')],
      [opportunity('o1', 'a2', 'Heat recovery retrofit')],
      [interaction('i1', 'a2', 'Call about the warehouse LED retrofit')],
      [{ id: 'ac1', account_id: 'a2', status: 'open', title: 'Confirm the phasing' }],
    ));
    assert.doesNotMatch(result.answer, /^Account: Grupo Calvo/);
    assert.match(result.answer, /2 customers/);
    assert.match(result.answer, /top of its own list/);
  });

  test('one customer in scope keeps the briefing voice', () => {
    const result = answerFromMemory('Which opportunities have no next action?', contextWith(
      [account('a1', 'Grupo Calvo')],
      [opportunity('o1', 'a1', 'Heat recovery retrofit')],
      [interaction('i1', 'a1', 'Call about the retrofit')],
      [{ id: 'ac1', account_id: 'a1', status: 'open', title: 'Confirm the phasing' }],
    ));
    assert.match(result.answer, /^Account: Grupo Calvo/);
    assert.doesNotMatch(result.answer, /top of its own list/);
  });

  test('a draft is refused rather than addressed to the wrong customer', () => {
    // This is the one guess that leaves the app as text the operator sends.
    const result = answerFromMemory('Draft a follow-up', contextWith(
      [account('a1', 'Grupo Calvo'), account('a2', 'Luis Simoes Logistica')],
      [opportunity('o1', 'a2', 'Heat recovery retrofit')],
      [interaction('i1', 'a2', 'Call about the retrofit')],
    ));
    assert.doesNotMatch(result.answer, /^Hi Grupo Calvo/);
    assert.match(result.answer, /Pick a customer first/);
  });

  test('one test decides it, for the text and the card alike', () => {
    // The answer card builder is a third copy of this join and never had the
    // test: "Recipient: Grupo Calvo" printed above another customer's
    // interaction, in the card for a draft about to be sent.
    assert.equal(hasSingleSubject([{ id: 'a1' }], { account_id: 'a1' }), true);
    assert.equal(hasSingleSubject([{ id: 'a1' }, { id: 'a2' }], { account_id: 'a1' }), false);
    // A deal carries its account by name, so a missing account_id is the norm
    // and not evidence of a second customer.
    assert.equal(hasSingleSubject([{ id: 'a1' }], { account_id: '' }), true);
    assert.equal(hasSingleSubject([{ id: 'a1' }], { account_id: 'a2' }), false);
    assert.equal(hasSingleSubject([], null), true);
  });

  test('a single customer still gets the draft', () => {
    const result = answerFromMemory('Draft a follow-up', contextWith(
      [account('a1', 'Grupo Calvo')],
      [opportunity('o1', 'a1', 'Heat recovery retrofit')],
      [interaction('i1', 'a1', 'Call about the retrofit')],
    ));
    assert.match(result.answer, /^Hi Grupo Calvo/);
  });
});

describe('four attention questions, four answers', () => {
  test('each question is recognised for what it asks', () => {
    // All four used to return the same ranked list under the same heading,
    // "Deals that may go silent" - so "Which objections are unresolved?" was
    // answered with an overdue action.
    assert.equal(attentionFocusFor('Which objections are unresolved?'), 'objections');
    assert.equal(attentionFocusFor('Which opportunities have no next action?'), 'no_next_action');
    assert.equal(attentionFocusFor('Which accounts need follow-up?'), 'accounts');
    assert.equal(attentionFocusFor('Which deals may go silent?'), 'all');
    assert.equal(attentionFocusFor('What should I fix today?'), 'all');
  });

  test('a question about deals is not answered as a question about accounts', () => {
    assert.equal(attentionFocusFor('Which accounts need action on their deals?'), 'all');
  });

  test('every focus has its own heading, label and empty answer', () => {
    const focuses = ['objections', 'no_next_action', 'accounts', 'all'];
    for (const focus of focuses) {
      assert.ok(attentionHeadings[focus], `${focus} needs a heading`);
      assert.ok(attentionWhyLabels[focus], `${focus} needs a card label`);
      assert.ok(attentionEmptyAnswers[focus], `${focus} needs an empty answer`);
    }
    assert.equal(new Set(focuses.map((f) => attentionHeadings[f])).size, focuses.length);
    assert.equal(new Set(focuses.map((f) => attentionWhyLabels[f])).size, focuses.length);
  });

  test('an empty objections answer is not read as an all-clear', () => {
    // Nothing captured is not the same as nothing raised.
    assert.match(attentionEmptyAnswers.objections, /not proof that customers have raised none/);
  });
});
