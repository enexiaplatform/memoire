import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Maximize2, MessageCircle, Minus, X } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { hasLocalSampleData } from "../../utils/dataMode";
import { DEMO_USER_ID } from "../../lib/demoMode";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";

const ChatPanel = lazy(() =>
  import("./AiChatPanel").then((module) => ({ default: module.AiChatPanel })),
);
import { viewedRecordScope } from "./workflows";
import type { ChatScope } from "./types";
const ALL = { kind: "all" as const };

/** Shell-level conversation survives page navigation; no transcript is persisted. */
export function MemoireChat({
  initiallyOpen = false,
}: { initiallyOpen?: boolean } = {}) {
  const { user } = useAuth();
  const { pathname, search } = useLocation();
  const viewed = viewedRecordScope(search);
  const [chatScope, setChatScope] = useState<ChatScope>(ALL);
  const [chatBusy, setChatBusy] = useState(false);
  const [open, setOpen] = useState(initiallyOpen);
  const [started, setStarted] = useState(initiallyOpen);
  const launcher = useRef<HTMLButtonElement>(null);
  const windowRef = useRef<HTMLElement>(null);
  const close = () => {
    setOpen(false);
    launcher.current?.focus();
  };
  useEscapeToClose(close, open);
  useEffect(() => {
    if (open) windowRef.current?.focus({ preventScroll: true });
  }, [open]);
  // A dedicated full-page conversation should not sit underneath a second copy.
  if (pathname === "/app/ask") return null;
  return (
    <>
      <button
        ref={launcher}
        type="button"
        aria-label={open ? "Minimize Memoire chat" : "Open Memoire chat"}
        aria-expanded={open}
        onClick={() => {
          setStarted(true);
          setOpen((value) => !value);
        }}
        className="fixed bottom-20 right-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full bg-brand-blue px-4 py-3 text-sm font-bold text-white shadow-xl hover:bg-brand-blue-dark lg:bottom-6 lg:right-6"
      >
        <MessageCircle className="h-5 w-5" />
        Ask Memoire
      </button>
      {started && (
        <section
          ref={windowRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="false"
          aria-label="Memoire AI chat"
          className={`${open ? "flex" : "hidden"} fixed bottom-0 right-0 top-0 z-[70] min-w-0 flex-col border border-line bg-canvas shadow-2xl outline-none sm:bottom-24 sm:right-5 sm:top-auto sm:h-[min(760px,calc(100dvh-8rem))] sm:w-[520px] sm:rounded-2xl lg:bottom-24`}
        >
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-white px-4 py-3 sm:rounded-t-2xl">
            <div>
              <p className="text-sm font-bold text-ink">Memoire AI</p>
              <p className="text-[11px] text-muted">
                Phân tích, chuẩn bị và thao tác trên dữ liệu Memoire
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Link
                to="/app/ask?mode=ai"
                aria-label="Open full chat page"
                aria-disabled={chatBusy}
                onClick={(event) => {
                  if (chatBusy) event.preventDefault();
                }}
                className="p-2 text-muted"
              >
                <Maximize2 className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={close}
                aria-label="Minimize chat"
                className="p-2 text-muted"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  close();
                  setStarted(false);
                  setChatScope(ALL);
                }}
                aria-label="Close and clear chat"
                disabled={chatBusy}
                className="p-2 text-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>
          {(viewed || chatScope.kind !== "all") && (
            <div className="flex shrink-0 flex-wrap gap-2 border-b border-line bg-white px-3 py-2 text-xs">
              {viewed && (
                <button
                  type="button"
                  disabled={chatBusy}
                  onClick={() => setChatScope(viewed)}
                  className="min-h-10 font-bold text-brand-blue"
                >
                  Dùng {viewed.kind === "account" ? "khách hàng" : "cơ hội"}{" "}
                  đang xem · bắt đầu chat mới
                </button>
              )}
              {chatScope.kind !== "all" && (
                <button
                  type="button"
                  disabled={chatBusy}
                  onClick={() => setChatScope(ALL)}
                  className="min-h-10 font-semibold text-muted"
                >
                  Toàn workspace · bắt đầu chat mới
                </button>
              )}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-hidden">
            {user && user.id !== DEMO_USER_ID && !hasLocalSampleData() ? (
              <Suspense
                fallback={
                  <p className="p-4 text-sm text-muted">
                    Opening your conversation…
                  </p>
                }
              >
                <ChatPanel
                  key={`${user.id}:${chatScope.kind}:${chatScope.id || ""}`}
                  userId={user.id}
                  scope={chatScope}
                  compact
                  dataRefreshKey={pathname}
                  surface={pathname}
                  onBusyChange={setChatBusy}
                  onLocal={close}
                />
              </Suspense>
            ) : (
              <div className="p-4 text-sm leading-6 text-muted">
                <p>
                  Chat AI cần workspace thật đã đăng nhập. Dữ liệu mẫu và chế độ
                  local vẫn dùng được Search & Insights.
                </p>
                <Link
                  to="/app/ask"
                  className="mt-4 inline-flex font-semibold text-brand-blue"
                >
                  Mở Local insights
                </Link>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}
