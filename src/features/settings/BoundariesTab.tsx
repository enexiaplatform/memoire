import { Link } from 'react-router-dom';

export function BoundariesTab() {
  return (
    <div className="space-y-8 max-w-2xl animate-in fade-in zoom-in-95 duration-200">
      <div>
        <h2 className="text-xl font-bold font-display text-navy mb-2">Memoire Profile Boundaries</h2>
        <p className="text-sm text-gray-500 font-body">
          These boundaries are immutable and dictate how your personal knowledge is protected.
        </p>
      </div>

      <div className="grid gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-navy mb-4">Memoire is NOT:</h3>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <span className="text-red-500 font-bold mt-0.5">✗</span>
              <span className="text-sm text-gray-700">A professional certification</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-red-500 font-bold mt-0.5">✗</span>
              <span className="text-sm text-gray-700">A skill rating or score</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-red-500 font-bold mt-0.5">✗</span>
              <span className="text-sm text-gray-700">A hiring or credit signal</span>
            </li>
          </ul>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-navy mb-4">Memoire WILL NOT:</h3>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <span className="text-red-500 font-bold mt-0.5">✗</span>
              <span className="text-sm text-gray-700">Share your data with third parties without explicit per-instance consent</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-red-500 font-bold mt-0.5">✗</span>
              <span className="text-sm text-gray-700">Respond to recruiter / employer / credit-bureau queries</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-red-500 font-bold mt-0.5">✗</span>
              <span className="text-sm text-gray-700">Generate composite scores visible outside your own account</span>
            </li>
          </ul>
        </div>

        <div className="bg-white border border-brand-blue/30 rounded-xl p-6">
          <h3 className="text-sm font-bold uppercase tracking-wider brand-gradient-text mb-4">Your rights:</h3>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <span className="text-green-500 font-bold mt-0.5">✓</span>
              <span className="text-sm text-gray-700">Export all your data anytime (Settings &rarr; Export)</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-green-500 font-bold mt-0.5">✓</span>
              <span className="text-sm text-gray-700">Delete your account + all data (Settings &rarr; Delete)</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-green-500 font-bold mt-0.5">✓</span>
              <span className="text-sm text-gray-700">Revoke any consent you've given</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-green-500 font-bold mt-0.5">✓</span>
              <span className="text-sm text-gray-700">Understand the logic behind any Memory Health or Sales Memory signal shown in Memoire</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="pt-4 border-t border-gray-100">
        <Link to="/legal/boundaries" className="text-sm text-brand-blue hover:text-navy hover:underline transition-colors">
          View full legal boundaries &rarr;
        </Link>
      </div>
    </div>
  );
}
