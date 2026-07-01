import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, X } from 'lucide-react';
import { usePlanLimits, PLAN_LIMITS } from '../../hooks/usePlanLimits';

export function PaywallBanner() {
  const { currentTier, capturesThisMonth, isNearCaptureLimit, isAtCaptureLimit, loading } = usePlanLimits();
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  if (loading || currentTier !== 'free' || dismissed || isAtCaptureLimit || !isNearCaptureLimit) {
    return null;
  }

  const limit = PLAN_LIMITS.free.captures_per_month;
  const remaining = limit - capturesThisMonth;

  return (
    <div className="relative mb-6 rounded-r-md border-l-4 border-amber-400 bg-amber-50 p-4">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
        </div>
        <div className="ml-3 flex flex-1 items-center justify-between">
          <div>
            <p className="text-sm font-medium text-amber-700">
              {remaining} {remaining === 1 ? 'capture' : 'captures'} remaining this month.
            </p>
            <p className="mt-1 text-sm text-amber-600">
              Request early access when you are ready to keep more sales memory.
            </p>
          </div>
          <div className="ml-4 flex flex-shrink-0 gap-2">
            <button
              onClick={() => navigate('/pricing')}
              className="rounded bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-200"
            >
              See access options
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="p-1 text-amber-500 hover:text-amber-700"
              aria-label="Dismiss capture limit notice"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
