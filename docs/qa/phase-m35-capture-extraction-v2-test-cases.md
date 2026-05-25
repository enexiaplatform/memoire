# Phase M.35 Capture Extraction v2 Test Cases

## Primary VHP fixture

Input:

```text
Met with Dr. Linh at VHP today. They confirmed budget approval for SolidFog Phase 2 next quarter. Need to send revised quote by Friday and follow up with procurement next Tuesday. Competitor STERIS still in the loop.
```

Expected extraction:

- `accountName`: `VHP`
- `contactName` or `stakeholderName`: `Dr. Linh`
- `stakeholderRole`: `Doctor` if captured
- `opportunityName`: `SolidFog Phase 2`
- Suggested opportunity: `VHP / SolidFog EU-GMP Phase 2` should rank Medium or High when that opportunity exists
- `competitors`: `STERIS`
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
Follow up with TV Pharm tomorrow about the revised pricing.
```

Expected:

- Activity type: `Follow-up`
- Account may be `TV Pharm`
- One next action
- Due date resolves to tomorrow

## Internal supplier coordination

Input:

```text
Internal sync with application team. Need to prepare validation proof for Control Union.
```

Expected:

- Activity type: `Internal coordination`
- Next action: `Prepare validation proof for Control Union`
- No competitor unless explicitly mentioned

## Competitor without account

Input:

```text
Competitor STERIS is still pushing hard. Need to confirm where we stand.
```

Expected:

- `competitors`: `STERIS`
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
