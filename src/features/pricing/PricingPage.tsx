import { ArrowRight, Check, Minus } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { MarketingNav } from '../../components/marketing/MarketingNav';
import { Footer } from '../../components/marketing/Footer';

/**
 * The public price list. It quotes one real number, and the number has to be
 * the one the store will actually charge.
 *
 * Two things are deliberate here. The plans are the two Lemon Squeezy variants
 * `api/_lemonsqueezy.js` can resolve (`personal`, `team`) plus the free tier
 * `src/hooks/usePlanLimits.ts` really enforces - nothing else may appear. And
 * there is no checkout button: the checkout call needs a session token, so the
 * buy path is Settings > Billing, and this page's job is to send people to
 * sign up rather than to take a payment from an anonymous visitor.
 */

const FREE_CAPTURES_PER_MONTH = 30;
const FREE_MAX_RECORDS = 50;

const plans = [
  {
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    description: 'A real workspace, not a countdown. Enough to run your week and judge it for yourself.',
    items: [
      `${FREE_CAPTURES_PER_MONTH} captures a month`,
      `Up to ${FREE_MAX_RECORDS} records`,
      'Today, Plan, Orders, Cash Collection and Review',
      'CSV import for accounts and opportunities',
      'Full data export whenever you want it',
    ],
    absent: ['Search & Insights — not included on Free'],
    note: 'No card, and no trial that expires behind your back.',
    highlighted: false,
  },
  {
    name: 'Personal',
    price: '$10',
    cadence: 'per month',
    description: 'For one operator running the whole commercial loop - capture, quote, deliver, collect, review.',
    items: [
      'Unlimited capture and unlimited records',
      'Search & Insights over everything you have written down',
      'Cost Analysis: landed cost and margin before you quote',
      'Cash Collection: aging from the payment terms on the quote',
      'Business Vault: your accounts, people and deals as one map',
      'Pipeline Defense Briefs and shareable review packs',
      'Daily digest email',
    ],
    absent: [],
    note: 'Cancel anytime - you keep everything until the period you already paid for runs out.',
    highlighted: true,
  },
  {
    name: 'Team',
    price: 'Later',
    cadence: '',
    description: 'A shared workspace for the people you sell alongside. Not available yet, and not sold yet.',
    items: [
      'Shared workspace and review standards',
      'Manager workflows',
      'Team security review',
      'CRM sync',
    ],
    absent: [],
    note: 'The individual loop gets finished before anything is charged for a team.',
    highlighted: false,
  },
];

export function PricingPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      {/* Without this the tab said whatever index.html says, which is the
          landing page's name on a page that is not the landing page. */}
      <Helmet>
        <title>Pricing - Memoire</title>
        <meta
          name="description"
          content="Memoire is free to start and $10 a month for one person: unlimited capture, unlimited records, and Search & Insights across everything you have written down."
        />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <MarketingNav />
      <main className="px-4 pb-20 pt-28 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <header className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-blue">Pricing</p>
            <h1 className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">
              One person, one price. <span className="brand-gradient-text">$10 a month.</span>
            </h1>
            <p className="mt-5 text-base leading-7 text-slate-600">
              Start on the free plan and stay there until its ceiling gets in your way. When it does, upgrading takes
              one click inside the app. Payment is handled by Lemon Squeezy, which is the merchant of record and the
              seller on your invoice - Memoire never sees your card.
            </p>
          </header>

          <section className="mt-12 grid items-start gap-5 lg:grid-cols-3">
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={`flex h-full flex-col rounded-xl border bg-white p-7 transition hover:-translate-y-0.5 hover:shadow-elevated ${
                  plan.highlighted ? 'border-brand-blue shadow-elevated ring-1 ring-brand-blue/20' : 'border-slate-200 shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display text-xl font-bold">{plan.name}</h2>
                  {plan.highlighted && (
                    <span className="flex-none rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-brand-blue">
                      Most people
                    </span>
                  )}
                </div>
                <p className="mt-3">
                  <span className="font-display text-4xl font-extrabold text-slate-950">{plan.price}</span>
                  {plan.cadence && <span className="ml-1 text-sm font-semibold text-slate-500">{plan.cadence}</span>}
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-600">{plan.description}</p>
                <ul className="mt-6 flex-1 space-y-3">
                  {plan.items.map((item) => (
                    <li key={item} className="flex gap-2.5 text-sm leading-6 text-slate-700">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                      {item}
                    </li>
                  ))}
                  {plan.absent.map((item) => (
                    <li key={item} className="flex gap-2.5 text-sm leading-6 text-slate-400">
                      <Minus className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">{plan.note}</p>
              </article>
            ))}
          </section>

          <section className="mt-10 rounded-xl border border-blue-200 bg-blue-50 p-8 text-center">
            <h2 className="font-display text-2xl font-bold">Try it on your own week before you pay for it.</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              The demo runs on sample data that never leaves your browser. A free account runs on your real work, with
              no card and no expiry. Upgrade from Settings under Billing on the day it earns the $10, and cancel from
              the same place if it stops.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-blue px-5 py-3 text-sm font-bold text-white hover:bg-brand-blue-dark active:scale-[0.98]"
              >
                Start free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/demo"
                className="inline-flex items-center justify-center rounded-full border border-blue-200 bg-white px-5 py-3 text-sm font-bold text-brand-blue hover:bg-blue-100 active:scale-[0.98]"
              >
                Try demo first
              </Link>
              <Link
                to="/request-access"
                className="inline-flex items-center justify-center rounded-full border border-blue-200 bg-white px-5 py-3 text-sm font-bold text-brand-blue hover:bg-blue-100 active:scale-[0.98]"
              >
                Request guided access
              </Link>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
