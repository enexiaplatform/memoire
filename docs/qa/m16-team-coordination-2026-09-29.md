# M16 — manager and team coordination

Starting green SHA: `8540283f33bdd764b47e3078131ae290d2a8fe2a`.

## Audit and domain boundary

The existing Commitment Ledger already distinguishes self, customer and internal promises, records named owners, dates, history and completion evidence, and provides the commands to update those records. M16 reuses that canonical concept. It adds manager-oriented visibility over recorded internal promises, explicit recording of an agreed delegation, and a selected review preview. It does not introduce a second task system or claim that a recorded name is an authenticated team member.

This milestone operates on team coordination recorded in the current user's workspace. Shared logins, invitations, member authority and cross-user access remain M21. The interface states this boundary: recording an agreement does not send a notification, grant access or verify the recipient's acknowledgement. The operator must confirm the agreement and its reference. This preserves personal working context while making coordinated work reviewable.

## Architecture and persistence

The pure `deriveTeamCoordination` view filters exact owner/sample scope and open internal Commitments, then orders by the recorded due date with undated work explicit. It joins Opportunity labels only within scope. There are no employee scores, inferred effort, monitoring signals or automatic allocation.

`recordInternalAgreement` validates the owned Opportunity, named responsible person, promise, agreement reference and optional valid date, then calls the existing canonical `createCommitment` command. The agreement reference uses existing provenance. A required-history failure prevents the promise from landing. No new mutable aggregate, migration or backup format is needed; existing Commitment RLS, Revisions, backup/export and sample isolation remain in force.

Review selection and preview are transient. The generated text contains only selected promises, customer, recorded date, source record identity and preparation time. Private notes, agreement references and unselected promises are omitted. It is a bounded operator-prepared reading, not recipient acceptance or a remotely synchronized team record.

## UX and verification

The existing Review follow-up area contains a folded Team coordination panel. People can inspect dated promises, open the relevant Opportunity, record an explicitly agreed internal promise, and preview selected text before copying it through their chosen channel. Changes to scope reset local selection. Existing Timeline/Commitment controls continue to own rescheduling and completion.

`npm run check` passed with **1,910 tests**, zero failures, build, API typecheck, lint and all repository contracts, including the existing PostgreSQL/RLS/history/backup matrix. New tests cover confirmation, ownership/sample boundaries, valid dates, minimal selected export, rollback on failed required history, and preservation through the real backup/history paths. The browser check passed confirmed agreement recording, reuse of the durable ledger, explicit selection, preview privacy, unchanged canonical state during selection, reload and narrow viewport.

Production remains **PENDING** under P1. **GO for M17** from the commit containing this report. Remaining debt is explicit: M16 is recorded coordination and manager review; real shared workspace authority is still the separately scheduled M21 work.
