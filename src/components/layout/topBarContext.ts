import { createContext, useContext } from 'react';

/**
 * The shared state behind the page's half of the top bar. The components that
 * use it live in TopBarSlot.tsx; this file holds the context and the shell's
 * hook, so that one stays a components-only module.
 */

export type TopBarState = {
  replacesSearch: boolean;
  ownsPrimary: boolean;
  /** A page status is present, so a healthy sync chip can stand aside. */
  hasStatus: boolean;
};

export const EMPTY_TOP_BAR_STATE: TopBarState = { replacesSearch: false, ownsPrimary: false, hasStatus: false };

export type TopBarContextValue = {
  leadNode: HTMLElement | null;
  actionsNode: HTMLElement | null;
  setLeadNode: (node: HTMLElement | null) => void;
  setActionsNode: (node: HTMLElement | null) => void;
  state: TopBarState;
  claim: (owner: symbol, next: TopBarState) => void;
  release: (owner: symbol) => void;
};

export const TopBarContext = createContext<TopBarContextValue | null>(null);

/** For the TopNav: where to mount the slots, and what the page asked for. */
export function useTopBarShell() {
  const context = useContext(TopBarContext);
  return {
    leadRef: context?.setLeadNode,
    actionsRef: context?.setActionsNode,
    state: context?.state || EMPTY_TOP_BAR_STATE,
  };
}
