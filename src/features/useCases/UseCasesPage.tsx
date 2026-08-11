import type { ReactNode } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Banknote,
  Briefcase,
  Check,
  FileText,
  Package,
  Users,
  X,
} from 'lucide-react';
import { MarketingNav } from '../../components/marketing/MarketingNav';
import { Footer } from '../../components/marketing/Footer';
import { CoverageHeatmap, OrderToCashFunnel } from '../../components/marketing/charts';
import { TRIAL_DAYS } from '../../utils/entitlement';

/**
 * Who this is for, told as four jobs rather than four industries.
 *
 * Deliberately not a vertical list. Memoire is sold worldwide and the same loop
 * serves a distributor in Jakarta and a consultant in Lisbon; naming industries
 * would repeat the mistake the landing page already made once, where pasting
 * one market's demo data made a global product look local.
 *
 * What varies between these four is the *shape of the follow-up* - how long the
 * cycle is, how many people are in it, and where the money gets stuck - so that
 * is what each section names. Every surface referenced here exists: the routes
 * are in src/config/featureRegistry.ts.
 */

type UseCase = {
  id: string;
  icon: typeof Briefcase;
  eyebrow: string;
  title: string;
  /** In the operator's voice. The sentence that makes them recognise themselves. */
  recognition: string;
  problem: string;
  /** Each pairs a real surface with what it does for this particular job. */
  moves: { surface: string; does: string }[];
  proof: string;
};

const useCases: UseCase[] = [
  {
    id: 'quota-carrier',
    icon: FileText,
    eyebrow: 'You carry the number',
    title: 'B2B sellers who answer for their own pipeline',
    recognition:
      '"My CRM has the stage. It does not have why the deal actually slipped, and that is what gets asked."',
    problem:
      'The company system records outcomes. Nobody records the evidence - the objection somebody raised in March, the proof you promised, the person who went quiet. So every review is rebuilt from memory and a scroll back through email.',
    moves: [
      { surface: 'Capture', does: 'Paste the thread. The account, amount, objection and next action come out and get filed against the deal.' },
      { surface: 'Today', does: 'Opens on the deals going silent and the promises you have not kept, ranked, with the reason attached.' },
      { surface: 'Review', does: 'Builds the defend / rescue / downgrade brief from what you captured, and shares it as a read-only link.' },
    ],
    proof: 'Walk into the forecast review with the answer already written.',
  },
  {
    id: 'founder-led',
    icon: Briefcase,
    eyebrow: 'You are also everything else',
    title: 'Founder-led sellers, consultants and agency owners',
    recognition:
      '"Selling is a third of my week. The other two thirds is why I forget to follow up."',
    problem:
      'There is no sales team, no ops person and no manager asking. Nothing goes wrong loudly - a proposal simply sits, a client stops replying, and by the time it surfaces the moment has passed.',
    moves: [
      { surface: 'Plan', does: 'One ledger of what is coming and what already happened, so the week has a shape you did not have to build.' },
      { surface: 'Proactive nudges', does: 'Capped at five. The few things that could embarrass you, not a second inbox.' },
      { surface: 'Daily digest', does: 'One email each morning with what needs you, so the loop survives the days you never open the app.' },
    ],
    proof: 'The follow-up happens on the weeks you are too busy to remember it.',
  },
  {
    id: 'trading-supply',
    icon: Package,
    eyebrow: 'The sale is only half the job',
    title: 'Trading, distribution and supply',
    recognition:
      '"We won it in May, shipped in June, and I found out in August that nobody invoiced it."',
    problem:
      'Winning is where most tools stop. The money is downstream of the win - a deposit, a delivery, an invoice, a payment - and every one of those steps is somewhere a deal can quietly stall with your cash inside it.',
    moves: [
      { surface: 'Orders', does: 'Contract to cash in seven steps, with how many days each order has been standing still.' },
      { surface: 'Cash Collection', does: 'Aging built from the payment terms already on the quote. Nothing re-entered.' },
      { surface: 'Cost Analysis', does: 'Goods, freight and duty landed against the sale - in its own currency if you buy and sell in different ones.' },
    ],
    proof: 'Know which order is stuck, on which step, holding how much.',
  },
  {
    id: 'complex-cycle',
    icon: Users,
    eyebrow: 'Nine months and six people',
    title: 'Long-cycle sales with procurement and a committee',
    recognition:
      '"The deal stalled at the last metre because nobody ever asked who signs."',
    problem:
      'A long cycle is not one conversation, it is thirty across a year, spread over people whose roles you half-know. The gaps are invisible until the deal is at the line and one of them turns out to be the gap that mattered.',
    moves: [
      { surface: 'Stakeholders', does: 'Who you know, where your champions are, and which accounts have nobody.' },
      { surface: 'Business Vault', does: 'Ranks what you do not know by what the relationship is worth - starting with who signs.' },
      { surface: 'Search & Insights', does: 'Answers what happened with an account last quarter, computed on your device.' },
    ],
    proof: 'Find the missing decision-maker in month two, not month nine.',
  },
];

const notFor = [
  'Ecommerce, marketplace or high-volume transactional selling',
  'Accounting, payroll or inventory management',
  'Enterprise teams needing SSO and an admin console today',
  'Anyone wanting a company system of record',
];

