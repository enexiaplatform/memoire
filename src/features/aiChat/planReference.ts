import type { ChatContext, ChatMessage } from './types';
import type { ChatAction } from '../../../shared/aiChatActions.js';

const identityText = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase()
  .replace(/[·–—‑]/g, '-').replace(/[^\S\r\n]+/g, ' ').trim();
function namesExactSource(content: string, title: string) {
  const escaped = identityText(title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=\\s*(?:[\\r\\n"“”*.,;:!?()]|$))`, 'u').test(identityText(content));
}

/** A request to transfer the preceding draft must not run a new record search. */
export function planReferenceContext(question: string, messages: ChatMessage[]): ChatContext | null {
  const text = question.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase();
  if (!/\b(add|put|save|insert|them|luu|dua)\b/.test(text) || !/\b(plan|ke hoach|lich)\b/.test(text)) return null;
  if (!/\b(it|them|these|those|above|draft|this|that|all|nay|do|tren)\b/.test(text) &&
      !/^(?:add (?:into|to) (?:the )?plan(?: with details information)?|(?:them|luu) (?:vao )?(?:plan|ke hoach|lich))[.! ]*$/.test(text)) return null;
  const previous = messages.findLast(message => message.role === 'assistant' && message.context && message.reply);
  if (!previous?.context || !previous.reply) return null;
  const cited = new Set(previous.reply.sourceKeys);
  // Some model drafts cite only the weekly analysis. Recover an omitted
  // citation only by its complete displayed identity from the same snapshot;
  // never by product/brand fragments or a new workspace search.
  const sources = previous.context.sources.filter(source => cited.has(source.key) ||
    (['account','opportunity'].includes(source.kind) && namesExactSource(previous.content, source.title)));
  return {
    ...previous.context,
    sources,
    facts: [...previous.context.facts,
      'Plan conversion of the preceding draft: record identities are locked to the cited sources below. Preserve each task and its original customer/opportunity. Never substitute another deal or turn a named customer task into an unlinked personal task. Ask for clarification if an exact target is unavailable.'],
  };
}

/** Fail closed instead of silently remapping or unlinking a named draft. */
export function assertPlanReferenceTargets(actions: ChatAction[], context: ChatContext) {
  if (!actions.length) return;
  const opportunities = context.sources.filter(source => source.kind === 'opportunity');
  const targets = opportunities.length ? opportunities : context.sources.filter(source => source.kind === 'account');
  const keys = new Set(targets.map(source => source.key));
  if (actions.some(action => action.kind !== 'create_plan' || (keys.size ? !keys.has(action.targetKey) : !!action.targetKey)) ||
      [...keys].some(key => !actions.some(action => action.targetKey === key)))
    throw new Error('Nhóm Plan không khớp các khách hàng/cơ hội trong lịch đã đề xuất. Chưa áp dụng. Hãy yêu cầu lập lại lịch với từng cơ hội rõ ràng.');
}
