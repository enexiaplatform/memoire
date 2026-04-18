import type { ExtractionResponse } from '../features/capture/types';

const API_URL = '/api/claude-extract';

export async function extractEntities(
  rawText: string,
  existingEntities?: { id: string; name: string; entity_type: string }[]
): Promise<ExtractionResponse> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText, existingEntities }),
  });

  if (!response.ok) {
    throw new Error(`Claude extraction failed: ${response.statusText}`);
  }

  return response.json();
}
