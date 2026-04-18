// Claude API wrapper
// All Claude API calls go through the server-side proxy at /api/claude-extract
// This keeps the ANTHROPIC_API_KEY server-side only

const API_URL = '/api/claude-extract';

export interface ExtractionResult {
  result: unknown;
}

export async function extractEntities(rawText: string): Promise<ExtractionResult> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText }),
  });

  if (!response.ok) {
    throw new Error(`Claude extraction failed: ${response.statusText}`);
  }

  return response.json();
}
