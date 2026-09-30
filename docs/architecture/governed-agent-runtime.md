# Governed agent runtime

M23 is a host-controlled orchestration layer exported from `@memoire/commercial-sdk/agent-runtime`. It wraps M22 and M19 rather than bypassing the API, calling persistence directly or creating an alternative recommendation engine. A host supplies the authenticated session, an agent label and optional original source envelopes. The runtime pins one token for its lifetime: refreshing or switching accounts requires recreating the runtime and its grant. Labels identify the host's configured agent; they do not prove an independently authenticated agent identity.

`propose(callback)` reads at most 50 owner commitments and page-scoped recommendations. It passes a frozen, cloned view and supplied observations to the callback, never credentials or a command executor. Separate reads are not an atomic snapshot. Recommendations whose references are outside the commitment page are excluded. The callback may return at most ten proposals per call and fifty per runtime: a follow-up referencing a visible commitment, or a receipt proposal referencing an exact host-supplied observation key. Unsupported commands, foreign references and additional confirmation/authority fields are refused. The entire output batch is validated before any proposal is retained.

Proposals have host-generated IDs, agent attribution and proposal time, and explicitly remain unaccepted. They are transient suggestions, not Evidence, Decisions, tasks or canonical truth. Nothing persists merely by observing or proposing. The host may show them for review or export its own orchestration log, but this runtime does not claim a durable agent audit ledger. Existing human-confirmed application flows remain the only route to consequential commercial changes.

The default is read/propose only. A separately configured host policy may permit `executeReceipt(proposalId)` for a list of source namespaces until a fixed expiry, with at most fifty distinct source keys. The agent cannot provide or enlarge this allowance. Execution always sends the immutable original envelope captured from the host, never generated summary text. Received content remains an unaccepted source observation; its existing Event identity, ownership, RLS and export/restore contracts apply. No agent-created Evidence or State Revision is introduced.

Receipt slots are reserved before dispatch. Failed or uncertain acknowledgements retain their slot; the exact same source can be retried through M19's immutable source-version identity. There are no automatic retries. A completed proposal returns its recorded acknowledgement. Runs/dispatches serialize inside one runtime. Grants and budgets are ephemeral per-instance host limits, not distributed quotas or database authorization: the server remains authoritative. Revocation prevents subsequent calls, but cannot roll back an already dispatched receipt. It returns an honest acknowledgement if that in-flight receipt completes.

The callback adapter is trusted host code that may invoke a model and return untrusted JSON; this is not a sandbox for arbitrary scripts. Hosts must apply their own model/network timeout and cancellation. Treat external text as data; do not give the model credentials or unrelated tools. Forbid automatic approval loops for consequential actions. Expiry, namespace allowance and receipt budget do not confer authority to complete a promise, accept Evidence, record a Decision, change roles, send messages or move money; those operations are absent from the runtime.

No database migration, backup format or new product navigation is needed. Runtime grants and pending proposals intentionally do not survive reload or backup restore; recreation requires a new host grant. Only completed source receipts use existing persistence. Production deployment and live identity verification remain pending P1.

```ts
import {createAgentRuntime} from '@memoire/commercial-sdk/agent-runtime';

const runtime = await createAgentRuntime({
  origin: 'https://your-trusted-memoire-deployment.example',
  getAccessToken: getCurrentUserAccessToken,
  agentId: 'receipt-assistant',
  observations: [{key: 'crm-42', observation: originalSourceEnvelope}],
  // Omit this for read/propose only. This value belongs to trusted host policy.
  receiptAuthority: {namespaces: ['my-tenant'], expiresAt: hostChosenExpiry, maxReceipts: 1},
});
const proposals = await runtime.propose(view => modelAdapterReturningJson(view));
// Trusted host chooses whether to invoke this allowed, non-truth-promoting operation.
const receiptProposal = proposals.find(item => item.proposal.type === 'receive-observation');
if (receiptProposal) await runtime.executeReceipt(receiptProposal.id);
runtime.revoke();
```
