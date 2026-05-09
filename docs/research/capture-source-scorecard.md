# Capture Source Scorecard

Scoring scale:

- 1 = weak
- 3 = moderate
- 5 = strong

For implementation effort and privacy risk:

- 1 = low effort / low risk
- 5 = high effort / high risk

| Capture Source | User Demand | Frequency | Context Richness | Implementation Effort | Privacy Risk | Retention Impact | Strategic Fit | Notes |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Manual Quick Capture | 3 | 4 | 4 | 1 | 1 | 3 | 5 | Fastest to validate. Risk is behavior tax. Works only if output is immediately valuable. |
| Gmail / email thread import | 4 | 5 | 5 | 4 | 5 | 5 | 4 | Likely rich for objections and follow-ups. High privacy and permission burden. |
| Calendar meeting context | 3 | 4 | 2 | 3 | 3 | 3 | 3 | Useful for meeting timing and account names, but weak without notes/transcripts. |
| Meeting transcript import | 3 | 3 | 5 | 4 | 4 | 4 | 4 | Rich context when available. May not cover calls, site visits, WhatsApp, or email-heavy sellers. |
| Voice note capture | 3 | 3 | 4 | 3 | 3 | 4 | 4 | Useful after field visits/calls. Depends on user habit and transcription quality. |
| CRM import later | 2 | 3 | 3 | 5 | 4 | 3 | 2 | May help migration later, but risks making Memoire feel like CRM infrastructure. Not ideal for wedge validation. |

## Initial Read

Best validation path:

1. Start with Manual Quick Capture to test whether the output is valuable enough.
2. Use interviews to identify whether one auto-capture source clearly wins.
3. Do not build integration until the winning capture source is obvious.

## Source Notes

### Manual Quick Capture

Strength:

- simple
- private
- fast to test
- keeps user control

Risk:

- may feel like admin work
- depends on habit formation

### Gmail / Email Thread Import

Strength:

- high context richness
- captures real customer language
- useful for follow-ups and objections

Risk:

- high privacy sensitivity
- OAuth/security work
- users may not want broad inbox access

### Calendar Meeting Context

Strength:

- helps identify meetings and cadence
- lower context burden than email

Risk:

- often lacks actual discussion detail
- may produce weak stuck-deal signals alone

### Meeting Transcript Import

Strength:

- rich for objections, pain points, next actions

Risk:

- fragmented sources
- not every interaction is recorded
- privacy and consent concerns

### Voice Note Capture

Strength:

- useful immediately after a call or visit
- lower friction than typing for some users

Risk:

- still manual
- transcription quality and user habit uncertainty

### CRM Import Later

Strength:

- can provide account/opportunity scaffold

Risk:

- not enough customer story
- pulls Memoire toward CRM clone territory
- high integration effort
