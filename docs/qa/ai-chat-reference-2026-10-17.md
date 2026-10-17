# Plan draft identity regression — 2026-10-17

Confirmed in the user's visible live conversation: the preceding agenda named one opportunity, but the next `add it into the Plan for next week` proposal cited and linked a different opportunity for every task. The group was still pending and was canceled in chat without a business write.

Root cause: typing an edit request reran record retrieval with edit ranking, replacing the period-ranked evidence used for the agenda. Source membership checked that the new target existed, but did not check that it belonged to the preceding draft.

## Change

- Keep the evidence snapshot alongside each assistant reply, only in the existing in-memory conversation. API chat history still serializes role/content only.
- Referential Plan conversion uses the preceding reply's cited sources from that snapshot, rather than running a fresh search. If the model cited only a weekly analysis, a missing identity can be recovered only by its complete displayed account/opportunity name matching that same snapshot. Product fragments, aliases and longer lookalike names do not match. The strict provider target enum and existing ownership validation therefore cannot admit an unrelated newly retrieved opportunity.
- Before a group can appear, require creation-only actions, exact named targets and coverage of every cited opportunity (or account when no opportunity is cited). Reject collapsed, substituted, unlinked or update actions instead of silently changing the draft's identity. An ambiguous or narrower request may require clarification/rebuilding the draft.
- New explicitly named work continues through normal retrieval. Reset, scope change and reload retain their existing conversation boundaries.
- Plan previews show account plus opportunity, rather than only a product-like opportunity name.

## Verification

43 focused chat tests passed. New cases cover the Swab-versus-Endotoxin substitution, whole-draft collapse across two opportunities, personal/unlinked tasks, direct new requests, exact-name recovery, lookalike rejection and history without a saved snapshot.

The fictional full-page fixture included an Endotoxin decoy ranked before the intended Analyzer. Its simulated provider chooses that decoy if it appears in the conversion schema. After `add it into the Plan for next week`, the locked request excluded the decoy and both proposed Plan items named the original Analyzer. Confirmation saved both fictional records with `linkedOpportunityId: fixture-deal`; the decoy stayed unchanged. See [preview](evidence/ai-chat-reference-2026-10-17/correct-reference.png) and [saved records](evidence/ai-chat-reference-2026-10-17/saved-records.json).

Fixture auth/provider/cloud acknowledgement are simulated; this is not real production cloud-write evidence. Production proposals may be checked without confirming a write. Whole-project/CI/deployment results are captured in the private release receipt after release.
