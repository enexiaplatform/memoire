# Capture AI Provider Setup

Daily Capture AI Assist is optional. The app still works without AI configuration and falls back to local rule-based classification.

## Architecture

Frontend calls:

```text
POST /api/capture-ai-classify
```

The Vercel serverless endpoint calls the configured OpenAI-compatible provider using server-only environment variables.

The browser never receives the provider API key.

## Environment Variables

Public frontend variable:

```env
VITE_CAPTURE_AI_ENDPOINT=/api/capture-ai-classify
```

Server-only variables:

```env
CAPTURE_AI_PROVIDER=openai-compatible
CAPTURE_AI_ENDPOINT=
CAPTURE_AI_API_KEY=
CAPTURE_AI_MODEL=
```

Important:

- `CAPTURE_AI_API_KEY` must not be prefixed with `VITE_`.
- Any `VITE_*` variable is exposed to the client bundle by Vite.
- Do not use `VITE_CAPTURE_AI_API_KEY` or `VITE_CAPTURE_AI_MODEL`.
- Do not commit real API keys.

## Provider Endpoint Shape

`CAPTURE_AI_ENDPOINT` should be an OpenAI-compatible chat completions endpoint.

Expected request support:

- `model`
- `messages`
- `temperature`
- `response_format`

Expected response:

```json
{
  "choices": [
    {
      "message": {
        "content": "{\"activityType\":\"Customer meeting\"}"
      }
    }
  ]
}
```

If the provider rejects `response_format`, the serverless endpoint retries once without it and still attempts strict JSON parsing.

## Privacy Warning

When AI Assist is configured, the raw Daily Capture note is sent to the configured server-side AI endpoint.

Users should not use AI Assist for confidential customer data unless the AI provider is approved for that data.

Only lightweight context is sent:

- account names
- opportunity names
- opportunity stage
- product or solution
- account segment
- account industry

Memoire does not send full activity history, linked notes, account notes, opportunity evidence, or pipeline defense briefs to the Capture AI provider.

## Disable AI

Leave any server-only variable empty, or set:

```env
CAPTURE_AI_PROVIDER=
```

Then `/api/capture-ai-classify` returns:

```text
503 Capture AI is not configured on the server.
```

The Capture page keeps local rule-based classification available.

## Local Test

1. Leave server-only Capture AI vars empty.
2. Run the app.
3. Open `/app/capture`.
4. Enter a note.
5. Click `Classify with AI`.
6. Confirm the app shows: `AI Assist is not configured on the server. Local rules are still available.`
7. Confirm local preview and Save Activity still work.
8. Add server-only env vars.
9. Restart the dev server.
10. Repeat and confirm an AI suggestion appears.

Endpoint test:

```bash
curl -X POST http://localhost:5173/api/capture-ai-classify \
  -H "Content-Type: application/json" \
  -d "{\"rawNote\":\"Met Northstar Foods, need to send lead time proof this week.\",\"activityDate\":\"2026-05-24\"}"
```

Without server AI vars, expect HTTP 503.

## Vercel Test

1. Add server-only env vars in Vercel Project Settings.
2. Redeploy.
3. Open `/app/capture`.
4. Enter a test note.
5. Click `Classify with AI`.
6. Confirm suggestion appears.
7. Remove or unset server vars and redeploy to verify the 503 fallback path.

## Intentionally Not Built

- Gmail integration
- Google Calendar integration
- Salesforce or HubSpot sync
- automatic opportunity/account updates
- background AI classification
- exposing provider API key to the browser
- hardcoded API keys
