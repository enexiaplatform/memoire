import type { ReactNode } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Banknote,
  BellRing,
  Check,
  ClipboardCheck,
  Coins,
  Download,
  FileText,
  Inbox,
  Network,
  ShieldCheck,
  Smartphone,
  Sun,
  X,
} from 'lucide-react';
import { MarketingNav } from '../components/marketing/MarketingNav';
import { Footer } from '../components/marketing/Footer';

/**
 * The public page, and the only claim it is allowed to make is one the app can
 * keep. Two rules have already been broken here once and are worth naming:
 *
 * 1. No AI. Memoire has no AI service, no key and no endpoint - capture parses
 *    on the device and Ask computes from your own history. This page used to
 *    offer optional AI help in the capture box, which was a promise of
 *    something that does not exist. scripts/verify-no-ai-dependency.mjs guards
 *    the code; the commercial-readiness contract guards this copy.
 * 2. No invented pricing. The plans below are the two Lemon Squeezy variants
 *    the server will actually resolve (`personal`, `team`) and the free tier
 *    that src/hooks/usePlanLimits.ts really enforces. A tier that is not in
 *    PLAN_LIMITS does not belong on this page.
 *
 * Checkout is deliberately not on this page. The checkout call needs a session
 * token, so the buy button lives in Settings > Billing where there is one -
 * and scripts/verify-commercial-readiness.mjs fails the build if a checkout
 * call ever appears in this file.
 */

const trustChips = [
  { icon: ShieldCheck, text: 'No AI service — answers are computed on your device' },
  { icon: Network, text: 'No CRM writeback — ever' },
  { icon: Download, text: 'Export everything, delete anytime' },
  { icon: Smartphone, text: 'Installs like an app, keeps working offline' },
];

const loopSteps = [
  {
    label: 'Capture',
    title: 'Type it once, messy is fine',
    text: 'A note, a pasted email, a meeting recap — Memoire pulls out the account, the amount and the next action.',
  },
  {
    label: 'Today',
    title: 'Start where the risk is',
    text: 'One screen with the top actions, the deals going silent, and the nudges that actually need you.',
  },
  {
    label: 'Orders & cash',
    title: 'Follow the money',
    text: 'Quote to order to delivery to payment — see exactly where every euro or dollar is stuck.',
  },
  {
    label: 'Review',
    title: 'Walk in with answers',
    text: 'Defend, rescue or downgrade every deal with proof attached — before someone asks.',
  },
];

const notCrmPoints = [
  ['No CRM writeback', 'Review and prepare without ever changing a source CRM record.'],
  ['Read-only working copy', 'CSV import from CRM, Excel, Notion, or your own pipeline sheet.'],
  ['Private demo sandbox', 'Sample data stays in this browser. Nothing is uploaded to try it.'],
  ['Private preparation', 'Build your story before you walk into the forecast review.'],
] as const;

const bestFor = [
  'B2B sellers who own their own follow-up, with weekly or monthly reviews',
  'Founder-led sellers, consultants, freelancers and agency owners',
  'Trading, distribution and supply businesses that quote, deliver, then chase payment',
  'Pharma, life science, lab, industrial and other complex technical sales',
  'Anyone running CRM plus Excel, plus Notion, plus private notes, plus memory',
  'Long-cycle deals with procurement and several technical stakeholders',
];

const notIdealFor = [
  'Enterprise teams needing SSO, admin controls and a formal security review today',
  'Teams needing native Salesforce or HubSpot two-way sync right now',
  'Anyone wanting a company system of record or a manager forecasting dashboard',
  'Accounting, payroll, inventory, ecommerce or marketplace operations',
  'Quick transactional selling with no meaningful follow-up loop',
];

