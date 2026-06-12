# Pre-onboarding remediation - 12 June 2026

## Issues addressed

- Unified demo identity as `Demo workspace` / `Demo local` so a signed-in profile name is not shown as the owner of local sample data.
- Removed legacy hard-coded `Henry` owner labels from Pipeline Defense defaults and normalized existing local brief records to `Sales owner`.
- Unified Ask Memoire and Journey with the same workspace data used by Dashboard, Accounts, and Opportunities.
- Redirected legacy `/app/accounts/:accountId` links to the current Account Master detail drawer.
- Backfilled production opportunity `account_name` values from their linked account records where the stored value was `Legacy account`.
- Updated opportunity loading to prefer the linked account relation and derive a useful solution label when older rows have no product field.
- Removed the duplicate Pipeline Defense sign-out control.
- Improved Capture next-action cleanup so phrases such as `Send pricing by next Thursday` produce `Send pricing` with the resolved due date.
- Standardized current review/calendar date labels to English locale.
- Replaced route loading text flashes with a delayed neutral skeleton.
- Removed eager route preloading that could create a burst of work shortly after opening the app.
- Removed named account and project examples from the public landing-page review preview.

## Production data correction

Supabase project `mlmpcpkucurylkrobain` was updated non-destructively:

- 18 opportunity rows were checked.
- 18 `Legacy account` placeholders were replaced from the linked account record.
- 0 `Legacy account` placeholders remain.
- 0 opportunity rows have a missing account name after the correction.

No schema or RLS change was required.

## Automated verification

- `npm run build`: pass
- `npm run typecheck:api`: pass
- `npm run lint`: pass with the same five pre-existing hook dependency warnings
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities

## Browser verification

- Public landing preview contains no customer or demo account/project names.
- Demo sandbox identity stays clearly local and separate from the signed-in profile.
- Ask Memoire account context uses current demo workspace accounts and does not show `Legacy account`.
- Journey uses current workspace opportunities, activities, stakeholders, and objections.
- Capture extracts `Send pricing` and resolves `next Thursday` to `2026-06-18` from a `2026-06-12` activity date.
- Account Master opens the correct detail drawer from both current query links and legacy account URLs.
- Pipeline Defense does not show the embedded duplicate sign-out control or the legacy `Henry` owner.

## Known limitations

- Demo sandbox data remains browser-local by design and must never be interpreted as cloud account data.
- Capture AI Assist remains optional and may transmit the selected note to the configured server-side provider.
- The five lint warnings are in legacy hooks outside the active V1 routes.
- Final signed-in OAuth and production refresh checks should be repeated after deployment using the intended Google test account.
