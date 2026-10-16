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
const ALL = { kind: "all" as const };

/** Shell-level conversation survives page navigation; no transcript is persisted. */
export function MemoireChat() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false);
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
                Hỏi về khách hàng, forecast và brands
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Link
                to="/app/ask?mode=ai"
                aria-label="Open full chat page"
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
                }}
                aria-label="Close and clear chat"
                className="p-2 text-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>
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
                  key={user.id}
                  userId={user.id}
                  scope={ALL}
                  compact
                dataRefreshKey={pathname}
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
