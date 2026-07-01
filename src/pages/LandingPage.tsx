import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  ClipboardCheck,
  FileText,
  FolderClock,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { MarketingNav } from '../components/marketing/MarketingNav';
import { Footer } from '../components/marketing/Footer';

const workflowSteps = [
  {
    title: 'Capture messy evidence',
    text: 'Paste a note, email thread, meeting recap, or quick update so Memoire can extract structured sales evidence.',
  },
  {
    title: 'Open Today',
    text: 'See the daily command center: top actions, proactive nudges, missing evidence, and deals that may embarrass you in review.',
  },
  {
    title: 'Prepare Pipeline Defense',
    text: 'Sort deals into defend, rescue, downgrade, or monitor decisions before your manager asks.',
  },
  {
    title: 'Copy manager-ready answers',
    text: 'Turn messy notes and emails into concise review answers with proof, gaps, next action, and due date.',
  },
  {
    title: 'Learn from outcomes',
    text: 'Use win/loss and action outcomes as a personal coaching loop for future forecast decisions.',
  },
];

const featureCards = [
  {
    title: 'Pipeline Defense Brief',
    text: 'Create a review-ready story for the deals you need to defend, rescue, downgrade, or monitor.',
    icon: FileText,
  },
  {
    title: 'Today command center',
    text: 'Start each day with the top risks, overdue evidence, and next actions that matter before review.',
    icon: RefreshCw,
  },
  {
    title: 'Capture evidence input',
    text: 'Capture messy B2B sales notes, pasted emails, threads, and recaps into reviewed structured evidence.',
    icon: Sparkles,
  },
  {
    title: 'MEDDIC Stakeholder Map',
    text: 'Check whether a deal has real stakeholder evidence, not guessed Champion or Economic Buyer labels.',
    icon: ClipboardCheck,
  },
  {
    title: 'Objection Debt',
    text: 'Track unresolved lead time, procurement, compliance, competitor, budget, and trust objections.',
    icon: ShieldCheck,
  },
  {
    title: 'Outcome Learning',
    text: 'Detect cautious win/loss and action-outcome patterns that can coach the next review.',
    icon: BadgeCheck,
  },
  {
    title: 'Proof Asset Vault',
    text: 'Keep proof notes, objection responses, proposal snippets, compliance notes, and competitor responses.',
    icon: LockKeyhole,
  },
  {
    title: 'Proactive Nudges',
    text: 'Surface reminders and risk signals before stale actions, missing roles, or weak evidence surprise you.',
    icon: FolderClock,
  },
];

const bestFor = [
  'B2B salespeople with weekly or monthly pipeline reviews',
  'Founder-led sellers and solo operators who own their own follow-up',
  'Consultants, freelancers, agencies, and creators selling client work or partnerships',
  'Pharma, life science, lab, industrial, and complex technical sales',
  'Reps who use CRM plus Excel, Notion, private notes, or memory',
  'Sellers who must defend forecast with evidence, not hope',
  'People managing long-cycle deals with procurement and technical stakeholders',
];

const notIdealFor = [
  'Enterprise teams requiring SSO, admin controls, and formal security review today',
  'Teams needing full Salesforce or HubSpot native sync right now',
  'Users looking for Memoire to become the system of record or a manager forecasting dashboard',
  'Operators needing invoicing, inventory, ecommerce, marketplace, or delivery/project management',
];

