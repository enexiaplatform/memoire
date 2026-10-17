import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUp,
  Check,
  Copy,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";
import {
  loadSalesWorkspaceData,
  type SalesWorkspaceData,
  WORKSPACE_REFRESHED_EVENT,
} from "../../services/workspaceData";
import {
  AiChatError,
  chatHistory,
  getAiChatStatus,
  sendAiChat,
} from "../../services/aiChat";
import {
  captureLocalWorkspaceScope,
  getLocalWorkspaceOwner,
} from "../../services/localWorkspaceOwner";
import { hasLocalSampleData } from "../../utils/dataMode";
import { createPersonalPlanRecord } from "../../utils/weeklyPlan";
import {
  savePlanItem,
  loadPlanItemsForUser,
} from "../../services/planItemStore";
import { isValidBusinessDate, todayDateKey } from "../../utils/safeDate";
import { Panel } from "../../components/ui/daylight";
import { buildChatContext } from "./chatContext";
import type { ChatMessage, ChatScope } from "./types";
import type { PlanRecord } from "../../utils/weeklyPlan";
import { prepareActionBatch, type ActionBatch } from "./actionBatch";
import { executeChatActions } from "../../services/aiChatActions";
import { planReferenceContext, assertPlanReferenceTargets } from "./planReference";

type Props = {
  userId: string;
  scope: ChatScope;
  onLocal: () => void;
  compact?: boolean;
  dataRefreshKey?: string;
};
const prompts = [
  "Tuần này cần đi gặp khách hàng nào?",
  "Deal nào nằm trong forecast Q4?",
  "Brand nào đang tăng hoặc giảm?",
];

