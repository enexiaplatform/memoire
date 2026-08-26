import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { MarketingNav } from '../../components/marketing/MarketingNav';
import { Footer } from '../../components/marketing/Footer';
import { PageSeo } from '../../components/marketing/PageSeo';
import { articleSchema, breadcrumbSchema } from '../../config/structuredData';
import { FREE_PREVIEW, PREVIEW_BADGE } from '../../config/launchPhase';
import { PERSONAL_MONTHLY_PRICE_USD, TRIAL_DAYS } from '../../utils/entitlement';

/**
 * The shell every guide page shares.
 *
 * ## Why guides exist at all
 *
 * Until 2026-08-26 this site had seven URLs and every one of them assumed the
 * reader already knew the product's name. `/`, `/pricing` and `/use-cases`
 * answer "what is Memoire"; nothing answered the question somebody actually
 * types before they have heard of it - "why do deals go quiet", "how do I track
 * quote to cash". A site that can only be found by its own brand name can only
 * be found by people who already found it.
 *
 * These pages are not brochures with a keyword in the title. Each one has to be
 * useful to a reader who never signs up: the advice sections are tool-agnostic
 * and would still be worth reading if Memoire did not exist. That is not
 * altruism - an answer engine cites the page that answers the question, and a
 * page that only says "and that is why you need our product" answers nothing.
 * The product appears at the end, once, as one way of doing what the page has
 * just argued for.
 *
 * ## The shape
 *
 * Nav, a hero, the prose, one CTA, footer. `scripts/verify-seo-contract.mjs`
 * requires every prerendered route to render more than 4000 bytes of body, an
 * <h1>, a canonical, a description and valid JSON-LD - a floor that a thin page
 * cannot clear, which is the point of having it.
 */

export type GuideLayoutProps = {
  /** The <title>. Kept under ~60 characters so a search result does not clip it. */
  title: string;
  description: string;
  path: string;
  /** Above the h1. The topic, not the brand. */
  eyebrow: string;
  heading: string;
  /** The paragraph under the h1. The claim the rest of the page earns. */
  standfirst: string;
  /** Machine-readable publish date, ISO. Answer engines rank recency. */
  published: string;
  updated: string;
  children: ReactNode;
};

export function GuideLayout({
  title,
  description,
  path,
  eyebrow,
  heading,
  standfirst,
  published,
  updated,
  children,
}: GuideLayoutProps) {
  return (
    <div className="min-h-screen bg-white">
      <PageSeo
        title={title}
        description={description}
        path={path}
        type="article"
        jsonLd={[
          articleSchema({ headline: heading, description, path, published, updated }),
          // Two levels, not three. A `/guides` hub crumb would name a URL that
          // does not exist, and a breadcrumb pointing at a 404 is worse markup
          // than no breadcrumb. Add the level when there is a hub worth having.
          breadcrumbSchema([
            { name: 'Memoire', path: '/' },
            { name: heading, path },
          ]),
        ]}
      />
      <MarketingNav />

      <header className="border-b border-gray-100 bg-page px-4 pb-14 pt-28 sm:pt-32">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">{eyebrow}</p>
          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.1] tracking-tight text-navy sm:text-5xl">
            {heading}
          </h1>
          <p className="mt-5 text-lg leading-8 text-gray-600">{standfirst}</p>
          <p className="mt-6 text-xs font-semibold text-gray-500">
            {/* A date a reader can see, not only one a crawler can parse. */}
            Updated{' '}
            <time dateTime={updated}>
              {new Date(`${updated}T00:00:00Z`).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
              })}
            </time>
          </p>
        </div>
      </header>

      <main className="px-4 py-14">
        <div className="mx-auto max-w-3xl">{children}</div>
      </main>

      <GuideCta />
      <Footer />
    </div>
  );
}

/**
 * The one place a guide sells.
 *
 * It reads `FREE_PREVIEW` rather than naming an offer inline, so a guide cannot
 * be the page still advertising a preview that ended - the same rule the
 * landing and pricing pages follow.
 */
function GuideCta() {
  return (
    <section className="border-t border-gray-100 bg-navy px-4 py-16 text-white">
      <div className="mx-auto max-w-3xl">
        {FREE_PREVIEW && (
          <p className="inline-block rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wide">
            {PREVIEW_BADGE}
          </p>
        )}
        <h2 className="mt-4 font-display text-3xl font-bold leading-tight">
          Memoire is one way to do all of this without remembering any of it.
        </h2>
        <p className="mt-4 max-w-2xl leading-8 text-slate-300">
          You write down what happened with a customer once. It becomes that account&apos;s memory, the next
          commitment you owe, and the warning when that commitment is about to be forgotten — through the quote,
          the delivery and the invoice, all the way to the money landing.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-display font-bold text-navy transition-colors hover:bg-slate-100"
          >
            {FREE_PREVIEW ? 'Start free — no card' : `Start the ${TRIAL_DAYS}-day trial`}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/pricing" className="font-semibold text-slate-300 underline-offset-4 hover:text-white hover:underline">
            {FREE_PREVIEW
              ? `Free during the preview, $${PERSONAL_MONTHLY_PRICE_USD} a month after`
              : `$${PERSONAL_MONTHLY_PRICE_USD} a month for one person`}
          </Link>
        </div>
      </div>
    </section>
  );
}

/** A section of a guide: one h2 and its prose. */
export function GuideSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="mt-14 first:mt-0 scroll-mt-24" id={id}>
      <h2 className="font-display text-2xl font-bold leading-snug text-navy sm:text-3xl">{title}</h2>
      <div className="mt-5 space-y-5 text-[17px] leading-8 text-gray-700">{children}</div>
    </section>
  );
}

/** A numbered point with a name, used where a guide is really a list of failures. */
export function GuidePoint({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-6 rounded-card border border-gray-200 bg-page p-5 sm:p-6">
      <div className="flex items-baseline gap-3">
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-navy text-xs font-bold text-white">
          {index}
        </span>
        <h3 className="font-display text-lg font-bold leading-snug text-navy">{title}</h3>
      </div>
      <div className="mt-3 space-y-3 text-[17px] leading-8 text-gray-700">{children}</div>
    </div>
  );
}

/** The pull-quote that names what a reader recognises in themselves. */
export function GuideQuote({ children }: { children: ReactNode }) {
  return (
    <blockquote className="mt-6 border-l-4 border-brand-blue bg-page px-5 py-4 font-display text-lg font-semibold leading-8 text-navy">
      {children}
    </blockquote>
  );
}

/** Cross-links between guides. An orphan page is a page a crawler deprioritises. */
export function GuideFurther({ links }: { links: { to: string; title: string; blurb: string }[] }) {
  return (
    <section className="mt-16 border-t border-gray-100 pt-10">
      <h2 className="font-display text-sm font-bold uppercase tracking-[0.18em] text-gray-500">Keep reading</h2>
      <ul className="mt-5 space-y-4">
        {links.map((link) => (
          <li key={link.to}>
            <Link to={link.to} className="group block rounded-card border border-gray-200 p-5 hover:border-brand-blue">
              <span className="font-display text-lg font-bold text-navy group-hover:text-brand-blue">{link.title}</span>
              <span className="mt-1 block leading-7 text-gray-600">{link.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
