# Capture AI Provider Setup

Phase M.31 adds optional AI-assisted classification for Daily Capture. The app still works without these settings and falls back to local rule-based classification.

## Environment Variables

Set these only if you want to enable AI Assist:

```env
VITE_CAPTURE_AI_ENDPOINT=
VITE_CAPTURE_AI_API_KEY=
VITE_CAPTURE_AI_MODEL=
```

Expected endpoint shape:

- OpenAI-compatible chat completions endpoint.
- Accepts `model`, `messages`, `temperature`, and `response_format`.
- Returns JSON content in `choices[0].message.content`.

Example endpoint format:

```text
https://your-provider.example.com/v1/chat/completions
```

Do not commit real API keys.

## Privacy Warning

When AI Assist is configured, the raw Daily Capture note may be sent to the configured AI provider.

Users should not use AI Assist for confidential customer data unless that provider has been approved for the data being entered.

Only lightweight account/opportunity context is sent:

- account names
- opportunity names
- opportunity stage
- product or solution
- account segment
- account industry

Memoire does not send full activity history, linked notes, account notes, opportunity evidence, or pipeline defense briefs to the Capture AI provider.

## How To Disable AI

Leave any of these variables empty:

- `VITE_CAPTURE_AI_ENDPOINT`
- `VITE_CAPTURE_AI_API_KEY`
- `VITE_CAPTURE_AI_MODEL`

When disabled, `/app/capture` shows:

```text
AI Assist unavailable
```

The app continues using local deterministic rules.

## Fallback Behavior

If the AI request fails:

- the raw note stays in the textarea
- the user sees `AI Assist failed. Local rules are still available.`
- local structured preview remains available
- saving activity still works

## How To Test

1. Run the app with no Capture AI env vars.
2. Open `/app/capture`.
3. Confirm local preview works and `Classify with AI` is unavailable.
4. Add the three Capture AI env vars.
5. Restart the dev server or redeploy.
6. Open `/app/capture`.
7. Enter a note.
8. Click `Classify with AI`.
9. Confirm an AI suggestion appears.
10. Click `Accept suggestion`.
11. Edit the structured preview if needed.
12. Click `Save Activity`.
13. Confirm activity saves to localStorage or Supabase depending on auth mode.

## Intentionally Not Built

- Gmail integration
- Google Calendar integration
- Salesforce or HubSpot sync
- automatic opportunity/account updates
- background AI classification
- server-side AI proxy
- hardcoded API keys
