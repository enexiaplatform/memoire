import { Link, Navigate, useParams } from 'react-router-dom';
import { MarketingNav } from '../../components/marketing/MarketingNav';
import { Footer } from '../../components/marketing/Footer';

type LegalDocument = {
  title: string;
  updated: string;
  intro: string;
  sections: { title: string; paragraphs: string[] }[];
};

const documents: Record<string, LegalDocument> = {
  privacy: {
    title: 'Privacy Policy',
    updated: 'June 12, 2026',
    intro: 'This policy explains how Memoire handles account, sales-workspace, local browser, and optional AI data.',
    sections: [
      {
        title: 'Data you provide',
        paragraphs: [
          'Memoire may store account information, pipeline records, activities, stakeholders, objections, review briefs, and other content you enter.',
          'Some product areas work locally in your browser. Signed-in cloud features may store supported records in Supabase under your account.',
        ],
      },
      {
        title: 'Local and demo data',
        paragraphs: [
          'Local-only and demo records stay in the browser profile where they were created unless you explicitly export or migrate them.',
          'Clearing browser storage, changing browser profiles, or using another device can remove or hide local-only records.',
        ],
      },
      {
        title: 'AI-assisted features',
        paragraphs: [
          'Most pipeline review logic is rule-based. When you explicitly use an AI-assisted feature, the submitted text and limited context may be sent to the configured server-side AI provider.',
          'Do not submit confidential customer information to an AI-assisted feature unless your organization has approved that provider and use case.',
        ],
      },
      {
        title: 'Service providers and security',
        paragraphs: [
          'Memoire may rely on hosting, authentication, database, and AI infrastructure providers to operate configured features.',
          'No online service can promise absolute security. Use appropriate judgment before entering sensitive tender, pricing, personal, or regulated information.',
        ],
      },
      {
        title: 'Your choices',
        paragraphs: [
          'You can use local mode, sign out, export available workspace data, clear local browser data, or request account deletion from Settings.',
          'Questions about privacy can be sent to hello@memoire.app.',
        ],
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    updated: 'June 12, 2026',
    intro: 'These terms govern use of the Memoire early-access and personal sales workspace.',
    sections: [
      {
        title: 'Early-access product',
        paragraphs: [
          'Memoire is currently an early-access product. Features, limits, storage behavior, and availability may change as the product is validated.',
          'The service is provided as a sales preparation and memory tool, not as a system of record, legal record, or guaranteed forecast.',
        ],
      },
      {
        title: 'Your responsibilities',
        paragraphs: [
          'You are responsible for having permission to enter or process any customer, contact, pricing, tender, or company information.',
          'You must not use Memoire for unlawful activity, unauthorized access, or storage of information prohibited by your employer or applicable agreements.',
        ],
      },
      {
        title: 'Outputs and decisions',
        paragraphs: [
          'Risk signals, MEDDIC-lite reviews, recommended actions, summaries, and AI-assisted suggestions require human review.',
          'You remain responsible for sales decisions, customer communications, forecasts, and information shared with managers or third parties.',
        ],
      },
      {
        title: 'Availability and liability',
        paragraphs: [
          'Early-access service may be interrupted or contain errors. Keep independent copies of business-critical information.',
          'To the extent permitted by law, Memoire is not liable for lost opportunities, lost local browser data, inaccurate outputs, or decisions made from generated recommendations.',
        ],
      },
      {
        title: 'Contact',
        paragraphs: ['Questions about these terms can be sent to hello@memoire.app.'],
      },
    ],
  },
  boundaries: {
    title: 'Product and Data Boundaries',
    updated: 'June 12, 2026',
    intro: 'Memoire is a personal preparation layer for B2B sales work. It is not an employer scoring or CRM system.',
    sections: [
      {
        title: 'What Memoire is',
        paragraphs: [
          'A personal workspace for capturing sales context, reviewing opportunity quality, preparing pipeline defense, and retaining reusable sales learning.',
          'A local-first product with optional account sync for supported data when cloud services are configured.',
        ],
      },
      {
        title: 'What Memoire is not',
        paragraphs: [
          'Memoire is not a professional certification, hiring score, credit signal, legal record, or replacement for your company CRM.',
          'Memoire does not currently provide enterprise SSO, team administration, or native CRM writeback.',
        ],
      },
      {
        title: 'Human review',
        paragraphs: [
          'All generated classifications, risk signals, summaries, recommendations, and drafts should be reviewed before use.',
          'Memoire does not silently update external systems or send customer communication on your behalf.',
        ],
      },
    ],
  },
};

export function LegalPage() {
  const { document } = useParams();
  const content = document ? documents[document] : null;

  if (!content) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <MarketingNav />
      <main className="px-4 pb-20 pt-28 sm:px-6">
        <article className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Memoire legal</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{content.title}</h1>
          <p className="mt-2 text-sm text-slate-500">Last updated: {content.updated}</p>
          <p className="mt-6 text-base leading-7 text-slate-700">{content.intro}</p>

          <div className="mt-8 space-y-8">
            {content.sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-xl font-bold">{section.title}</h2>
                <div className="mt-3 space-y-3">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="text-sm leading-7 text-slate-600">{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-10 border-t border-slate-200 pt-6">
            <Link to="/request-access" className="text-sm font-bold text-blue-700 hover:text-blue-800">
              Request early access
            </Link>
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}
