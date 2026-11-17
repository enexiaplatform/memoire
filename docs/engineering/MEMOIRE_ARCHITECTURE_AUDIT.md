# Memoire architecture audit

Reviewed 2026-11-17. The initial baseline was `4a5f55e`. The branch incorporates the workspace release through `7b8eb1c`, which was associated with a Ready Vercel production deployment and successful GitHub CI when inspected.

## System architecture

- React 19, TypeScript, Vite, React Router 7, Tailwind 3, Lucide and Memoire's shared layout, drawer, form, table and status components. Client state includes React hooks and browser-local collections. Public pages are prerendered. There is no Next.js runtime.
- Supabase Auth handles email and Google sessions. `AuthProvider` claims local ownership when applying a session. `ProtectedRoute` gates signed-in and permitted sample routes. The browser uses the public Supabase client. Database grants and RLS govern its queries and mutations. Vercel endpoints validate bearer sessions or separately provisioned integration credentials before applying server authorization.
- Canonical cloud records use PostgreSQL, including relational commercial records and JSON payload collections with row-level owner columns. Browser-first stores support offline operation and merge confirmed cloud records with local changes. `workspaceData.ts` aggregates stores and maintains a first-paint cache. Writes, imports, history, recovery and export have separate entry points.
- `api/commercial.ts` dispatches the existing Commercial API, AI chat, automation control and automation-worker handlers. Vercel also hosts export, deletion, billing, telemetry, health and digest functions. Server build products are bundled by `scripts/build-commercial-server.mjs`.
- GitHub Actions runs build, API types, lint and Node tests, followed by the full contract suite. SQL tests run historical migrations against PGlite with distinct authenticated roles. Playwright scripts cover feature workflows with fixture environments. Client operational telemetry, health and automation run history expose failures. Production requires separate authorization, migration checks and live smoke.

## Routes and workflows

`src/App.tsx` and `src/config/featureRegistry.ts` are the canonical route and navigation sources. The rail order is Today, Timeline, Leads, Accounts, Opportunities, Money, Review, Products, Reports and Dashboards. Capture, Ask and Settings use shell entry points. Quotes is a working secondary destination reached in context. Business Vault, Stakeholders, Objections, Activity, Coverage, Playbook, Assets, Imports and Operating System have secondary or guarded routes. The authentication, marketing, legal, first-run and operator surfaces sit outside the working rail.

Legacy Orders, Cash Collection and Cost Analysis URLs redirect to Money tabs. Legacy Plan and Calendar redirect to Timeline with Upcoming and History selections. Legacy Pipeline Defense and Review Pack routes redirect into the working review or opportunity flows. Legacy Dashboard/Business, account/deal detail links, Search and singular routes resolve through redirects in `App.tsx`. Keep these bookmarks and query parameters as part of the regression baseline.

'Production-ready' below means the workflow has source wiring and automated behavior evidence or a hosted operational receipt. Per-workspace behavior is described where verified.

