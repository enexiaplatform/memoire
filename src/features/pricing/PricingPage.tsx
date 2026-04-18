import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useCheckout } from '../billing/useCheckout';

export function PricingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { startCheckout, loading } = useCheckout();

  const handleGetStarted = (plan: 'free' | 'personal' | 'team') => {
    if (!user) {
      navigate('/signup');
      return;
    }
    
    if (plan === 'free') {
      navigate('/app/capture');
      return;
    }

    const priceId = plan === 'personal' 
      ? import.meta.env.VITE_STRIPE_PERSONAL_PRICE_ID 
      : import.meta.env.VITE_STRIPE_TEAM_PRICE_ID;
      
    startCheckout(priceId);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="p-6 flex justify-between items-center bg-white border-b border-gray-200">
        <div className="text-xl font-bold text-gray-900 border-b-2 border-gray-900">Memoire</div>
        <div className="space-x-4">
          <button onClick={() => navigate('/login')} className="text-gray-600 hover:text-gray-900 font-medium font-sm">Login</button>
          <button onClick={() => navigate('/signup')} className="bg-gray-900 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-gray-800">
            Sign up
          </button>
        </div>
      </nav>

      <main className="flex-1 max-w-5xl mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-gray-900 mb-4 tracking-tight">Your professional memory,<br/>portable across companies.</h1>
          <p className="text-lg text-gray-500">Simple, transparent pricing. No lock-in.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 items-stretch max-w-4xl mx-auto">
          {/* Free */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 flex flex-col">
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Free</h3>
            <div className="text-3xl font-bold text-gray-900 mb-6">$0<span className="text-lg font-normal text-gray-500">/mo</span></div>
            <ul className="space-y-4 text-gray-600 mb-8 flex-1">
              <li>30 captures / month</li>
              <li>50 entities max</li>
              <li className="text-gray-400 line-through">AI search</li>
            </ul>
            <button 
              onClick={() => handleGetStarted('free')}
              className="w-full py-2.5 px-4 font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
            >
              Get Free
            </button>
          </div>

          {/* Personal */}
          <div className="bg-white rounded-2xl shadow-lg border-2 border-memoire-500 p-8 flex flex-col relative transform md:-translate-y-4">
            <div className="absolute top-0 right-8 -translate-y-1/2">
              <span className="bg-memoire-500 text-white text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full">★ Popular</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Personal</h3>
            <div className="text-3xl font-bold text-gray-900 mb-6">$19<span className="text-lg font-normal text-gray-500">/mo</span></div>
            <ul className="space-y-4 text-gray-600 mb-8 flex-1">
              <li className="font-medium text-gray-900">Unlimited captures</li>
              <li className="font-medium text-gray-900">Unlimited entities</li>
              <li className="flex items-center gap-2">AI search <span className="text-green-500">✓</span></li>
              <li className="flex items-center gap-2">Full data export <span className="text-green-500">✓</span></li>
            </ul>
            <button 
              disabled={loading}
              onClick={() => handleGetStarted('personal')}
              className="w-full py-2.5 px-4 font-medium rounded-lg bg-memoire-600 text-white hover:bg-memoire-700 transition"
            >
              {loading ? 'Redirecting...' : 'Get Personal'}
            </button>
          </div>

          {/* Team */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 flex flex-col">
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Team</h3>
            <div className="text-3xl font-bold text-gray-900 mb-6">$39<span className="text-lg font-normal text-gray-500">/mo</span></div>
            <ul className="space-y-4 text-gray-600 mb-8 flex-1">
              <li className="font-medium text-gray-900">Unlimited captures</li>
              <li>+ up to 5 seats (coming soon)</li>
              <li className="flex items-center gap-2">AI search <span className="text-green-500">✓</span></li>
              <li className="flex items-center gap-2">Full data export <span className="text-green-500">✓</span></li>
            </ul>
            <button 
              disabled={loading}
              onClick={() => handleGetStarted('team')}
              className="w-full py-2.5 px-4 font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
            >
              {loading ? 'Redirecting...' : 'Get Team'}
            </button>
          </div>
        </div>

        <div className="mt-20 border-t border-gray-200 pt-10 text-center max-w-2xl mx-auto">
          <h4 className="font-semibold text-gray-900 mb-4">All plans include:</h4>
          <ul className="space-y-2 text-gray-600 flex flex-col items-center">
            <li>✓ Your data is always yours — export anytime</li>
            <li>✓ No lock-in, cancel anytime</li>
            <li>✓ Privacy-first — your notes are never used for AI modeling</li>
          </ul>
          <p className="mt-8 text-sm text-gray-400">Questions? hello@memoire.app</p>
        </div>
      </main>
    </div>
  );
}
