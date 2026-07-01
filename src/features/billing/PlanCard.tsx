import { useNavigate } from 'react-router-dom';
import { usePlanLimits } from '../../hooks/usePlanLimits';

export function PlanCard() {
  const { currentTier, loading } = usePlanLimits();
  const navigate = useNavigate();

  if (loading) return null;

  const planDetails = {
    free: { name: 'Starter access', price: 'Early access', description: 'Demo and controlled-cohort limits apply' },
    personal: { name: 'Cohort access', price: 'Active', description: 'Controlled access is active' },
    team: { name: 'Team access', price: 'Inactive', description: 'Team billing is not enabled' },
  };

  const { name, price, description } = planDetails[currentTier];

  return (
    <div className="space-y-6">
      <h3 className="border-b border-gray-200 pb-2 font-display text-[15px] font-semibold uppercase tracking-wider text-navy">
        Current plan
      </h3>

      <div className="rounded-[12px] bg-white p-5 shadow-card">
        <div className="mb-2 flex items-start justify-between">
          <div>
            <h4 className="font-display text-[16px] font-bold text-navy">{name}</h4>
            <p className="mt-1 font-body text-[14px] text-gray-500">{description}</p>
          </div>
          <div className="text-right">
            <span className="font-display text-[16px] font-bold text-navy">{price}</span>
          </div>
        </div>
      </div>

      {currentTier === 'free' ? (
        <button
          onClick={() => navigate('/pricing')}
          className="rounded-full bg-brand-blue px-5 py-2.5 font-display text-[15px] font-semibold text-white transition-all hover:bg-brand-blue-dark active:scale-[0.98]"
        >
          See access options
        </button>
      ) : (
        <p className="text-sm font-medium text-gray-500">
          Billing management is not enabled during the controlled cohort.
        </p>
      )}
    </div>
  );
}
