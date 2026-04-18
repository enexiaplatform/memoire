import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import type { SearchResponse } from './types';

export function useSearch() {
  const { user } = useAuth();
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchMemory = async (query: string) => {
    if (!user || !query.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          userId: user.id,
          authToken: session?.access_token,
        }),
      });

      if (!response.ok) {
        throw new Error('Search request failed');
      }

      const data: SearchResponse = await response.json();
      if ((data as any).error) throw new Error((data as any).error);

      setResults(data);
    } catch (err: any) {
      console.error(err);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const clearSearch = () => {
    setResults(null);
    setError(null);
  };

  return { searchMemory, results, loading, error, clearSearch };
}
