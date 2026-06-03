# Phase M.35 Capture Extraction v2 Test Cases

## Primary Apex Labs fixture

Input:

```text
Met with Dr. Avery at Apex Labs today. They confirmed budget approval for Validation Expansion next quarter. Need to send revised quote by Friday and follow up with procurement next Tuesday. Competitor Incumbent Vendor still in the loop.
```

Expected extraction:

- `accountName`: `Apex Labs`
- `contactName` or `stakeholderName`: `Dr. Avery`
- `stakeholderRole`: `Doctor` if captured
- `opportunityName`: `Validation Expansion`
- Suggested opportunity: `Apex Labs / Validation Expansion` should rank Medium or High when that opportunity exists
- `competitors`: `Incumbent Vendor`
- `buyingSignals`: `Budget approved`
- `timelineSignals`: `Next quarter`
- `risks`: `Competitor still active`
- `nextActions`:
  - `Send revised quote`, due on the upcoming Friday from the selected activity date
  - `Follow up with procurement`, due on the next Tuesday from the selected activity date
- Backward-compatible fields:
  - `nextAction`: first action
  - `dueDate`: first action due date

## Simple follow-up

Input:

```text
Follow up with Orion Pharma tomorrow about the revised pricing.
```

Expected:

- Activity type: `Follow-up`
- Account may be `Orion Pharma`
- One next action
- Due date resolves to tomorrow

## Internal supplier coordination

Input:

```text
Internal sync with application team. Need to prepare validation proof for Northstar Foods.
```

Expected:

- Activity type: `Internal coordination`
- Next action: `Prepare validation proof for Northstar Foods`
- No competitor unless explicitly mentioned

## Competitor without account

Input:

```text
Competitor Incumbent Vendor is still pushing hard. Need to confirm where we stand.
```

Expected:

- `competitors`: `Incumbent Vendor`
- `risks`: competitor active signal
- Account may remain empty

## Multiple actions without dates

Input:

```text
Need to send brochure and schedule demo with procurement.
```

Expected:

- Multiple or at least one next action
- Due date may remain empty

## No clear account

Input:

```text
Had a quick call today. Customer asked for support details and a revised quote.
```

Expected:

- Activity type: `Quote / proposal` or `Customer meeting`
- Account remains empty
- Summary and next action remain editable before save
