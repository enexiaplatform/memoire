import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
    <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-6 rounded-r-md relative">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <span className="text-amber-400 text-lg">⚠️</span>
        </div>
        <div className="ml-3 flex-1 flex items-center justify-between">
          <div>
            <p className="text-sm text-amber-700 font-medium">
              {remaining} {remaining === 1 ? 'capture' : 'captures'} remaining this month.
            </p>
            <p className="text-sm text-amber-600 mt-1">
              Upgrade to Personal for unlimited captures.
            </p>
          </div>
          <div className="ml-4 flex-shrink-0 flex gap-2">
            <button
              onClick={() => navigate('/pricing')}
              className="px-3 py-1.5 text-sm font-medium rounded bg-amber-100 text-amber-800 hover:bg-amber-200"
            >
              Upgrade — $19/mo →
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="text-amber-500 hover:text-amber-700 p-1"
            >
              &times;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
