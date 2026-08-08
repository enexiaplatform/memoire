/**
 * The one address the product tells people to write to.
 *
 * It was typed literally in five places - the marketing footer, both legal
 * documents, the Settings export panel and the early-access form - all of them
 * `hello@memoire.app`, on a product served from `memoire-official.com`. Whether
 * that mailbox exists is not something the code can know, but a lead that
 * bounces is invisible: nobody writes twice. One constant means checking it is
 * one line, and changing it is one line.
 *
 * ACTION: confirm which domain actually receives mail and set it here.
 */
export const CONTACT_EMAIL = 'hello@memoire.app';

/** `mailto:` for the same address, so no call site builds its own. */
export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;
