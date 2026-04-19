import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { MarketingNav } from '../components/marketing/MarketingNav';
import { HeroSection } from '../components/marketing/HeroSection';
import { HowItWorksSection } from '../components/marketing/HowItWorksSection';
import { FeaturesSection } from '../components/marketing/FeaturesSection';
import { PricingPreviewSection } from '../components/marketing/PricingPreviewSection';
import { Footer } from '../components/marketing/Footer';

export function LandingPage() {
  return (
    <div className="min-h-screen font-sans bg-white text-gray-900 selection:bg-indigo-100 selection:text-indigo-900 flex flex-col">
      <Helmet>
        <title>Memoire — Professional Memory OS for B2B Professionals</title>
        <meta name="description" content="Capture every meeting, call, and insight. AI structures your knowledge automatically. Your professional memory — portable across companies." />
        <meta property="og:title" content="Memoire — Your professional memory, portable across companies" />
        <meta property="og:description" content="Stop losing knowledge every time you change jobs. Memoire captures and structures your professional memory — and it's always yours to keep." />
        <meta property="og:type" content="website" />
        <link rel="canonical" href="https://memoire.app" />
      </Helmet>

      <MarketingNav />
      
      <main className="pt-16 flex-grow">
        <HeroSection />

        {/* SECTION 3 — Pain Statement */}
        <section className="w-full bg-gray-50 py-24 md:py-32 px-4 text-center">
          <div className="max-w-[680px] mx-auto">
            <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-8 leading-snug">
              You've spent years building knowledge.<br />
              Then you changed jobs — and lost all of it.
            </h2>
            <div className="space-y-6 text-lg text-gray-600">
              <p>
                Your customer relationships, deal context, market intelligence — all locked in your company's CRM. All left behind the moment you left.
              </p>
              <p>
                B2B professionals change jobs every 3–5 years.<br />
                Every move resets the clock.
              </p>
            </div>
          </div>
        </section>

        <HowItWorksSection />

        {/* SECTION 5 — Core Differentiator */}
        <section className="w-full bg-gray-900 py-24 md:py-32 px-4 text-center">
          <div className="max-w-[640px] mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
              Your data is always yours.<br />
              No lock-in. No surprises.
            </h2>
            <div className="space-y-6 text-lg text-gray-300">
              <p>
                Export everything — contacts, companies, deals, insights — as JSON, CSV, or Markdown. Anytime. One click.
              </p>
              <p>
                Memoire is your external memory, not your company's database.
              </p>
            </div>
          </div>
        </section>

        <div id="features">
          <FeaturesSection />
        </div>

        <PricingPreviewSection />

        {/* SECTION 8 — Final CTA */}
        <section className="w-full bg-indigo-600 py-24 md:py-32 px-4 text-center">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-10">
              Start building your professional memory today.
            </h2>
            <div className="flex flex-col items-center gap-3">
              <Link to="/signup" className="bg-white text-indigo-600 text-lg font-medium px-8 py-4 rounded-lg transition-colors hover:bg-gray-50">
                Start for free &rarr;
              </Link>
              <span className="text-sm text-indigo-200">No credit card required</span>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