const pricingPlans = [
  {
    name: 'Solo',
    price: '$15-25/month',
    description: 'For one person managing their own sales follow-up and pipeline memory.',
    items: ['Pipeline review workspace', 'Capture and calendar', 'CSV refresh', 'Defense brief', 'Playbook and assets'],
  },
  {
    name: 'Pro',
    price: '$29-49/month',
    description: 'For power users with deeper review history and exports.',
    items: ['More review pack history', 'Advanced exports', 'Deeper automation later', 'Richer proof assets', 'Priority workflow polish'],
  },
  {
    name: 'Team later',
    price: 'Not available yet',
    description: 'For managers and teams after individual workflow validation.',
    items: ['Shared review standards later', 'Team security review later', 'CRM sync later', 'Manager workflows later'],
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
      'Memoire is for people who sell without a sales team: B2B salespeople, founder-led sellers, consultants, freelancers, agency owners, and creators managing meaningful client, buyer, or partnership follow-up.',
  },
  {
    question: 'Is Memoire for C2B or C2C selling?',
    answer:
      'Only when there is a real sales-memory loop: client context, proposal or partnership follow-up, objections, stakeholders, and next actions. Memoire is not built for ecommerce, inventory, marketplace listings, or simple one-off transactions.',
  },
  {
    question: 'What is the Pipeline Defense Brief?',
    answer:
      'It is a manager-ready summary of which deals can be defended, rescued, downgraded, or monitored, plus the proof and next actions needed for review.',
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-950">
      <Helmet>
        <title>Memoire - Personal Pipeline Defense OS for B2B and Solo Operators</title>
        <meta
          name="description"
          content="Memoire is a Personal Pipeline Defense OS used beside CRM, spreadsheets, and notes to help B2B and solo operators capture messy evidence, prepare reviews, and defend, rescue, or downgrade pipeline."
        />
        <meta name="robots" content="noindex, nofollow" />
        <meta property="og:title" content="Memoire - Personal Pipeline Defense OS for B2B and Solo Operators" />
        <meta
          property="og:description"
          content="Never enter a pipeline review unprepared. Capture messy notes and emails, find risks in Today, and copy manager-ready Pipeline Defense answers."
        />
        <meta property="og:type" content="website" />
      </Helmet>

      <MarketingNav />

      <main className="pt-16">
        <section className="relative overflow-hidden bg-slate-950 px-4 py-20 text-white sm:px-6 lg:px-8">
          <div className="absolute inset-0 opacity-40">
            <div className="h-full w-full bg-[radial-gradient(circle_at_20%_20%,rgba(14,165,233,0.24),transparent_32%),radial-gradient(circle_at_80%_10%,rgba(99,102,241,0.20),transparent_28%),linear-gradient(135deg,#020617,#0f172a_55%,#111827)]" />
          </div>
          <div className="relative mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1fr_0.95fr] lg:items-center">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.28em] text-cyan-200">
                Personal Pipeline Defense OS for people who sell without a sales team
              </p>
              <h1 className="mt-5 max-w-4xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                Never enter a pipeline review unprepared.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-200">
                Memoire works beside your CRM, spreadsheet, or notes, not instead of them. Capture messy notes and emails, let Today expose the urgent risks,
                and turn Pipeline Defense into manager-ready answers to defend, rescue, or downgrade your forecast.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/demo"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-300 px-6 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-200"
                >
                  Try Demo
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/demo?sample=1"
                  className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/10 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/15"
                >
                  Load Proof Path Demo
                </Link>
                <Link
                  to="/request-access"
                  className="inline-flex items-center justify-center rounded-lg border border-white/20 px-6 py-3 text-sm font-bold text-slate-100 transition hover:bg-white/10"
                >
                  Request Access
                </Link>
              </div>
              <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-300">
                Private beta. Built for B2B reps, founder-led sellers, consultants, freelancers, agencies, and creators with real follow-up loops. No CRM writeback, no manager surveillance, and demo data stays local in this browser.
              </p>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/10 p-4 shadow-2xl shadow-slate-950/40 backdrop-blur">
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-5">
                <div className="flex items-center justify-between border-b border-slate-700 pb-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-200">Review Pack</p>
                    <h2 className="mt-1 text-xl font-bold text-white">Weekly Pipeline Defense</h2>
                  </div>
                  <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-200">
                    Manager-ready
                  </span>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <Metric label="Defend" value="3" tone="emerald" />
                  <Metric label="Rescue" value="2" tone="amber" />
                  <Metric label="Downgrade" value="1" tone="rose" />
                </div>

                <div className="mt-5 space-y-3">
                  <PreviewRow
                    title="Strategic validation program"
                    tag="Defensible"
                    body="Budget approved, champion active, documentation proof ready."
                  />
                  <PreviewRow
                    title="Technical workflow proposal"
                    tag="Rescue"
                    body="Lead time concern open. Need local support proof this week."
                  />
                  <PreviewRow
                    title="Procurement review"
                    tag="Hope-based"
                    body="Procurement path and decision criteria still unclear."
                  />
                </div>

                <div className="mt-5 rounded-lg border border-cyan-400/20 bg-cyan-400/10 p-4">
                  <p className="text-sm font-bold text-cyan-100">Manager summary</p>
                  <p className="mt-2 text-sm leading-6 text-slate-200">
                    Defend the validated deal with budget and proof. Rescue the technical proposal by resolving lead time concern.
                    Downgrade unsupported deals unless buyer and process evidence is confirmed.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-slate-200 bg-white px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-blue-700">Not a CRM</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                Your CRM tracks records for the company. Memoire helps you prepare as the salesperson.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600">
                CRM fields, spreadsheets, and private notes show the official record. Memoire gives you a private working layer for evidence,
                objections, proof gaps, stakeholders, and review answers.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ['No CRM writeback', 'Review and prepare without changing source CRM records.'],
                ['Read-only working copy', 'Use CSV imports from CRM, Excel, Notion, or private pipeline sheets.'],
                ['Private demo sandbox', 'Try sample data locally before sign-in; account work syncs where configured.'],
                ['Private review preparation', 'Build your deal story before walking into forecast review.'],
              ].map(([title, text]) => (
                <div key={title} className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                  <h3 className="font-bold text-slate-950">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-slate-50 px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <SectionHeader
              eyebrow="Core workflow"
              title="From messy evidence to manager-ready review answers."
              text="Memoire is built for the weekly rhythm of pipeline defense and solo sales follow-up, not for replacing the system of record."
            />
            <div className="mt-10 grid gap-4 md:grid-cols-5">
              {workflowSteps.map((step, index) => (
                <div key={step.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-700">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-base font-bold text-slate-950">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="bg-white px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <SectionHeader
              eyebrow="What Memoire helps you do"
              title="Make weak forecast visible before your manager does."
              text="Capture is evidence input. Today is the daily command center. Pipeline Defense is the review artifact. Outcome Learning is the personal coaching loop."
            />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {featureCards.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <Icon className="h-5 w-5 text-blue-700" />
                    <h3 className="mt-4 font-bold text-slate-950">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{feature.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-slate-950 px-4 py-16 text-white sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
            <AudiencePanel title="Best for" items={bestFor} />
            <AudiencePanel title="Not ideal yet for" items={notIdealFor} muted />
          </div>
        </section>

        <section id="pricing" className="bg-white px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <SectionHeader
              eyebrow="Early pricing hypothesis - not final"
              title="Pricing is being validated with early users."
              text="No payment checkout is active here. These are working assumptions for customer discovery."
            />
            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {pricingPlans.map((plan) => (
                <div key={plan.name} className="rounded-lg border border-slate-200 bg-slate-50 p-6">
                  <h3 className="text-xl font-bold text-slate-950">{plan.name}</h3>
                  <p className="mt-2 text-3xl font-extrabold text-blue-700">{plan.price}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{plan.description}</p>
                  <ul className="mt-5 space-y-2">
                    {plan.items.map((item) => (
                      <li key={item} className="flex gap-2 text-sm leading-6 text-slate-700">
                        <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-blue-600" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-8 text-center">
              <div className="flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  to="/signup"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-6 py-3 text-sm font-bold text-white transition hover:bg-blue-800"
                >
                  Create early-access account
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/request-access"
                  className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-white px-6 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-50"
                >
                  Request guided access
                </Link>
              </div>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
                No payment checkout is active. Create an account directly, or request guided access for workflow support.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-slate-50 px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <SectionHeader
              eyebrow="Privacy FAQ"
              title="Built for sensitive pipeline preparation."
              text="Memoire is careful about positioning because customer, tender, pricing, competitor, and forecast data can be sensitive."
            />
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {faqs.map((faq) => (
                <div key={faq.question} className="rounded-lg border border-slate-200 bg-white p-5">
                  <h3 className="font-bold text-slate-950">{faq.question}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{faq.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-blue-700 px-4 py-16 text-white sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-blue-100">Early access</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Bring a stronger deal story to your next pipeline review.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-blue-50">
              Try the demo sandbox, create an early-access account, or request guided support for your real pipeline workflow.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                to="/demo"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-50"
              >
                Try the Demo
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/signup"
                className="inline-flex items-center justify-center rounded-lg border border-white/30 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10"
              >
                Create Account
              </Link>
              <Link
                to="/request-access"
                className="inline-flex items-center justify-center rounded-lg border border-white/30 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10"
              >
                Request Guided Access
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function SectionHeader({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="text-sm font-bold uppercase tracking-[0.22em] text-blue-700">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{title}</h2>
      <p className="mt-4 text-base leading-7 text-slate-600">{text}</p>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'emerald' | 'amber' | 'rose' }) {
  const toneClasses = {
    emerald: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100',
    amber: 'border-amber-400/20 bg-amber-400/10 text-amber-100',
    rose: 'border-rose-400/20 bg-rose-400/10 text-rose-100',
  };

  return (
    <div className={`rounded-lg border p-3 ${toneClasses[tone]}`}>
      <p className="text-xs font-bold uppercase tracking-[0.16em] opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-extrabold">{value}</p>
    </div>
  );
}

function PreviewRow({ title, tag, body }: { title: string; tag: string; body: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-bold text-white">{title}</h3>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-200">{tag}</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-300">{body}</p>
    </div>
  );
}

function AudiencePanel({ title, items, muted = false }: { title: string; items: string[]; muted?: boolean }) {
  return (
    <div className={`rounded-lg border p-6 ${muted ? 'border-white/10 bg-white/5' : 'border-cyan-300/30 bg-cyan-300/10'}`}>
      <h3 className="text-xl font-bold text-white">{title}</h3>
      <ul className="mt-5 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-6 text-slate-200">
            <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-cyan-300" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
