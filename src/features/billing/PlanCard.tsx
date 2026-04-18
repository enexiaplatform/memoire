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
      <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">Current plan</h3>
      
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h4 className="font-semibold text-gray-900">{name}</h4>
            <p className="text-sm text-gray-500 mt-1">{description}</p>
          </div>
          <div className="text-right">
            <span className="font-medium text-gray-900">{price}</span>
          </div>
        </div>
      </div>

      {currentTier === 'free' ? (
        <button
          onClick={() => navigate('/pricing')}
          className="px-4 py-2 bg-memoire-600 text-white text-sm font-medium rounded-lg hover:bg-memoire-700 transition"
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
