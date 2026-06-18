# Sales Operating Setup Blueprint

Date: 2026-06-18

## Product Intent

Memoire should ask new users whether they want to set up their sales operating context before they start capturing daily work. The setup is not another CRM configuration screen. It is the business frame Memoire uses to connect notes, opportunities, activity logs, reviews, and next actions back to outcomes.

## First-Run Prompt

Recommended copy:

> Set up Sales Operating Context so Memoire can connect daily activity to target, GTM focus, route-to-market plan, sales cycle, and execution intelligence.

Primary options:

- Setup now
- Skip for now
- Use demo or imported data first

## Setup Sections

### 1. Sales Target

Purpose: define the number Memoire should help the user move toward.

Capture:

- Revenue target by month, quarter, or year
- Deal, customer, retention, or upsell target
- Split by product, territory, team, or channel

Memoire output:

- Gap-to-target
- Forecast pressure
- Activity needed to hit plan

### 2. GTM Target

Purpose: define who the user is prioritizing and which message matters.

Capture:

- ICP
- Priority segment, market, geography, or industry
- Offer or product focus
- Core pain and sales message

Memoire output:

- ICP focus
- Segment priority
- Outreach angles
- Market signals to watch

### 3. RTM Target

Purpose: define the route used to reach each customer type.

Capture:

- Direct sales vs partner, distributor, reseller, online, or key account route
- Channel contribution target
- Coverage by region, segment, or account tier

Memoire output:

- Channel coverage gaps
- Partner/direct split
- Route-specific next actions

### 4. P&L Guardrails

Purpose: optional profitability context when the user needs commercial discipline beyond revenue.

Capture:

- Gross margin target
- Sales and marketing budget
- CAC or cost per lead
- Commission or partner margin
- Operating cost assumptions

Memoire output:

- Margin risk
- Budget pressure
- Revenue that looks good but is not healthy

### 5. Sales Cycle

Purpose: define how opportunities move from lead to closed-won.

Capture:

- Stages
- Average cycle length
- Conversion assumptions
- Owners per stage
- Common blockers

Memoire output:

- Stage health
- Stuck-deal warnings
- Conversion risk
- Next-step suggestions

### 6. Daily Activity Log Intelligence

Purpose: define what the team should submit every day so Memoire can learn from execution.

Capture:

- Meetings, calls, demos, dealer updates, proposals, and follow-ups
- Deal progress
- Stuck deals
- Customer insight
- Objections and competitor signals
- Next actions for tomorrow

Memoire output:

- Activity quality
- ICP alignment
- Risk trends
- Forecast confidence
- Tomorrow priorities

## Current MVP Implementation

The MVP is local-first and available at `/app/onboarding/sales-operating-setup`.

Implemented behavior:

- Six setup sections with P&L optional
- Local browser persistence under `memoire.salesOperatingSetup.v1`
- Readiness progress based on required sections
- Dashboard entry inside Review setup
- First-run empty dashboard CTA
- Settings entry

## Future Upgrade Path

- Cloud sync per user/workspace
- AI suggestion from imported CSV, notes, and activity history
- Use setup digest in Ask Memoire context
- Compare daily activity mix against Sales Target, GTM Target, and RTM Target
- Add setup review prompts to weekly pipeline review
