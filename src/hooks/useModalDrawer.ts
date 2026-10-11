import { useEffect, useRef } from 'react';
import { useEscapeToClose } from './useEscapeToClose';

/**
 * What a drawer has to do to actually be a dialog.
 *
 * The Account and Opportunity drawers were bare `<aside>` elements over a
 * dimming overlay. To a mouse that reads as a modal; to everything else it is
 * not one. Escape did nothing - `useEscapeToClose` already existed in the bundle
 * and neither drawer called it - focus stayed on `<main>` behind the overlay, so
 * the first Tab walked the page underneath rather than the form on top, and the
 * page scrolled under the drawer while the drawer sat still. A keyboard user
 * could open one and have no way to close it.
 *
 * Returns the ref for the drawer element. Spread `dialogProps` onto it for the
 * roles, and give it `aria-label` through `label`.
 */
export function useModalDrawer({ onClose, label, enabled = true }: { onClose: () => void; label: string; enabled?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const activeRef = useRef(false);

  useEscapeToClose(onClose, enabled);

  // Focus moves into the drawer on open, and back to whatever opened it on
  // close. Without the restore, closing a drawer drops focus to <body> and the
  // next Tab starts again from the top of the page.
  useEffect(() => {
    if (!enabled) return;
    activeRef.current = true;
    // StrictMode replays effects while the dialog is already focused. Keep
    // the original trigger rather than treating its own Close button as one.
    if (!openerRef.current) openerRef.current = document.activeElement as HTMLElement | null;
    const node = ref.current;
    if (node) {
      const first = node.querySelector<HTMLElement>(FOCUSABLE);
      (first || node).focus({ preventScroll: true });
    }
    return () => {
      activeRef.current = false;
      queueMicrotask(() => {
        if (activeRef.current) return;
        const opener = openerRef.current;
        if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
        openerRef.current = null;
      });
    };
  }, [enabled]);

  // Tab cycles inside the drawer rather than walking the page behind it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const node = ref.current;
      if (!node) return;

      const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((element) => element.offsetParent !== null || element === document.activeElement);
      if (focusable.length === 0) {
        event.preventDefault();
        node.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !node.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !node.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    if (!enabled) return;
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [enabled]);

  // The page behind a modal must not scroll. Scrolling it moves the record the
  // drawer is about out from under the drawer, and on a phone the wheel gesture
  // lands on the page rather than the form.
  useEffect(() => {
    if (!enabled) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Make siblings along the portal path unavailable without disabling the
    // dialog itself. Preserve pre-existing inert state for nested dialogs.
    const hidden: { node: HTMLElement; inert: boolean }[] = [];
    let child: HTMLElement | null = ref.current;
    while (child?.parentElement) {
      for (const sibling of Array.from(child.parentElement.children)) {
        if (sibling instanceof HTMLElement && sibling !== child && !['SCRIPT', 'STYLE'].includes(sibling.tagName)) {
          if (sibling.matches('button[aria-label^="Close"]')) continue;
          hidden.push({ node: sibling, inert: sibling.inert }); sibling.inert = true;
        }
      }
      if (child.parentElement === document.body) break;
      child = child.parentElement;
    }
    return () => { hidden.forEach(({ node, inert }) => { node.inert = inert; }); document.body.style.overflow = previous; };
  }, [enabled]);

  return {
    ref,
    dialogProps: {
      role: 'dialog' as const,
      'aria-modal': true,
      'aria-label': label,
      tabIndex: -1,
    },
  };
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');
