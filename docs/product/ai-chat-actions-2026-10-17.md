# Memoire actions through chat

The seller can request several changes in one message, inspect the exact targets and before/after values in chat, then reply **thực hiện** to apply the group. **Hủy** discards it. An apply-all button is an alternative, never a requirement to open each record.

Examples:

- “Tạo Plan gọi khách A ngày 20/10 và gửi checklist ngày 21/10.”
- “Cập nhật next action của cơ hội [tên đầy đủ] thành [nội dung], hạn 23/10.”
- “Đổi cơ hội [tên đầy đủ] sang Proposal và xác suất 60%.”

## Scope

Up to eight typed operations per batch:

1. Create a personal Plan item, optionally linked to an exact selected account or opportunity, with an explicit date and optional recorded channel.
2. Update an existing open opportunity: next action/date, non-Lead open stage, Active/On hold status, expected close period, estimate in its existing currency, declared probability, evidence, missing context, objections, decision maker, budget owner, procurement path or technical criteria.

Lead qualification and Won/Lost transitions retain their existing dedicated evidence flows. No deletion, payments, currency conversion, Brand reassignment, external CRM writeback or customer-message sending is exposed by these actions. Ambiguous targets, missing dates and unsupported requests should produce clarification rather than guessed writes.

## Execution

Groq returns proposed data under a strict schema; API and browser both enforce an allowlist, target source membership, field values, dates, unique targets and batch size. Provider prose is replaced with a deterministic pending message whenever actions are present, so an optimistic “already saved” response cannot become an application receipt.

Confirmation is handled locally against the currently displayed batch; it does not ask the model to reconstruct a write from chat history. Repeated confirmation without a pending batch does nothing. A different request replaces the pending batch; reload, scope/owner changes and refresh clear it. Previews expire after ten minutes.

Before writing, the application verifies the signed-in user and reloads records. A changed opportunity version stops the whole batch before its first write. Writers reuse the existing opportunity store (including Brand integrity and change history) and Plan/cloud JSON stores under the current user's RLS. Other open Memoire surfaces are notified to refresh after execution.

Writes run sequentially and **are not a database transaction**. If a write fails or remains local-only, later operations stop, and the receipt distinguishes successful, local-only, failed and unexecuted work. It does not promise rollback. A stable Plan ID and exact duplicate checks avoid repeating the same item on retries. In-flight requests or concurrent edits after the preflight read are not protected by a new database compare-and-swap mechanism.

## Verification boundary

Automated cases cover foreign/sample/closed targets, invalid fields and dates, forbidden transitions, stale snapshots, expiry, duplicate Plan/no-op edits, partial failure and owner changes during execution. The browser fixture simulates auth/provider/cloud acknowledgement and writes only fictional local data. A live Groq synthetic request verifies model/schema compatibility; it does not verify real cloud mutation. No production business data needs to be changed to test the proposal UI.
