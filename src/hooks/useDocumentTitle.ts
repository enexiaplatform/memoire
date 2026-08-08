import { useEffect } from 'react';

const SITE_NAME = 'Memoire';

/**
 * The browser tab, named after the page you are actually on.
 *
 * Every surface in the product - including the 404, the legal pages and pricing
 * - shared one `<title>`: "Memoire - Personal Sales Memory OS for B2B Sellers".
 * That is the tab strip, the history list and the first thing a screen reader
 * announces on navigation, all saying the same thing about twenty different
 * places. `PageHeader` already carries the page's name, so nothing new has to be
 * declared for it to be right.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    if (typeof document === 'undefined' || !title) return;
    const previous = document.title;
    document.title = `${title} · ${SITE_NAME}`;
    return () => { document.title = previous; };
  }, [title]);
}
