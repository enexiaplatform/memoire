import {
  recommendationRuleConcerns,
  type PersonalEvidence,
} from '../commercialKernel/rankRecommendations.ts';
import type { Recommendation } from '../commercialKernel/policyEngine.ts';
import { isAtLeast, LEARNING_QUOTABLE_FROM } from './learningPatterns.ts';
import type { PersonalLearningEvidence } from './derivePersonalLearning.ts';

/**
 * The consumer Phase 2 left a seam for.
 *
 * `PersonalEvidence` has existed since the ranking primitive shipped, with no
 * implementation, on the grounds that an abstraction with no consumer is worse
 * than no abstraction. This is the implementation - and it is deliberately the
 * smaller half of what that seam could do.
 *
 * ## What it does
 *
 * Turns a matured personal pattern into one extra line in a recommendation's
 * "why this" - labelled as the seller's own history, beside the reason the
 * policy engine already gave.
 *
 * ## What it deliberately does not do
 *
 * Change the order. Not one recommendation moves because of anything measured
 * here, and that is a decision rather than an oversight:
 *
 *   1. No pattern in this workspace has reached `established`, and several
 *      cannot reach it for months. A reordering path that nothing can currently
 *      exercise is a path that ships untested and fails the first time it fires.
 *   2. Ranking is lexicographic over four named dimensions precisely so that a
 *      seller who disagrees with the order can see which one decided it. A
 *      fifth input that is a statistical tendency rather than a fact about the
 *      record in front of them would be the first ingredient they cannot check.
 *   3. Historical association is weaker evidence than current state, always. A
 *      pattern saying "deals with a customer promise close more often" must
 *      never outrank the fact that this particular customer asked for no
 *      contact until the 20th.
 *
 * Learning earns influence gradually, and display is the first rung.
 *
 * ## The two gates
 *
 * **Maturity.** Below `developing` nothing is quoted at all. An eight-deal
 * pattern is worth showing someone looking back over their book; it is not
 * worth putting in front of them while they decide what to do this morning.
 *
 * **Relevance.** The pattern's dimension has to be one the rule declares it is
 * about, using the same typed map the Phase 2.1 relevance gate uses. There is
 * no second copy of it here: a technical pattern reaching a payment-collection
 * recommendation is the exact failure that map was written to prevent, and
 * re-implementing the check would be re-opening it.
 */
export function personalEvidenceFor(
  learning: PersonalLearningEvidence[],
  recommendations: Recommendation[],
): PersonalEvidence[] {
  const quotable = learning.filter((pattern) => (
    isAtLeast(pattern.strength, LEARNING_QUOTABLE_FROM)
    // A pattern with no visible difference has nothing to add to a rationale.
    // It is still worth showing on Review, where "no difference" is an answer.
    && pattern.direction !== 'none'
  ));
  if (quotable.length === 0) return [];

  return quotable.flatMap((pattern) => {
    const recommendationIds = recommendations
      .filter((recommendation) => (
        recommendationRuleConcerns[recommendation.reasonCode].includes(pattern.dimension)
      ))
      .map((recommendation) => recommendation.id);

    if (recommendationIds.length === 0) return [];

    return [{
      // Labelled as history and as a count, so it reads as one input among
      // several rather than as the product's verdict.
      reading: `From your own history (${pattern.sample} comparable closed deals): ${pattern.reading}`,
      recommendationIds,
    }];
  });
}
