import { useState } from 'react';
import { Link } from 'react-router-dom';

export function MarketingNav() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="fixed top-0 w-full bg-white/90 backdrop-blur-md border-b border-gray-100 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex-shrink-0">
            <Link to="/" className="text-xl font-bold text-gray-900">
              Memoire
            </Link>
          </div>
          <div className="hidden md:flex items-center space-x-6">
            <a href="/#demo" className="font-medium text-gray-600 hover:text-gray-900">Demo</a>
            <Link to="/login" className="text-gray-600 hover:text-gray-900 font-medium">Log in</Link>
            <Link to="/signup" className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
              Try Memoire
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
          <Link to="/login" className="block px-3 py-2 text-base font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md">Log in</Link>
          <a href="/#demo" className="block rounded-md px-3 py-2 text-base font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900">View Demo</a>
          <Link to="/signup" className="block px-3 py-2 text-base font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md">Try Memoire</Link>
        </div>
      )}
    </nav>
  );
}
