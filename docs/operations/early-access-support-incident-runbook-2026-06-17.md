# Early-Access Support And Incident Runbook

Date: 2026-06-17

Roadmap slice: C5 support and incident readiness

## Decision

Memoire now has a lightweight early-access support process for a 5-10 person controlled cohort.

This is sufficient for a manual cohort if an operator confirms the support inbox and escalation owner before invites. It is not enough for paid checkout or unrestricted public selling.

## Support Channel

Default support channel:

- `hello@memoire.app`

Before inviting the cohort, the operator must confirm:

- The mailbox exists and receives external mail.
- At least one named person checks it every business day during the cohort.
- A backup owner exists for weekends, travel, or illness.
- Support notes are recorded in the cohort tracker or operating review notes.

## In-App User Guidance

User-facing support guidance now appears in:

- `src/features/settings/ExportTab.tsx`

The Export & Delete tab tells users to include:

- What they were doing.
- Approximate time.
- Visible error message.
- Whether they were signed in or using local/demo mode.
- Optional workspace export when support needs evidence for sync, deletion, or data recovery.

The export README also reminds users that the archive may contain customer and pipeline information.

## Severity Levels

| Severity | Meaning | First Response Target | Escalation |
| --- | --- | --- | --- |
| SEV0 | Possible cross-account data exposure, deletion failure after confirmed request, account takeover, or customer data exposed to the wrong user. | Same day, as soon as seen | Stop new invites, preserve evidence, inspect Supabase/Vercel logs, do not ask for more customer data until scope is clear. |
| SEV1 | User cannot access account, cannot export, cannot delete, or core saved work disappears from signed-in workspace. | 1 business day | Check auth, `/api/health`, Vercel errors, Supabase row ownership, and local/cloud sync status. |
| SEV2 | AI endpoint, Quick Capture, Ask Memoire, Review Pack, or Pipeline Defense workflow fails but user data is preserved. | 2 business days | Reproduce on protected preview or local build; capture route, browser, data mode, and logs. |
| SEV3 | Product question, copy confusion, feature request, or onboarding friction. | 3 business days | Record in cohort feedback tracker and weekly operating review. |

## Intake Checklist

For every support item, record:

- Date and time received.
- User email or cohort alias.
- Route or screen.
- Data mode: signed-in, local-only, or demo.
- Browser and device if known.
- Visible error text.
- Whether an export was attached or explicitly not shared.
- Severity.
- Owner.
- Next action and due date.
- Resolution summary.

Never require a user to send confidential customer data to get basic help. Ask for sanitized screenshots or an export only when needed to diagnose workspace-specific sync, deletion, or recovery issues.

## Incident Workflow

1. Triage severity.
2. Acknowledge receipt using the response target above.
3. For SEV0 or suspected data exposure, pause cohort expansion and stop inviting new users.
4. Check `/api/health` for environment readiness.
5. Search Vercel logs for API errors and `Memoire client operational event`.
6. Check Supabase Auth and database logs for the same time window.
7. For sync issues, compare browser mode, local export contents, and cloud row ownership before changing data.
8. Record the decision: fixed, mitigated, user-action required, accepted risk, or product backlog.
9. Update release gate evidence if the issue affects A1-A10, B1-B6, or C1-C6.

## Data Handling

Support exports may contain customer names, notes, opportunities, objections, actions, and pipeline review details.

Operator rules:

- Store received exports only in the approved support workspace.
- Do not forward exports into personal email or chat unless the user has approved that support path.
- Delete received exports after the issue is resolved or at the next retention review, whichever comes first.
- If a user asks for deletion, confirm whether they mean local browser data, signed-in cloud data, or both.
- Never paste customer content into an AI tool unless the user explicitly approves that provider and use case.

## Billing Boundary

Paid checkout remains blocked.

Before billing is enabled, this runbook must be extended with:

- Billing support procedures in `docs/operations/billing-support-runbook-2026-06-17.md`.
- Billing payment QA in `docs/qa/billing-payment-qa-2026-06-17.md`.
- Selected paid offer, price ID, owners, refund policy, and trial policy.

## Pass Criteria For C5

C5 can move from missing to operational evidence only when:

- Support inbox is confirmed live.
- Named primary and backup owners are recorded.
- First test support request is received and answered.
- One support note is recorded in the cohort tracker or operating review.
- SEV0/SEV1 escalation owner is confirmed.

Current status:

- Runbook exists.
- In-app support package guidance exists.
- Operational evidence is still missing.
