import { assistantTranscript } from "./chatHistory.ts";
import { fitChatContext } from "./contextBudget.ts";
import { isPlanTransferRequest } from "../../../shared/aiChatActions.js";
import type { ChatContext, ChatMessage } from "./types";
import type { ChatAction } from "../../../shared/aiChatActions.js";

const identityText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[·–—‑]/g, "-")
    .replace(/[^\S\r\n]+/g, " ")
    .trim();
function namesExactSource(content: string, title: string) {
  const escaped = identityText(title).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${escaped}(?=\\s*(?:[\\r\\n"“”*.,;:!?()]|$))`,
    "u",
  ).test(identityText(content));
}

/** A request to transfer the preceding draft must not run a new record search. */
export function planReferenceContext(
  question: string,
  messages: ChatMessage[],
): ChatContext | null {
  if (!isPlanTransferRequest(question)) return null;
  const previous = messages.findLast(
    (message) =>
      message.role === "assistant" && message.context && message.reply,
  );
  if (!previous?.context || !previous.reply) return null;
  const latest = messages.findLast(message => message.role === "assistant");
  if (latest !== previous || previous.planReceipt)
    throw new Error("Bản nháp trước đã bị hủy hoặc đã xử lý. Hãy lập bản nháp mới hoặc nêu rõ công việc cần tạo; chưa ghi dữ liệu.");
  if (previous.content.length > 6000 || assistantTranscript(previous.reply).length > 6000)
    throw new Error("Bản nháp quá dài để chuyển đầy đủ thành Plan. Hãy lập bản nháp mới với ít việc hơn hoặc nêu riêng các việc cần lưu; chưa ghi dữ liệu.");
  const cited = new Set(previous.reply.sourceKeys);
  // Some model drafts cite only the weekly analysis. Recover an omitted
  // citation only by its complete displayed identity from the same snapshot;
  // never by product/brand fragments or a new workspace search.
  const sources = previous.context.sources.filter(
    (source) =>
      cited.has(source.key) ||
      (["account", "opportunity"].includes(source.kind) &&
        namesExactSource(previous.content, source.title)),
  );
  const draftConversion = previous.context.facts.some(fact => fact.startsWith("DRAFT PLANNING MODE:"));
  // The complete preceding agenda is already in history. Aggregate readings and
  // repeated candidate descriptions are not needed to convert it into writes.
  const facts = draftConversion
    ? previous.context.facts.filter(fact => fact.startsWith("Local business date:") || fact.startsWith("DRAFT PLANNING MODE:"))
    : previous.context.facts;
  return fitChatContext({
    ...previous.context,
    limitations: draftConversion
      ? ["Conversion only: full-scope analytical readings are omitted. Use the complete preceding agenda for task details; exact cited record identities remain locked. Do not invent additional work or recompute analysis."]
      : previous.context.limitations,
    sources,
    facts: [
      ...new Set([
        ...facts,
        "Plan conversion of the preceding draft: record identities are locked to the cited sources below. Preserve each task and its original customer/opportunity. Never substitute another deal or turn a named customer task into an unlinked personal task. Ask for clarification if an exact target is unavailable.",
      ]),
    ],
  }, [question, previous.content, messages.findLast(message => message.role === "user")?.content || ""].join("\n"));
}

/** Fail closed instead of silently remapping or unlinking a named draft. */
export function assertPlanReferenceTargets(
  actions: ChatAction[],
  context: ChatContext,
) {
  if (!actions.length) return;
  const opportunities = context.sources.filter(
    (source) => source.kind === "opportunity",
  );
  const targets = opportunities.length
    ? opportunities
    : context.sources.filter((source) => source.kind === "account");
  const keys = new Set(targets.map((source) => source.key));
  if (!keys.size && context.sources.some((source) => source.kind === "plan"))
    throw new Error(
      "Chưa xác định được liên kết gốc khi sao chép Plan. Hãy nêu khách hàng/cơ hội và nội dung cần tạo; chưa ghi dữ liệu.",
    );
  if (
    actions.some(
      (action) =>
        action.kind !== "create_plan" ||
        (keys.size ? !keys.has(action.targetKey) : !!action.targetKey),
    ) ||
    [...keys].some((key) => !actions.some((action) => action.targetKey === key))
  )
    throw new Error(
      "Nhóm Plan không khớp các khách hàng/cơ hội trong lịch đã đề xuất. Chưa áp dụng. Hãy yêu cầu lập lại lịch với từng cơ hội rõ ràng.",
    );
}
