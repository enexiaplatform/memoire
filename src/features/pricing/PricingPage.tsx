import { ArrowRight, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MarketingNav } from '../../components/marketing/MarketingNav';
import { Footer } from '../../components/marketing/Footer';
import { PageSeo } from '../../components/marketing/PageSeo';
import { breadcrumbSchema, softwareApplicationSchema } from '../../config/structuredData';
import { PERSONAL_MONTHLY_PRICE_USD, TRIAL_DAYS } from '../../utils/entitlement';

/**
 * The public price list. It quotes one real number, and the number has to be
 * the one the store will actually charge.
 *
 * Two things are deliberate here. The offer is the one Lemon Squeezy variant
 * `api/_lemonsqueezy.js` can resolve today (`personal`) plus the trial that
 * `src/utils/entitlement.ts` really applies - nothing else may appear. There is
 * no free tier: the one this page used to advertise quoted capture and record
 * ceilings that no code enforced.
 *
 * And there is no checkout button: the checkout call needs a session token, so
 * the buy path is Settings > Billing, and this page's job is to send people to
 * sign up rather than to take a payment from an anonymous visitor.
 */

const plans = [
  {
    name: `${TRIAL_DAYS}-day trial`,
    price: '$0',
    cadence: `for ${TRIAL_DAYS} days`,
    description: 'The whole product, on your own work, with nothing held back to make a point.',
    items: [
      'Every feature the paid plan has',
      'Card taken up front, charged only when it ends',
      'Cancel inside the trial and you pay nothing',
      'Your data stays readable and exportable either way',
    ],
    note: 'There is no free tier after it. A plan that is permanently almost-enough helps nobody.',
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
    note: 'The individual loop gets finished before anything is charged for a team.',
    highlighted: false,
  },
];

export function PricingPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      {/* Without this the tab said whatever index.html says, which is the
          landing page's name on a page that is not the landing page.

          The `Offer` is repeated here rather than left on the home page alone
          because this is the URL a price query resolves to, and a page that
          quotes a price in prose without one is a page whose price gets
          paraphrased instead of quoted. */}
      <PageSeo
        path="/pricing"
        title={`Pricing - $${PERSONAL_MONTHLY_PRICE_USD} a Month for One Person | Memoire`}
        /* Under 155 characters so a search result shows the whole thing - see
           the note on the landing page's description. */
        description={`$${PERSONAL_MONTHLY_PRICE_USD} a month for one person, after a ${TRIAL_DAYS}-day free trial you can cancel without paying. Unlimited capture and records. No free tier.`}
        jsonLd={[
          softwareApplicationSchema({
            monthlyPriceUsd: PERSONAL_MONTHLY_PRICE_USD,
            trialDays: TRIAL_DAYS,
            featureList: plans[1].items,
          }),
          breadcrumbSchema([
            { name: 'Memoire', path: '/' },
            { name: 'Pricing', path: '/pricing' },
          ]),
        ]}
      />
      <MarketingNav />
      <main className="px-4 pb-20 pt-28 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <header className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-blue">Pricing</p>
            <h1 className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">
              One person, one price. <span className="brand-gradient-text">$10 a month.</span>
            </h1>
            <p className="mt-5 text-base leading-7 text-slate-600">
              Seven days of the whole product on your own work. Lemon Squeezy takes the card up front and holds the
              first payment until the trial ends, so cancelling inside the seven days costs nothing. After that it is
              $10 a month. Lemon Squeezy is the merchant of record and the seller on your invoice, and
              Memoire never sees your card number.
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
                </ul>
                <p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">{plan.note}</p>
              </article>
            ))}
          </section>

          <section className="mt-10 rounded-xl border border-blue-200 bg-blue-50 p-8 text-center">
            <h2 className="font-display text-2xl font-bold">Try it on your own week before you pay for it.</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              The trial runs on your real work, not on a sample company - seven days is enough to capture a week and
              see what it caught. Start it from Settings under Billing, and cancel from the same place; inside the
              seven days that costs nothing.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-blue px-5 py-3 text-sm font-bold text-white hover:bg-brand-blue-dark active:scale-[0.98]"
              >
                Start the trial
                <ArrowRight className="h-4 w-4" />
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
