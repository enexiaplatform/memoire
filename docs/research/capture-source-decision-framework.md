# Capture Source Decision Framework

## Core Decision Rule

Use 10 target ICP interviews before deciding whether to keep manual capture, prototype a capture source, or pause feature building.

Do not build integrations before these interviews are complete.

## Scenario A - Manual Capture Viable For Beta

Criteria:

- >=6/10 users are willing to manual capture for at least 7 days.
- >=4/10 users are willing to capture after important deals/calls.

Decision:

Keep manual Quick Capture for beta and improve the immediate reward loop.

What to do next:

- Make capture produce visible stuck-deal value faster.
- Improve confirmation after capture.
- Show how one captured interaction changes Account Memory and the stuck-deal queue.

What not to do yet:

- Do not build Gmail integration.
- Do not build Calendar integration.
- Do not build transcript integration.
- Do not build voice capture.
- Do not build CRM sync.

## Scenario B - Manual Capture Weak But One Source Wins

Criteria:

- <4/10 users are willing to manual capture for 7 days.
- >=6/10 users choose the same auto-capture source.

Decision:

Prototype that source lightly.

Source-specific prototype rules:

- Email: paste email thread first, OAuth later.
- Calendar: manual meeting prep first, Google Calendar later.
- Transcript: paste/upload transcript first, recorder integration later.
- Voice: voice-to-memory only if users strongly prefer it.
- CRM: treat as later import only, not first wedge unless users strongly demand it.

What to do next:

- Build the smallest user-controlled prototype for the winning source.
- Validate whether that source creates useful stuck-deal signals.
- Re-test with 3-5 users before considering a full integration.

What not to do yet:

- Do not jump directly to OAuth.
- Do not build background sync.
- Do not create a CRM-style import product.

## Scenario C - No Clear Source And No Manual Habit

Criteria:

- <3/10 users are willing to manual capture.
- No source gets >=5/10 preference.

Decision:

Pause feature building and rethink wedge or ICP.

What to do next:

- Revisit whether technical B2B sellers feel enough urgency.
- Revisit whether "catch deals before they go silent" is the right first wedge.
- Revisit whether the product needs a different capture entry point.

What not to do:

- Do not keep adding product features.
- Do not build integrations hoping behavior will appear later.
- Do not broaden into CRM, forecasting, or generic AI assistant territory.

## Decision Matrix

| Interview Result | Scenario | Decision |
|---|---|---|
| >=6/10 accept manual capture for 7 days and >=4/10 accept important-call capture | Scenario A | Keep manual Quick Capture for beta |
| <4/10 accept manual capture and one source has >=6/10 preference | Scenario B | Prototype winning source lightly |
| <3/10 accept manual capture and no source reaches >=5/10 preference | Scenario C | Pause feature building and rethink wedge or ICP |
| Strong privacy rejection on winning source | Scenario B review | Test a manual/paste version before integration |

## What Counts As Manual Capture Acceptance

Count as acceptance only if the user says something like:

- "Yes, I would use it after calls for a week."
- "I would paste notes if it gave me the stuck-deal queue."
- "I already write notes, so this would replace where they go."
- "I would use it after important customer calls, but not every interaction."

Do not count vague positive reactions:

- "Sounds useful."
- "Maybe."
- "I should do that."
- "My team might like it."

## What Counts As Source Preference

Count a preferred source only if the user can explain:

- what context lives there
- why it is useful
- how often it would be relevant
- privacy boundary required
- whether they would accept a lightweight prototype first

## Final Recommendation Format

After 10 interviews, summarize:

1. Manual capture for 7 days count
2. Important deals/calls capture count
3. Top capture source
4. Source preference count
5. Privacy blockers
6. Strongest quotes
7. Scenario A/B/C classification
8. Recommended beta capture strategy
9. What not to build yet
