import assert from 'node:assert/strict';
import {
  quickStartQuestions,
  defaultQuickStartAnswers,
  buildQuickStartPlan,
  isQuickStartComplete,
} from '../src/utils/quickStartSetup.ts';

// Five dropdown questions, each with options, covering the setup dimensions.
const ids = quickStartQuestions.map((q) => q.id);
for (const id of ['sells', 'sellsTo', 'cycle', 'currency', 'focus']) {
  assert.ok(ids.includes(id), `quick start missing question ${id}`);
}
for (const question of quickStartQuestions) {
  assert.ok(question.options.length >= 2, `question ${question.id} needs options`);
  assert.ok(question.label && question.help, `question ${question.id} needs label and help`);
}

// Currency options are the supported reporting currencies.
const currencyOptions = quickStartQuestions.find((q) => q.id === 'currency').options.map((o) => o.value);
for (const currency of ['VND', 'SGD', 'USD', 'EUR']) {
  assert.ok(currencyOptions.includes(currency), `currency option missing ${currency}`);
}

// Plans route each focus choice to a concrete first step.
const silencePlan = buildQuickStartPlan({ ...defaultQuickStartAnswers(), focus: 'silence', currency: 'USD', cycle: 'short' });
assert.match(silencePlan.focusRoute, /goingSilent/);
assert.match(silencePlan.summary, /USD/);
assert.match(silencePlan.summary, /Short cycles/);
assert.ok(silencePlan.steps.length >= 3);

const capturePlan = buildQuickStartPlan({ ...defaultQuickStartAnswers(), focus: 'capture' });
assert.match(capturePlan.focusRoute, /\/app\/capture/);

const reviewPlan = buildQuickStartPlan({ ...defaultQuickStartAnswers(), focus: 'review' });
assert.match(reviewPlan.focusRoute, /pipeline-defense/);

// Without localStorage (Node), the setup is not marked complete.
assert.equal(isQuickStartComplete(), false);

console.log('Quick start setup verified: 5 dropdown questions, currency options, and focus-routed plans.');
