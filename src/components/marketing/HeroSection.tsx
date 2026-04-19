import { Link } from 'react-router-dom';

export function HeroSection() {
  return (
    <section className="w-full bg-white pt-32 pb-24 md:pt-40 md:pb-32 px-4 text-center">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight mb-6">
          Your professional memory,<br className="hidden sm:block" /> portable across companies.
        </h1>
        <p className="max-w-[560px] mx-auto text-lg md:text-xl text-gray-600 mb-10 leading-relaxed">
          Every meeting, customer insight, and deal context — captured in seconds, 
          structured automatically, and owned by you forever.
        </p>
        <div className="flex flex-col items-center gap-3">
          <Link to="/signup" className="bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-medium px-8 py-4 rounded-lg transition-colors">
            Start for free &rarr;
          </Link>
          <span className="text-sm text-gray-400">No credit card required</span>
        </div>
      </div>
    </section>
  );
}