| Major area | Status | Behavior and evidence |
| --- | --- | --- |
| Today | Production-ready | Combines work, commercial risk and prepared outputs from the workspace loader. Today command-center and daily execution contracts exercise the links and data flow. |
| Capture | Partially implemented | Manual/local capture, offline retry and extraction feed Activities and Commercial Events, with review before accepted facts. Capture and Plan share an Activity reference when completing work. The same Activity ID survives a lost cloud response. A single durable event path for every direct commercial edit is missing. |
| Timeline, Activities and Plan | Production-ready | Upcoming commitments and planned activities, recorded activity and linked completion. Weekly Plan, activity channel, activity ledger and reconciliation checks protect this loop. Separate uncommitted Plan/Capture changes sit in the original checkout. |
| Leads, Accounts and Contacts | Production-ready | Leads and Accounts are first-class destinations. Contacts in the selling workflow are Stakeholders, linked to account/opportunity identities. The legacy `contacts` table appears in export. Account import, canonical identity and MEDDIC contracts exercise the working model. |
| Opportunities, pipeline and MEDDIC | Production-ready | Opportunity stages, next actions, outcomes and stakeholder coverage. The MEDDIC insight derives visible gaps. Pipeline Defense is embedded in active workflows and legacy URLs redirect. Pipeline ordering, eligibility, stakeholder and defense contracts cover the core. |
| Quotations | Production-ready for tracking | Manual quotes, statuses, opportunity links, amount/currency/discount and purchase-order, delivery and payment state. Quote linkage and pricing regressions exist. RFQ-assisted itemization, configurable approval and quote versioning are missing. |
| Orders, payments and cost analysis | Production-ready | Money reads won opportunity outcomes and the quote/order relationships, with separate milestone, receivable, collection and cost records. Order-to-cash, receivables currency, order margin and delivery regressions exercise calculations. |
| Products and pricing | Partially implemented | Portfolio models products and brands with commercial coverage. Quote pricing math exists. Approved line-item catalog prices, quote version policies and controlled pricing authority need dedicated design. |
| Business Vault and intelligence | Production-ready | Knowledge notes, commercial events, objection memory, assets, retention and recommendations. Vault replay, note-store, evidence, history and restore tests exercise persistence and traversal. |
| Weekly Review, analytics, reports and dashboards | Production-ready | Review synthesizes open work and commercial health. Reports and dashboards persist definitions and reuse canonical calculations. Storage, engine, database and handoff tests cover these flows. |
| AI assistance | Partially implemented | Optional external chat has consent controls, validation, bounded context and owner-checked source retrieval. Core analysis can run locally. RFQ intake and reviewed quotation/approval workflows are missing. |
| Automation | Production-ready for the existing rules | Opt-in periodic execution, prepared outputs and low-risk internal Plan creation. The October release receipt describes historical scheduled acceptance. Domain/API and SQL tests verify settings, claims, stale-source rejection, caps and idempotency. Event subscriptions and explicit commercial approval decisions are missing. |
| Shared Workspaces | Production-ready for promise sharing | Owner selects commitments, invites readers or reviewers, and acceptance binds to a revocable access epoch. Database tests exercise identity, roles, restore and revocation. |
| Same-account commercial workspace switching and copy | Production-ready for the existing workflow | A verified login can create and switch named books. The Data API resolves the requested workspace to an isolated data owner and the browser loads its storage namespace in a fresh document. Creation can copy selected account, contact, catalog and template information. This branch adds a category preview and confirmation. |
| Delayed browser loads across account changes | Production-ready on the tested paths | Owner-generation guards reject delayed collection writes and preference hydration. The baseline race could replace the active account's quotations or reporting currency. |
| RFQ extraction, smart quote drafting and commercial approvals | Not implemented | Existing Capture extraction, pricing functions, event records and policy domains are reusable pieces. No complete RFQ-document-to-approved-quote workflow is wired. |

## Relationships and permission boundaries

- `auth.users.id` anchors ownership. `user_profiles.id` holds profile, entitlement and several reporting values. Owner-bound cloud collections commonly use `(user_id,id)`. Historical forms also use UUID identities, sparse relational links and account aliases.
- Accounts link opportunities and stakeholders. Activities bind to a canonical account/opportunity where known. Quotes and outcomes can link opportunities. Won outcomes drive order views. Costs, milestones and receivables attach to order identities. Several links are inside JSON payloads or checked by domain code and must be treated as relationships even when PostgreSQL has no foreign key.
- The Commercial Kernel ties evidence, events, conditions, dependencies, commitments, decisions and money gates to commercial records. Historical State Revision triggers and backup code depend on canonical source identifiers and owner scope.
- `memoire_personal_workspaces` stores named books plus source and copy categories. A verified Data API request resolves the book to a distinct internal data owner, and the existing table policies apply to that transaction's effective subject. Native workspace data owners are blocked from signing in. Browser storage uses login and workspace identifiers.
- `commercial_workspaces` is an owner-scoped sharing configuration. Its membership/epoch RPCs publish a bounded commitment projection. It has no foreign-key role as the tenant of the rest of the book.
- Account-wide profile, billing, immediate support and account deletion have distinct semantics from active-workspace reports, search, AI, recovery and jobs. The service-role export, automation, import and restore paths require explicit review because a privileged caller can bypass ordinary RLS.

