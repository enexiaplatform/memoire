import type { ChatContext } from "./types";

const bytes = (value: string) => new TextEncoder().encode(value).length;

/** Keep exact identities and calculated facts; shorten visible excerpts before sending. */
export function fitChatContext(
  context: ChatContext,
  question: string,
): ChatContext {
  // Reserve room for the system instructions, current question and latest draft.
  const budget = Math.max(1600, 7200 - Math.max(0, bytes(question) - 800));
  if (bytes(JSON.stringify(context)) <= budget) return context;
  let sources = context.sources;
  let omitted = 0;
  const pack = () => {
    for (const limit of [600, 400, 240, 160, 96, 40, 0]) {
      const packed = {
        ...context,
        sources: sources.map((source) => ({
          ...source,
          detail:
            source.detail.length > limit
              ? `${source.detail.slice(0, limit).trimEnd()} … [excerpt]`
              : source.detail,
        })),
        limitations: [
          ...context.limitations.slice(0, 9),
          `Long record details were shortened; ${omitted} supporting sources omitted. All editable source identities and calculated facts are retained. Select one account/opportunity for a deeper brief; never guess omitted details.`,
        ],
      };
      if (bytes(JSON.stringify(packed)) <= budget) return packed;
    }
    return null;
  };
  const first = pack();
  if (first) return first;
  // Omit only supporting read snippets. Preserve every writable identity and
  // complete money evidence; aggregate facts keep their stated full scope.
  for (const kind of [
    "activity",
    "outcome",
    "evidence",
    "objection",
    "stakeholder",
  ]) {
    let index = sources.findLastIndex((source) => source.kind === kind);
    while (index >= 0) {
      sources = sources.filter((_source, position) => position !== index);
      omitted += 1;
      const packed = pack();
      if (packed) return packed;
      index = sources.findLastIndex((source) => source.kind === kind);
    }
  }
  throw new Error(
    "Phạm vi dữ liệu quá lớn cho câu hỏi này. Chọn một khách hàng hoặc opportunity để phân tích sâu; chưa gửi dữ liệu.",
  );
}
