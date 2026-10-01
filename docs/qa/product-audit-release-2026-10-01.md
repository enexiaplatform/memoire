# Memoire product audit and Preview release — 2026-10-01

## Verdict and scope

The tested local build passes the product checks and is eligible for the existing `main` → Vercel Preview path. This is not Production acceptance. Production remains blocked by the independently verified schema and recovery gate below.

This run inspected all ten primary destinations, global capture/search/settings, export/restore entry points, and public pricing/authentication screens in the current in-app browser. Screenshots are current-run public/demo data; no customer account was created, no message was sent, and no customer records were changed. Automated unit, contract and browser journeys additionally exercised commercial state, history, ownership, connectors, money, reports and dashboards in local fixtures.

Products & Brands, Reports and Dashboards have their own navigation entries and routes. Review retains Weekly Review and Learning & Analytics. Existing `reviews?view=portfolio|reports|dashboards` links redirect to their standalone destination while preserving other query parameters and the fragment. Unknown legacy view values retain Review.

## Findings and changes

| Finding | Evidence | Change and verification |
| --- | --- | --- |
| Reports checkbox labels were too small to tap reliably | Step 2; mobile target measurement | Minimum 44px label height for column, measure, archive and sort controls. Heading levels corrected in Reports and Products. All 16 measured destinations pass the existing 390px audit. |
| Lead actions could be clipped by a wide table | Step 6 before/after | Sticky Actions cells keep Qualify, nurture and disqualify controls visible while the other columns scroll. Accepted after screenshot included below. |
| A workspace load timestamp said “synced” even in local demo | Step 8 before/after | Display now says “loaded”; persisted collection sync statuses still distinguish local, synced and unavailable. |
| Opportunity gap tooltips rendered `[object Object]` | Step 8 DOM inspection | Tooltips now join each issue's human-readable label. Current DOM shows named issues such as Missing decision maker and Past-due next action. |
| Landing copy claimed Today had exactly three sections | Step 15 and current Today | Copy now says Today starts with the picture, three moves and watch-list, with additional readings for leads and money. |
| Installed React Router dependency chain had two moderate audit entries | Current npm audit and maintainer advisories | Upgrade to React Router 7.18.4, adapt BrowserRouter and StaticRouter imports. Full dependency audit returns zero known vulnerabilities. |
| History browser fixture recreated a deleted deal on reload | Time-machine journey failure investigation | Seed once and wait for return-to-current navigation before asserting. Repeated repaired journey passes; no history business logic workaround. |
| Surface render readiness depended on arbitrary text length | Empty Leads under the scale fixture | Readiness now checks a rendered primary heading and completed loading. Report actual fixture size and empty states rather than treating short valid content as loading. |

