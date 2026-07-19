import type { ReactNode } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Banknote,
  BellRing,
  Check,
  ClipboardCheck,
  Database,
  FileText,
  Inbox,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import { MarketingNav } from '../components/marketing/MarketingNav';
import { Footer } from '../components/marketing/Footer';

const trustChips = [
  { icon: ShieldCheck, text: 'No CRM writeback — ever' },
  { icon: Database, text: 'Works from CSV exports you already have' },
  { icon: LockKeyhole, text: 'Demo data stays in this browser' },
  { icon: Sparkles, text: 'Rule-based first, AI assist optional' },
];

const loopSteps = [
  {
    label: 'Capture',
    title: 'Type it once, messy is fine',
    text: 'A note, a pasted email, a meeting recap — Memoire turns it into structured evidence.',
  },
  {
    label: 'Today',
    title: 'Start where the risk is',
    text: 'One screen with the top actions, silent deals, and nudges that actually need you.',
  },
  {
    label: 'Money',
    title: 'Follow the money',
    text: 'Quote to order to invoice to cash — see where every euro or dollar is stuck.',
  },
  {
    label: 'Review',
    title: 'Walk in with answers',
    text: 'Defend, rescue, or downgrade every deal with proof — before someone asks.',
  },
];

const notCrmPoints = [
  ['No CRM writeback', 'Review and prepare without ever changing source CRM records.'],
  ['Read-only working copy', 'CSV imports from CRM, Excel, Notion, or private pipeline sheets.'],
  ['Private demo sandbox', 'Try sample data locally before sign-in; account work syncs where configured.'],
  ['Private preparation', 'Build your deal story before walking into forecast review.'],
] as const;

const bestFor = [
  'B2B salespeople with weekly or monthly pipeline reviews',
  'Founder-led sellers and solo operators who own their own follow-up',
  'Consultants, freelancers, agencies, and creators selling client work',
  'Pharma, life science, lab, industrial, and complex technical sales',
  'Reps who run CRM plus Excel, Notion, private notes, or memory',
  'People managing long-cycle deals with procurement and technical stakeholders',
];

const notIdealFor = [
  'Enterprise teams requiring SSO, admin controls, and formal security review today',
  'Teams needing full Salesforce or HubSpot native sync right now',
  'Anyone wanting a system of record or a manager forecasting dashboard',
  'Invoicing, inventory, ecommerce, marketplace, or delivery management',
  'Quick transactional selling with no meaningful follow-up loop',
];

const pricingPlans = [
  {
    name: 'Solo',
    price: '$15–25',
    cadence: '/month',
    description: 'For one person managing their own follow-up and business memory.',
    items: ['Pipeline review workspace', 'Capture and calendar', 'CSV refresh', 'Defense brief', 'Playbook and assets'],
    highlighted: true,
  },
  {
    name: 'Pro',
    price: '$29–49',
    cadence: '/month',
    description: 'For power users with deeper review history and exports.',
    items: ['More review pack history', 'Advanced exports', 'Deeper automation later', 'Richer proof assets', 'Priority workflow polish'],
    highlighted: false,
  },
  {
    name: 'Team',
    price: 'Later',
    cadence: '',
    description: 'For managers and teams, after the individual workflow is validated.',
    items: ['Shared review standards later', 'Team security review later', 'CRM sync later', 'Manager workflows later'],
    highlighted: false,
  },
];

