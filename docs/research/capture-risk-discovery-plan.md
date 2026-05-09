# Capture Risk Discovery Plan

## Research Goal

Validate whether technical B2B salespeople will consistently put customer context into Memoire often enough for the product to catch deals before they go silent.

The goal is not to prove that Memoire is useful in theory. The goal is to learn whether the capture behavior is realistic in daily sales work.

## Key Risk

Memoire depends on fresh customer context.

If users do not capture meeting notes, customer replies, objections, and follow-up commitments, Memoire cannot reliably surface:

- deals going silent
- missing follow-ups
- unresolved objections
- weak decision context
- account memory before follow-up

Manual Quick Capture may be perceived as a tax rather than a habit.

## Target ICP

Primary ICP:

- technical B2B salespeople
- consultative sellers
- account managers
- business development managers
- technical sales / application sales
- long, relationship-driven sales cycles

Ideal interview profile:

- manages 20+ active accounts or opportunities
- has sales cycles longer than 30 days
- regularly handles objections, technical clarification, procurement, and follow-up
- currently uses notes, email, spreadsheets, CRM, chat, or memory to track account context

## Hypotheses

1. Technical B2B salespeople already lose deal context after calls, meetings, and customer messages.
2. The strongest remembered pain is not note taking, but forgotten follow-up and accounts going silent.
3. Manual Quick Capture is acceptable only if it takes under 60 seconds and immediately produces visible value.
4. Some users will tolerate manual capture for beta if Memoire clearly catches stuck deals before they go quiet.
5. Email threads are likely rich but may raise privacy and implementation concerns.
6. Calendar context helps identify meetings but may not contain enough deal detail by itself.
7. Meeting transcripts are rich but may be less frequent or harder to access for field/technical sellers.
8. Voice notes may be useful after calls or site visits, but behavior and privacy comfort are uncertain.
9. CRM import is strategically useful later, but should not be the first capture dependency if Memoire is not a CRM clone.

## Capture Source Candidates

1. Manual Quick Capture
2. Email thread import
3. Calendar meeting context
4. Meeting transcript import
5. Voice note capture
6. CRM import later

## Interview Plan

Interview 10 target users before changing product direction.

Recommended mix:

- 4 technical sales / application sales reps
- 3 account managers
- 2 business development managers
- 1 founder-led sales operator

Run the interview in this order:

1. Ask workflow questions before showing the demo.
2. Ask after-call and follow-up behavior questions.
3. Ask manual capture willingness questions.
4. Ask source preference and privacy questions.
5. Show the demo only after workflow reality is captured.
6. Ask whether the demo changes capture willingness.

Each interview should cover:

- how they prepare for follow-up
- what happens after a customer call or meeting
- where account context currently lives
- whether they forget follow-ups or let deals go silent
- whether they would manually capture notes for at least 7 days
- whether they would capture only after important deals/calls
- which auto-capture source they would trust most
- what privacy boundaries matter

## Success Criteria

Manual capture beta signal:

- At least 6/10 users say they would use Manual Quick Capture for at least 7 days.
- At least 4/10 users say they would capture after important deals/calls.
- At least 5/10 users describe a specific recent deal that went silent because context or follow-up was missed.
- At least 5/10 users say the stuck-deal queue would be useful before they add more data.

Auto-capture source signal:

- At least 6/10 users choose the same auto-capture source.
- Users can clearly explain why that source would capture meaningful customer context.
- Privacy concerns are manageable with explicit user control.

## Kill Criteria

Pause feature building if:

- Fewer than 3/10 users would use manual capture.
- No capture source receives clear preference from at least 5/10 users.
- Users describe the capture burden as worse than the missed-follow-up pain.
- Users do not see stuck-deal detection as valuable enough to justify any capture behavior.
- Privacy objections block access to the most useful context sources.

## Scenario-Based Decision Framework

### Scenario A - Manual Capture Viable For Beta

Criteria:

- >=6/10 users are willing to manual capture for at least 7 days.
- >=4/10 users are willing to capture after important deals/calls.

Decision:

Keep manual Quick Capture for beta and improve the immediate reward loop.

Implication:

- Do not build integrations yet.
- Make capture feel worth it immediately.
- Improve the path from capture to stuck-deal detection, Account Memory, and next action.

### Scenario B - Manual Capture Weak But One Source Wins

Criteria:

- <4/10 users are willing to manual capture for 7 days.
- >=6/10 users choose the same auto-capture source.

Decision:

Prototype that source lightly before building a full integration.

Prototype options:

- Email: paste email thread first, OAuth later.
- Calendar: manual meeting prep first, Google Calendar later.
- Transcript: paste/upload transcript first, recorder integration later.
- Voice: voice-to-memory only if users strongly prefer it.

Implication:

- Do not jump straight to OAuth or integration work.
- Validate the capture source with user-controlled input first.
- Keep the wedge focused on catching deals before they go silent.

### Scenario C - No Clear Source And No Manual Habit

Criteria:

- <3/10 users are willing to manual capture.
- No source gets >=5/10 preference.

Decision:

Pause feature building and rethink wedge or ICP.

Implication:

- Do not continue adding product features.
- Revisit whether the ICP has enough urgency.
- Revisit whether the wedge needs a different entry point.
