/**
 * The one address the product tells people to write to.
 *
 * It was typed literally in five places - the marketing footer, both legal
 * documents, the Settings export panel and the early-access form - all of them
 * `hello@memoire.app`, on a product served from `memoire-official.com`. A lead
 * that bounces is invisible: nobody writes twice. One constant means checking
 * it is one line, and changing it is one line.
 *
 * Set to the support mailbox on the domain the product is actually served from
 * (2026-08-10, founder). It is now also the address on a paid invoice dispute,
 * so it has to be a mailbox somebody reads.
 */
export const CONTACT_EMAIL = 'support@memoire-official.com';

/** `mailto:` for the same address, so no call site builds its own. */
export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;
