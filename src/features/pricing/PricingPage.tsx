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
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <nav className="p-6 flex justify-between items-center bg-white border-b border-gray-200">
        <div className="text-[20px] font-extrabold tracking-tight brand-gradient-text font-display">Memoire</div>
        <div className="space-x-4">
          <button onClick={() => navigate('/login')} className="text-gray-600 hover:text-gray-900 font-medium text-[15px] font-body">Login</button>
          <button onClick={() => navigate('/signup')} className="bg-[#1976D2] text-white px-5 py-2 rounded-full font-semibold font-display text-[14px] hover:bg-[#1565C0] active:scale-[0.98] transition-all">
            Sign up
          </button>
        </div>
      </nav>

      <main className="flex-1 max-w-5xl mx-auto px-6 py-20 w-full">
        <div className="text-center mb-16">
          <h1 className="text-[40px] font-bold text-navy mb-4 tracking-tight font-display">Your professional memory,<br/>portable across companies.</h1>
          <p className="text-[18px] font-body text-gray-500">Simple, transparent pricing. No lock-in.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 items-stretch max-w-4xl mx-auto">
          {/* Free */}
          <div className="bg-white rounded-[16px] shadow-card border-[1.5px] border-gray-200 p-8 flex flex-col">
            <h3 className="text-[20px] font-semibold font-display text-navy mb-2">Free</h3>
            <div className="text-[36px] font-bold font-display text-navy mb-6">$0<span className="text-[18px] font-normal text-gray-400">/mo</span></div>
            <ul className="space-y-4 font-body text-[15px] text-gray-600 mb-8 flex-1">
              <li>30 captures / month</li>
              <li>50 entities max</li>
              <li className="text-gray-400 line-through">AI search</li>
            </ul>
            <button 
              onClick={() => handleGetStarted('free')}
              className="w-full py-2.5 px-4 font-semibold font-display rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 transition-all active:scale-[0.98] text-[15px]"
            >
              Get Free
            </button>
          </div>

          {/* Personal */}
          <div className="relative transform md:-translate-y-4">
            <div className="gradient-border-card shadow-elevated h-full">
              <div className="gradient-border-card-inner p-8 flex flex-col h-full bg-white relative">
                <div className="absolute top-0 right-8 -translate-y-1/2">
                  <span className="brand-gradient text-white text-[11px] font-bold font-body uppercase tracking-wider px-3 py-1 rounded-full shadow-sm">★ Popular</span>
                </div>
                <h3 className="text-[20px] font-semibold font-display text-navy mb-2">Personal</h3>
                <div className="text-[36px] font-bold font-display text-navy mb-6">$19<span className="text-[18px] font-normal text-gray-400">/mo</span></div>
                <ul className="space-y-4 font-body text-[15px] text-gray-600 mb-8 flex-1">
                  <li className="font-semibold text-navy">Unlimited captures</li>
                  <li className="font-semibold text-navy">Unlimited entities</li>
                  <li className="flex items-center gap-2">AI search <span className="text-[#43A047]">✓</span></li>
                  <li className="flex items-center gap-2">Full data export <span className="text-[#43A047]">✓</span></li>
                </ul>
                <button 
                  disabled={loading}
                  onClick={() => handleGetStarted('personal')}
                  className="w-full py-2.5 px-4 font-semibold font-display rounded-full brand-gradient text-white hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 text-[15px]"
                >
                  {loading ? 'Redirecting...' : 'Get Personal'}
                </button>
              </div>
            </div>
          </div>

          {/* Team */}
          <div className="bg-white rounded-[16px] shadow-card border-[1.5px] border-gray-200 p-8 flex flex-col mt-4 md:mt-0">
            <h3 className="text-[20px] font-semibold font-display text-navy mb-2">Team</h3>
            <div className="text-[36px] font-bold font-display text-navy mb-6">$39<span className="text-[18px] font-normal text-gray-400">/mo</span></div>
            <ul className="space-y-4 font-body text-[15px] text-gray-600 mb-8 flex-1">
              <li className="font-semibold text-navy">Unlimited captures</li>
              <li>+ up to 5 seats (coming soon)</li>
              <li className="flex items-center gap-2">AI search <span className="text-[#43A047]">✓</span></li>
              <li className="flex items-center gap-2">Full data export <span className="text-[#43A047]">✓</span></li>
            </ul>
            <button 
              disabled={loading}
              onClick={() => handleGetStarted('team')}
              className="w-full py-2.5 px-4 font-semibold font-display rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 transition-all active:scale-[0.98] text-[15px]"
            >
              {loading ? 'Redirecting...' : 'Get Team'}
            </button>
          </div>
        </div>

        <div className="mt-20 border-t border-gray-200 pt-10 text-center max-w-2xl mx-auto">
          <h4 className="font-semibold font-display text-navy mb-4 text-[16px]">All plans include:</h4>
          <ul className="space-y-2 font-body text-[14px] text-gray-600 flex flex-col items-center">
            <li>✓ Your data is always yours — export anytime</li>
            <li>✓ No lock-in, cancel anytime</li>
            <li>✓ Privacy-first — your notes are never used for AI modeling</li>
          </ul>
          <p className="mt-8 text-[13px] font-body text-gray-400">Questions? hello@memoire.app</p>
        </div>
      </main>
    </div>
  );
}
