import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BrandWordmark } from '../brand/BrandWordmark';
import { useAuthContext } from '../../auth/authContext';

/**
 * The public nav, which now knows whether the visitor is already signed in.
 *
 * It did not, and the result read as a bug: a signed-in operator landing on the
 * marketing page was still offered "Log in" and "Create Account", and clicking
 * either dropped them straight into the workspace with no explanation - because
 * /login and /signup both redirect an authenticated session to /app/today. The
 * jump was correct; being invited to make a second account was not.
 *
 * `loading` is deliberately treated as "not signed in yet" rather than blocking:
 * this nav sits on the public marketing pages, where the session check is the
 * slowest thing on screen and a nav that pops in late is worse than one that
 * settles.
 */
export function MarketingNav() {
  const [isOpen, setIsOpen] = useState(false);
  const { isAuthenticated, loading } = useAuthContext();
  const signedIn = isAuthenticated && !loading;

  return (
    <nav className="fixed top-0 w-full bg-white/90 backdrop-blur-md border-b border-gray-100 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex-shrink-0">
            <Link to="/" aria-label="Memoire home">
              <BrandWordmark className="text-2xl" />
            </Link>
          </div>
          <div className="hidden md:flex items-center space-x-6">
            <Link to="/demo" className="font-medium text-gray-600 hover:text-gray-900">Try Demo</Link>
            <a href="/#pricing" className="font-medium text-gray-600 hover:text-gray-900">Pricing</a>
            {!signedIn && <Link to="/login" className="text-gray-600 hover:text-gray-900 font-medium">Log in</Link>}
            {!signedIn && <Link to="/request-access" className="font-medium text-gray-600 hover:text-gray-900">Request Access</Link>}
            <Link
              to={signedIn ? '/app/today' : '/signup'}
              className="rounded-full bg-brand-blue px-4 py-2 font-display font-semibold text-white transition-colors hover:bg-brand-blue-dark active:scale-[0.98]"
            >
              {signedIn ? 'Open workspace' : 'Create Account'}
            </Link>
          </div>
          <div className="md:hidden flex items-center">
            <button onClick={() => setIsOpen(!isOpen)} className="text-gray-600 hover:text-gray-900 focus:outline-none">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-white border-b border-gray-100 px-2 pt-2 pb-3 space-y-1 sm:px-3 shadow-lg">
          {!signedIn && <Link to="/login" className="block px-3 py-2 text-base font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md">Log in</Link>}
          <Link to="/demo" className="block rounded-md px-3 py-2 text-base font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900">Try Demo</Link>
          <a href="/#pricing" className="block rounded-md px-3 py-2 text-base font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900">Pricing</a>
          {!signedIn && <Link to="/request-access" className="block rounded-md px-3 py-2 text-base font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900">Request Access</Link>}
          <Link to={signedIn ? '/app/today' : '/signup'} className="block rounded-full px-3 py-2 text-base font-semibold text-brand-blue hover:bg-blue-50 hover:text-brand-blue-dark">
            {signedIn ? 'Open workspace' : 'Create Account'}
          </Link>
        </div>
      )}
    </nav>
  );
}
