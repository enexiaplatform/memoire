import { Link } from 'react-router-dom';

export function HeroSection() {
  return (
    <section className="w-full bg-white pt-32 pb-24 md:pt-40 md:pb-32 px-4 text-center">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight mb-6">
          From conversation to cash, nothing goes silent.
        </h1>
        <p className="max-w-[680px] mx-auto text-lg md:text-xl text-gray-600 mb-10 leading-relaxed">
          Memoire is a personal commercial control tower for complex B2B sellers. It turns every customer interaction into
          a continuous commercial thread - from conversation and quotation to delivery and cash - so no commitment,
          follow-up, or revenue opportunity goes silent.
        </p>
        <p className="mx-auto mb-8 max-w-xl text-sm font-semibold text-indigo-700">
          Your CRM tracks records for the company. Memoire keeps your commercial threads moving.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/demo" className="rounded-lg bg-indigo-600 px-8 py-4 text-lg font-medium text-white transition-colors hover:bg-indigo-700">
            Try Interactive Demo
          </Link>
          <Link to="/request-access" className="rounded-lg border border-gray-200 bg-white px-8 py-4 text-lg font-medium text-gray-700 transition-colors hover:border-indigo-200 hover:text-indigo-700">
            Request Access
          </Link>
        </div>
      </div>
    </section>
  );
}
