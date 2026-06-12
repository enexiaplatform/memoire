import { useEffect, useState } from 'react';
import { DEMO_MODE_CHANGED_EVENT, isDemoWorkspaceActive } from '../lib/demoMode';
import { SAMPLE_DATA_UPDATED_EVENT } from '../utils/sampleData';

export function useDemoWorkspaceMode() {
  const [active, setActive] = useState(() => isDemoWorkspaceActive());

  useEffect(() => {
    const refresh = () => setActive(isDemoWorkspaceActive());
    window.addEventListener(DEMO_MODE_CHANGED_EVENT, refresh);
    window.addEventListener(SAMPLE_DATA_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(DEMO_MODE_CHANGED_EVENT, refresh);
      window.removeEventListener(SAMPLE_DATA_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return active;
}
