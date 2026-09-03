import { useCallback, useEffect, useState } from 'react';
import { useAuthContext } from '../../auth/authContext';
import { hasLocalSampleData } from '../../utils/dataMode';
import { useCommercialThreads } from '../threads/useCommercialThreads';
import type { CoverageReport } from '../../domain/commercialKernel/forecast';
import {
  loadTargets,
  loadTargetsForWorkspace,
  TARGETS_UPDATED_EVENT,
  type CommercialTarget,
} from '../../services/commercialKernel/targetStore';

const EMPTY: CoverageReport = {
  quarters: [],
  currentQuarter: 'Q1',
  hasTargets: false,
  unsupportedValue: 0,
  unsupportedDeals: [],
  unbackedQuarters: 0,
  unbackedValue: 0,
  unqualifiedByBrand: [],
};

/**
 * Coverage for the Money page.
 *
 * The report itself comes from `useCommercialThreads`, which already builds it
 * to feed the quarter-level rules. Recomputing it here would let the panel and
 * the warning on Today disagree about the same quarter - which is exactly the
 * kind of split that makes a forecast impossible to trust. This hook only adds
 * the target list, which the editor needs.
 */
export function useCoverage() {
  const { user } = useAuthContext();
  const sampleDataActive = hasLocalSampleData();
  const dataUserId = sampleDataActive ? undefined : user?.id;

  const { coverage } = useCommercialThreads();
  const [targets, setTargets] = useState<CommercialTarget[]>(() => loadTargets());
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    void loadTargetsForWorkspace(dataUserId, sampleDataActive)
      .then((loaded) => { if (active) setTargets(loaded); })
      .catch(() => undefined);

    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<CommercialTarget[]>).detail;
      if (Array.isArray(detail)) setTargets(detail);
    };
    window.addEventListener(TARGETS_UPDATED_EVENT, onUpdate);
    return () => { active = false; window.removeEventListener(TARGETS_UPDATED_EVENT, onUpdate); };
  }, [dataUserId, sampleDataActive, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { coverage: coverage || EMPTY, targets, reload };
}
