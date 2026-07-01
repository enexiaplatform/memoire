import { Link } from 'react-router-dom';

export function PricingPreviewSection() {
  return (
    <section className="w-full bg-gray-50 px-4 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl font-bold text-gray-900">Early-access pricing.</h2>
          <p className="text-lg text-gray-600">
            Start with the demo, then request access when you want to use real pipeline data.
          </p>
        </div>

        <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-2">
          <div className="flex h-full flex-col rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
            <h3 className="mb-2 text-2xl font-semibold text-gray-900">Demo</h3>
            <p className="mb-8 text-4xl font-bold text-gray-900">
              Free<span className="text-lg font-normal text-gray-500"> preview</span>
            </p>

            <ul className="mb-8 flex-grow space-y-4">
              {['Sample sales memory', 'Guided Pipeline Defense demo', 'No paid checkout required'].map((item) => (
                <li key={item} className="flex items-center text-gray-600">
                  <svg className="mr-3 h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>

            <Link
              to="/demo"
              className="block w-full rounded-lg border-2 border-indigo-600 px-4 py-3 text-center font-semibold text-indigo-600 transition-colors hover:bg-indigo-50"
            >
              Try the demo
            </Link>
          </div>

          <div className="relative flex h-full flex-col rounded-2xl border-2 border-indigo-600 bg-white p-8 shadow-md">
            <div className="absolute right-0 top-0 -translate-y-1/2 translate-x-1/4">
              <span className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                Cohort
              </span>
            </div>
            <h3 className="mb-2 text-2xl font-semibold text-gray-900">Controlled access</h3>
            <p className="mb-8 text-4xl font-bold text-gray-900">
              Invite<span className="text-lg font-normal text-gray-500"> cohort</span>
            </p>

            <ul className="mb-8 flex-grow space-y-4">
              {[
                'Real account and opportunity memory',
                'Review Pack and export workflows',
                'AI-assisted workflows when configured',
                'Manual onboarding and support',
              ].map((item) => (
                <li key={item} className="flex items-center text-gray-600">
                  <svg className="mr-3 h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>

            <Link
              to="/request-access"
              className="block w-full rounded-lg bg-indigo-600 px-4 py-3 text-center font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              Request access
            </Link>
          </div>
        </div>

        <div className="mt-12 text-center">
          <Link to="/pricing" className="font-medium text-indigo-600 transition-colors hover:text-indigo-800">
            See access options
          </Link>
        </div>
      </div>
    </section>
  );
}
