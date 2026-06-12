import type { ExtractionResponse } from '../features/capture/types';
import { supabase } from './supabase';

const API_URL = '/api/claude-extract';

export async function extractEntities(
  rawText: string,
  existingEntities?: { id: string; name: string; entity_type: string }[]
): Promise<ExtractionResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Sign in is required for AI extraction.');
  }
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText, existingEntities, authToken: session.access_token }),
  });

  if (!response.ok) {
    throw new Error(`Claude extraction failed: ${response.statusText}`);
  }

  return response.json();
}
