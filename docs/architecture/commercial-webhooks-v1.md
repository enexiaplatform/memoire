# Commercial change notifications v1

Webhooks announce that a canonical source revision was recorded. They do not carry its commercial truth, private notes, Evidence text or source material. A receiver must use an authorized read interface or its own governed process to interpret a change. Notifications never create Decisions, accept claims or alter historical reconstruction.

## Identity and receiver contract

The stable envelope contains `version: 1`, `id: memoire.change.v1:<revision UUID>`, `type: commercial.state.changed`, `recordedAt`, `subject: {kind,id,revision}` and `operation`. Source baseline snapshots are excluded. Repeated delivery of the same notification must be deduplicated by the receiver, scoped to the configured sender. A successful HTTP acknowledgement is a transport result, not evidence that a commercial action succeeded. Arrival order is not guaranteed; use source revision numbers, not delivery order.

Each request has `Memoire-Notification-Id`, `Memoire-Timestamp` (Unix seconds) and `Memoire-Signature: v1=<hex HMAC-SHA256>`. Sign the exact string `<timestamp>.<raw request body>` with a dedicated random signing secret of at least 32 characters. Verify before parsing, compare in constant time, reject timestamps outside five minutes and durably deduplicate notification IDs. `verifyWebhookSignature` implements byte/signature/time checking; receiver business idempotency remains the receiver's responsibility. Use distinct secrets for different recipients and support overlapping keys during a controlled rotation.

## Governed deployment configuration

The worker is disabled unless deployment operators explicitly configure `COMMERCIAL_WEBHOOK_TARGETS` as an array (maximum three) of `{id,ownerId,url,since,secretEnv}`. `since` is the agreed notification start timestamp. `secretEnv` names a `COMMERCIAL_WEBHOOK_SECRET_...` environment variable; secrets are not in database rows, exports, logs or notifications. The target ID and owner bind the disclosure scope. A URL change requires a new endpoint ID; existing queued disclosures cannot silently move to a different recipient. This is deployment-managed configuration, not a customer-facing subscription or invitation system.

Only `POST /api/commercial-webhooks` with the existing scheduler `CRON_SECRET` may run delivery. No schedule or endpoint was configured by this implementation. Production configuration and deployment remain pending under P1. Development tests use injected receivers and make no external requests.

Outbound URLs require HTTPS, normal TLS hostname verification and port 443. DNS must resolve exclusively to public IPv4; the connection pins the validated address to prevent DNS rebinding. Private/reserved addresses and IPv6 are refused. Redirects are not followed. DNS and request phases each have a three-second bound. This conservative IPv4 transport is a stated limitation, not a claim of universal provider compatibility.

## Queue, retries and recovery

`commercial_webhook_deliveries` is operational state separate from Commercial Events and State Revisions. Scheduler-only security-definer functions derive at most 100 previously unqueued source revisions per endpoint and claim two jobs per invocation. Per-endpoint locking protects target identity; row leases and `SKIP LOCKED` protect concurrent workers. Owners can read their own delivery rows, but clients cannot insert, acknowledge, redirect or delete them. Anonymous access is denied.

HTTP 2xx marks transport acknowledgement. Network errors, 408, 429 and 5xx retry with exponential delay starting at 30 seconds and capped at one hour. Other 3xx/4xx stop. Eight attempts is the limit. A crashed worker's lease expires after two minutes, and a late acknowledgement cannot finish a different worker's lease. A crash after receiver acceptance may cause a duplicate; stable receiver deduplication is mandatory. Exhausted jobs remain visibly failed; an operator must investigate before an authorized requeue. There is no invented successful delivery on timeouts or unknown acknowledgement.

Delivery rows are included in account export and retained as an audit archive during restore. They are intentionally not replayed as executable jobs by a browser restore. Source history is the reconstructable input; restoring a database without its delivery queue can lead to repeat notifications with the same stable IDs. Preserve the operational database backup or rely on receiver deduplication before resuming. Secrets and recipient configuration require separate deployment backup. No new canonical-history source or backup-format change is needed, because delivery state is not commercial truth.