## Existing automation

`src/domain/automation`, `shared/automation.js`, `api/_automation.js` and the October migrations implement scheduled collection reminders, supplier promises, lead revisit, quotation/commitment checks, order handoff and opportunity blockers. They evaluate confirmed cloud snapshots with leases, source fingerprints, a per-day cap, stable task identities, manual-edit precedence, run receipts and retry/failure status. Settings offers preview, enablement, pause and history. Today, Capture, Plan, Review, margin, reports and dashboards consume those outputs. Extend this scheduler and Commercial Events instead of installing a second engine.

## Security and implementation sequence

1. **Audit and baseline.** Keep the existing route and data contracts, exercise the dedicated owner/RLS and core commercial tests, and reproduce real boundary failures with synthetic fixtures.
2. **Workspace isolation.** Keep login identity separate from commercial workspace identity. Native workspace scope reuses the data-owner policies and preserves the original personal book. Expand acceptance coverage of privileged and bulk operations, soft references, search, export, and multi-tab history. The create flow copies selected categories with regenerated record identities and stores its source and options.
3. **Capture consistency.** Adopt the Commercial Kernel event trail. Define the canonical command and stable mutation identity for each requested action before attaching activity/history projections.
4. **Automation.** Extend claim and execution with event triggers, versioned rules and reviewed transitions. Reuse existing schedule, worker, prepared outputs, checks and receipts.
5. **Commercial AI and release.** Gate external processing on workspace-specific consent. Apply deterministic pricing and policy checks, keep drafts editable, and verify the flows with synthetic files. Exercise local and hosted release gates separately.

[Shared workspace permission contract](../architecture/shared-workspaces.md), [automation release receipt](../deployment/automation-whole-product-production-2026-10-21.md), [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [PostgREST transactions](https://docs.postgrest.org/en/stable/references/transactions.html).

## Route compatibility inventory

| Access and purpose | Paths |
| --- | --- |
| Public entry and marketing | `/`, `/pricing`, `/use-cases`, `/why-deals-go-quiet`, `/quote-to-cash`, `/request-access` |
| Auth and legal | `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password`, `/legal/:document` and the legacy entry points `/privacy`, `/terms`, `/share/brief` |
| Protected roots | `/app` redirects to Today. `/app/start` is first-run setup. `/app/workspaces` is the named-workspace directory when enabled. `/admin` uses server-checked operator access. |
| Rail destinations under /app | `today`, `timeline` (Plan label), `leads`, `accounts`, `opportunities`, `revenue`, `reviews`, `products`, `reports`, `dashboards` |
| Other routes under /app | `capture`, `ask`, `activity`, `vault`, `settings`, `quotes`, `portfolio-coverage`, `stakeholders`, `objections`, `operating-system`, `playbook`, `assets`, `imports`, `validation-feedback` |
| Legacy compatibility under /app | `cost-analysis`, `cash-collection`, `orders`, `pipeline-defense`, `pipeline-defense/review-pack/:id`, `dashboard`, `business`, `plan`, `calendar`, `weekly-brief`, `onboarding/pipeline-review`, `onboarding/sales-operating-setup`, `onboarding/quick-start`, `accounts/:accountId`, `journey`, `history`, `entities`, `entities/:entityId`, `deals`, `deals/new`, `deals/:id`, `deals/:id/edit`, `search`, `review`, `account`, `opportunity`, `stakeholder`, `quote`, `objection` |

The route table also provides separate inside-shell and top-level not-found handlers. Browser Today, Plan and rails use the feature registry as the display authority.
