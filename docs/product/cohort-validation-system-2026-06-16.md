# Memoire Cohort Validation System

Date: 2026-06-16

Roadmap session: Session 7 - Cohort Validation System

## Decision

Memoire should not invite anonymous public traffic yet.

The next commercial step is a controlled 5-10 person early-access cohort after the Session 3 infrastructure controls and Session 4 two-account QA gates have evidence.

The cohort exists to answer one question:

Can individual B2B sellers get enough value from the Pipeline Defense workflow to justify a paid early-access offer?

## Cohort Shape

Size:

- Minimum: 5 active participants.
- Target: 8 participants.
- Maximum for first cohort: 10 participants.

Duration:

- 14 calendar days.
- Includes one onboarding call, one pipeline-review usage moment, and one closing interview.

Access posture:

- Early access only.
- No paid checkout.
- No unrestricted public signup.
- No CRM writeback.
- No production cohort until infrastructure and two-account gates pass.

## Ideal Participant Profile

Prioritize people who match all or most of:

- Individual contributor or founder-led seller.
- Owns active B2B opportunities, not only marketing leads.
- Has at least 5 active deals or 3 strategic deals.
- Prepares for weekly pipeline review, forecast call, founder update, or manager review.
- Uses CRM, spreadsheet, Notion, docs, email, or personal notes to track context.
- Feels pain around stale opportunities, missing follow-up, weak evidence, objections, or manager-ready summaries.
- Can try a CSV import or add one opportunity manually within 48 hours.
- Is willing to join one feedback call.

Avoid for first cohort:

- Sales leaders who only want manager dashboards.
- Teams requiring admin/security review before use.
- Users who need Salesforce/HubSpot two-way sync before any value.
- Users selling only transactional/self-serve deals.
- Users who cannot use fictional/demo data or a sanitized pipeline.

## Qualification Score

Score every request from 0-10.

| Signal | Points |
| --- | ---: |
| Has weekly pipeline or forecast review pain | 2 |
| Owns active long-cycle B2B opportunities | 2 |
| Can provide sanitized CSV or add one opportunity | 2 |
| Mentions weak evidence, stale follow-up, objections, or review prep | 2 |
| Willing to do feedback call and 14-day test | 1 |
| Has budget influence or can name buyer | 1 |

Invite order:

- 8-10 points: invite first.
- 6-7 points: backup list.
- 4-5 points: ask one clarification before invite.
- 0-3 points: do not invite to cohort 1.

## Cohort Workflow

### Day -2 To Day 0: Select And Invite

Operator actions:

1. Pull new requests from `early_access_requests`.
2. Score each lead using the qualification score.
3. Check the Session 6 funnel views for recent demo completion or request-access activity.
4. Invite the top 5-10 qualified people.
5. Keep a backup list of 5.

Evidence to record:

- Qualification score.
- Primary pain.
- Expected first workflow.
- Whether they can use CSV/import or manual opportunity entry.

### Day 0: Onboarding

Operator actions:

1. Confirm early-access expectations.
2. Ask the user to bring one sanitized pipeline slice or one real deal.
3. Have them start with Import CSV, Add Opportunity, or Demo.
4. Record whether they reach first activation during the call.

Target activation:

- CSV import or manual opportunity added.
- Pipeline Defense Brief created.
- Review Pack saved or manager summary copied.

### Day 1-3: First Review Push

Operator actions:

1. Check funnel events for `csv_import_completed`, `pipeline_defense_brief_created`, and `review_pack_saved`.
2. Follow up if they have not imported or added an opportunity.
3. Ask for the first blocker in the exact words they use.

### Day 4-10: Real Usage Window

Operator actions:

1. Encourage one real pipeline review moment.
2. Ask whether the output changed a follow-up, downgrade, rescue, or manager conversation.
3. Record trust concerns and missing capabilities.

### Day 11-14: Closeout Interview

Operator actions:

1. Run the interview script below.
2. Record willingness-to-pay signal.
3. Ask whether the product should be daily workflow, weekly review tool, or not relevant.
4. Decide whether this user is a reference, paid-beta candidate, learning-only user, or not ICP.

## Interview Script

Use this order. Do not sell while asking.

1. Before using Memoire, how did you prepare for pipeline review or forecast conversations?
2. What was the most painful part of keeping deal context current?
3. Did Memoire's demo make sense within 30 seconds?
4. Which first action felt most natural: import CSV, add one opportunity, or try demo?
5. Did you create or review a Pipeline Defense Brief? If not, what stopped you?
6. What part of the brief was useful enough to reuse?
7. What part felt wrong, generic, risky, or not worth trusting?
8. Did Memoire help you decide to defend, rescue, downgrade, or follow up on a deal?
9. Would you use this before your next pipeline review?
10. Would you use it weekly, daily, only before review, rarely, or not at all?
11. What would make you stop using it after week 1?
12. What would need to be true before you put real customer data in it?
13. Would you pay personally, ask your company to pay, or not pay?
14. What price range would feel fair for early access?
15. Who else has this pain strongly enough to try it?

## Stop/Go Criteria

### Go To Paid Offer Design

Proceed to Session 9 pricing and packaging only if at least 5 cohort participants finish the 14-day loop and:

- At least 4/5 create or review a Pipeline Defense Brief.
- At least 3/5 save a Review Pack, copy a manager summary, or use the output in a real review.
- At least 3/5 say they would use it weekly or before pipeline review.
- At least 2/5 show paid intent: personal budget, company budget, or clear willingness to pay after one missing capability.
- No unresolved P0 trust, isolation, deletion, or sync failure occurs.

### Iterate Before Paid Offer

Do not price yet if:

- Users understand the product but fail to reach first review outcome.
- CSV import/manual opportunity entry blocks more than half of qualified users.
- The brief is interesting but not trusted for manager-facing use.
- Users ask for one repeated missing capability that is smaller than a full repositioning.

### Pause Or Reposition

Pause commercialization push if:

- Fewer than 2/5 qualified users reach the Pipeline Defense moment.
- Most users only want CRM sync, manager dashboards, or team forecasting.
- Users will not enter even sanitized pipeline data.
- The strongest repeated pain is not pipeline review, stale follow-up, weak evidence, or account memory.

## Weekly Operating Review

Use `docs/operations/weekly-operating-review-template-2026-06-17.md` as the source of truth for the Friday review.

Review these every Friday during cohort:

- Invited count.
- Activated count: CSV import or manual opportunity.
- Pipeline Defense Brief created count.
- Review Pack saved or manager summary copied count.
- First review completed count.
- Trust blockers.
- Top product blockers.
- Strongest quotes.
- Paid-intent count.
- Support load.
- Any P0 operational issue.

## Source Of Truth

Use these artifacts together:

- Funnel SQL: `docs/product/operator-funnel-queries-2026-06-16.sql`
- Feedback tracker: `docs/product/cohort-feedback-tracker-2026-06-16.csv`
- Outreach templates: `docs/product/cohort-outreach-templates-2026-06-16.md`
- Existing local feedback page: `/app/validation-feedback`

## Required Evidence Before First Invite

Do not invite until the operator has:

- Production environment variable checklist.
- Applied infrastructure controls or accepted written risk.
- Two-account QA pass or accepted written risk.
- Applied funnel migration and confirmed live events.
- Lead retrieval query confirmed.
- Support contact path ready.
- Cohort tracker ready.

## Next Recommended Session

Session 8 should focus on Core Workflow Reliability Pass.

The key question:

Can a real cohort user import or create pipeline data, create a Pipeline Defense Brief, save a Review Pack, return later, and trust that data is still correct?