Router advisories: [open redirect](https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6), [SSR hydration injection](https://github.com/remix-run/react-router/security/advisories/GHSA-337j-9hxr-rhxg). The maintainer states Declarative Mode is unaffected by the SSR issue; the dependency was nevertheless patched. A zero npm audit result is not a comprehensive security certification.

## Numbered screenshot walkthrough

Each screenshot was saved and inspected in this audit run. Images describe the observed local demo/public state, not authenticated cloud acceptance. Screenshots for steps 6 and 8 preserve before and after evidence; step 15's hero remains visually unchanged after the later copy correction farther down the page.

### 1. Products & Brands — healthy local foundation

Own page and navigation entry. Empty catalog exposes an explicit Add record action; pipeline measures retain currency and sample-size limits. BU/brand classification does not imply access permissions. Cloud persistence is not accepted while its table is absent.

![Products & Brands](assets/product-audit-2026-10-01/01-products.png)

### 2. Reports — healthy after target and heading fixes

Templates, saved library, dataset, filters, selected fields and grouping are visible in one builder. Empty library is explicit. Creation, refresh, version conflicts and export are covered by the browser/unit journeys; screenshot is the empty library state.

![Reports](assets/product-audit-2026-10-01/02-reports.png)

### 3. Dashboards — healthy local foundation

Standalone page. Empty dashboard state directs the user to create a saved report before adding widgets; unavailable actions are disabled. Widgets reuse report definitions and the existing metrics engine, avoiding an independent source of business totals.

![Dashboards](assets/product-audit-2026-10-01/03-dashboards.png)

### 4. Today — healthy observed demo state

Business picture, ranked moves and named risks are readable. The persistent demo banner explains local storage and lack of account sync. This is an aged sample fixture, not current customer performance.

![Today](assets/product-audit-2026-10-01/04-today.png)

### 5. Plan — healthy observed demo state

Week range, commitment counts and next actions make the planning state understandable. Overdue sample commitments remain visible rather than appearing completed.

![Plan](assets/product-audit-2026-10-01/05-plan.png)

### 6. Leads — fixed clipped actions

Queue states distinguish qualification and nurture. Before: actions extend beyond the available table width. After: the action column remains visible. The table still scrolls horizontally for the other fields; cards are used at narrower breakpoints.

![Leads before](assets/product-audit-2026-10-01/06-leads.png)
![Leads after](assets/product-audit-2026-10-01/06-leads-fixed.png)

### 7. Accounts — healthy observed demo state

Status, owner/contact context and next actions are visible. Existing account navigation remains intact after the three new destinations were introduced.

![Accounts](assets/product-audit-2026-10-01/07-accounts.png)

### 8. Opportunities — fixed freshness wording and tooltips

Leads remain outside qualified pipeline. After screenshot shows “loaded” rather than “synced”. DOM verification after the tooltip correction contains named record issues, with no object serialization text.

![Opportunities before](assets/product-audit-2026-10-01/08-opportunities.png)
![Opportunities after](assets/product-audit-2026-10-01/08-opportunities-fixed.png)

### 9. Money — healthy observed demo state

Orders, collections and margin remain separate views. Money and delivery risks are expressed with their supporting records. Financial correctness is supported by fixtures/contracts, not inferred from screenshots.

![Money](assets/product-audit-2026-10-01/09-money.png)

### 10. Review — healthy; two original tabs retained

Weekly Review and Learning & Analytics remain the Review tabs. The new portfolio, reporting and dashboard capabilities are separate primary destinations.

![Review](assets/product-audit-2026-10-01/10-review.png)

### 11. Capture — healthy observed entry state

Note intake shows resolved fields and a human confirmation boundary. The entry screen explains local parsing and no CRM write-back. Screenshot does not prove a cloud save.

![Capture](assets/product-audit-2026-10-01/11-capture.png)

### 12. Settings — healthy observed demo state

Currency, planning and workspace controls remain available. Direct links to the three standalone capabilities support discovery beyond the sidebar.

![Settings](assets/product-audit-2026-10-01/12-settings.png)

### 13. Export/restore — clear entry; restore not executed on live data

Workspace backup and restore boundaries are explained. Restore is restricted in demo. Format 18 includes dashboard definitions and existing revision history; parser/unit/contract tests pass. No customer restore or destructive operation was performed.

![Export and restore](assets/product-audit-2026-10-01/13-export.png)

### 14. Search — healthy local discovery

Search opens with visible focus. Searching for Reports exposes its navigation result. No cloud search or sensitive records were used.

![Search](assets/product-audit-2026-10-01/14-search.png)

### 15. Public home — healthy after copy alignment

Hero and free preview route are clear. The Today narrative's exact section-count claim was corrected to reflect the observed product.

![Public home](assets/product-audit-2026-10-01/15-home.png)

### 16. Pricing — healthy observed disclosure

Free preview and later paid/team offerings are distinguished. No paid checkout or billing activation was exercised.

![Pricing](assets/product-audit-2026-10-01/16-pricing.png)

### 17. Login — entry UI inspected; authenticated flow limited

Email/password fields and recovery link are visible. Google sign-in honestly reports that it is not configured in this local environment. No credentials were submitted; external OAuth and recovery email delivery remain unverified here.

![Login](assets/product-audit-2026-10-01/17-login.png)

### 18. Signup — entry UI inspected; account creation limited

Named fields and password requirements are visible; demo separation is stated. No new account or acceptance of terms was performed.

![Signup](assets/product-audit-2026-10-01/18-signup.png)

## Validation evidence

- Full `npm run check` passes: build, API typecheck, lint, **2,071 unit tests**, and the repository contract suite. The final run was serial. One earlier scale check exceeded its ratio during concurrent browser load, then passed isolated and in the serial full check; thresholds were not loosened.
- After the final two copy/tooltip edits, build, lint and the relevant Today, UI text and positioning contracts were run again.
- **22 browser journeys** pass on the final feature implementation: next-gen, time-machine, money-consequence, policies, incidents, attention-budget, contract-obligations, team-coordination, external-observations, connector-adapters, commercial-api, commercial-webhooks, shared-workspaces, shared-members, commercial-sdk, external-promises, federated-threads, cross-company, portfolio, reports, dashboards and standalone-navigation. Time-machine was re-run after its fixture repair; the other 21 passed in the same final matrix.
- Mobile measurement: **16 destinations pass at 390px**, including the three new pages and Leads. Keyboard sampling checks Today and Capture primary controls and skip links. This is not a full WCAG audit. The in-app viewport override did not produce a mobile screenshot; mobile results come from the repository's automated harness, not the desktop screenshot set.
- Local scale measurement: **300 deals, 900 activities, 210 accounts, 2.05 MB stored**; all 12 measured surfaces show content within 2,000ms. Observed range 347–934ms. Money/activity can still produce approximately 325ms long frames: this is not a claim of smooth rendering on every device.
- Full dependency audit: **0 known vulnerabilities** after the router patch.
- Raw test logs remain local under `.memoire-private/product-audit-*.log`. Screenshots in this report are committed public/demo evidence.

## Deployment boundary

Repository `enexiaplatform/memoire`: working branch `main`; repository/default Production branch `master`. Vercel project `memoire` (`prj_IG0RdVVsY9KzEuSFHdTez5T5nQNH`) uses the existing main Preview path. Publishing this tree on main must be followed by GitHub CI and exact-SHA Vercel Ready verification. A Ready deployment alone does not establish database correctness. Delivery identifiers and hosted checks are recorded at handoff after the push.

Read-only Supabase catalog verification in this run: `mlmpcpkucurylkrobain` / `memories`, ACTIVE_HEALTHY, ap-south-1. **All 17 checked tables are absent**: commercial_conditions, commercial_requirements, commercial_dependencies, commercial_timing_windows, commercial_decisions, commercial_history_coverage, commercial_state_revisions, commercial_money_gates, commercial_decision_observations, commercial_policies, commercial_incidents, commercial_contract_obligations, commercial_workspaces, commercial_webhook_deliveries, portfolio_records, report_definitions, dashboard_definitions.

Consequently, authenticated cross-device operation of the new definitions and the advanced commercial schema cannot be declared ready. Backup/recovery evidence and migration-ledger reconciliation remain outstanding under the existing [P1 Production gate](../deployment/p1-production-audit-2026-09-28.md). No migration, Production promotion, billing activation or customer-data mutation is part of this Preview push.

## Evidence limits

The audit covers the observed states and the bounded fixture journeys above. It does not certify every possible customer dataset, permissions combination, email provider, OAuth provider, payment workflow, recovery rehearsal or browser/device. Empty-library screenshots are complemented by local report/dashboard create, edit, refresh, export and archive journeys. Hosted HTTP health will be verified separately after deployment; health must not be confused with schema acceptance.
