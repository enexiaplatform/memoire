import { usePlanLimits, PLAN_LIMITS } from '../../hooks/usePlanLimits';

export function UsageMeter() {
  const { currentTier, capturesThisMonth, entityCount, loading } = usePlanLimits();

  if (loading) return <div className="text-gray-500 text-sm">Loading usage...</div>;

  const capsLimit = PLAN_LIMITS[currentTier].captures_per_month;
  const entLimit = PLAN_LIMITS[currentTier].max_entities;

  const capsPercent = capsLimit === Infinity ? 0 : Math.min(100, Math.round((capturesThisMonth / capsLimit) * 100));
  const entPercent = entLimit === Infinity ? 0 : Math.min(100, Math.round((entityCount / entLimit) * 100));

  const capsText = capsLimit === Infinity ? 'Unlimited' : capsLimit.toString();
  const entText = entLimit === Infinity ? 'Unlimited' : entLimit.toString();

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">Usage this month</h3>
      
      <div className="space-y-4">
        {/* Captures */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-medium text-gray-700">Captures</span>
            <span className="text-sm text-gray-500">{capturesThisMonth} / {capsText}</span>
          </div>
          {capsLimit !== Infinity && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${capsPercent > 90 ? 'bg-red-500' : capsPercent > 75 ? 'bg-amber-400' : 'bg-memoire-500'}`} 
                style={{ width: `${capsPercent}%` }}
              ></div>
            </div>
          )}
        </div>

        {/* Entities */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-medium text-gray-700">Entities</span>
            <span className="text-sm text-gray-500">{entityCount} / {entText}</span>
          </div>
          {entLimit !== Infinity && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${entPercent > 90 ? 'bg-red-500' : entPercent > 75 ? 'bg-amber-400' : 'bg-memoire-500'}`} 
                style={{ width: `${entPercent}%` }}
              ></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
