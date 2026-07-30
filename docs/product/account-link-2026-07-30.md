# The account link is a string, so make it hard to get wrong

Date: 2026-07-30
Follows: `operator-insight-2026-07-29.md`

## What Henry asked

Looking at the deal drawer: *"are the opportunities actually linked to the account? It looks like free text."*

They are not. The link is the account **name**. `CrmLiteOpportunity` has no `accountId`; records belong to the same customer because their names resolve to the same key through `accountKey` (lowercase, strip diacritics, collapse punctuation).

Worth recording precisely, because the codebase looks like it does more than it does: the `opportunities` table *has* an `account_id uuid REFERENCES accounts(id)` from migration 005, and `loadCloudOpportunities` even joins it (`select('*,account:account_id(...)')`). But `opportunityToRow` - the only function that builds an insert or update payload - writes `account_name` and nothing else. Every deal created or edited in the app leaves `account_id` NULL, and the join is dead code for app-created records.

## What this changes

Two things, chosen because they are the ones that do not require touching the schema.

**A. The name is hard to get wrong at the point of entry.** The deal form's Account field was a bare text input with no suggestions at all - so the fastest way through it was to retype a customer the workspace already knew, and one slip created a second customer silently.

- The field is now a typeahead over every customer the workspace knows (account records *and* names already on deals), matching anywhere in the name and ignoring diacritics.
- One implementation, not two: Quick Capture's local `QuickSuggestInput` moved to `src/components/common/SuggestInput.tsx` and both surfaces use it. Its matching also moved to `normalizeEntityName`, so the two fields cannot drift apart on what counts as a match.
- A near-miss is named. Typing a name that is one or two characters from an existing customer, or that the user has already merged away, produces "Did you mean Orion Pharma?" with a one-click *Use Orion Pharma*.
- **Saving interrupts once.** The first press of Save names the customer this looks like and writes nothing; a second press means the seller meant it and goes through. Creating a genuinely new customer stays one extra click, and nothing is ever blocked.

**B. A merge the user has already made reaches every surface that groups by account.** Merging records an alias and rewrites no records - which is what keeps it reversible - but that means each surface has to apply it, and only the Accounts page did.

- New `src/utils/accountAliases.ts`: one resolver, chain-aware (A into B, B into C) with a hop limit, because merging A into B and B into A is two clicks and a `while` loop would hang the tab.
- `accountMerges` now loads with the rest of the workspace, so no surface has to remember to fetch it.
- Applied in `buildCoverageMatrix` (the Vault matrix), `buildActivityInsights` (Timeline's band) and `buildOperatorProfile` (the contact-rhythm reading).

## Two real defects found while building it

1. **The Vault matrix drew one customer as two rows.** Its cells grouped on a local normalizer that lowercases and strips accents but keeps punctuation, so "VNVC" and "vnvc." were two rows carrying two halves of one customer's squares - with the empty squares of each reading as gaps. Both the row list and the cell key now use `accountKey`, the app's single answer to "same customer?".

2. **The outcome retro could create the duplicate the Save button was guarding against.** `OpportunityOutcomeRetroPanel` is handed `{ ...editingOpportunity, ...form }`, so saving a retro persists whatever account name is currently typed in the panel. Guarding only `handleSave` left a second write path wide open. Both now call one `holdForAccountNameCheck`, and the contract counts the call sites.

Found because a probe of my own typeahead accidentally renamed a demo deal's account to "Apex Lab" through the retro path - a reminder that verifying on real data finds what unit tests are not looking for.

## Why the thresholds differ from the merge tool's

`compareAccountNames` is deliberately blind to a one-letter slip: it feeds a merge, and a wrong merge buries a customer's history under a name the seller no longer recognises. The form needs the opposite bias, because it only asks a question, so `findSimilarAccountName` uses a bounded edit distance (≤ 2) with a minimum name length of 5 - short names like MDL and MDK really are different companies. Two functions, two jobs, both in `accountDuplicates.ts` with the reasoning written down between them.

## Deliberately not built

**A real foreign key.** Writing `account_id` on save and backfilling the existing deals by `accountKey` is the actual fix for "is it linked?", and it is a data migration: it needs a preview of what matches and what does not, applied against the live workspace, with the seller reviewing the unmatched rows. Henry chose A+B first for exactly that reason. Until then `account_name` remains the link, which is why the two halves above are worth having on their own.

## Verification

- `npm run check` green, including the new `verify:account-link`.
- 354 unit tests pass (17 new across `accountAliases` and `accountDuplicates`).
- Demo sandbox: typing `Orion Pharm` over a workspace holding `Orion Pharma` offers the existing customer in the dropdown, names the near-miss under the field, and the first Save writes nothing (`memoire.opportunities.v1` unchanged) while the second writes `Orion Pharm` as its own customer.