export function AiChatPanel({
  userId,
  scope,
  onLocal,
  compact = false,
  dataRefreshKey = "",
}: Props) {
  const [workspace, setWorkspace] = useState<SalesWorkspaceData | null>(null);
  const [plan, setPlan] = useState<PlanRecord[]>([]);
  const [available, setAvailable] = useState(false);
  const [checking, setChecking] = useState(true);
  const [reload, setReload] = useState(0);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState<number | null>(null);
  const [pendingBatch, setPendingBatch] = useState<ActionBatch | null>(null);
  const [applying, setApplying] = useState(false);
  const applyingRef = useRef(false);
  const [action, setAction] = useState<{
    text: string;
    date: string;
    saved: boolean;
  } | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const flightRef = useRef(false);
  const revision = useRef(0);
  const output = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLFormElement>(null);
  const actionDateInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const stillOwnsWorkspace = captureLocalWorkspaceScope();
    let active = true;
    setChecking(true);
    setPendingBatch(null);
    flightRef.current = false;
    setBusy(false);
    void Promise.all([
      getAiChatStatus(userId, controller.signal),
      loadSalesWorkspaceData(userId),
      loadPlanItemsForUser(userId),
    ])
      .then(([status, data, records]) => {
        if (!active || !stillOwnsWorkspace()) return;
        if (hasLocalSampleData() || getLocalWorkspaceOwner() !== userId)
          throw new Error(
            "Use a real, signed-in workspace for AI chat. Sample and local-only workspaces stay in Local insights.",
          );
        setAvailable(status.available);
        setWorkspace(data);
        setPlan(records);
        setError(
          status.available
            ? ""
            : "AI chat is not configured on this deployment. Local insights are ready to use.",
        );
      })
      .catch((reason) => {
        if (active && !controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not check AI chat.",
          );
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
      controller.abort();
      requestRef.current?.abort();
      revision.current += 1;
    };
  }, [userId, reload, dataRefreshKey]);

  useEffect(() => {
    if (!retryAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  useEffect(() => {
    if (messages.length || busy)
      output.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages.length, busy]);

  const preview = useMemo(() => {
    if (!workspace) return { context: null, error: "" };
    const reference = planReferenceContext(question, messages);
    if (reference) return { context: reference, error: "" };
    const topic =
      /brand|thuong hieu|thuong hiệu|nhan hang|nhãn hàng|forecast|forcast|du bao|dự báo|\bq[1-4]\b|quy\s*[1-4]|quý\s*[1-4]|tuan|tuần|week|gap|gặp|visit|follow.?up/i;
    const previous =
      [...messages]
        .reverse()
        .find((item) => item.role === "user" && topic.test(item.content))
        ?.content || "";
    const contextualQuestion = topic.test(question)
      ? question
      : `${question}\n${previous}`;
    try {
      return {
        context: buildChatContext(
          workspace,
          userId,
          scope,
          contextualQuestion,
          plan,
        ),
        error: "",
      };
    } catch (reason) {
      return {
        context: null,
        error: reason instanceof Error ? reason.message : "Choose a context.",
      };
    }
  }, [workspace, userId, scope, question, plan, messages]);
  const cooldown = Math.max(0, Math.ceil((retryAt - now) / 1000));
  useEffect(() => {
    if (error || preview.error)
      composer.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [error, preview.error]);

  function reset() {
    if (applyingRef.current) return;
    revision.current += 1;
    requestRef.current?.abort();
    flightRef.current = false;
    setBusy(false);
    setMessages([]);
    setQuestion("");
    setConsent(false);
    setAction(null);
    setCopied(null);
    setPendingBatch(null);
    setError(
      available
        ? ""
        : "AI chat is not configured on this deployment. Local insights are ready to use.",
    );
  }

  async function send() {
    const value = question.trim();
    if (applyingRef.current || flightRef.current) return;
    const command = value
      .toLocaleLowerCase("vi")
      .replace(/[.!]+$/, "")
      .trim();
    if (
      !pendingBatch &&
      [
        "thực hiện",
        "thực hiện tất cả",
        "xác nhận",
        "áp dụng",
        "confirm",
        "apply",
        "do it",
        "hủy",
        "huỷ",
        "cancel",
      ].includes(command)
    ) {
      setQuestion("");
      setMessages((previous) => [
        ...previous,
        { role: "user", content: value },
        {
          role: "assistant",
          content:
            "Không có nhóm thay đổi nào đang chờ. Hãy mô tả việc cần tạo hoặc cập nhật.",
        },
      ]);
      return;
    }
    if (
      pendingBatch &&
      [
        "thực hiện",
        "thực hiện tất cả",
        "xác nhận",
        "áp dụng",
        "confirm",
        "apply",
        "do it",
      ].includes(command)
    ) {
      setQuestion("");
      await applyPendingBatch(value);
      return;
    }
    if (pendingBatch && ["hủy", "huỷ", "cancel", "bỏ qua"].includes(command)) {
      setPendingBatch(null);
      setQuestion("");
      setMessages((previous) => [
        ...previous,
        { role: "user", content: value },
        {
          role: "assistant",
          content: "Đã hủy nhóm thay đổi. Chưa ghi dữ liệu.",
        },
      ]);
      return;
    }
    if (
      !value ||
      value.length > 2000 ||
      flightRef.current ||
      !available ||
      !consent ||
      !preview.context ||
      cooldown
    )
      return;
    const controller = new AbortController();
    const currentRevision = revision.current;
    const sentContext = preview.context;
    const ownsWorkspace = captureLocalWorkspaceScope();
    requestRef.current = controller;
    flightRef.current = true;
    setBusy(true);
    setError("");
    setPendingBatch(null);
    try {
      const reply = await sendAiChat(
        userId,
        chatHistory(messages, value),
        preview.context,
        controller.signal,
      );
      if (
        controller.signal.aborted ||
        currentRevision !== revision.current ||
        !ownsWorkspace() ||
        getLocalWorkspaceOwner() !== userId
      )
        return;
      const content = [
        reply.answer,
        reply.draft && `Draft:\n${reply.draft}`,
        reply.suggestedAction && `Proposed action: ${reply.suggestedAction}`,
      ]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 6000);
      const reference = planReferenceContext(value, messages);
      if (reference) assertPlanReferenceTargets(reply.actions || [], reference);
      const batch =
        reply.actions?.length && workspace
          ? prepareActionBatch(
              reply.actions,
              preview.context.sources,
              workspace,
              userId,
              crypto.randomUUID(),
            )
          : null;
      setPendingBatch(batch);
      setMessages((previous) => [
        ...previous,
        { role: "user", content: value },
        { role: "assistant", content, reply, context: sentContext },
      ]);
      setQuestion((current) => (current.trim() === value ? "" : current));
    } catch (reason) {
      if (
        !controller.signal.aborted &&
        currentRevision === revision.current &&
        ownsWorkspace()
      ) {
        setError(
          reason instanceof Error
            ? reason.message
            : "AI chat could not respond.",
        );
        if (reason instanceof AiChatError && reason.retryAfterSeconds) {
          setRetryAt(Date.now() + reason.retryAfterSeconds * 1000);
          setNow(Date.now());
        }
      }
    } finally {
      if (currentRevision === revision.current) {
        flightRef.current = false;
        setBusy(false);
      }
    }
  }

  async function copyDraft(index: number, draft: string) {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(index);
    } catch {
      setError("Clipboard is unavailable. Select and copy the draft text.");
    }
  }

  async function applyPendingBatch(confirmation = "Thực hiện") {
    if (!pendingBatch || applyingRef.current || flightRef.current) return;
    const batch = pendingBatch;
    const generation = revision.current;
    const owns = captureLocalWorkspaceScope();
    applyingRef.current = true;
    flightRef.current = true;
    setApplying(true);
    setBusy(true);
    setPendingBatch(null);
    setError("");
    setMessages((previous) => [
      ...previous,
      { role: "user", content: confirmation },
    ]);
    try {
      const results = await executeChatActions(
        batch,
        () => generation === revision.current && owns(),
      );
      if (generation !== revision.current || !owns()) return;
      const content = results
        .map(
          (result, index) =>
            `${index + 1}. ${result.title}\n${batch.items[index].preview}\n${result.detail}`,
        )
        .join("\n\n");
      setMessages((previous) => [...previous, { role: "assistant", content }]);
      // Refresh failure must not turn successful writes into a retry instruction.
      try {
        const [updated, records] = await Promise.all([
          loadSalesWorkspaceData(userId, { force: true }),
          loadPlanItemsForUser(userId),
        ]);
        if (generation === revision.current && owns()) {
          setWorkspace(updated);
          setPlan(records);
          window.dispatchEvent(
            new CustomEvent(WORKSPACE_REFRESHED_EVENT, { detail: { userId } }),
          );
        }
      } catch {
        if (generation === revision.current && owns())
          setError(
            "Kết quả lưu ở trên vẫn có hiệu lực. Chưa tải lại được dữ liệu; không thực hiện lại nhóm này.",
          );
      }
    } catch (reason) {
      if (generation === revision.current && owns())
        setMessages((previous) => [
          ...previous,
          {
            role: "assistant",
            content:
              reason instanceof Error
                ? reason.message
                : "Không thể kiểm tra nhóm thay đổi. Hãy tải lại dữ liệu.",
          },
        ]);
    } finally {
      applyingRef.current = false;
      setApplying(false);
      if (generation === revision.current) {
        flightRef.current = false;
        setBusy(false);
      }
    }
  }

  function saveAction() {
    const selectedDate = actionDateInput.current?.value || action?.date || "";
    if (
      !action ||
      action.saved ||
      !action.text.trim() ||
      !isValidBusinessDate(selectedDate) ||
      getLocalWorkspaceOwner() !== userId
    )
      return;
    try {
      const selected =
        scope.kind === "opportunity"
          ? workspace?.opportunities.find((row) => row.id === scope.id)
          : undefined;
      const selectedAccount =
        scope.kind === "account"
          ? workspace?.accounts.find((row) => row.id === scope.id)
          : undefined;
      const savedRecords = savePlanItem(
        createPersonalPlanRecord({
          date: selectedDate,
          label: action.text.trim(),
          linkedOpportunityId: selected?.id,
          linkedAccountName:
            selected?.accountName || selectedAccount?.accountName,
          source: "user",
          isSample: false,
        }),
      );
      setPlan(savedRecords);
      setAction({ ...action, date: selectedDate, saved: true });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not save the plan item.",
      );
    }
  }

  return (
    <div
      className={`relative flex min-w-0 flex-col ${compact ? "h-full gap-0 bg-white" : "gap-4"}`}
      data-testid="ai-chat-panel"
    >
      <Panel
        as="div"
        className={`flex shrink-0 flex-wrap items-center justify-between gap-3 ${compact ? "rounded-none border-b border-line px-3 py-2 shadow-none" : "px-5 py-4"}`}
      >
        <div className="flex items-center gap-3">
          {!compact && <MessageCircle className="h-5 w-5 text-brand-blue" />}
          <div>
            {!compact && (
              <h2 className="text-sm font-bold text-ink">Chat with Memoire</h2>
            )}
            <p className="mt-1 text-xs text-muted">
              Groq ·{" "}
              {checking
                ? "Checking availability…"
                : available
                  ? "Ready"
                  : "Unavailable"}{" "}
              {!compact && " · Kept for this visit only"}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            disabled={applying}
            onClick={() => {
              reset();
              setReload((value) => value + 1);
            }}
            className="inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={applying}
            className="min-h-10 text-xs font-bold text-brand-blue"
          >
            New conversation
          </button>
        </div>
      </Panel>

      {checking && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Loading your context…
        </p>
      )}
      {preview.context && (
        <details
          className={`shrink-0 border border-line bg-white ${compact ? "max-h-52 overflow-y-auto rounded-none px-3 py-2" : "rounded-2xl px-4 py-3"}`}
          open={!compact && !consent}
        >
          <summary className="cursor-pointer text-xs font-bold text-ink">
            Data preview · {preview.context.sources.length} sources ·{" "}
            {preview.context.scope}
          </summary>
          <p className="mt-3 text-xs leading-5 text-muted">
            Only this preview, your question and up to four recent exchanges go
            to Groq when you send. Raw capture notes and attachments are
            excluded. Summaries may contain names, prices or contact details;
            inspect this preview. Changing scope starts a new conversation.
          </p>
          <div
            className="mt-3 max-h-60 space-y-3 overflow-y-auto text-xs leading-5"
            tabIndex={0}
            aria-label="Context sent to Groq"
          >
            {preview.context.sources.map((source) => (
              <div key={source.key}>
                <p className="font-semibold text-ink">{source.title}</p>
                <p className="whitespace-pre-wrap text-muted">
                  {source.detail}
                </p>
              </div>
            ))}
            {preview.context.facts.map((fact) => (
              <p key={fact} className="text-ink">
                {fact}
              </p>
            ))}
            {preview.context.limitations.map((item) => (
              <p key={item} className="text-muted">
                {item}
              </p>
            ))}
          </div>
        </details>
      )}

      <Panel
        as="div"
        className={`min-w-0 px-4 py-5 ${compact ? "min-h-0 flex-1 overflow-y-auto rounded-none shadow-none" : "sm:px-5"}`}
      >
        <div
          role="log"
          aria-label="AI conversation"
          aria-live="polite"
          aria-busy={busy}
          className="space-y-5"
        >
          {!messages.length && (
            <div className="py-2">
              <h3 className="text-lg font-bold text-ink">
                A question, with your records behind it.
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted">
                Explore a deal, prepare a follow-up, or ask what needs
                attention. Answers name their sources and distinguish evidence
                from suggestions. Bạn cũng có thể yêu cầu tạo Plan hoặc sửa cơ
                hội; xem cả nhóm thay đổi rồi nhắn “thực hiện”.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                {prompts.map((prompt) => (
                  <button
                    type="button"
                    key={prompt}
                    onClick={() => setQuestion(prompt)}
                    disabled={busy}
                    className="rounded-xl bg-tint-neutral-bg px-3.5 py-3 text-left text-sm text-ink hover:bg-chip"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message, index) => (
            <div
              key={index}
              className={
                message.role === "user"
                  ? "ml-6 rounded-2xl bg-tint-blue-bg px-4 py-3 sm:ml-12"
                  : "min-w-0 border-b border-line pb-5"
              }
            >
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">
                {message.role === "user" ? "You" : "Memoire · AI answer"}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm leading-7 text-ink">
                {message.reply?.answer || message.content}
              </p>
              {message.reply?.sources.length ? (
                <div className="mt-3 flex flex-wrap gap-2" aria-label="Sources">
                  {message.reply.sources.map((source) => (
                    <Link
                      key={source.key}
                      to={source.href || "/app/ask"}
                      className="max-w-full break-words rounded-lg border border-line px-2.5 py-2 text-xs font-semibold text-brand-blue"
                    >
                      {source.title}
                    </Link>
                  ))}
                </div>
              ) : null}
              {!!message.reply?.missingContext.length && (
                <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  <p className="font-bold">Missing evidence</p>
                  {message.reply.missingContext.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
              )}
              {message.reply?.draft && (
                <div className="mt-4 rounded-xl bg-canvas p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-ink">
                      Draft · review before use
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        void copyDraft(index, message.reply!.draft)
                      }
                      className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-brand-blue"
                    >
                      {copied === index ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copied === index ? "Copied" : "Copy draft"}
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-7 text-ink">
                    {message.reply.draft}
                  </p>
                  <p className="mt-3 text-xs text-muted">
                    Nothing is sent to the customer.
                  </p>
                </div>
              )}
              {message.reply?.suggestedAction && (
                <div className="mt-3">
                  <p className="text-xs leading-5 text-muted">
                    Suggested next action: {message.reply.suggestedAction}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setAction({
                        text: message.reply!.suggestedAction,
                        date: todayDateKey(),
                        saved: false,
                      })
                    }
                    className="mt-2 min-h-10 text-xs font-bold text-brand-blue"
                  >
                    Review as a plan item
                  </button>
                </div>
              )}
            </div>
          ))}
          {pendingBatch && (
            <div
              className="rounded-xl border border-brand-blue/30 bg-tint-blue-bg p-4"
              aria-label="Nhóm thay đổi chờ xác nhận"
            >
              <p className="text-sm font-bold">
                {pendingBatch.items.length} thay đổi · chưa áp dụng
              </p>
              <ol className="mt-3 max-h-64 space-y-3 overflow-y-auto text-xs leading-5">
                {pendingBatch.items.map((item, index) => (
                  <li key={index}>
                    <p className="font-semibold">
                      {index + 1}. {item.title}
                    </p>
                    <p className="whitespace-pre-wrap break-words">
                      {item.preview}
                    </p>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs">
                Nhắn “thực hiện” để áp dụng cả nhóm hoặc “hủy”. Khi sửa yêu cầu,
                nhóm cũ sẽ được thay thế.
              </p>
              <button
                type="button"
                onClick={() => void applyPendingBatch()}
                className="mt-3 min-h-10 rounded-xl bg-brand-blue px-4 text-xs font-bold text-white"
              >
                Thực hiện tất cả
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingBatch(null);
                  setMessages((previous) => [
                    ...previous,
                    { role: "user", content: "Hủy" },
                    {
                      role: "assistant",
                      content: "Đã hủy nhóm thay đổi. Chưa ghi dữ liệu.",
                    },
                  ]);
                }}
                className="ml-3 min-h-10 text-xs font-semibold"
              >
                Hủy
              </button>
            </div>
          )}
          {busy && (
            <p
              role="status"
              className="flex items-center gap-2 text-sm text-muted"
            >
              <LoaderCircle className="h-4 w-4 animate-spin" />
              {applying
                ? "Đang lưu thay đổi…"
                : "Reading the selected context…"}
            </p>
          )}
          <div ref={output} />
        </div>
        {!!messages.at(-1)?.reply?.suggestedQuestions.length && (
          <div className="mt-4 flex flex-wrap gap-2">
            {messages.at(-1)!.reply!.suggestedQuestions.map((item) => (
              <button
                type="button"
                key={item}
                onClick={() => setQuestion(item)}
                disabled={busy}
                className="rounded-xl bg-tint-neutral-bg px-3 py-2 text-left text-xs text-ink"
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </Panel>

      <form
        ref={composer}
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        className={`shrink-0 border border-line bg-white ${compact ? "rounded-none p-3 shadow-none" : "rounded-2xl p-4 shadow-panel"}`}
      >
        {(error || preview.error) && (
          <div
            role="alert"
            className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900"
          >
            <p>{error || preview.error}</p>
            {cooldown > 0 && (
              <p className="mt-1 text-xs">Thử lại sau {cooldown}s.</p>
            )}
            <button type="button" onClick={onLocal} className="mt-1 min-h-9 font-semibold underline">
              Use Local insights
            </button>
          </div>
        )}
        <label className="mb-3 flex items-start gap-2 text-xs leading-5 text-muted">
          <input
            type="checkbox"
            checked={consent}
            disabled={busy}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-brand-blue"
          />
          <span>
            I choose to share the previewed context and this conversation with
            Groq. AI can make mistakes; I will review its answers and drafts.
          </span>
        </label>
        <div className="flex items-end gap-3">
          <textarea
            value={question}
            maxLength={2000}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void send();
              }
            }}
            aria-label="Message Memoire AI"
            placeholder="Ask in English or Vietnamese…"
            rows={2}
            className="min-h-16 min-w-0 flex-1 resize-y bg-transparent text-sm leading-6 text-ink outline-none placeholder:text-muted"
          />
          {busy ? (
            <button
              key="stop"
              type="button"
              aria-label="Stop response"
              disabled={applying}
              onClick={(event) => {
                if (applyingRef.current) return;
                event.preventDefault();
                event.stopPropagation();
                revision.current += 1;
                requestRef.current?.abort();
                flightRef.current = false;
                setBusy(false);
                setError(
                  "Stopped. Your question is still here; you can send it again.",
                );
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-white"
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              key="send"
              type="submit"
              aria-label="Send to Groq"
              disabled={
                !available ||
                !consent ||
                !preview.context ||
                !question.trim() ||
                cooldown > 0 ||
                checking
              }
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-blue text-white hover:bg-brand-blue-dark disabled:opacity-40"
            >
              <ArrowUp className="h-5 w-5" />
            </button>
          )}
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-5 text-muted">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {messages.length >= 8
            ? "Only the latest four exchanges are retained in the next request. "
            : ""}
          Chat stays in memory until you clear it, sign out or reload. Capture
          and Local insights continue to work without AI.
        </p>
      </form>

      {action && (
        <Panel
          as="div"
          className={`border border-brand-blue/20 bg-white p-5 ${compact ? "absolute inset-3 z-10 overflow-y-auto shadow-xl" : ""}`}
          aria-label="Review suggested plan item"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink">
              Review suggested plan item
            </h3>
            <button
              type="button"
              aria-label="Close plan preview"
              onClick={() => setAction(null)}
              className="p-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <label className="mt-3 block text-xs font-semibold text-muted">
            Action
            <textarea
              aria-label="Plan action"
              value={action.text}
              disabled={action.saved}
              onChange={(event) =>
                setAction({ ...action, text: event.target.value })
              }
              maxLength={500}
              className="mt-2 block w-full rounded-xl border border-line p-3 text-sm text-ink"
            />
          </label>
          <label className="mt-3 block text-xs font-semibold text-muted">
            Date
            <input
              aria-label="Plan date"
              ref={actionDateInput}
              type="date"
              value={action.date}
              disabled={action.saved}
              onChange={(event) =>
                setAction({ ...action, date: event.target.value })
              }
              className="mt-2 block rounded-xl border border-line p-2 text-sm text-ink"
            />
          </label>
          {action.saved ? (
            <p role="status" className="mt-3 text-sm text-green-700">
              Saved to your plan on this device.{" "}
              <Link to="/app/timeline" className="font-semibold underline">
                Open Plan
              </Link>
            </p>
          ) : (
            <button
              type="button"
              onClick={saveAction}
              disabled={
                !action.text.trim() || !isValidBusinessDate(action.date)
              }
              className="mt-4 rounded-full bg-brand-blue px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              Confirm and add to Plan
            </button>
          )}
        </Panel>
      )}
    </div>
  );
}
