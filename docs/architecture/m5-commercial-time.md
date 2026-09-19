# M5 Commercial Time

Commercial Time is a projection over the M4 Requirement DAG, not a second planning system. It answers a narrow question: given an explicitly chosen Opportunity close target, what is the latest date each unresolved prerequisite can complete under the recorded downstream durations? The operator links exactly one `required_now` Requirement to `Opportunity.expectedClosePeriod` as the target. That field is a seller's close target; it does not stand for a purchase order date or customer deadline.

## Temporal ownership

| Existing field | Meaning | M5 use |
| --- | --- | --- |
| `Opportunity.expectedClosePeriod` | Seller close target, day-level when valid | Target only after an explicit anchor |
| `Opportunity.nextActionDate`, `nurturedUntil` | Planned follow-up and revisit | Never substituted for target or blocker completion |
| `Opportunity.closedOn` | Observed close | Never projected forward |
| `CommercialCommitment.originalDueDate` | Initial promise | History, not the current prediction |
| `CommercialCommitment.currentDueDate` | Current party promise | Blocker completion date only after an explicit link |
| `CommercialCommitment.dueDateHistory` | Rescheduling history | Retained, not treated as concurrent deadlines |
| `QuoteRecord.quoteDate`, `validUntil` | Quote issuance and validity | No automatic close-path link |
| Quote expected delivery / payment due; OrderReceivable due dates | Delivery and payment semantics | Stay in their own flows |
| Condition `validFrom`, Evidence `observedAt`, Event `occurredAt`/`recordedAt` | Validity, observation, occurrence / recording | Provenance, never fabricated duration |

## Canonical assertions

`commercial_timing_assertions` persists only three operator-confirmed relationships: `target_anchor`, `duration`, and `commitment_link`. Every row has stable identity, Opportunity and Requirement, owner, lifecycle, basis, creation/update times, and manual source. A duration has nonnegative integral days, `calendar_days` or `business_days`, and epistemic status. Supported durations require a concrete contract, customer/supplier, or internal SLA reference; assumptions are explicitly planning assumptions. An optional Evidence link must remain in scope. A commitment link references the existing Commitment rather than copying its due date. Retirement preserves the original input; it is never silently overwritten. The database constrains types, scope, ownership, unique current anchor, and history immutability. Local commands use the same reference preflight as backup restore.

No last safe date, buffer, recovery window, status, or path is persisted. They are recomputed from the current graph, current Commitment date, current target, and an explicit local commercial day. The projection returns source IDs, source type/reference/basis, constraining Requirement/Dependency path, assumptions, unknown/conflicting segments, and calculation time.

## Derivation

The active, unresolved portion of the anchored M4 DAG is traversed. For a leaf blocker, each downstream Requirement contributes its explicit duration after all its prerequisites finish. The latest safe completion date is target day minus the longest known downstream route in calendar days. An AND branch constrains by its longest route; a diamond keeps both routes before selecting the tighter one. This is a time-constraining path over the known graph, not a claim that the entire commercial process has a project-critical path. A zero-day duration is an explicit assertion, not a default.

If a required duration is missing, two active values conflict, the graph is invalid, the target is not a strict date, or a business-day assertion lacks a calendar, the affected blocker gets no safe date. A complete result is withheld if any anchored blocker is partial or conflicted; known pieces and missing pieces remain visible. No holiday or working-hours calendar is inferred. Date-only arithmetic uses UTC ordinal days without interpreting date keys as local instants; `today` is supplied as a local date key. Event timestamps remain instants.

For a blocker with an explicitly linked, open, dated Commitment, `bufferDays = lastSafeDate - currentDueDate`. Without both facts, buffer is unknown. `recoveryWindowDays = overallLastSafeDate - today`; it is temporal room to complete the blocker, not a probability of recovery. A complete target is `target_no_longer_supported` when today or a linked promise is past its safe date. The projection does not change the Opportunity, Commitment, forecast, or plan. Retired assertions stay auditable but do not contribute.

## Surfaces and durability

Opportunity displays the target distinction, timing status, missing/conflicting segments, per-blocker safe dates, linked promises, path, duration source and assumption, and lets the operator create/retire the three assertion types. Today emits one material exception for an unsupported target with a complete timing model; Review inherits the same recommendation. The existing Requirement question remains the next-best question from M4. Plan may use the exception as a suggestion, but no plan item or revised promise is created automatically. Search and money/forecast language are unchanged.

The assertion is a registered canonical collection for local storage, cloud sync, export, backup format 7, and restore preflight. Sample rows stay local and are dropped from live restore. State writes precede Events; failed state writes create no history, and failed history returns a warning without repeating the accepted state change. Cloud deployment must separately verify the M2/M3/M4/M5 migrations before production readiness is claimed. M5 does not introduce historical-duration inference or forecast defensibility; those remain separate decisions.
