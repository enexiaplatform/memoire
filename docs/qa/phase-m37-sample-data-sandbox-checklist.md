# Phase M.37 Sample Data Sandbox Checklist

## First Run
- Clear localStorage in the browser.
- Open `/app/dashboard`.
- Click `Open Demo Sandbox`.
- Confirm the confirmation panel explains that demo data is local-only.
- Click `Load demo sandbox`.
- Confirm `DataModePill` shows `Demo local`.
- Confirm the banner says `Demo sandbox active - sample data is local only`.

## Opportunities
- Open `/app/opportunities`.
- Confirm demo opportunities include:
  - `Apex Labs / Validation Expansion` as `Defensible`
  - `Northstar Foods / Lab workflow` as `Weak but recoverable`
  - `Orion Pharma / Procurement review` as `Hope-based`
  - `Summit Diagnostics / QC workflow` as `Unsupported`
- Confirm at least 6 total demo opportunities are visible.

## Dashboard
- Return to `/app/dashboard`.
- Confirm the command center shows a realistic mix of healthy, weak, and risky work.
- Confirm it is not all red / missing-context-only.

## Accounts
- Open `/app/accounts`.
- Confirm these demo accounts appear:
  - `Apex Labs`
  - `Northstar Foods`
  - `Orion Pharma`
  - `Summit Diagnostics`

## Calendar And Reviews
- Open `/app/calendar`.
- Confirm demo activities appear across multiple dates.
- Open `/app/reviews`.
- Generate a weekly or monthly recap and confirm demo activities are included.

## Pipeline Defense
- Open `/app/pipeline-defense`.
- Confirm `Demo Defense Brief` exists.
- Confirm it includes a mixed quality set of deals: defensible, weak, hope-based, and unsupported.

## Signed-In Mode
- Sign in with Google.
- Confirm demo mode still shows `Demo local`.
- Confirm demo records remain local-only and do not overwrite cloud records.
- Confirm warning copy says demo data will not be saved to the cloud account.

## Clear Demo Data
- Click `Clear demo data`.
- Confirm demo activities, opportunities, accounts, and demo brief are removed from localStorage-backed views.
- Confirm cloud data is not deleted.
- Confirm `DataModePill` returns to `Synced` or `Local only` depending account state.

## Regression
- Capture a real activity.
- Add a real opportunity.
- Add a real account.
- Generate a Pipeline Defense Brief.
- Confirm real storage behavior remains unchanged.

## Verification
- Run `npm run build`.
- Run `npm run lint`.
