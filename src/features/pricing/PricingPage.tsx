import { ArrowRight, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MarketingNav } from '../../components/marketing/MarketingNav';
import { Footer } from '../../components/marketing/Footer';

const plans = [
  {
    name: 'Solo',
    price: '$15-25/month',
    description: 'Working price range for an individual B2B salesperson.',
    items: ['Pipeline review workspace', 'Daily capture and account memory', 'CSV pipeline refresh', 'Pipeline Defense Briefs'],
  },
  {
    name: 'Pro',
    price: '$29-49/month',
    description: 'Working price range for users who need deeper history and exports.',
    items: ['Everything in Solo', 'Longer review-pack history', 'Advanced exports', 'Expanded proof assets and playbooks'],
  },
  {
    name: 'Team',
    price: 'Not available yet',
    description: 'Team administration and shared workflows are outside the current early-access scope.',
    items: ['No team checkout today', 'No manager dashboard today', 'No CRM writeback today', 'No enterprise SSO today'],
  },
];

export function PricingPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <MarketingNav />
      <main className="px-4 pb-20 pt-28 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <header className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">Early pricing hypothesis</p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Pricing is still being validated.</h1>
            <p className="mt-5 text-base leading-7 text-slate-600">
              Memoire is currently request-access only. No payment checkout is active. Early users help validate the
              workflow, security expectations, and the right individual plan.
            </p>
          </header>

          <section className="mt-12 grid gap-5 lg:grid-cols-3">
            {plans.map((plan) => (
              <article key={plan.name} className="flex flex-col rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold">{plan.name}</h2>
                <p className="mt-3 text-3xl font-extrabold text-blue-700">{plan.price}</p>
                <p className="mt-3 text-sm leading-6 text-slate-600">{plan.description}</p>
                <ul className="mt-6 flex-1 space-y-3">
                  {plan.items.map((item) => (
                    <li key={item} className="flex gap-2 text-sm leading-6 text-slate-700">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </section>

          <section className="mt-10 rounded-lg border border-blue-200 bg-blue-50 p-6 text-center">
            <h2 className="text-2xl font-bold">Test your real pipeline-review workflow first.</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Request access without submitting confidential customer data. We will use your workflow context only to
              evaluate product fit during early access.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                to="/request-access"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800"
              >
                Request early access
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/demo"
                className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-white px-5 py-3 text-sm font-bold text-blue-700 hover:bg-blue-100"
              >
                Try demo first
              </Link>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
