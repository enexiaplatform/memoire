import { Link, Navigate, useParams } from 'react-router-dom';
import { MarketingNav } from '../../components/marketing/MarketingNav';
import { Footer } from '../../components/marketing/Footer';
import { PageSeo } from '../../components/marketing/PageSeo';
import { breadcrumbSchema } from '../../config/structuredData';
import { CONTACT_EMAIL } from '../../config/contact';
import { LEGAL_ENTITY, LEGAL_ENTITY_DECLARED } from '../../config/legalEntity';

type LegalDocument = {
  title: string;
  updated: string;
  intro: string;
  /**
   * The search-result description.
   *
   * Separate from `intro` because the two are written for different readers.
   * `intro` is the first thing on the page and can take a full sentence to set
   * up the document; this has about 155 characters before Google cuts it, so
   * it has to say the whole thing or say less.
   */
  metaDescription: string;
  sections: { title: string; paragraphs: string[] }[];
};

const documents: Record<string, LegalDocument> = {
  privacy: {
    title: 'Privacy Policy',
    updated: 'August 11, 2026',
    metaDescription:
      'What Memoire stores, what leaves your browser, and where it goes. No AI service, no CRM writeback, and every real data flow named.',
    intro:
      'This policy explains what Memoire stores, what leaves your browser and where it goes. Every claim here describes what the product actually does today, not what it may do later.',
    sections: [
      {
        title: 'Data you provide',
        paragraphs: [
          'Memoire may store account information, pipeline records, activities, stakeholders, objections, quotes, orders, receivables, review briefs, and other content you enter.',
          'Signed in, supported records sync to a database held under your account. Not signed in, Memoire runs on browser storage only, and the app says so inside when it is doing that.',
        ],
      },
      {
        title: 'Local and sample data',
        paragraphs: [
          'Local-only and sample records stay in the browser profile where they were created unless you explicitly export or migrate them.',
          'Clearing browser storage, changing browser profiles, or using another device can remove or hide local-only records.',
        ],
      },
      {
        title: 'No AI service',
        paragraphs: [
          'Memoire has no AI provider, no AI API key and no AI endpoint. Capture parses what you paste on your own device, using rules. Search & Insights answers from records already in your workspace, computed in your browser.',
          'Nothing you write is sent to a language model, by us or on our behalf, and none of it is used to train one. This is enforced by an automated check that fails our build if an AI dependency, endpoint or key is added back.',
        ],
      },
      {
        title: 'Product analytics',
        paragraphs: [
          'Memoire records a short list of product events - for example capture saved, commitment completed, review completed, CSV import completed, sync failed, signup completed.',
          'Each event carries only the event name, a random identifier generated in your browser, the app path you were on with any query string removed, and which storage mode the workspace was in. It carries no notes, no customer or contact names, no deal content, no amounts and no email address.',
          'There is currently no setting to turn these off. Rather than offer a switch that does nothing, we keep the payload small enough that turning it off would protect nothing.',
        ],
      },
      {
        title: 'Email digests',
        paragraphs: [
          'The daily digest and the Monday review are off unless you turn them on in Settings, and each can be turned off again there or from the unsubscribe link in any digest.',
          'When they are on, the email is built from your own records and does contain account names and quote titles - that is what makes it useful. It is delivered by a transactional email provider, which necessarily receives the message in order to send it.',
        ],
      },
      {
        title: 'Payment',
        paragraphs: [
          'Subscriptions are handled by Lemon Squeezy, which acts as merchant of record. Your card details go to Lemon Squeezy and never reach Memoire; we do not see them, receive them or store them.',
          'Memoire sends Lemon Squeezy your email address and an internal account identifier, and stores back only the customer and subscription identifiers and the resulting entitlement.',
        ],
      },
      {
        title: 'Links you share',
        paragraphs: [
          'A shared review brief carries its content in the fragment of the link - the part after the # - which browsers do not send to any server. The brief is never uploaded; it is decoded in whichever browser opens it.',
          'The consequence is that anyone holding the link can read it, and there is no password and no expiry. Share it the way you would share the document itself.',
        ],
      },
      {
        title: 'Service providers and security',
        paragraphs: [
          'Memoire relies on Supabase for its database and authentication, Vercel for hosting, Lemon Squeezy for subscriptions, a transactional email provider for digests you have enabled, and Google for sign-in if you choose to sign in with Google. There is no AI provider in this list because there is none in the product.',
          // A B2B buyer asks where their customer list physically sits before
          // they put it anywhere, and "our provider is Supabase" is not an
          // answer to that question.
          'The database holding synced workspaces runs in Supabase\'s Mumbai region (ap-south-1). Serving is global: the application itself is delivered from the hosting network\'s nearest edge, so a request made in Europe or Japan is answered near you while the records themselves stay in that one database region. If you are subject to rules about where your customer data may be stored, read that sentence before you sign in rather than after.',
          'How long it is kept: for as long as the workspace exists. Deleting your account from Settings removes the account and every record keyed to it in the same operation - it is one cascading delete, not a flag that hides your rows. Copies can persist for a short window afterwards in the database provider\'s own routine backups, which we do not read and cannot selectively edit. Records you never synced live only in the browser you wrote them in, and clearing that browser removes them.',
          'No online service can promise absolute security. Use appropriate judgment before entering sensitive tender, pricing, personal, or regulated information.',
        ],
      },
      {
        title: 'Your choices',
        paragraphs: [
          'You can use Memoire without signing in, accepting the limits of browser-only storage; sign out; export your workspace at any time; clear local browser data; turn digests off; or delete your account from Settings, which deletes the account and its records.',
          'Export is never withheld. A lapsed subscription stops you adding to a workspace; it must never stop you taking your own work out of it.',
          `Questions about privacy can be sent to ${CONTACT_EMAIL}.`,
        ],
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    updated: 'August 11, 2026',
    metaDescription:
      'The terms for Memoire: $10 a month for one person, a 7-day trial, no free tier, and no refunds on completed charges.',
    intro: 'These terms govern use of Memoire, a personal sales workspace for one operator.',
    sections: [
      {
        title: 'What this service is',
        paragraphs: [
          'Memoire is provided as a sales preparation and memory tool, not as a system of record, legal record, or guaranteed forecast.',
          'Features, limits, storage behavior, and availability may change. Anything that would remove access to work you have already entered will be announced before it happens, and export is always available.',
        ],
      },
      {
        title: 'Subscription and payment',
        paragraphs: [
          'The Personal plan is $10 per month for one person. It begins with a 7-day free trial: a card is taken up front, nothing is charged during the trial, and the first charge is taken when the trial ends. Cancel before then and you are not charged.',
          'Cancelling after that stops the next renewal; access continues until the end of the period already paid for. There is no free tier. The Team plan is not on sale and has no price.',
          'Refunds are not offered on completed charges. The trial exists so the decision is made before any money moves: you get the whole product for seven days, and cancelling inside that window costs nothing. Statutory rights that apply where you live are not affected by this paragraph.',
          'Lemon Squeezy processes payments as merchant of record, and its own terms apply to the transaction. Write to us at the address below about anything to do with a charge.',
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
          'Risk signals, MEDDIC-lite reviews, recommended actions and summaries are computed by rule from the records you entered. They are not produced by a language model, and they require human review all the same: a rule applied to an incomplete record returns a confident answer about the wrong thing.',
          'You remain responsible for sales decisions, customer communications, forecasts, and information shared with managers or third parties.',
        ],
      },
      {
        title: 'Availability and liability',
        paragraphs: [
          'The service may be interrupted or contain errors. Keep independent copies of business-critical information.',
          'To the extent permitted by law, Memoire is not liable for lost opportunities, lost local browser data, inaccurate outputs, or decisions made from generated recommendations.',
        ],
      },
      {
        // Who "we" is. See src/config/legalEntity.ts - while the fields there
        // are blank this says so plainly rather than leaving the reader to
        // notice that a contract they are being charged under names nobody.
        title: 'Who you are contracting with',
        paragraphs: LEGAL_ENTITY_DECLARED
          ? [
            `Memoire is operated by ${LEGAL_ENTITY.name}, ${LEGAL_ENTITY.registration}, registered at ${LEGAL_ENTITY.address}.`,
            `These terms are governed by ${LEGAL_ENTITY.governingLaw}, and any dispute arising from them is subject to ${LEGAL_ENTITY.disputeVenue}. Nothing here removes a right you have under the consumer law of the country you live in.`,
            'Lemon Squeezy is the merchant of record for payments and is the seller named on your invoice; its own terms cover the transaction itself.',
          ]
          : [
            `The operating entity behind Memoire has not been named in these terms yet, and no charge is taken while that is true: checkout stays closed. Anything you need to raise in the meantime can be sent to ${CONTACT_EMAIL} and will be answered by the person who runs the service.`,
            'Lemon Squeezy is the merchant of record for payments and is the seller named on your invoice; its own terms cover the transaction itself.',
          ],
      },
      {
        title: 'Contact',
        paragraphs: [`Questions about these terms can be sent to ${CONTACT_EMAIL}.`],
      },
    ],
  },
  boundaries: {
    title: 'Product and Data Boundaries',
    updated: 'August 11, 2026',
    metaDescription:
      'What Memoire deliberately is not: no CRM, no invoicing, no inventory, no AI, no manager scoring, and no writeback to your company systems.',
    intro: 'Memoire is a personal preparation layer for B2B and solo sales work. It is not an employer scoring, CRM, invoicing, inventory, ecommerce, marketplace, or project-delivery system.',
    sections: [
      {
        title: 'What Memoire is',
        paragraphs: [
          'A personal workspace for capturing sales context, reviewing opportunity quality, preparing pipeline defense, and retaining reusable sales learning.',
          'A hybrid workspace where pipeline records, review packs, reusable sales assets, and action outcomes can sync to your account. Lightweight setup preferences may remain in the current browser.',
        ],
      },
      {
        title: 'What Memoire is not',
        paragraphs: [
          'Memoire is not a professional certification, hiring score, credit signal, legal record, or replacement for your company CRM.',
          'Memoire does not currently provide enterprise SSO, team administration, or native CRM writeback.',
          'Memoire does not manage invoices, inventory, ecommerce listings, marketplace fulfillment, or client project delivery.',
          'Memoire is not an AI product. It has no AI provider, no AI key and no AI endpoint, and nothing you write is sent to a language model. Capture parses on your device and Search & Insights computes from your own records.',
        ],
      },
      {
        title: 'Human review',
        paragraphs: [
          'Every classification, risk signal, summary and recommendation is derived by rule from records you entered. Review them before use: a rule reading an incomplete record still returns an answer.',
          'Memoire does not silently update external systems or send customer communication on your behalf. The only messages it sends are the digests you have switched on, and they go to you.',
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
      {/* Legal pages are indexed on purpose. They are low-value as traffic and
          high-value as evidence: "does this store my customer data" is a
          question a buyer asks an answer engine before they ever visit, and the
          only page that answers it truthfully is this one. */}
      <PageSeo
        path={`/legal/${document}`}
        title={`${content.title} - Memoire`}
        description={content.metaDescription}
        type="article"
        jsonLd={[
          breadcrumbSchema([
            { name: 'Memoire', path: '/' },
            { name: content.title, path: `/legal/${document}` },
          ]),
        ]}
      />
      <MarketingNav />
      <main className="px-4 pb-20 pt-28 sm:px-6">
        <article className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Memoire legal</p>
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
            <Link to="/request-access" className="text-sm font-bold text-brand-blue hover:text-brand-blue-dark">
              Talk to us
            </Link>
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}
