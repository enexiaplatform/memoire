import { Link } from 'react-router-dom';
import { BrandWordmark } from '../brand/BrandWordmark';
import { CONTACT_EMAIL, CONTACT_MAILTO } from '../../config/contact';

export function Footer() {
  return (
    <footer className="bg-white border-t border-gray-100 py-12 px-4">
      <div className="max-w-7xl mx-auto grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-5">
        <div className="md:col-span-2">
          <Link to="/" className="mb-4 block" aria-label="Memoire home">
            <BrandWordmark className="text-2xl" />
          </Link>
          <a href={CONTACT_MAILTO} className="mb-4 inline-block text-gray-500 hover:text-gray-900">
            {CONTACT_EMAIL}
          </a>
        </div>
        
        <div>
          <h4 className="font-semibold text-gray-900 mb-4">Product</h4>
          <ul className="space-y-3">
            <li><Link to="/#features" className="text-gray-600 hover:text-gray-900">Features</Link></li>
            <li><Link to="/use-cases" className="text-gray-600 hover:text-gray-900">Use Cases</Link></li>
            <li><Link to="/pricing" className="text-gray-600 hover:text-gray-900">Pricing</Link></li>
            <li><Link to="/request-access" className="text-gray-600 hover:text-gray-900">Talk to us</Link></li>
            <li><Link to="/signup" className="text-gray-600 hover:text-gray-900">Create Account</Link></li>
            <li><Link to="/login" className="text-gray-600 hover:text-gray-900">Log in</Link></li>
          </ul>
        </div>
        
        {/* The guides are linked from every marketing page rather than only from
            the sitemap. A page a crawler reaches only through an XML file is
            treated as one nothing on the site thinks is important. */}
        <div>
          <h4 className="font-semibold text-gray-900 mb-4">Guides</h4>
          <ul className="space-y-3">
            <li><Link to="/why-deals-go-quiet" className="text-gray-600 hover:text-gray-900">Why deals go quiet</Link></li>
            <li><Link to="/quote-to-cash" className="text-gray-600 hover:text-gray-900">Quote to cash</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="font-semibold text-gray-900 mb-4">Legal</h4>
          <ul className="space-y-3">
            <li><Link to="/legal/privacy" className="text-gray-600 hover:text-gray-900">Privacy Policy</Link></li>
            <li><Link to="/legal/terms" className="text-gray-600 hover:text-gray-900">Terms of Service</Link></li>
            <li><Link to="/legal/boundaries" className="text-gray-600 hover:text-gray-900">Product Boundaries</Link></li>
          </ul>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto mt-12 pt-8 border-t border-gray-100 text-sm text-gray-500">
        &copy; {new Date().getFullYear()} Memoire. All rights reserved.
      </div>
    </footer>
  );
}
