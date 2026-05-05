import { useEffect, useState } from 'react';

export function useSlowLoadingFallback(loading: boolean, timeoutMs = 9000) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), timeoutMs);
    return () => window.clearTimeout(timer);
  }, [loading, timeoutMs]);

  return slow;
}
