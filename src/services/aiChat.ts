import { supabaseClient } from "../lib/supabaseClient";
import { parseActionList } from "../../shared/aiChatActions.js";
import type {
  ChatContext,
  ChatMessage,
  ChatReply,
} from "../features/aiChat/types";

export class AiChatError extends Error {
  code: string;
  retryAfterSeconds: number;
  constructor(code: string, retryAfterSeconds = 0) {
    const messages: Record<string, string> = {
      sign_in_required:
        "Sign in to use AI chat. Local insights remain available.",
      ai_not_configured:
        "AI chat is not configured on this deployment. You can still use Local insights.",
      context_not_synced:
        "Some selected sources are not synced to your account yet. Sync them, then start a new conversation.",
      context_too_large:
        "This conversation has reached the context limit. Start a new conversation or choose one opportunity.",
      provider_quota:
        "Groq has reached its available quota. Try later or use Local insights.",
      rate_limited:
        "The chat request limit has been reached. Wait before trying again, or use Local insights.",
      provider_timeout:
        "Groq took too long to respond. Your message has not been answered; you can retry.",
      provider_unavailable:
        "Groq is unavailable right now. Your message has not been answered; you can retry.",
      invalid_model_response:
        "The AI response could not be verified. Nothing was applied; you can retry.",
    };
    super(
      messages[code] ||
        "AI chat could not respond. Nothing was applied. Try again or use Local insights.",
    );
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function tokenForUser(userId: string) {
  const { data } = (await supabaseClient?.auth.getSession()) || { data: null };
  if (!data?.session?.access_token || data.session.user.id !== userId)
    throw new AiChatError("sign_in_required");
  return data.session.access_token;
}

export async function getAiChatStatus(
  userId: string,
  signal: AbortSignal,
): Promise<{ available: boolean; provider: string }> {
  const token = await tokenForUser(userId);
  const response = await fetch("/api/ai-chat", {
    headers: { Authorization: `Bearer ${token}` },
    signal,
    cache: "no-store",
  });
  if (!response.ok)
    throw new AiChatError(
      response.status === 401 ? "sign_in_required" : "chat_unavailable",
    );
  const result = await response.json();
  if (typeof result.available !== "boolean" || result.provider !== "Groq")
    throw new AiChatError("chat_unavailable");
  return result;
}

/** History is bounded to four complete exchanges plus the current question. */
export function chatHistory(messages: ChatMessage[], question: string) {
  return [
    ...messages
      .slice(-8)
      .map(({ role, content }) => ({ role, content: content.slice(0, 6000) })),
    { role: "user" as const, content: question },
  ];
}

export async function sendAiChat(
  userId: string,
  messages: { role: "user" | "assistant"; content: string }[],
  context: ChatContext,
  signal: AbortSignal,
): Promise<ChatReply> {
  const token = await tokenForUser(userId);
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const response = await fetch("/api/ai-chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ consent: true, messages, context }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(35000)]),
  }).catch((reason) => {
    if (!signal.aborted && reason?.name === "TimeoutError")
      throw new AiChatError("provider_timeout");
    throw reason;
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new AiChatError(
      typeof result.error === "string" ? result.error : "chat_unavailable",
      Number(result.retryAfterSeconds) || 0,
    );
  if (
    typeof result.answer !== "string" ||
    !Array.isArray(result.sources) ||
    typeof result.draft !== "string" ||
    typeof result.suggestedAction !== "string" ||
    !Array.isArray(result.missingContext) ||
    !Array.isArray(result.suggestedQuestions)
  )
    throw new AiChatError("invalid_model_response");
  // Only server-generated paths matching the provided evidence may be rendered as links.
  const allowedKeys = new Set(context.sources.map((source) => source.key));
  result.sources = result.sources.filter(
    (source: { key?: string; href?: string }) =>
      allowedKeys.has(source.key || "") &&
      typeof source.href === "string" &&
      source.href.startsWith("/app/") &&
      !source.href.includes("//"),
  );
  try {
    result.actions = parseActionList(result.actions ?? [], context.sources);
  } catch {
    throw new AiChatError("invalid_model_response");
  }
  return result as ChatReply;
}
