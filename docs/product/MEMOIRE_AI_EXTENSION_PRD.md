# Memoire AI extension PRD

Status as of 2026-11-17. Memoire already offers optional Chat, local commercial search and analysis, manual quotation tracking, pricing calculations, follow-up preparation and pipeline review. The release candidate carries confirmed copy previews for named workspaces and more durable Capture and Plan activity linking. The capabilities below describe acceptance for the later extension. They are not enabled.

## Product and capability boundaries

The personal seller remains the primary operator. Capture, Accounts, Opportunities, Money and Review keep their normal workflows. AI assists at the existing point of work. A seller can use local tools and manual forms without an external model or team workspace. The current edition and billing entitlements stay in place. A future Business edition can add role-scoped approvals and shared work through verified server permissions once required.

## RFQ intake and correction

The seller opens a supported RFQ source from the quote flow. Validate file type and structure, size, expansion limits and content before reading. Process a chosen file or selected email content. Use PDF, spreadsheet, document and pasted-content parsers where a supported format can be read safely. For unsupported or scanned material the interface states which sections require manual entry or verified OCR.

Return customer, requested product or specification, stated SKU, quantity, unit, delivery, requested payment terms and requested quotation date with per-field source anchors such as page and text span, sheet and cell, or paragraph. Missing values stay blank. Any confidence indicator explains its basis in extraction evidence. Conflicts, provenance and corrections remain visible. Confirming the draft preserves the reviewed fields and source references under the active workspace.

## Quotation and commercial checks

Show catalog suggestions as candidates within the quote editor. Require the seller to confirm a product match. Read price from an authorized workspace price list or explicit seller input. Calculate quantity extension, currency conversion, discounts, VAT and margins from validated decimal inputs with explicit rate/date and rounding rules. Missing cost or an unavailable approved rate prevents the corresponding total or margin from being presented as confirmed.

Save an immutable revision of a reviewed quote with canonical line items, inputs, policy version and derived totals. Validate on the backend. Retain earlier revisions and allow the seller to resume manual quote entry. Clone only explicitly selected template fields. Evaluate threshold checks for discounts, margins, terms and missing required attributes. The operator sees the rule and its evaluated inputs.

## Commercial approval

Approval requests refer to a quote revision and evaluated rule. Only an authorized approver in that workspace can approve, reject or request changes. Bind approval to the reviewed revision, revoke applicability when material fields change, and preserve who decided, when and why. Show state in Quotes and relevant Today or Review summaries. Begin with internal notifications and a review history. External delivery and financial commitments require separate authorization.

## Follow-up and pipeline review

Surface overdue commitments, stale opportunities, quotes awaiting response, missing stakeholders and next actions using current scoped records. Use deterministic rules for timing, aging and forecast inconsistencies. Explain which record and timestamp supported each finding. Optional model drafts and proposed interventions are labeled, editable and tied to that record. Suggestions and predictions are separate from verified commercial facts. Drafts never trigger sending by themselves.

## Privacy and acceptance

- The seller chooses which RFQ or context goes to a named processor and sees what will be sent before authorizing processing. Consent, relevance and retention rules apply per workspace. Existing local workflows remain usable if the external service fails or the seller declines.
- The backend verifies workspace membership and the scope of each retrieved record. A stale request or a source from another workspace cannot produce a draft, evidence link, report or job.
- Tests use fictional RFQs that cover missing quantities and SKUs, contradictory lines, spreadsheet formulas, malformed inputs and embedded prompt injection. Reviews retain source anchors and seller corrections.
- Money regression cases cover zero and missing values, tax and discount order, negative margin, currency rounding and approved-rate validity. Approval tests cover false actor, stale revision, retry, concurrent response and changed authorization.
- Named workspaces now have server-checked data scope. The extension still depends on canonical Capture event integration and governed event-triggered automation. Current evidence and open gates are in the [release readiness report](../engineering/RELEASE_READINESS_REPORT.md).
