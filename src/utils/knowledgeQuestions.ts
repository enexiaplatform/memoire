import { buildKnowledgeGraph, type KnowledgeGraphInput, type KnowledgeGraph } from './knowledgeGraph.ts';
import { normalizeSearchText } from './textSearch.ts';
import type { AskMemoireAnswer } from '../types/v31.ts';

/** The exact questions shown in Vault and their evidence are one registry. */
export function knowledgeQuestionRegistry(graph: KnowledgeGraph) {
  return [...graph.health.entries()].flatMap(([nodeId, health]) => health.dimensions.map(dimension => ({
    question: dimension.question, node: graph.byId.get(nodeId)!, dimension,
  })));
}
export function answerKnowledgeQuestion(question: string, input: KnowledgeGraphInput): AskMemoireAnswer | null {
  const registry = knowledgeQuestionRegistry(buildKnowledgeGraph(input));
  const entry = registry.find(item => normalizeSearchText(item.question) === normalizeSearchText(question));
  if (!entry) return null;
  const {node, dimension} = entry;
  const value = dimension.dismissed ? 'Marked not applicable by the operator.' : dimension.known ? dimension.answer || 'Recorded; review the source for detail.' : 'Not recorded. Confirm this with the customer and capture the evidence.';
  return {answer: `${node.label} — ${dimension.label}: ${value}`, contextUsed: ['Business Vault recorded knowledge', node.label],
    missingContext: dimension.known || dimension.dismissed ? [] : [dimension.label],
    suggestedQuestions: [], cards: [{kind:'insight',title:`${node.label} · ${dimension.label}`,fields:[{label:'Recorded evidence',value}],
      ctas: [{label:'Open Business Vault',href:`/app/vault?node=${encodeURIComponent(node.id)}`}, ...(node.href ? [{label:'Open source',href:node.href}] : [])]}]};
}