const pricingPlans = [
  {
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    description: 'Enough to run a real week and decide for yourself.',
    items: [
      '30 captures a month',
      'Up to 50 records',
      'Today, Plan, Orders, Cash Collection, Review',
      'Export your data whenever you want',
    ],
    note: 'Search & Insights is not included on Free.',
    highlighted: false,
  },
  {
    name: 'Personal',
    price: '$10',
    cadence: 'per month',
    description: 'For one operator running the whole commercial loop themselves.',
    items: [
      'Unlimited capture, unlimited records',
      'Search & Insights over everything you have written down',
      'Cost Analysis, Cash Collection and the Business Vault',
      'Pipeline Defense Briefs and shareable review packs',
      'Daily digest email and full data export',
    ],
    note: 'Cancel anytime — you keep access until the period you paid for ends.',
    highlighted: true,
  },
  {
    name: 'Team',
    price: 'Later',
    cadence: '',
    description: 'A shared workspace for the people you sell alongside.',
    items: [
      'Shared workspace and review standards',
      'Manager workflows',
      'Team security review',
      'CRM sync',
    ],
    note: 'Not on sale yet. The individual loop gets finished first.',
    highlighted: false,
  },
];

const faqs = [
  {
    question: 'What does $10 a month actually buy?',
    answer:
      'Unlimited capture and unlimited records instead of the free ceiling of 30 captures a month and 50 records, plus Search & Insights across your whole workspace. Everything else — Today, Plan, Orders, Cash Collection, Cost Analysis, Review, the Business Vault — is on both plans.',
  },
  {
    question: 'How do I pay, and who takes the payment?',
    answer:
      'Create a free account first. When you want more room, open Settings and go to the Billing tab — the upgrade runs through Lemon Squeezy, which is the merchant of record and the seller on your invoice. Memoire never sees your card. Cards, invoices and cancellation all live in the Lemon Squeezy portal, reachable from the same tab.',
  },
  {
    question: 'Does Memoire use AI?',
    answer:
      'No. There is no AI service behind Memoire, no AI key, and no AI endpoint. Capture parses your text on your own device with rules you can see and correct, and Search & Insights answers from your measured history. Your customer names, prices and notes are never sent to a model.',
  },
  {
    question: 'Is Memoire a CRM?',
    answer:
      'No. Your CRM keeps records for the company. Memoire is the private layer where you think, remember, prepare and defend — and where a quote is followed all the way to the money landing in your account.',
  },
  {
    question: 'Does Memoire write back to my CRM?',
    answer:
      'No CRM writeback exists. Memoire works from CSV import and its own working data, so you can review safely without touching a source record.',
  },
  {
    question: 'Where is my data stored?',
    answer:
      'Demo sandbox data stays in this browser and is never uploaded. A signed-in account syncs to cloud storage, and the app tells you inside when it is running on local fallback instead. You can export everything, and deleting your account deletes it.',
  },
  {
    question: 'Can I start from CSV exports from Salesforce, HubSpot or Excel?',
    answer:
      'Yes. Accounts and opportunities both import from CSV, with a review step before anything is written, so you can bring a real pipeline in and refresh it later.',
  },
  {
    question: 'What is the Pipeline Defense Brief?',
    answer:
      'A manager-ready summary of which deals you can defend, rescue, downgrade or monitor — with the proof, the gaps and the next actions attached. You can share it as a read-only link instead of rebuilding it in a slide.',
  },
  {
    question: 'Who is Memoire for?',
    answer:
      'People who sell without a sales team behind them: B2B sellers, founder-led sellers, consultants, freelancers, agency owners, and small trading or supply operators who quote, deliver and then have to chase the payment themselves.',
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-950">
      <Helmet>
        <title>Memoire - Personal Commercial Control Tower for B2B Sellers</title>
        <meta
          name="description"
          content="Memoire is a personal commercial control tower for complex B2B sellers: every customer interaction becomes a continuous commercial thread, from conversation and quotation to delivery and cash, so nothing goes silent. Free to start, $10 a month for one person."
        />
        <meta name="robots" content="noindex, nofollow" />
        <meta property="og:title" content="Memoire - Personal Commercial Control Tower for B2B Sellers" />
        <meta
          property="og:description"
          content="Never enter a pipeline review unprepared. Capture messy notes and emails, find the risk in Today, follow every quote to cash, and copy manager-ready answers."
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
                Personal Commercial Control Tower
              </p>
              <h1 className="mt-6 font-display text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
                {/* The trailing space is load-bearing. A block-level span after
                    text joins in the accessibility tree, so this line was
                    announced as "businessgoes silent". */}
                Nothing in your business{' '}
                <span className="block brand-gradient-text">goes silent.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
                Memoire works beside your CRM, spreadsheets and notes — not instead of them.
                Capture every meeting, quote, delivery and payment. See where the money is stuck.
                Walk into every review with answers.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/signup"
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 font-display text-base font-bold text-navy shadow-lg shadow-black/30 transition hover:bg-slate-100 active:scale-[0.98]"
                >
                  Start free
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  to="/demo"
                  className="inline-flex items-center justify-center rounded-full border border-white/25 px-7 py-3.5 font-display text-base font-bold text-white transition hover:bg-white/10"
                >
                  Try the live demo
                </Link>
              </div>
              <p className="mt-5 text-sm leading-6 text-slate-400">
                Free plan, no card · $10/month when you outgrow it · Demo data never leaves this browser
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
                <Icon className="h-4 w-4 flex-none text-brand-blue" />
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
                CRM fields, spreadsheets and private notes hold the official record. Memoire is your private
                working layer for evidence, objections, proof gaps, stakeholders, money and review answers.
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
            text="Paste a note, an email thread or a meeting recap. Memoire reads out the account, the amount, the objection and the next action — on your device, with rules you can see, and shows you the result to correct before anything is saved."
            bullets={[
              'Structured records out of unstructured notes — nothing invented',
              'Live typeahead over your own customers and deals as you type',
              'No forms, no required fields, no data-entry ritual',
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
            text="Today is a command center, not a dashboard. It surfaces the deals going silent, the promises you made and have not kept, and the three actions that matter — before they surprise you."
            bullets={[
              'Silence detection on every deal and every customer',
              'Proactive nudges: stale actions, missing roles, weak evidence',
              'One glance, one action — never forty widgets',
            ]}
            visual={<TodayMock />}
          />
        </section>

        {/* ── Narrative: Money ── */}
        <section className="bg-white px-4 py-20 sm:px-6 lg:px-8">
          <NarrativeBlock
            eyebrow="Orders & cash"
            icon={Banknote}
            title="See where the money is stuck."
            text="A quote becomes an order, an order becomes a delivery, a delivery becomes an invoice, and an invoice becomes cash — or does not. Memoire keeps watching after you win, because winning is not where your attention should end."
            bullets={[
              'Quote to order to delivery to payment, in one order book',
              'Cash Collection: aging built from the payment terms already on the quote',
              'Cost Analysis: landed cost and real margin, priced before you send the quote',
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
            text="Sort every deal into defend, rescue, or downgrade — with the proof, the gaps and the next actions attached. Share the pack as a read-only link instead of rebuilding it in a slide, then log what actually happened."
            bullets={[
              'Pipeline Defense Brief: manager-ready answers in minutes',
              'MEDDIC stakeholder map built from real evidence, not guessed labels',
              'Win/loss and objection history — what your follow-ups actually revived',
            ]}
            visual={<ReviewMock />}
          />
        </section>

        {/* ── Memory band ── */}
        <section className="bg-white px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <SectionHeader
              eyebrow="It remembers so you do not have to"
              title="A month of work, still answerable in six months."
              text="Everything you capture keeps its thread. Two surfaces exist purely to give it back to you."
            />
            <div className="mt-12 grid gap-6 lg:grid-cols-2">
              <MemoryCard
                icon={Network}
                title="Business Vault"
                text="Your accounts, people, deals, orders and commitments drawn as one connected map — built from what you already captured, not from a form you have to fill in. Find the thread you half-remember, and see which customers nobody has touched."
              />
              <MemoryCard
                icon={Coins}
                title="Search & Insights"
                text="Ask what is at risk, where the money sits, which objection keeps costing you, or what happened with a customer last quarter. Every answer is computed from your own history on your own device — nothing is sent to an AI service."
                badge="Personal"
              />
            </div>
          </div>
        </section>

        {/* ── Audience ── */}
        <section className="bg-page px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <SectionHeader
              eyebrow="Honest fit"
              title="Built for people who sell without a sales team."
              text="Memoire is deliberately narrow. If it is not for you, we would rather you found out on this page than after paying."
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
        <section id="pricing" className="bg-white px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <SectionHeader
              eyebrow="Pricing"
              title="One person, one price. $10 a month."
              text="Start free and stay free until the free ceiling gets in your way. There is no trial to forget to cancel."
            />
            <div className="mt-12 grid items-start gap-6 lg:grid-cols-3">
              {pricingPlans.map((plan) =>
                plan.highlighted ? (
                  <div key={plan.name} className="gradient-border-card shadow-elevated">
                    <div className="gradient-border-card-inner flex h-full flex-col !p-7">
                      <PlanBody plan={plan} />
                    </div>
                  </div>
                ) : (
                  <div key={plan.name} className="flex h-full flex-col rounded-card border border-slate-200 bg-white p-7 shadow-card">
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
                  Create your free account
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/request-access"
                  className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-7 py-3.5 font-display text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  Request guided access
                </Link>
              </div>
              <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-500">
                Upgrading happens inside the app, in Settings under Billing. Payment is taken by Lemon Squeezy,
                which is the seller on your invoice and handles tax where you are — Memoire never sees your card.
              </p>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="bg-page px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <SectionHeader
              eyebrow="Questions"
              title="Built for sensitive commercial work."
              text="Customer, tender, pricing, competitor and forecast data is sensitive. Memoire is careful with it — and careful about what it claims."
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
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-cyan-300">Start today</p>
            <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
              Bring a stronger story to your <span className="brand-gradient-text">next review</span>.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-slate-300">
              Create a free account and capture your first week, or open the demo sandbox and look around first.
              Nothing is charged until you decide it is worth $10.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                to="/signup"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 font-display text-base font-bold text-navy transition hover:bg-slate-100 active:scale-[0.98]"
              >
                Start free
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/demo"
                className="inline-flex items-center justify-center rounded-full border border-white/25 px-7 py-3.5 font-display text-base font-bold text-white transition hover:bg-white/10"
              >
                Try the live demo
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

function MemoryCard({
  icon: Icon,
  title,
  text,
  badge,
}: {
  icon: typeof Inbox;
  title: string;
  text: string;
  badge?: string;
}) {
  return (
    <div className="flex h-full flex-col rounded-card border border-slate-200 bg-white p-7 shadow-card transition hover:-translate-y-1 hover:shadow-elevated">
      <div className="flex items-center gap-3">
        <span className="brand-gradient inline-flex h-10 w-10 items-center justify-center rounded-full text-white">
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="font-display text-xl font-bold text-slate-950">{title}</h3>
        {badge && (
          <span className="ml-auto rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-blue">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">{text}</p>
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
    <MockFrame label="Capture · on-device parsing">
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
        Parsed on this device — check it before it counts
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
    <MockFrame label="Orders · where the money sits">
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
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-xl font-bold text-slate-950">{plan.name}</h3>
        {plan.highlighted && (
          <span className="flex-none rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-brand-blue">Most people</span>
        )}
      </div>
      <p className="mt-3">
        <span className="font-display text-4xl font-extrabold text-slate-950">{plan.price}</span>
        {plan.cadence && <span className="ml-1.5 text-sm font-semibold text-slate-500">{plan.cadence}</span>}
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
      <p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">{plan.note}</p>
    </>
  );
}
