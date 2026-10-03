# Global B2B audit remediation — 2026-10-03

This change resolves F01–F07 from `global-b2b-12-month-audit-2026-10-03.md` using the retained fictional Northstar workspace. The original audit evidence remains unchanged.

| Finding | Change | Regression evidence |
| --- | --- | --- |
| F01 | Export orders history coverage by its actual `user_id` key. | Every exported table resolves its pagination columns against the complete migration chain, and the owner predicate plus ordering contains a unique database key. Complete authenticated backup and populated isolated restore acceptance are required before release. |
| F02 | The latest accepted quote controls contract value, currency, terms and fulfilment evidence. Draft, Sent and Expired proposals cannot override it. | Unaccepted revisions leave the order unchanged; a subsequently accepted revision changes the commercial basis. |
| F03 | Identical receipt identities count once. Conflicting duplicates reject calculation, store writes and backup restore validation. | Identical retry leaves storage and timestamps unchanged; distinct transfers with identical amounts/dates remain separate; conflicting local data cannot become an empty workspace. |
| F04 | UI and store reject a future receipt date. Existing future/invalid dates remain visible but are excluded from current/as-of received totals. | Exact cutoff date included, next day excluded; invalid dates remain invalid rather than being converted into today. Rejected input does not change cloud receipts. |
| F05 | Receipt history uses the receipt's original currency. Aggregate balances retain the reporting currency. | EUR receipt history checked in a USD workspace. |
| F06 | Orders, Reports, Today cash and Ask money answers use collection records. Receipt balance owns deposit/paid milestones once a collection record exists. Proven milestones carry collection provenance and cannot be overridden by manual ticks. | Full, partial and excess payments; refunds; removal of the final receipt; fulfilled deposit; missing FX; full year: 24 collected / 24 open. |
| F07 | Consuming `orderId` preserves the selected Collections view and every other query parameter. It opens paid orders too. | Stable desktop and 390px mobile deep links after the consuming effect runs. |

Verification status: implementation and domain regressions complete; final release/browser/restore receipts are recorded below when verified. No schema migration is required.

The existing backup script changes and database-incident documents in the working directory are outside this application patch.