const faqs = [
  {
    question: 'Is Memoire a CRM?',
    answer:
      'No. Your CRM tracks records for the company. Memoire helps the individual salesperson think, remember, prepare, and defend their pipeline.',
  },
  {
    question: 'Does Memoire write back to my CRM?',
    answer:
      'No CRM writeback is built today. Memoire works from CSV imports and local/cloud working data so you can review safely without changing CRM records.',
  },
  {
    question: 'Where is my data stored?',
    answer:
      'Demo sandbox data stays local in your browser. Signed-in account work uses cloud sync where configured, with local fallback behavior shown inside the app.',
  },
  {
    question: 'Can I use CSV exports from Salesforce, HubSpot, or Excel?',
    answer:
      'Yes. The current workflow is designed around CSV import and refresh from CRM exports, spreadsheets, or private pipeline working copies.',
  },
  {
    question: 'Does AI send my data externally?',
    answer:
      'Most review logic is rule-based. Capture AI assist is optional and only uses a configured server-side endpoint. Do not use AI assist with confidential data unless your provider is approved.',
  },
  {
    question: 'Who is Memoire for?',
    answer:
      'People who sell without a sales team: B2B salespeople, founder-led sellers, consultants, freelancers, agency owners, and creators managing meaningful client, buyer, or partnership follow-up.',
  },
  {
    question: 'Is Memoire for C2B or C2C selling?',
    answer:
      'Only when there is a real sales-memory loop: client context, proposal or partnership follow-up, objections, stakeholders, and next actions. Memoire is not built for ecommerce, inventory, marketplace listings, or one-off transactions.',
  },
  {
    question: 'What is the Pipeline Defense Brief?',
    answer:
      'A manager-ready summary of which deals can be defended, rescued, downgraded, or monitored — plus the proof and next actions needed for review.',
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-950">
      <Helmet>
        <title>Memoire - Personal Business Activity OS for B2B and Solo Operators</title>
        <meta
          name="description"
          content="Memoire is a Personal Business Activity OS used beside CRM, spreadsheets, and notes: capture every commercial activity, see where the money sits, prepare reviews, and never let anything go silent."
        />
        <meta name="robots" content="noindex, nofollow" />
        <meta property="og:title" content="Memoire - Personal Business Activity OS for B2B and Solo Operators" />
        <meta
          property="og:description"
          content="Never enter a pipeline review unprepared. Capture messy notes and emails, find risks in Today, and copy manager-ready Pipeline Defense answers."
        />
        <meta property="og:type" content="website" />
      </Helmet>

      <MarketingNav />

      <main className="pt-16">
        {/* ── Hero ── */}
        <section className="relative overflow-hidden bg-navy-dark px-4 pb-16 pt-20 text-white sm:px-6 lg:px-8 lg:pb-24 lg:pt-28">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(25,118,210,0.35),transparent)] blur-2xl" />
            <div className="absolute -right-32 top-24 h-96 w-96 rounded-full bg-[radial-gradient(closest-side,rgba(0,172,193,0.22),transparent)] blur-2xl" />
            <div className="absolute -left-40 bottom-0 h-96 w-96 rounded-full bg-[radial-gradient(closest-side,rgba(123,31,162,0.18),transparent)] blur-2xl" />
          </div>

          <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
                <span className="brand-gradient inline-block h-2 w-2 rounded-full" />
                Personal Business Activity OS
              </p>
              <h1 className="mt-6 font-display text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
                Nothing in your business
                <span className="block brand-gradient-text">goes silent.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
                Memoire works beside your CRM, spreadsheets, and notes — not instead of them.
                Capture every meeting, quote, delivery, and payment. See where the money sits.
                Walk into every review with answers.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/demo"
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 font-display text-base font-bold text-navy shadow-lg shadow-black/30 transition hover:bg-slate-100 active:scale-[0.98]"
                >
                  Try the live demo
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  to="/request-access"
                  className="inline-flex items-center justify-center rounded-full border border-white/25 px-7 py-3.5 font-display text-base font-bold text-white transition hover:bg-white/10"
                >
                  Request access
                </Link>
              </div>
              <p className="mt-5 text-sm leading-6 text-slate-400">
                Private beta · No credit card · Demo data never leaves this browser
              </p>
            </div>

            {/* Hero product mock */}
            <div className="relative mx-auto w-full max-w-lg">
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-2 shadow-2xl shadow-black/40 backdrop-blur">
                <div className="rounded-xl bg-white p-5 text-slate-950">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Today · Wednesday</p>
                      <p className="mt-1 font-display text-lg font-bold">3 things need you. The rest is quiet.</p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">On track</span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <HeroMetric label="Quotes waiting" value="$18.4k" tone="blue" />
                    <HeroMetric label="Unpaid invoices" value="$6.2k" tone="amber" />
                    <HeroMetric label="Won this month" value="$12.9k" tone="emerald" />
                  </div>

                  <div className="mt-4 space-y-2">
                    <HeroAction tone="rose" title="Delta Labs quote — silent for 6 days" hint="Draft the follow-up" />
                    <HeroAction tone="amber" title="Invoice #241 due tomorrow" hint="Send the reminder" />
                    <HeroAction tone="blue" title="Northwind demo done" hint="Book the next touch" />
                  </div>
                </div>
              </div>

              {/* Floating review card */}
              <div className="absolute -bottom-8 -left-4 hidden w-64 rounded-xl border border-white/10 bg-navy-light p-4 shadow-2xl shadow-black/50 sm:block">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-200">Review pack</p>
                  <span className="rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">Ready</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <ReviewStat label="Defend" value="3" className="text-emerald-300" />
                  <ReviewStat label="Rescue" value="2" className="text-amber-300" />
                  <ReviewStat label="Downgrade" value="1" className="text-rose-300" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Trust bar ── */}
        <section className="border-b border-slate-100 bg-white px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {trustChips.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2.5 text-sm font-semibold text-slate-600">
                <Icon className="h-4 w-4 text-brand-blue" />
                {text}
              </div>
            ))}
          </div>
        </section>

        {/* ── The loop ── */}
        <section className="bg-white px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <SectionHeader
              eyebrow="One working loop"
              title="Every activity connects to money. Every glance becomes an action."
              text="Memoire is built around one loop — not forty features. Four moves, repeated weekly, and nothing slips."
            />
            <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {loopSteps.map((step, index) => (
                <div key={step.label} className="relative rounded-card border border-slate-200 bg-white p-6 shadow-card transition hover:-translate-y-1 hover:shadow-elevated">
                  <div className="flex items-center gap-3">
                    <span className="brand-gradient inline-flex h-9 w-9 items-center justify-center rounded-full font-display text-sm font-extrabold text-white">
                      {index + 1}
                    </span>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{step.label}</p>
                  </div>
                  <h3 className="mt-4 font-display text-lg font-bold text-slate-950">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Not a CRM ── */}
        <section className="bg-navy px-4 py-20 text-white sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-cyan-300">Not a CRM</p>
              <h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Your CRM keeps records for the company. Memoire prepares <span className="brand-gradient-text">you</span>.
              </h2>
              <p className="mt-5 text-base leading-7 text-slate-300">
                CRM fields, spreadsheets, and private notes hold the official record. Memoire is your private
                working layer for evidence, objections, proof gaps, stakeholders, and review answers.
              </p>
              <Link to="/demo" className="mt-7 inline-flex items-center gap-2 font-display text-sm font-bold text-cyan-300 transition hover:text-cyan-200">
                See the difference in the demo
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {notCrmPoints.map(([title, text]) => (
                <div key={title} className="rounded-card border border-white/10 bg-white/5 p-5">
                  <h3 className="font-display font-bold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Narrative: Capture ── */}
        <section id="features" className="bg-white px-4 py-20 sm:px-6 lg:px-8">
          <NarrativeBlock
            eyebrow="Capture"
            icon={Inbox}
            title="Type it once. Messy is fine."
            text="Paste a note, an email thread, or a meeting recap. Memoire extracts the account, amount, objection, and next action — and files the proof where you can find it again."
            bullets={[
              'Structured evidence from unstructured notes',
              'Proof asset vault: proposals, objection responses, compliance notes',
              'No forms, no required fields, no data entry ritual',
            ]}
            visual={<CaptureMock />}
          />
        </section>

        {/* ── Narrative: Today ── */}
        <section className="bg-page px-4 py-20 sm:px-6 lg:px-8">
          <NarrativeBlock
            flip
            eyebrow="Today"
            icon={Sun}
            title="Start where the risk is."
            text="Today is a command center, not a dashboard. It surfaces the deals going silent, the overdue promises, and the top three actions that matter — before they surprise you."
            bullets={[
              'Silence detection on every deal and client',
              'Proactive nudges: stale actions, missing roles, weak evidence',
              'One glance, one action — never forty widgets',
            ]}
            visual={<TodayMock />}
          />
        </section>

        {/* ── Narrative: Money ── */}
        <section className="bg-white px-4 py-20 sm:px-6 lg:px-8">
          <NarrativeBlock
            eyebrow="Money"
            icon={Banknote}
            title="See where the money sits."
            text="Every activity connects to a money state: quoted, ordered, invoiced, paid. Won a deal? Memoire watches the delivery and the invoice so winning is not where your attention ends."
            bullets={[
              'Quote → order → invoice → cash, in one view',
              'Post-won watch: delivery and payment never go quiet',
              'Your own obligations tracked, not just what clients owe you',
            ]}
            visual={<MoneyMock />}
          />
        </section>

        {/* ── Narrative: Review ── */}
        <section className="bg-page px-4 py-20 sm:px-6 lg:px-8">
          <NarrativeBlock
            flip
            eyebrow="Review & learn"
            icon={FileText}
            title="Walk in with answers."
            text="Sort deals into defend, rescue, or downgrade — with proof, gaps, and next actions attached. Then log outcomes and learn what your follow-ups actually revived."
            bullets={[
              'Pipeline Defense Brief: manager-ready answers in minutes',
              'MEDDIC stakeholder map with real evidence, not guessed labels',
              'Objection debt and outcome learning — history, not prediction',
            ]}
            visual={<ReviewMock />}
          />
        </section>

        {/* ── Audience ── */}
        <section className="bg-white px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <SectionHeader
              eyebrow="Honest fit"
              title="Built for people who sell without a sales team."
              text="Memoire is deliberately narrow. If it is not for you, we would rather you know on this page."
            />
            <div className="mt-12 grid gap-6 lg:grid-cols-2">
              <div className="rounded-card border border-emerald-200 bg-emerald-50/50 p-7">
                <h3 className="font-display text-xl font-bold text-slate-950">Best for</h3>
                <ul className="mt-5 space-y-3">
                  {bestFor.map((item) => (
                    <li key={item} className="flex gap-3 text-sm leading-6 text-slate-700">
                      <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-card border border-slate-200 bg-slate-50 p-7">
                <h3 className="font-display text-xl font-bold text-slate-500">Not ideal yet for</h3>
                <ul className="mt-5 space-y-3">
                  {notIdealFor.map((item) => (
                    <li key={item} className="flex gap-3 text-sm leading-6 text-slate-500">
                      <X className="mt-0.5 h-4 w-4 flex-none text-slate-400" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section id="pricing" className="bg-page px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <SectionHeader
              eyebrow="Early pricing hypothesis — not final"
              title="Pricing is being validated with early users."
              text="No payment checkout is active here. These are working assumptions for customer discovery."
            />
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {pricingPlans.map((plan) =>
                plan.highlighted ? (
                  <div key={plan.name} className="gradient-border-card shadow-elevated">
                    <div className="gradient-border-card-inner flex h-full flex-col !p-7">
                      <PlanBody plan={plan} />
                    </div>
                  </div>
                ) : (
                  <div key={plan.name} className="flex flex-col rounded-card border border-slate-200 bg-white p-7 shadow-card">
                    <PlanBody plan={plan} />
                  </div>
                ),
              )}
            </div>
            <div className="mt-10 text-center">
              <div className="flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  to="/signup"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-blue px-7 py-3.5 font-display text-sm font-bold text-white transition hover:bg-brand-blue-dark active:scale-[0.98]"
                >
                  Create early-access account
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/request-access"
                  className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-7 py-3.5 font-display text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  Request guided access
                </Link>
              </div>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-500">
                No payment checkout is active. Create an account directly, or request guided access for workflow support.
              </p>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="bg-white px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <SectionHeader
              eyebrow="Privacy & FAQ"
              title="Built for sensitive pipeline preparation."
              text="Customer, tender, pricing, competitor, and forecast data is sensitive. Memoire is careful about it — and about what it claims."
            />
            <div className="mt-10 divide-y divide-slate-200 rounded-card border border-slate-200 bg-white">
              {faqs.map((faq) => (
                <details key={faq.question} className="group px-6 py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display font-bold text-slate-950 [&::-webkit-details-marker]:hidden">
                    {faq.question}
                    <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-slate-200 text-slate-500 transition group-open:rotate-45">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M7 1v12M1 7h12" />
                      </svg>
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="relative overflow-hidden bg-navy-dark px-4 py-24 text-white sm:px-6 lg:px-8">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/2 h-[420px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(25,118,210,0.30),transparent)] blur-2xl" />
          </div>
          <div className="relative mx-auto max-w-3xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-cyan-300">Early access</p>
            <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
              Bring a stronger story to your <span className="brand-gradient-text">next review</span>.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-slate-300">
              Try the demo sandbox, create an early-access account, or request guided support for your real workflow.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                to="/demo"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 font-display text-base font-bold text-navy transition hover:bg-slate-100 active:scale-[0.98]"
              >
                Try the live demo
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/signup"
                className="inline-flex items-center justify-center rounded-full border border-white/25 px-7 py-3.5 font-display text-base font-bold text-white transition hover:bg-white/10"
              >
                Create account
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

/* ── Section building blocks ── */

function SectionHeader({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="text-sm font-bold uppercase tracking-[0.22em] text-brand-blue">{eyebrow}</p>
      <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{title}</h2>
      <p className="mt-4 text-base leading-7 text-slate-600">{text}</p>
    </div>
  );
}

function NarrativeBlock({
  eyebrow,
  icon: Icon,
  title,
  text,
  bullets,
  visual,
  flip = false,
}: {
  eyebrow: string;
  icon: typeof Inbox;
  title: string;
  text: string;
  bullets: string[];
  visual: ReactNode;
  flip?: boolean;
}) {
  return (
    <div className={`mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 ${flip ? 'lg:[&>*:first-child]:order-2' : ''}`}>
      <div>
        <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.22em] text-brand-blue">
          <Icon className="h-4 w-4" />
          {eyebrow}
        </p>
        <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{title}</h2>
        <p className="mt-5 text-base leading-7 text-slate-600">{text}</p>
        <ul className="mt-6 space-y-3">
          {bullets.map((bullet) => (
            <li key={bullet} className="flex gap-3 text-sm leading-6 text-slate-700">
              <Check className="mt-0.5 h-4 w-4 flex-none text-brand-blue" />
              {bullet}
            </li>
          ))}
        </ul>
        <Link to="/demo" className="mt-7 inline-flex items-center gap-2 font-display text-sm font-bold text-brand-blue transition hover:text-brand-blue-dark">
          Try it in the demo
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="mx-auto w-full max-w-md">{visual}</div>
    </div>
  );
}

/* ── Hero mock pieces ── */

function HeroMetric({ label, value, tone }: { label: string; value: string; tone: 'blue' | 'amber' | 'emerald' }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-800',
    amber: 'bg-amber-50 text-amber-800',
    emerald: 'bg-emerald-50 text-emerald-800',
  };
  return (
    <div className={`rounded-lg p-2.5 ${tones[tone]}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-0.5 font-display text-base font-extrabold">{value}</p>
    </div>
  );
}

function HeroAction({ tone, title, hint }: { tone: 'rose' | 'amber' | 'blue'; title: string; hint: string }) {
  const dots = { rose: 'bg-rose-500', amber: 'bg-amber-500', blue: 'bg-blue-500' };
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5">
      <span className={`h-2 w-2 flex-none rounded-full ${dots[tone]}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
      </div>
      <span className="hidden flex-none text-xs font-semibold text-brand-blue sm:block">{hint}</span>
    </div>
  );
}

function ReviewStat({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className="rounded-lg bg-white/5 py-2">
      <p className={`font-display text-xl font-extrabold ${className}`}>{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

/* ── Narrative visuals (pure CSS mocks) ── */

function MockFrame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-elevated">
      <div className="rounded-xl bg-slate-50 p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">{label}</p>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

function CaptureMock() {
  return (
    <MockFrame label="Capture · evidence input">
      <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-500">
        "Called Delta Labs — Minh likes the proposal but procurement wants a 3-week lead time guarantee. Sending local support proof Friday. ~$14k."
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {[
          ['Account', 'Delta Labs'],
          ['Amount', '$14,000'],
          ['Objection', 'Lead time'],
          ['Next', 'Proof by Friday'],
        ].map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
            <span className="text-blue-400">{k}</span>
            {v}
          </span>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-emerald-700">
        <ClipboardCheck className="h-3.5 w-3.5" />
        Structured evidence saved — review before it counts
      </div>
    </MockFrame>
  );
}

function TodayMock() {
  return (
    <MockFrame label="Today · nudges">
      <div className="space-y-2.5">
        {[
          { icon: BellRing, text: 'Aster Clinic has been silent for 9 days', action: 'Draft follow-up', tone: 'text-rose-600' },
          { icon: BellRing, text: 'No Economic Buyer identified on Northwind', action: 'Map stakeholders', tone: 'text-amber-600' },
          { icon: BellRing, text: 'Quote #88 expires in 3 days', action: 'Nudge or extend', tone: 'text-blue-600' },
        ].map(({ icon: Icon, text, action, tone }) => (
          <div key={text} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-3">
            <Icon className={`h-4 w-4 flex-none ${tone}`} />
            <p className="min-w-0 flex-1 text-sm font-medium text-slate-800">{text}</p>
            <span className="flex-none rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{action}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-xs font-semibold text-slate-400">Everything else is quiet — on purpose.</p>
    </MockFrame>
  );
}

function MoneyMock() {
  const stages = [
    { label: 'Quoted', value: '$18.4k', width: 'w-full', color: 'bg-spectrum-blue' },
    { label: 'Ordered', value: '$11.0k', width: 'w-4/5', color: 'bg-spectrum-indigo' },
    { label: 'Invoiced', value: '$6.2k', width: 'w-3/5', color: 'bg-spectrum-purple' },
    { label: 'Paid', value: '$12.9k', width: 'w-2/5', color: 'bg-spectrum-green' },
  ];
  return (
    <MockFrame label="Money · where it sits">
      <div className="space-y-3">
        {stages.map((stage) => (
          <div key={stage.label}>
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-500">{stage.label}</span>
              <span className="font-display text-sm font-extrabold text-slate-900">{stage.value}</span>
            </div>
            <div className="mt-1 h-2.5 rounded-full bg-slate-200">
              <div className={`h-2.5 rounded-full ${stage.width} ${stage.color}`} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-800">
        Post-won watch: Delta Labs delivery confirmed — invoice not sent yet
      </div>
    </MockFrame>
  );
}

function ReviewMock() {
  return (
    <MockFrame label="Pipeline Defense · review pack">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ['Defend', '3', 'border-emerald-200 bg-emerald-50 text-emerald-700'],
          ['Rescue', '2', 'border-amber-200 bg-amber-50 text-amber-700'],
          ['Downgrade', '1', 'border-rose-200 bg-rose-50 text-rose-700'],
        ].map(([label, value, cls]) => (
          <div key={label} className={`rounded-lg border p-2.5 ${cls}`}>
            <p className="font-display text-xl font-extrabold">{value}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-2">
        {[
          ['Strategic validation program', 'Defensible', 'Budget approved, champion active, proof ready.'],
          ['Technical workflow proposal', 'Rescue', 'Lead time open — local support proof due this week.'],
        ].map(([title, tag, body]) => (
          <div key={title} className="rounded-lg border border-slate-200 bg-white p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-slate-900">{title}</p>
              <span className="flex-none rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">{tag}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">{body}</p>
          </div>
        ))}
      </div>
    </MockFrame>
  );
}

/* ── Pricing ── */

function PlanBody({ plan }: { plan: (typeof pricingPlans)[number] }) {
  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl font-bold text-slate-950">{plan.name}</h3>
        {plan.highlighted && (
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-brand-blue">Start here</span>
        )}
      </div>
      <p className="mt-3">
        <span className="font-display text-4xl font-extrabold text-slate-950">{plan.price}</span>
        <span className="text-sm font-semibold text-slate-500">{plan.cadence}</span>
      </p>
      <p className="mt-3 text-sm leading-6 text-slate-600">{plan.description}</p>
      <ul className="mt-6 flex-1 space-y-2.5">
        {plan.items.map((item) => (
          <li key={item} className="flex gap-2.5 text-sm leading-6 text-slate-700">
            <Check className="mt-0.5 h-4 w-4 flex-none text-brand-blue" />
            {item}
          </li>
        ))}
      </ul>
    </>
  );
}
