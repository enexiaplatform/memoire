import { usePlanLimits } from '../../hooks/usePlanLimits';
import { useCheckout } from './useCheckout';
import { useNavigate } from 'react-router-dom';

export function PlanCard() {
  const { currentTier, loading } = usePlanLimits();
  const { openPortal, loading: portalLoading } = useCheckout();
  const navigate = useNavigate();

  if (loading) return null;

  const planDetails = {
    free: { name: 'Free Plan', price: '$0/mo', description: '30 captures/month · 50 entities max' },
    personal: { name: 'Personal Plan', price: '$19/month', description: 'Status: Active' },
    team: { name: 'Team Plan', price: '$39/month', description: 'Status: Active' },
  };

  const { name, price, description } = planDetails[currentTier];

  return (
    <div className="space-y-6">
      <h3 className="text-[15px] font-semibold font-display text-navy border-b border-gray-200 pb-2 uppercase tracking-wider">Current plan</h3>
      
      <div className="bg-white rounded-[12px] p-5 shadow-card">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h4 className="font-bold font-display text-navy text-[16px]">{name}</h4>
            <p className="text-[14px] font-body text-gray-500 mt-1">{description}</p>
          </div>
          <div className="text-right">
            <span className="font-bold font-display text-navy text-[16px]">{price}</span>
          </div>
        </div>
      </div>

      {currentTier === 'free' ? (
        <button
          onClick={() => navigate('/pricing')}
          className="px-5 py-2.5 bg-brand-blue text-white text-[15px] font-semibold font-display rounded-full hover:bg-brand-blue-dark transition-all active:scale-[0.98]"
        >
          Upgrade to Personal — $19/month →
        </button>
      ) : (
        <button
          onClick={openPortal}
          disabled={portalLoading}
          className="text-sm font-medium text-memoire-600 hover:text-memoire-700 transition"
        >
          {portalLoading ? 'Opening portal...' : 'Manage billing →'}
        </button>
      )}
    </div>
  );
}
