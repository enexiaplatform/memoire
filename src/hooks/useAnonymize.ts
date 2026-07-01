import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { AnonymizationSuggestion } from '../types/anonymization';

export function useAnonymize() {
  const [isAnonymizing, setIsAnonymizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestAnonymization = async (text: string): Promise<AnonymizationSuggestion | null> => {
    setIsAnonymizing(true);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) throw new Error('Sign in again before anonymizing this note.');

      const response = await fetch('/api/anonymize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, authToken: token }),
      });

      if (!response.ok) {
        throw new Error('Memoire could not anonymize this note. Please retry.');
      }

      const raw = await response.json();
      setIsAnonymizing(false);
      return raw as AnonymizationSuggestion;
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Memoire could not anonymize this note. Please retry.');
      setIsAnonymizing(false);
      return null;
    }
  };

  return { suggestAnonymization, isAnonymizing, error };
}
