import { usePlanLimits, PLAN_LIMITS } from '../../hooks/usePlanLimits';

export function UsageMeter() {
  const { currentTier, capturesThisMonth, entityCount, loading } = usePlanLimits();

  if (loading) return <div className="text-sm text-gray-500">Loading workspace activity...</div>;

  const capsLimit = PLAN_LIMITS[currentTier].captures_per_month;
  const entLimit = PLAN_LIMITS[currentTier].max_entities;

  const capsPercent = capsLimit === Infinity ? 0 : Math.min(100, Math.round((capturesThisMonth / capsLimit) * 100));
  const entPercent = entLimit === Infinity ? 0 : Math.min(100, Math.round((entityCount / entLimit) * 100));

  const capsText = capsLimit === Infinity ? 'No cohort cap' : capsLimit.toString();
  const entText = entLimit === Infinity ? 'No cohort cap' : entLimit.toString();

  return (
    <div className="space-y-6">
      <h3 className="border-b border-gray-200 pb-2 font-display text-[15px] font-semibold uppercase tracking-wider text-navy">Workspace activity</h3>
      
      <div className="space-y-4">
        {/* Captures */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <span className="font-body text-[14px] font-medium text-gray-700">Captures this month</span>
            <span className="text-[14px] font-body text-gray-500">{capturesThisMonth} / {capsText}</span>
          </div>
          {capsLimit !== Infinity && (
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${capsPercent > 90 ? 'bg-red-500' : capsPercent > 75 ? 'bg-amber-400' : 'bg-brand-blue'}`} 
                style={{ width: `${capsPercent}%` }}
              ></div>
            </div>
          )}
        </div>

        {/* Entities */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <span className="font-body text-[14px] font-medium text-gray-700">Memory records</span>
            <span className="text-[14px] font-body text-gray-500">{entityCount} / {entText}</span>
          </div>
          {entLimit !== Infinity && (
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${entPercent > 90 ? 'bg-red-500' : entPercent > 75 ? 'bg-amber-400' : 'bg-brand-blue'}`} 
                style={{ width: `${entPercent}%` }}
              ></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
