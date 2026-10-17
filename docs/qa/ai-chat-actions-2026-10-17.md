# Chat action verification — 2026-10-17

Scope: grouped Plan creation and open-opportunity updates from Ask Memoire, with an exact preview and one confirmation in chat.

## Recorded evidence

- Browser fixture: two Plan items and one opportunity update proposed together. Before confirmation, the visible saved-record readout contained no Plan items and the original next action. Typing `hủy` discarded the proposal without a write. Typing `thực hiện` on a new proposal saved the three fictional changes. Repeating confirmation without a pending batch did nothing.
- Reload: the visible fixture readout retained exactly two Plan items, correct dates/channels/linked opportunity, and the updated next action/date. See [saved records](evidence/ai-chat-actions-2026-10-17/saved-records.json).
- Responsive: the pending group, cancellation/apply controls and composer remained usable at 390 × 900. Inspected [mobile preview](evidence/ai-chat-actions-2026-10-17/mobile-preview.png), [desktop preview](evidence/ai-chat-actions-2026-10-17/batch-preview.png) and [result](evidence/ai-chat-actions-2026-10-17/batch-result.png).
- Real Groq, synthetic inputs only: all three cases returned HTTP 200 with expected action counts: explicit batch (three), read question (zero), ambiguous target (zero plus clarification). This caught and fixed unprefixed target IDs by constraining source and action target enums to the supplied source keys. A dedicated clarification field preserves an actual question instead of a generic no-evidence response.
- Model prose for proposed actions is replaced with a deterministic pending notice. No provider-generated success claim serves as a write receipt.

## Boundaries

The browser fixture mocks authentication/provider/cloud acknowledgement and writes fictional local data only. Real-provider tests do not invoke the executor. These results do **not** establish end-to-end production cloud mutation. No real customer records were created or edited during this verification.

During source edits, Vite hot reload emitted duplicate-root/removeChild errors in the fixture. The completed flow and reload checks ran after those edits; no new error was observed during those interactions. This is development-fixture evidence, not a production error scan.

The executor uses existing authenticated writers and RLS without a schema migration. Whole-batch stale-version preflight precedes sequential writes; a partial failure/local-only result stops subsequent items and reports their status. There is no cross-table transaction or new database compare-and-swap protection for edits racing after preflight.

Automated regression coverage includes protocol validation, ownership/sample boundaries, forbidden fields/transitions, stale previews, expiration, duplicate/no-op handling, partial writes and owner changes. Release check results are recorded separately after completion.
