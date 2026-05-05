import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { MarketingNav } from '../components/marketing/MarketingNav';
import { HeroSection } from '../components/marketing/HeroSection';
import { HowItWorksSection } from '../components/marketing/HowItWorksSection';
import { FeaturesSection } from '../components/marketing/FeaturesSection';
import { PricingPreviewSection } from '../components/marketing/PricingPreviewSection';
import { Footer } from '../components/marketing/Footer';

const problems = [
  'Customer details disappear across notes, chats, emails, and memory.',
  'Salespeople forget what blocked the deal last time.',
  'Follow-ups are missed after meetings.',
  'CRMs store fields but not the real customer story.',
  'Repeated sales mistakes are hard to see.',
];

const crmItems = [
  'Built for company reporting',
  'Tracks pipeline fields',
  'Focuses on management visibility',
  'Stores activity history',
  'Reports what happened',
];

const memoireItems = [
  'Built for individual sales execution',
  'Remembers customer stories',
  'Focuses on daily next action',
  'Turns interactions into memory and action',
  'Helps decide what to do next',
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
        <title>Memoire - Personal Sales Memory System</title>
        <meta name="description" content="Memoire turns customer interactions into account memory, next actions, and reusable sales knowledge for B2B sales professionals." />
        <meta property="og:title" content="Memoire - Your CRM tracks the deal. Memoire remembers the story." />
        <meta property="og:description" content="Capture customer interactions, turn them into account memory and next actions, and ask your sales brain what to do next." />
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
                Sales context gets lost every day.
              </h2>
              <p className="text-lg leading-relaxed text-gray-600">
                The most important sales knowledge is often buried in scattered notes, memory, and old conversations.
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
                Not another CRM. A personal sales brain.
              </h2>
              <p className="text-lg leading-relaxed text-gray-300">
                Memoire complements the CRM by helping the individual seller remember context, protect follow-up momentum, and learn from real customer conversations.
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
            <h2 className="text-center text-2xl font-bold text-gray-900 md:text-3xl">Demo story</h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-lg leading-relaxed text-gray-600">
              One customer interaction becomes memory, action, and reusable sales knowledge.
            </p>
            <div className="mt-10 rounded-xl border border-indigo-100 bg-white p-6 shadow-sm">
              <p className="text-sm font-bold uppercase tracking-wide text-indigo-700">Control Union / Nam</p>
              <p className="mt-3 text-lg leading-relaxed text-gray-700">
                The seller just called Nam from Control Union. They are reviewing a proposal but are concerned about lead time and local support. Memoire structures the note, updates Account Memory, creates a Next Action for next Tuesday, shows the Journey, and helps draft a follow-up.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {['Quick Capture', 'Structured Interaction', 'Account Memory', 'Journey', 'Ask Memoire', 'Follow-up Composer'].map((step) => (
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
              Start building your Sales Memory today.
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
