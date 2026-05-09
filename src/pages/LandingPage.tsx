import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { MarketingNav } from '../components/marketing/MarketingNav';
import { HeroSection } from '../components/marketing/HeroSection';
import { HowItWorksSection } from '../components/marketing/HowItWorksSection';
import { FeaturesSection } from '../components/marketing/FeaturesSection';
import { PricingPreviewSection } from '../components/marketing/PricingPreviewSection';
import { Footer } from '../components/marketing/Footer';

const problems = [
  'Long-cycle deals go silent after a promising technical conversation.',
  'Follow-ups are forgotten after meetings, demos, and proposal reviews.',
  'Unresolved objections stay buried in notes and memory.',
  'Customer context is scattered across chats, email, notebooks, and CRM fields.',
  'CRM fields show status, but not what needs follow-up now.',
];

const crmItems = [
  'Built for company reporting',
  'Tracks pipeline fields',
  'Focuses on management visibility',
  'Stores activity history',
  'Reports what happened',
];

const memoireItems = [
  'Built for technical B2B follow-up',
  'Surfaces stuck deals before they go quiet',
  'Remembers unresolved objections',
  'Turns account context into next actions',
  'Helps decide what to fix today',
];

const bestFor = [
  'Account managers',
  'Business development managers',
  'Technical sales',
  'Life science, healthcare, and industrial sales',
  'Consultative B2B sellers',
  'Solo sales operators',
];

const notFor = [
  'Enterprise CRM replacement',
  'Manager forecasting dashboards',
  'Transactional one-call sales cycles',
];

export function LandingPage() {
  return (
    <div className="min-h-screen font-sans bg-white text-gray-900 selection:bg-indigo-100 selection:text-indigo-900 flex flex-col">
      <Helmet>
        <title>Memoire - Catch deals before they go silent</title>
        <meta name="description" content="Memoire helps technical B2B salespeople turn scattered customer context into stuck-deal alerts, account memory, and next actions." />
        <meta property="og:title" content="Memoire - Catch deals before they go silent." />
        <meta property="og:description" content="Your CRM tracks the deal. Memoire remembers what needs follow-up." />
        <meta property="og:type" content="website" />
        <link rel="canonical" href="https://memoire.app" />
      </Helmet>

      <MarketingNav />

      <main className="pt-16 flex-grow">
        <HeroSection />

        <section className="w-full bg-gray-50 py-24 md:py-32 px-4">
          <div className="mx-auto max-w-5xl">
            <div className="mx-auto max-w-[680px] text-center">
              <h2 className="mb-6 text-3xl font-semibold leading-snug text-gray-900 md:text-4xl">
                Deals go silent when follow-up context gets lost.
              </h2>
              <p className="text-lg leading-relaxed text-gray-600">
                Technical B2B sellers manage long buying cycles where one missed follow-up or unresolved objection can quietly stall the deal.
              </p>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-2">
              {problems.map((problem) => (
                <div key={problem} className="rounded-lg border border-gray-200 bg-white p-5 text-gray-700 shadow-sm">
                  {problem}
                </div>
              ))}
            </div>
          </div>
        </section>

        <HowItWorksSection />

        <section className="w-full bg-gray-900 py-24 md:py-32 px-4">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-[680px] text-center">
              <h2 className="mb-6 text-3xl font-bold text-white md:text-4xl">
                Not another CRM. A stuck-deal queue for the seller.
              </h2>
              <p className="text-lg leading-relaxed text-gray-300">
                Memoire complements the CRM by helping the individual seller remember what needs follow-up, what is unresolved, and which accounts are going quiet.
              </p>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-2">
              <ComparisonCard title="CRM" items={crmItems} muted />
              <ComparisonCard title="Memoire" items={memoireItems} />
            </div>
          </div>
        </section>

        <div id="features">
          <FeaturesSection />
        </div>

        <section id="demo" className="w-full bg-indigo-50 py-24 px-4">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-center text-2xl font-bold text-gray-900 md:text-3xl">Demo: see stuck deals first</h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-lg leading-relaxed text-gray-600">
              The demo opens with deals that may go silent today, then shows how a new customer note joins the queue.
            </p>
            <div className="mt-10 rounded-xl border border-indigo-100 bg-white p-6 shadow-sm">
              <p className="text-sm font-bold uppercase tracking-wide text-indigo-700">Northstar Labs / Linh</p>
              <p className="mt-3 text-lg leading-relaxed text-gray-700">
                The seller sees unresolved objections, missing follow-ups, and accounts going quiet before adding a new note from Linh at Northstar Labs.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {['Stuck Deal Queue', 'Account Memory', 'Unresolved Objections', 'Next Actions', 'Ask Memoire', 'Follow-up from Memory'].map((step) => (
                  <span key={step} className="rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700">{step}</span>
                ))}
              </div>
              <Link
                to="/demo"
                className="mt-6 inline-flex rounded-lg bg-indigo-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-indigo-700"
              >
                Try Interactive Demo
              </Link>
            </div>
          </div>
        </section>

        <section className="w-full bg-white py-24 px-4">
          <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-2">
            <AudienceCard title="Best for" items={bestFor} />
            <AudienceCard title="Not for" items={notFor} />
          </div>
        </section>

        <PricingPreviewSection />

        <section className="w-full bg-indigo-600 py-24 md:py-32 px-4 text-center">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-10">
              Stop letting warm deals go quiet.
            </h2>
            <div className="flex flex-col items-center gap-3">
              <Link to="/demo" className="bg-white text-indigo-600 text-lg font-medium px-8 py-4 rounded-lg transition-colors hover:bg-gray-50">
                Try Interactive Demo
              </Link>
              <Link to="/signup" className="text-sm font-semibold text-indigo-100 hover:text-white">Create Account</Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function ComparisonCard({ title, items, muted = false }: { title: string; items: string[]; muted?: boolean }) {
  return (
    <div className={`rounded-xl border p-6 ${muted ? 'border-white/10 bg-white/5 text-gray-300' : 'border-indigo-400/40 bg-indigo-500/10 text-white'}`}>
      <h3 className="mb-4 text-xl font-bold">{title}</h3>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item} className="text-sm leading-6">{item}</li>
        ))}
      </ul>
    </div>
  );
}

function AudienceCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-xl font-bold text-gray-900">{title}</h3>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item} className="text-sm leading-6 text-gray-600">{item}</li>
        ))}
      </ul>
    </div>
  );
}
