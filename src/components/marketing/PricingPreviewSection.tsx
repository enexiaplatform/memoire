import { Link } from 'react-router-dom';

export function PricingPreviewSection() {
  return (
    <section className="w-full bg-gray-50 py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Simple pricing.</h2>
          <p className="text-lg text-gray-600">Start free, upgrade when you need more.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Free Tier */}
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm flex flex-col h-full">
            <h3 className="text-2xl font-semibold text-gray-900 mb-2">Free</h3>
            <p className="text-4xl font-bold text-gray-900 mb-8">$0<span className="text-lg text-gray-500 font-normal">/month</span></p>
            
            <ul className="space-y-4 mb-8 flex-grow">
              <li className="flex items-center text-gray-600">
                <svg className="w-5 h-5 text-indigo-600 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                30 captures / month
              </li>
              <li className="flex items-center text-gray-600">
                <svg className="w-5 h-5 text-indigo-600 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                50 entities
              </li>
              <li className="flex items-center text-gray-400">
                <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                No AI search
              </li>
            </ul>
            
            <Link to="/signup" className="block w-full py-3 px-4 bg-white border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50 font-semibold rounded-lg text-center transition-colors">
              Get started
            </Link>
          </div>

          {/* Personal Tier */}
          <div className="bg-white rounded-2xl p-8 border-2 border-indigo-600 shadow-md flex flex-col h-full relative">
            <div className="absolute top-0 right-0 transform translate-x-1/4 -translate-y-1/2">
              <span className="bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                ★ Popular
              </span>
            </div>
            <h3 className="text-2xl font-semibold text-gray-900 mb-2">Personal</h3>
            <p className="text-4xl font-bold text-gray-900 mb-8">$19<span className="text-lg text-gray-500 font-normal">/month</span></p>
            
            <ul className="space-y-4 mb-8 flex-grow">
              <li className="flex items-center text-gray-600">
                <svg className="w-5 h-5 text-indigo-600 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Unlimited captures
              </li>
              <li className="flex items-center text-gray-600">
                <svg className="w-5 h-5 text-indigo-600 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Unlimited entities
              </li>
              <li className="flex items-center text-gray-600">
                <svg className="w-5 h-5 text-indigo-600 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Full AI search
              </li>
              <li className="flex items-center text-gray-600">
                <svg className="w-5 h-5 text-indigo-600 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Full export
              </li>
            </ul>
            
            <Link to="/signup" className="block w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-center transition-colors">
              Get Personal &rarr;
            </Link>
          </div>
        </div>

        <div className="text-center mt-12">
          <Link to="/pricing" className="text-indigo-600 font-medium hover:text-indigo-800 transition-colors">
            See full pricing &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}
