/**
 * Who a customer is actually contracting with, and under which law.
 *
 * The Terms of Service ran from 2026-06 to 2026-08 naming no party at all. It
 * said what the service is, what it costs, what it will not do and who is
 * liable for what - and never said who "we" is, where they are registered, or
 * which country's law decides a disagreement. A price and a refund policy make
 * that a contract; a contract with an unnamed party is the one defect on the
 * pre-launch list that cannot be fixed after the fact, because it is wrong at
 * the moment of every sale made under it.
 *
 * Left deliberately blank on 2026-08-18: the founder had not decided between a
 * Vietnamese company, trading as an individual, and a foreign entity, and
 * inventing any of those would be worse than an honest gap. So this file is the
 * gap, in one place, with the two things that must be true before money moves:
 *
 * 1. **The page tells the truth while it is blank.** `/legal/terms` renders a
 *    plain notice saying the operating entity has not been named yet and giving
 *    the contact address, rather than quietly omitting the section.
 * 2. **Checkout will not open under it.** `api/billing.ts` refuses to mint a
 *    checkout while `LEGAL_ENTITY_NAME` is unset in the environment. Taking a
 *    card against terms with no counterparty is the specific mistake this whole
 *    file exists to make impossible to reach by forgetting.
 *
 * ## Filling it in
 *
 * Both halves, or neither. This file is what the page renders; the environment
 * variable is what the server checks, because the endpoint cannot import a
 * React config at runtime. `/api/health` reports `legal_entity_named` so the
 * disagreement is visible from outside rather than discovered at the first
 * attempted purchase.
 *
 *   1. Fill `name`, `registration`, `address` and `governingLaw` below.
 *   2. Set `LEGAL_ENTITY_NAME` in Vercel to the same `name`.
 *   3. Re-run `npm run check` - the contract will now require every field.
 */
export type LegalEntity = {
  /** Registered name, exactly as it appears on the registration. */
  name: string;
  /** Company or tax number, with the register that issued it. */
  registration: string;
  /** Registered address. */
  address: string;
  /** "the laws of Vietnam", "the laws of Singapore" - reads inside a sentence. */
  governingLaw: string;
  /** Where a dispute is heard. Usually the courts of the same place. */
  disputeVenue: string;
};

export const LEGAL_ENTITY: LegalEntity = {
  name: '',
  registration: '',
  address: '',
  governingLaw: '',
  disputeVenue: '',
};

/**
 * True only when every field is filled.
 *
 * Deliberately all-or-nothing: a half-filled entity - a name with no
 * jurisdiction, an address with no register - reads as more settled than it is,
 * and the point of naming a party is that the customer can find them.
 */
export const LEGAL_ENTITY_DECLARED = Object.values(LEGAL_ENTITY).every(
  (value) => value.trim().length > 0,
);
