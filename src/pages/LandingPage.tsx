import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Check,
  ClipboardCheck,
  Download,
  FileText,
  HelpCircle,
  Inbox,
  Network,
  Search,
  ShieldCheck,
  Smartphone,
  Sun,
  Timer,
  X,
} from 'lucide-react';
import { MarketingNav } from '../components/marketing/MarketingNav';
import { Footer } from '../components/marketing/Footer';
import { PageSeo } from '../components/marketing/PageSeo';
import { CashAgingChart, CoverageHeatmap, OrderToCashFunnel } from '../components/marketing/charts';
import {
  faqPageSchema,
  organizationSchema,
  softwareApplicationSchema,
  websiteSchema,
} from '../config/structuredData';
import { PERSONAL_MONTHLY_PRICE_USD, TRIAL_DAYS } from '../utils/entitlement';

/**
 * The public page. Three rules, each of which has already been broken here once.
 *
 * 1. No AI. Memoire has no AI service, no key and no endpoint - capture parses
 *    on the device and Ask computes from your own history. This page once
 *    offered optional AI help in the capture box, which promised something that
 *    does not exist. scripts/verify-no-ai-dependency.mjs guards the code; the
 *    commercial-readiness contract guards this copy.
 * 2. No invented pricing. The plans below are the two Lemon Squeezy variants
 *    the server will actually resolve (`personal`, `team`). There is no free
 *    tier: the one that used to be advertised here declared limits that no
 *    code applied. The trial is Lemon Squeezy's - card up front, charged when
 *    it ends - and src/utils/entitlement.ts reads the result rather than
 *    inventing one.
 * 3. Nothing here may narrow the product. The mocks below are structurally
 *    real - the flag names ("Payment overdue", "Deal going silent"), the seven
 *    order stages, "0 of 5 steps done", the aging buckets and the knowledge-gap
 *    questions are all strings the product renders. The account names, figures
 *    and currency are *illustrative* and must stay industry-neutral and
 *    international. An earlier version pasted the demo workspace in verbatim
 *    and shipped a global product looking like a tool for one country's pharma
 *    trade. Real structure, neutral content - the two are not the same thing.
 *
 * Checkout is deliberately not on this page. The checkout call needs a session
 * token, so the buy button lives in Settings > Billing where there is one -
 * and scripts/verify-commercial-readiness.mjs fails the build if a checkout
 * call ever appears in this file.
 */

const trustChips = [
  { icon: ShieldCheck, text: 'No AI service — computed on your device' },
  { icon: Network, text: 'No CRM writeback — ever' },
  { icon: Download, text: 'Export everything, delete anytime' },
  { icon: Smartphone, text: 'Installs like an app, works offline' },
];

/**
 * The failures this product exists for, in the operator's own voice, each
 * paired with the flag the app actually raises. The flag names are not
 * marketing phrases - they are the strings on the nudge cards in Today.
 */
const painPoints = [
  {
    quote: 'I sent the quote three weeks ago. Then nothing.',
    cost: 'The deal did not die. It stopped being anybody\'s job.',
    flag: 'Deal going silent',
  },
  {
    quote: 'We delivered last month. Did anyone invoice it?',
    cost: 'Winning felt like the finish line, so nobody watched the rest.',
    flag: 'To invoice',
  },
  {
    quote: 'That money was due weeks ago and I only just noticed.',
    cost: 'Cash you already earned, sitting in someone else\'s account.',
    flag: 'Payment overdue',
  },
  {
    quote: 'My manager asked why this slipped. I had nothing.',
    cost: 'You knew the answer in June. You just could not find it.',
    flag: 'Missing forecast evidence',
  },
] as const;

const bestFor = [
  'B2B sellers who own their own follow-up',
  'Founder-led sellers, consultants and agency owners',
  'Trading, distribution and supply — quote, deliver, then chase payment',
  'Long-cycle deals with procurement and several stakeholders',
];

const notIdealFor = [
  'Enterprise teams needing SSO and a formal security review today',
  'Anyone wanting a company system of record or a manager dashboard',
  'Accounting, payroll, inventory or ecommerce operations',
  'Quick transactional selling with no follow-up loop',
];