export function UseCasesPage() {
  return (
    <div className="min-h-screen bg-white text-slate-950">
      <Helmet>
        <title>Use Cases - Memoire</title>
        <meta
          name="description"
          content="Four jobs Memoire is built for: B2B sellers who answer for their own pipeline, founder-led sellers, trading and supply businesses chasing cash, and long-cycle sales with a buying committee."
        />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <MarketingNav />

      <main className="pt-16">
        {/* ── Hero ── */}
        <section className="relative overflow-hidden bg-navy-dark px-4 pb-20 pt-20 text-white sm:px-6 lg:px-8">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-32 left-1/2 h-[480px] w-[860px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(25,118,210,0.32),transparent)] blur-2xl" />
            <div className="absolute -right-28 bottom-0 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,rgba(67,160,71,0.20),transparent)] blur-2xl" />
          </div>
          <div className="relative mx-auto max-w-3xl text-center">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
              <span className="brand-gradient inline-block h-2 w-2 rounded-full" />
              Use cases
            </p>
            <h1 className="mt-6 font-display text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Four jobs, one loop,{' '}
              <span className="block brand-gradient-text">and the same failure underneath.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              These are not four industries. They are four shapes of follow-up — different cycle lengths, different
              numbers of people, different places the money gets stuck. What they share is that nothing ever fails
              loudly.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                to="/signup"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 font-display text-base font-bold text-navy shadow-lg shadow-black/30 transition hover:bg-slate-100 active:scale-[0.98]"
              >
                Start your {TRIAL_DAYS}-day trial
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center rounded-full border border-white/25 px-7 py-3.5 font-display text-base font-bold text-white transition hover:bg-white/10"
              >
                See pricing
              </Link>
            </div>
          </div>

          {/* Jump strip: four jobs, named, before anybody scrolls. */}
          <div className="relative mx-auto mt-14 grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {useCases.map(({ id, icon: Icon, eyebrow, title }) => (
              <a
                key={id}
                href={`#${id}`}
                className="group rounded-card border border-white/10 bg-white/[0.04] p-5 text-left transition hover:border-white/25 hover:bg-white/[0.08]"
              >
                <span className="brand-gradient inline-flex h-9 w-9 items-center justify-center rounded-full text-white">
                  <Icon className="h-4 w-4" />
                </span>
                <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200">{eyebrow}</p>
                <p className="mt-1.5 text-sm font-bold leading-snug text-white">{title}</p>
              </a>
            ))}
          </div>
        </section>

        {/* ── The four ── */}
        {useCases.map((useCase, index) => (
          <UseCaseBlock
            key={useCase.id}
            useCase={useCase}
            tinted={index % 2 === 1}
            visual={
              useCase.id === 'trading-supply' ? (
                <div className="rounded-card bg-navy-dark p-2">
                  <OrderToCashFunnel />
                </div>
              ) : useCase.id === 'complex-cycle' ? (
                <CoverageHeatmap />
              ) : null
            }
          />
        ))}

        {/* ── Not for ── */}
        <section className="bg-white px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl rounded-card border border-slate-200 bg-slate-50 p-8">
            <h2 className="font-display text-xl font-bold text-slate-500">Not what Memoire is for</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Being useful to everyone is how a tool ends up useful to nobody. If you are here, it is not for you.
            </p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {notFor.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm leading-6 text-slate-500">
                  <X className="mt-0.5 h-4 w-4 flex-none text-slate-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="relative overflow-hidden bg-navy-dark px-4 py-20 text-white sm:px-6 lg:px-8">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/2 h-[360px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(25,118,210,0.28),transparent)] blur-2xl" />
          </div>
          <div className="relative mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              Recognise your own week in any of those?
            </h2>
            <p className="mx-auto mt-4 text-base leading-7 text-slate-300">
              Seven days on your real work, cancel inside them and pay nothing.
            </p>
            <Link
              to="/signup"
              className="group mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 font-display text-base font-bold text-navy transition hover:bg-slate-100 active:scale-[0.98]"
            >
              Start your {TRIAL_DAYS}-day trial
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function UseCaseBlock({
  useCase,
  tinted,
  visual,
}: {
  useCase: UseCase;
  tinted: boolean;
  visual: ReactNode;
}) {
  const { id, icon: Icon, eyebrow, title, recognition, problem, moves, proof } = useCase;
  return (
    <section id={id} className={`scroll-mt-20 px-4 py-20 sm:px-6 lg:px-8 ${tinted ? 'bg-page' : 'bg-white'}`}>
      <div className={`mx-auto grid max-w-6xl items-start gap-12 ${visual ? 'lg:grid-cols-[1.05fr_0.95fr]' : ''}`}>
        <div className={visual ? 'min-w-0' : 'mx-auto max-w-3xl'}>
          <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.22em] text-brand-blue">
            <Icon className="h-4 w-4" />
            {eyebrow}
          </p>
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{title}</h2>

          <blockquote className="mt-6 border-l-2 border-brand-blue pl-4 font-display text-lg font-bold leading-snug text-slate-800">
            {recognition}
          </blockquote>

          <p className="mt-5 text-base leading-7 text-slate-600">{problem}</p>

          <ul className="mt-7 space-y-3">
            {moves.map((move) => (
              <li key={move.surface} className="flex gap-3 rounded-card border border-slate-200 bg-white p-4">
                <Check className="mt-0.5 h-4 w-4 flex-none text-brand-blue" />
                <p className="text-sm leading-6 text-slate-600">
                  <span className="font-display font-bold text-slate-950">{move.surface}</span>
                  {' — '}
                  {move.does}
                </p>
              </li>
            ))}
          </ul>

          <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800">
            <Banknote className="h-4 w-4" />
            {proof}
          </p>
        </div>

        {visual && <div className="w-full min-w-0">{visual}</div>}
      </div>
    </section>
  );
}
