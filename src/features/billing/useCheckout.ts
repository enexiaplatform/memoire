import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

export function useCheckout() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCheckout = async (priceId: string) => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          authToken: session?.access_token,
          priceId,
        }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      window.location.href = data.url;
    } catch (err: any) {
      console.error('Checkout failed', err);
      setError('Checkout failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const openPortal = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/create-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          authToken: session?.access_token,
        }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      window.location.href = data.url;
    } catch (err: any) {
      console.error('Portal failed', err);
      setError('Could not open billing portal.');
    } finally {
      setLoading(false);
    }
  };

  return { startCheckout, openPortal, loading, error };
}
