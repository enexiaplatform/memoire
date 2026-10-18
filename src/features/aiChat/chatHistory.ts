import type { ChatMessage, ChatReply } from "./types";

/** Receipts can follow an assistant answer; the API requires alternating turns. */
export function chatHistory(messages: ChatMessage[], question: string) {
  const turns: { role: "user" | "assistant"; content: string }[] = [];
  for (const { role, content } of messages) {
    const last = turns.at(-1);
    if (last?.role === role)
      last.content = `${last.content}\n\n${content}`.slice(-6000);
    else if (turns.length || role === "user")
      turns.push({ role, content: content.slice(0, 6000) });
  }
  if (turns.at(-1)?.role === "user") turns.pop();
  return [...turns.slice(-8), { role: "user" as const, content: question }];
}

/** The visible answer and editable draft must share one loss-detection boundary. */
export function assistantTranscript(reply: ChatReply): string {
  return [reply.answer, reply.draft && `Draft:\n${reply.draft}`, reply.suggestedAction && `Proposed action: ${reply.suggestedAction}`]
    .filter(Boolean).join("\n\n");
}