const pricingPlans = [
  {
    name: 'Personal',
    price: '$10',
    cadence: 'per month',
    description: 'Everything Memoire does, for one operator running the whole commercial loop.',
    items: [
      'Unlimited capture and unlimited records',
      'Search & Insights over everything you have written down',
      'Orders, Cash Collection and Cost Analysis',
      'Pipeline Defense Briefs and shareable review packs',
      'Business Vault, daily digest email and full data export',
    ],
    note: `Starts with a ${TRIAL_DAYS}-day free trial. Your card is taken up front and charged when the trial ends — cancel before then and nothing is taken.`,
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
      'Everything. There is no smaller plan holding features back — Today, Plan, Orders, Cash Collection, Cost Analysis, Review, the Business Vault and Search & Insights are all included. The seven-day trial is the same full product, so what you try is exactly what you buy.',
  },
  {
    question: 'How do I pay, and who takes the payment?',
    answer:
      'You start the trial from Settings, in the Billing tab. Lemon Squeezy takes the card and holds the first payment for seven days, then charges $10 — it is the merchant of record and the seller on your invoice, and Memoire never sees your card number. Cancelling inside the seven days costs nothing, and cancellation lives in the same Lemon Squeezy portal as your cards and invoices.',
  },
  {
    question: 'Does Memoire use AI?',
    answer:
      'No. There is no AI service behind Memoire, no key, and no endpoint. Capture parses your text on your own device with rules you can see and correct, and Search & Insights answers from your measured history. Your customer names, prices and notes are never sent to a model.',
  },
  {
    question: 'Is Memoire a CRM, and does it change my CRM?',
    answer:
      'It is not, and it does not. Your CRM keeps records for the company; Memoire is the private layer where you think, remember, prepare and defend — and where a quote is followed all the way to the money landing in your account. No CRM writeback exists: it works from CSV import and its own working data.',
  },
  {
    question: 'Does it handle my currency and my market?',
    answer:
      'Yes. Quotes, orders and collection each carry their own currency with a base currency for the totals, and landed cost can sit in a different currency from the sale. Dates, number formats and payment terms follow your locale — Memoire is used the same way whether you invoice in dollars, euros, pounds or anything else.',
  },
  {
    question: 'Where is my data stored?',
    answer:
      'Your workspace syncs to cloud storage under your account, and the app tells you inside when it is running on local fallback instead. Nothing is shared with other users, nothing is sent to an AI service, and no CRM is written to. You can export everything at any time, and deleting your account deletes it.',
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-950">
      {/* The home page carries the site-wide graph - Organization, WebSite and
          the product itself - because it is the URL every other reference
          points at. The FAQ block below is the same `faqs` array the page
          renders, not a second copy written for crawlers: an answer engine that
          finds the structured answer and the visible answer disagreeing trusts
          neither. */}
      <PageSeo
        path="/"
        title="Memoire - Personal Commercial Control Tower for B2B Sellers"
        /* Google shows about 155 characters. The previous description was 262,
           so the two things a searcher decides on - the price and the trial -
           were both in the part that got cut, and the visible half ended
           mid-clause on "from conversation ...". Everything that has to survive
           truncation is now in the first sentence. */
        description={`Follow every customer thread from conversation to quote to delivery to cash, so nothing goes silent. $${PERSONAL_MONTHLY_PRICE_USD}/month, ${TRIAL_DAYS}-day free trial.`}
        socialDescription="Never enter a pipeline review unprepared. Capture messy notes and emails, find the risk in Today, follow every quote to cash, and copy manager-ready answers."
        jsonLd={[
          organizationSchema(),
          websiteSchema(),
          softwareApplicationSchema({
            monthlyPriceUsd: PERSONAL_MONTHLY_PRICE_USD,
            trialDays: TRIAL_DAYS,
            featureList: pricingPlans[0].items,
          }),
          faqPageSchema(faqs),
        ]}
      />

      <MarketingNav />

      <main className="pt-16">
        {/* ── Hero ── */}
        <section className="relative overflow-hidden bg-navy-dark px-4 pb-20 pt-20 text-white sm:px-6 lg:px-8 lg:pb-28 lg:pt-28">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(25,118,210,0.35),transparent)] blur-2xl" />
            <div className="absolute -right-32 top-24 h-96 w-96 rounded-full bg-[radial-gradient(closest-side,rgba(0,172,193,0.22),transparent)] blur-2xl" />
            <div className="absolute -left-40 bottom-0 h-96 w-96 rounded-full bg-[radial-gradient(closest-side,rgba(123,31,162,0.18),transparent)] blur-2xl" />
          </div>

          <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1fr_1fr]">
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
                The quote nobody chased. The delivery nobody invoiced. The payment nobody noticed was late.
                Memoire works beside your CRM and your spreadsheets, and keeps watching every thread
                from the first conversation to the money in the bank.
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
                  to="/use-cases"
                  className="inline-flex items-center justify-center rounded-full border border-white/25 px-7 py-3.5 font-display text-base font-bold text-white transition hover:bg-white/10"
                >
                  See it for your business
                </Link>
              </div>
              <p className="mt-5 text-sm leading-6 text-slate-400">
                {TRIAL_DAYS} days free, then $10 a month · Cancel in the trial and pay nothing · Your data is never shared
              </p>
            </div>

            {/* The ranked list Today opens on. */}
            <div className="relative mx-auto w-full max-w-xl">
              <BrowserFrame label="Today · Memoire">
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                      What Memoire would start with
                    </p>
                    <p className="mt-1 font-display text-base font-bold leading-snug text-slate-950">
                      Ranked across defense, revenue and follow-up
                    </p>
                  </div>
                  <span className="mt-0.5 flex-none rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-700">
                    5 need you
                  </span>
                </div>

                <div className="mt-4 space-y-2.5">
                  <RankedAction
                    rank="#1"
                    severity="Critical"
                    category="Revenue"
                    title="Confirm payment release date with finance."
                    subject="Meridian Group / Q3 supply contract"
                    reason="Payment overdue: pending payment."
                    due="Due Aug 9"
                    amount="$74,000"
                  />
                  <RankedAction
                    rank="#2"
                    severity="Critical"
                    category="Pipeline Defense"
                    title="De-risk the platform rollout."
                    subject="Caldera Systems / Platform rollout"
                    reason="Downgrade: decision maker is still unresolved."
                    due="Missing evidence"
                    amount="$186,000"
                  />
                  <RankedAction
                    rank="#3"
                    severity="High"
                    category="Opportunity"
                    title="Schedule the procurement clarification call."
                    subject="Halden Industrial / Procurement review"
                    reason="High impact objection remains open."
                    due="Due Aug 17"
                    amount="$96,000"
                  />
                </div>
              </BrowserFrame>

              <div className="absolute -bottom-10 -left-6 hidden w-60 rounded-xl border border-white/10 bg-navy-light p-4 shadow-2xl shadow-black/50 lg:block">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200">Review pack</p>
                  <span className="rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">Ready</span>
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

        {/* ── The pain ── */}
        <section className="bg-navy px-4 py-20 text-white sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-rose-300">The quiet failures</p>
              <h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Nothing in your pipeline fails loudly.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-300">
                Deals go quiet, and by the time you notice, the answer is a re-quote, a late payment,
                or a review you cannot defend. Each one below is a flag Memoire raises by name.
              </p>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {painPoints.map((pain) => (
                <div
                  key={pain.flag}
                  className="flex flex-col rounded-card border border-white/10 bg-white/[0.04] p-6 transition hover:border-white/20 hover:bg-white/[0.07]"
                >
                  <p className="font-display text-lg font-bold leading-snug text-white">"{pain.quote}"</p>
                  <p className="mt-3 flex-1 text-sm leading-6 text-slate-400">{pain.cost}</p>
                  <div className="mt-5 flex items-center gap-2 border-t border-white/10 pt-4">
                    <AlertTriangle className="h-3.5 w-3.5 flex-none text-amber-300" />
                    <span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-[11px] font-bold text-amber-200">
                      {pain.flag}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Capture ── */}
        <section id="features" className="bg-page px-4 py-20 sm:px-6 lg:px-8">
          <NarrativeBlock
            eyebrow="Capture"
            icon={Inbox}
            title="Type it once. Messy is fine."
            text="Paste a note, an email thread or a meeting recap. Memoire reads out the account, the amount, the objection and the next action — on your device, with rules you can see, and shows you the result to correct before anything is saved."
            bullets={[
              'Structured records out of unstructured notes — nothing invented',
              'Live typeahead over your own customers and deals as you type',
              'It suggests the deal to link and the quote to advance — you decide',
            ]}
            visual={<CaptureMock />}
          />
        </section>

        {/* ── Today ── */}
        <section className="bg-white px-4 py-20 sm:px-6 lg:px-8">
          <NarrativeBlock
            flip
            eyebrow="Today"
            icon={Sun}
            title="Start where the risk is."
            text="Today is a command center, not a dashboard: get the picture, do the work, check the watch-list. The watch-list is capped at five, because a list that grows without limit is a list nobody reads."
            bullets={[
              'Every flag carries a "Why am I seeing this?" you can open',
              'Silence detection on every deal, customer and initiative',
              'Snooze, dismiss or act — and it never changes CRM data',
            ]}
            visual={<NudgeMock />}
          />
        </section>

        {/* ── Money spine: the differentiator, given the heaviest treatment ── */}
        <section className="relative overflow-hidden bg-navy-dark px-4 py-20 text-white sm:px-6 lg:px-8 lg:py-24">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -right-40 top-0 h-[500px] w-[700px] rounded-full bg-[radial-gradient(closest-side,rgba(67,160,71,0.18),transparent)] blur-2xl" />
            <div className="absolute -left-40 bottom-0 h-[420px] w-[620px] rounded-full bg-[radial-gradient(closest-side,rgba(25,118,210,0.22),transparent)] blur-2xl" />
          </div>
          <div className="relative mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.22em] text-emerald-300">
                <Banknote className="h-4 w-4" />
                Orders & cash
              </p>
              <h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Most tools stop at <span className="text-slate-500 line-through decoration-rose-400/60">Won</span>.
                {' '}
                <span className="brand-gradient-text">Memoire follows the money to the bank.</span>
              </h2>
              <p className="mt-5 text-base leading-7 text-slate-300">
                A contract becomes a deposit, a deposit becomes a delivery, a delivery becomes an invoice,
                an invoice becomes cash — or sits there for weeks while everyone assumes
                somebody else is chasing it.
              </p>
            </div>

            <div className="mt-12 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              <OrderBookMock />
              <OrderToCashFunnel />
            </div>

            <div className="mt-6">
              <CashAgingChart />
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <MoneyPoint
                title="Seven steps, one order"
                text="Status comes from what the records already prove. You tick only the steps no document will ever prove."
              />
              <MoneyPoint
                title="Aging you did not build"
                text="Due dates derive from the payment terms already on the quote, so collection has an answer on day one."
              />
              <MoneyPoint
                title="Margin before you send it"
                text="Cost Analysis lands goods, freight and duty against the sale — in its own currency if you buy and sell in different ones."
              />
            </div>
          </div>
        </section>

        {/* ── Review ── */}
        <section className="bg-page px-4 py-20 sm:px-6 lg:px-8">
          <NarrativeBlock
            eyebrow="Review & learn"
            icon={FileText}
            title="Walk in with answers."
            text="Sort every deal into defend, rescue, or downgrade — with the proof, the gaps and the next actions attached. Share the pack as a read-only link instead of rebuilding it in a slide, then log what actually happened."
            bullets={[
              'Pipeline Defense Brief: manager-ready answers in minutes',
              'MEDDIC stakeholder map built from real evidence, not guessed labels',
              'Win/loss and objection history — what your follow-ups actually revived',
            ]}
            visual={<DefenseMock />}
          />
        </section>

        {/* ── Memory ── */}
        <section className="bg-white px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <SectionHeader
              eyebrow="It remembers so you do not have to"
              title="A month of work, still answerable in six months."
              text="Including the part most tools never admit: what you still do not know."
            />
            <div className="mt-12 grid items-start gap-10 lg:grid-cols-[1fr_1fr]">
              <div className="min-w-0 space-y-6">
                <VaultMock />
                <CoverageHeatmap />
              </div>
              <div className="flex min-w-0 flex-col gap-6">
                <MemoryHeading
                  icon={Network}
                  title="Business Vault"
                  text="Your customers, people, products and deals drawn as one connected map, built from what you already captured — and an honest account of the gaps, ranked by what the relationship is worth."
                />
                <MemoryHeading
                  icon={Search}
                  title="Search & Insights"
                  badge="Personal"
                  text="Ask what is at risk, where the money sits, or whether your follow-ups worked. Every answer is computed from your own history on your own device — nothing is sent to an AI service."
                />
                <div className="rounded-card border border-slate-200 bg-page p-5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Ask, in your own words</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {[
                      'Which deals may go silent?',
                      'Where is the money?',
                      'Did my follow-ups work?',
                      'What do I owe today?',
                    ].map((preset) => (
                      <span key={preset} className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-800">
                        {preset}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Not a CRM, and not for everyone ──
            These were two sections. The "Not a CRM" half had four cards under
            it that restated the trust strip ("No CRM writeback") and the FAQ
            ("any currency") - filler holding up one genuinely good line. The
            line stays as the headline; the cards are gone, and the two
            qualification sections are now one. */}
        <section className="bg-page px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <SectionHeader
              eyebrow="Not a CRM, and not for everyone"
              title="Your CRM keeps records for the company. Memoire prepares you."
              text="Memoire is your private working layer for evidence, objections, stakeholders, money and review answers — and it is deliberately narrow. If it is not for you, we would rather you found out here than after paying."
            />
            <div className="mt-12 grid gap-6 lg:grid-cols-2">
              <div className="rounded-card border border-emerald-200 bg-emerald-50/50 p-7">
                <h3 className="font-display text-lg font-bold text-slate-950">Best for</h3>
                <ul className="mt-4 space-y-3">
                  {bestFor.map((item) => (
                    <li key={item} className="flex gap-3 text-sm leading-6 text-slate-700">
                      <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-card border border-slate-200 bg-slate-50 p-7">
                <h3 className="font-display text-lg font-bold text-slate-500">Not ideal yet for</h3>
                <ul className="mt-4 space-y-3">
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
              text={`Seven days free to run a real week on your own work. Card up front, charged only when the trial ends — cancel before then and you pay nothing. After that it is $10 a month, and there is no smaller plan pretending to be enough.`}
            />
            <div className="mx-auto mt-12 grid max-w-4xl items-start gap-6 lg:grid-cols-2">
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
                  Start your free trial
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
              text="Customer, tender, pricing and forecast data is sensitive. Memoire is careful with it — and careful about what it claims."
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
              Find out what went quiet <span className="brand-gradient-text">while you can still fix it</span>.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-slate-300">
              Take {TRIAL_DAYS} days to capture a real week of your own work and see what it caught. Cancel inside the
              trial and you are charged nothing.
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
                to="/use-cases"
                className="inline-flex items-center justify-center rounded-full border border-white/25 px-7 py-3.5 font-display text-base font-bold text-white transition hover:bg-white/10"
              >
                See it for your business
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
        <Link to="/use-cases" className="mt-7 inline-flex items-center gap-2 font-display text-sm font-bold text-brand-blue transition hover:text-brand-blue-dark">
          See this for your business
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="mx-auto w-full max-w-lg">{visual}</div>
    </div>
  );
}

function MemoryHeading({
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
    <div>
      <div className="flex items-center gap-3">
        <span className="brand-gradient inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-white">
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="font-display text-xl font-bold text-slate-950">{title}</h3>
        {badge && (
          <span className="ml-auto flex-none rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-blue">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function MoneyPoint({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-card border border-white/10 bg-white/[0.04] p-5">
      <h3 className="font-display font-bold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
    </div>
  );
}

/* ── Product portraits ──────────────────────────────────────────────────────
 * Structurally real, deliberately generic. Every label, badge, stage name and
 * counter below is a string the product renders - "Payment overdue", "0 of 5
 * steps done", "9/11 known", the aging buckets, the gap questions. The account
 * names, figures and currency are invented and kept industry-neutral, because
 * a landing page that shows one market's customers sells to one market.
 *
 * Not screenshots: a screenshot goes stale silently and cannot reflow onto a
 * phone, while these stay crisp, adapt, and cost no bytes.
 */

/** The chrome that makes a mock read as a product screen rather than a card. */
function BrowserFrame({ children, label, tone = 'light' }: { children: ReactNode; label: string; tone?: 'light' | 'dark' }) {
  const isDark = tone === 'dark';
  return (
    <div
      className={
        isDark
          ? 'overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/40 backdrop-blur'
          : 'overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] p-2 shadow-2xl shadow-black/40 backdrop-blur'
      }
    >
      <div className={isDark ? 'flex items-center gap-2 border-b border-white/10 px-4 py-2.5' : 'flex items-center gap-2 px-3 py-2'}>
        <span className="h-2 w-2 rounded-full bg-rose-400/70" />
        <span className="h-2 w-2 rounded-full bg-amber-400/70" />
        <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
        <span className={`ml-2 truncate text-[10px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-300'}`}>{label}</span>
      </div>
      {isDark ? <div className="p-5">{children}</div> : <div className="rounded-xl bg-white p-5 text-slate-950">{children}</div>}
    </div>
  );
}

/** A row from Today's "What Memoire would start with". */
function RankedAction({
  rank,
  severity,
  category,
  title,
  subject,
  reason,
  due,
  amount,
}: {
  rank: string;
  severity: 'Critical' | 'High';
  category: string;
  title: string;
  subject: string;
  reason: string;
  due: string;
  amount: string;
}) {
  const severityTone =
    severity === 'Critical' ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-amber-50 text-amber-800 ring-amber-200';
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-display text-xs font-extrabold text-slate-400">{rank}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${severityTone}`}>
          {severity}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
          {category}
        </span>
      </div>
      <p className="mt-2 text-sm font-bold leading-snug text-slate-900">{title}</p>
      <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{subject}</p>
      <p className="mt-1.5 text-xs leading-5 text-slate-600">{reason}</p>
      <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-slate-100 pt-2.5">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
          <HelpCircle className="h-3 w-3" />
          Why am I seeing this?
        </span>
        <span className="font-display text-xs font-extrabold text-slate-900">{amount}</span>
      </div>
      <p className="mt-1 text-[11px] font-semibold text-slate-400">{due}</p>
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

function MockFrame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-elevated">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
        <span className="h-2 w-2 rounded-full bg-rose-300" />
        <span className="h-2 w-2 rounded-full bg-amber-300" />
        <span className="h-2 w-2 rounded-full bg-emerald-300" />
        <span className="ml-2 truncate text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function CaptureMock() {
  return (
    <MockFrame label="Capture · on-device parsing">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">
        "Called Halden Industrial — Dana Reyes likes the proposal but procurement wants a 3-week lead time
        guarantee. Sending the support proof Friday. ~96k, 50% with PO."
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="h-px flex-1 bg-slate-100" />
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Parsed on this device</span>
        <div className="h-px flex-1 bg-slate-100" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {[
          ['Account', 'Halden Industrial'],
          ['Amount', '$96,000'],
          ['Objection', 'Lead time'],
          ['Payment term', '50% with PO'],
          ['Next action', 'Proof by Friday'],
          ['Stakeholder', 'Dana Reyes'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-blue-400">{k}</p>
            <p className="mt-0.5 truncate text-xs font-bold text-blue-900">{v}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
        <ClipboardCheck className="h-3.5 w-3.5 flex-none" />
        Check it before it counts — every field is editable
      </div>
    </MockFrame>
  );
}

function NudgeMock() {
  return (
    <MockFrame label="Today · proactive nudges">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-slate-900">The few things that could embarrass you</p>
        <span className="flex-none rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
          Capped at 5
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3.5 py-2">
          <p className="text-xs font-bold text-slate-900">Caldera Systems</p>
          <span className="text-[11px] font-bold text-rose-600">3 things to answer</span>
        </div>
        <div className="divide-y divide-slate-100">
          <NudgeRow severity="Critical" kind="revenue" flag="Payment overdue" detail="Confirm the payment release date with finance." amount="$186,000" />
          <NudgeRow severity="Critical" kind="opportunity" flag="Deal going silent" detail="No customer touch since Jul 25, and no next action scheduled." amount="$186,000" />
          <NudgeRow severity="High" kind="pipeline-defense" flag="Missing forecast evidence" detail="Evidence is not strong enough to defend in review." amount="$186,000" />
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3.5 py-2">
          <p className="text-xs font-bold text-slate-900">Halden Industrial</p>
          <span className="text-[11px] font-bold text-amber-600">1 thing to answer</span>
        </div>
        <NudgeRow severity="High" kind="revenue" flag="Quote expiring soon" detail="Confirm the revised quote before it expires." amount="$96,000" />
      </div>

      <p className="mt-3 text-center text-xs font-semibold text-slate-400">
        Everything else is quiet — on purpose.
      </p>
    </MockFrame>
  );
}

function NudgeRow({
  severity,
  kind,
  flag,
  detail,
  amount,
}: {
  severity: 'Critical' | 'High';
  kind: string;
  flag: string;
  detail: string;
  amount: string;
}) {
  const tone = severity === 'Critical' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800';
  return (
    <div className="px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone}`}>{severity}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{kind}</span>
        <span className="ml-auto font-display text-[11px] font-extrabold text-slate-900">{amount}</span>
      </div>
      <p className="mt-1.5 text-xs font-bold text-slate-900">{flag}</p>
      <p className="mt-0.5 text-[11px] leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function OrderBookMock() {
  const stages = [
    { label: 'To confirm', count: '2', value: '$112k', active: true },
    { label: 'Deposit due', count: '0', value: '—', active: false },
    { label: 'To deliver', count: '0', value: '—', active: false },
    { label: 'To invoice', count: '0', value: '—', active: false },
    { label: 'Awaiting payment', count: '0', value: '—', active: false },
    { label: 'Collected', count: '0', value: '—', active: false },
  ];
  return (
    <BrowserFrame tone="dark" label="Orders · order book">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-sm font-bold text-white">Contract to cash</p>
        <p className="text-[11px] font-semibold text-slate-400">Awaiting: $112,000</p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {stages.map((stage) => (
          <div
            key={stage.label}
            className={`rounded-lg border p-2 text-center ${
              stage.active ? 'border-emerald-400/40 bg-emerald-400/10' : 'border-white/10 bg-white/[0.03]'
            }`}
          >
            <p className={`font-display text-base font-extrabold ${stage.active ? 'text-emerald-300' : 'text-slate-500'}`}>
              {stage.count}
            </p>
            <p className="mt-0.5 text-[9px] font-bold uppercase leading-tight tracking-wide text-slate-400">{stage.label}</p>
            <p className={`mt-0.5 text-[10px] font-bold ${stage.active ? 'text-emerald-200' : 'text-slate-600'}`}>{stage.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        <OrderRow
          account="Meridian Group"
          reference="PO-4471 · Q3 supply contract"
          value="$74,000"
          term="50% with PO, 50% after delivery"
          next="Contract / PO"
          waiting="6d"
          steps={0}
        />
        <OrderRow
          account="Northwind Trading"
          reference="ORD-2208 · Line audit service"
          value="$38,000"
          term="No payment term"
          next="Contract / PO"
          waiting="25d"
          steps={0}
        />
      </div>
    </BrowserFrame>
  );
}

// `reference`, not `ref` - React reserves that name, and a component that
// takes one reads as forwarding a DOM node rather than showing a quote number.
function OrderRow({
  account,
  reference,
  value,
  term,
  next,
  waiting,
  steps,
}: {
  account: string;
  reference: string;
  value: string;
  term: string;
  next: string;
  waiting: string;
  steps: number;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{account}</p>
          <p className="truncate text-[11px] text-slate-400">{reference}</p>
        </div>
        <div className="flex-none text-right">
          <p className="font-display text-sm font-extrabold text-white">{value}</p>
          <p className="text-[10px] text-slate-400">{term}</p>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-blue-400/10 px-2 py-0.5 text-[10px] font-bold text-blue-200">Next: {next}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-200">
          <Timer className="h-2.5 w-2.5" />
          {waiting} since it moved
        </span>
        <span className="ml-auto text-[10px] font-semibold text-slate-400">{steps} of 5 steps done</span>
      </div>
      <div className="mt-2 flex gap-1">
        {[0, 1, 2, 3, 4].map((index) => (
          <div
            key={index}
            className={`h-1 flex-1 rounded-full ${index < steps ? 'bg-emerald-400' : 'bg-white/10'}`}
          />
        ))}
      </div>
    </div>
  );
}

function DefenseMock() {
  return (
    <MockFrame label="Review · pipeline defense brief">
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
        <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-900">Northwind Trading / Line audit</p>
            <span className="flex-none rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">
              Rescue
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-5 text-slate-600">
            "I can rescue this deal only if the lead time objection is answered with proof this week."
          </p>
          <div className="mt-2.5 space-y-1.5 border-t border-amber-200/60 pt-2.5">
            {[
              ['High', 'Identify a champion inside the account'],
              ['Medium', 'Confirm the economic buyer'],
            ].map(([weight, action]) => (
              <div key={action} className="flex items-center gap-2">
                <span className="flex-none rounded bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-500 ring-1 ring-slate-200">
                  {weight}
                </span>
                <span className="truncate text-[11px] font-semibold text-slate-700">{action}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-900">Meridian Group / Q3 supply</p>
            <span className="flex-none rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
              Defend
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-5 text-slate-600">
            "I can defend this deal — budget approved, champion active, proof pack ready."
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
        <FileText className="h-3.5 w-3.5 flex-none text-brand-blue" />
        Copy the summary, export it, or share a read-only link
      </div>
    </MockFrame>
  );
}

function VaultMock() {
  return (
    <MockFrame label="Business Vault · knowledge gaps">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ['35', 'Knowledge nodes'],
          ['53', 'Connections'],
          ['27', 'Open gaps'],
        ].map(([value, label], index) => (
          <div key={label} className={`rounded-lg p-2.5 ${index === 2 ? 'bg-amber-50' : 'bg-slate-50'}`}>
            <p className={`font-display text-xl font-extrabold ${index === 2 ? 'text-amber-700' : 'text-slate-900'}`}>{value}</p>
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        Ranked by what the relationship is worth
      </p>
      <div className="mt-2 space-y-2">
        <GapRow
          account="Caldera Systems"
          worth="$186,000"
          known="9/11"
          question="Who signs at Caldera Systems?"
          why="Deals stall at the last metre when nobody named the signer."
        />
        <GapRow
          account="Halden Industrial"
          worth="$96,000"
          known="8/11"
          question="Who is your champion inside Halden Industrial?"
          why="Without one, every objection has to be answered by you, in the room."
        />
      </div>

      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">
        <span className="font-bold text-slate-800">Portfolio coverage:</span> every customer against every line you
        carry. The squares you have never filled are the business you have never asked for.
      </div>
    </MockFrame>
  );
}

function GapRow({
  account,
  worth,
  known,
  question,
  why,
}: {
  account: string;
  worth: string;
  known: string;
  question: string;
  why: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{account}</p>
        <div className="flex flex-none items-center gap-1.5">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600">{known} known</span>
          <span className="font-display text-[10px] font-extrabold text-slate-700">{worth}</span>
        </div>
      </div>
      <p className="mt-1.5 text-sm font-bold text-slate-900">{question}</p>
      <p className="mt-0.5 text-[11px] leading-5 text-slate-500">{why}</p>
    </div>
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
