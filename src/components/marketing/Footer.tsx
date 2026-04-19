import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="bg-white border-t border-gray-100 py-12 px-4">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="md:col-span-2">
          <Link to="/" className="text-xl font-bold text-gray-900 mb-4 block">
            Memoire
          </Link>
          <p className="text-gray-500 mb-4">
            hello@memoire.app
          </p>
        </div>
        
        <div>
          <h4 className="font-semibold text-gray-900 mb-4">Product</h4>
          <ul className="space-y-3">
            <li><Link to="/#features" className="text-gray-600 hover:text-gray-900">Features</Link></li>
            <li><Link to="/pricing" className="text-gray-600 hover:text-gray-900">Pricing</Link></li>
            <li><Link to="/login" className="text-gray-600 hover:text-gray-900">Log in</Link></li>
          </ul>
        </div>
        
        <div>
          <h4 className="font-semibold text-gray-900 mb-4">Legal</h4>
          <ul className="space-y-3">
            <li><Link to="/legal/privacy" className="text-gray-600 hover:text-gray-900">Privacy Policy</Link></li>
            <li><Link to="/legal/terms" className="text-gray-600 hover:text-gray-900">Terms of Service</Link></li>
          </ul>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto mt-12 pt-8 border-t border-gray-100 text-sm text-gray-500">
        &copy; {new Date().getFullYear()} Memoire. All rights reserved.
      </div>
    </footer>
  );
}
