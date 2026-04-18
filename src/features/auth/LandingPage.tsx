import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';

export function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-memoire-50">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-memoire-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">M</span>
          </div>
          <span className="text-lg font-semibold text-gray-900">Memoire</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login">
            <Button variant="ghost" size="sm">Log in</Button>
          </Link>
          <Link to="/signup">
            <Button variant="primary" size="sm">Sign up</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-4xl mx-auto px-6 pt-24 pb-32 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-memoire-50 border border-memoire-200 text-memoire-700 text-sm font-medium mb-8">
          <span className="w-2 h-2 rounded-full bg-memoire-500 animate-pulse" />
          Now in early access
        </div>

        <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 leading-tight mb-6">
          Your professional memory,
          <br />
          <span className="text-memoire-600">portable.</span>
        </h1>

        <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-10 leading-relaxed">
          Capture, structure, and retrieve your career knowledge — customer context,
          deal intelligence, relationship history — all owned by you, not your company.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link to="/signup">
            <Button size="lg" className="min-w-[200px]">
              Get started free
            </Button>
          </Link>
          <Link to="/login">
            <Button variant="secondary" size="lg" className="min-w-[200px]">
              I have an account
            </Button>
          </Link>
        </div>

        {/* Value props */}
        <div className="grid sm:grid-cols-3 gap-8 mt-24 text-left">
          <div className="p-6 rounded-xl bg-white border border-gray-100 shadow-sm">
            <div className="w-10 h-10 rounded-lg bg-memoire-50 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-memoire-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">You own your data</h3>
            <p className="text-sm text-gray-600">
              Full export anytime. Your knowledge stays with you across jobs and companies.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-white border border-gray-100 shadow-sm">
            <div className="w-10 h-10 rounded-lg bg-memoire-50 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-memoire-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">AI connects the dots</h3>
            <p className="text-sm text-gray-600">
              Automatically extract entities, relationships, and insights from your captures.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-white border border-gray-100 shadow-sm">
            <div className="w-10 h-10 rounded-lg bg-memoire-50 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-memoire-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Instant recall</h3>
            <p className="text-sm text-gray-600">
              Search across your entire professional memory in seconds, not hours.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 text-center text-sm text-gray-400">
        &copy; {new Date().getFullYear()} Memoire. All rights reserved.
      </footer>
    </div>
  );
}
