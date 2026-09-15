import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * A record opened in full, from the right edge.
 *
 * Stakeholders and Objections used to keep their editor as a 420px column
 * beside the list, which is how both lists ended up 420px narrower than the
 * screen for the whole visit to edit one row. Under Daylight the list takes the
 * width and the editor exists only while it is open - which also means it can
 * take focus when it opens and hand it back when it closes, something a column
 * that is always on the page could never do.
 */
export function RecordDrawer({
  eyebrow,
  title,
  meta,
  label,
  onClose,
  footer,
  children,
}: {
  eyebrow: string;
  title: string;
  /** Provenance under the title - when it was added, when it last moved. */
  meta?: ReactNode;
  /** What a screen reader calls the dialog. */
  label: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', closeOnEscape);
    // The page behind a drawer must not scroll under the wheel meant for the form.
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      body.style.overflow = previousOverflow;
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label={`Close ${label}`} onClick={onClose} className="absolute inset-0 bg-ink/40" />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative flex h-full w-full max-w-[480px] flex-col bg-white shadow-2xl outline-none"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div className="min-w-0">
            <p className="font-display text-[11px] font-bold uppercase tracking-[0.22em] text-brand-blue">{eyebrow}</p>
            <h2 className="mt-1.5 break-words font-display text-xl font-bold leading-snug tracking-[-0.02em] text-ink">{title}</h2>
            {meta}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-full border border-line p-2 text-gray-500 transition hover:bg-canvas hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">{children}</div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-6 py-4">{footer}</div>
      </aside>
    </div>
  );
}
