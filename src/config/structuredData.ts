import { CONTACT_EMAIL } from './contact';
import { FREE_PREVIEW } from './launchPhase';
import { SITE_DESCRIPTION, SITE_NAME, SITE_OG_IMAGE, SITE_URL, canonicalUrl } from './seo';

/**
 * Schema.org JSON-LD builders.
 *
 * This is the half of the work that search engines and answer engines share.
 * A crawler reads the prose; an answer engine reads the prose and then looks
 * for a machine-readable claim to check it against. Without JSON-LD the price,
 * the trial length and the "what kind of thing is this" question all have to be
 * inferred from marketing copy - and inference is where a model invents a free
 * tier that does not exist.
 *
 * Every number here must come from the same constant the product charges from.
 * Nothing is typed twice: `scripts/verify-seo-contract.mjs` fails the build if
 * the price in the structured data stops matching the price on the pricing
 * page.
 */

/** Stable node ids so the graph can reference itself instead of repeating. */
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const SOFTWARE_ID = `${SITE_URL}/#software`;

export function organizationSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/app-icon.svg`,
    image: SITE_OG_IMAGE,
    description: SITE_DESCRIPTION,
    email: CONTACT_EMAIL,
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: CONTACT_EMAIL,
        availableLanguage: ['English'],
      },
    ],
  };
}

export function websiteSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    description: SITE_DESCRIPTION,
    publisher: { '@id': ORGANIZATION_ID },
    inLanguage: 'en',
  };
}

/**
 * The product itself.
 *
 * `SoftwareApplication` rather than `Product` because the thing being sold is
 * hosted software, and `applicationCategory` is what puts it in the right
 * comparison set when an answer engine is asked for "a CRM alternative for one
 * person" rather than for Memoire by name.
 */
export function softwareApplicationSchema(options: {
  monthlyPriceUsd: number;
  trialDays: number;
  featureList: string[];
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': SOFTWARE_ID,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    description: SITE_DESCRIPTION,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Sales pipeline and order-to-cash tracking',
    operatingSystem: 'Web browser (Chrome, Safari, Edge, Firefox); installable on iOS and Android',
    browserRequirements: 'Requires JavaScript. Works offline for capture once installed.',
    softwareVersion: '1',
    publisher: { '@id': ORGANIZATION_ID },
    image: SITE_OG_IMAGE,
    featureList: options.featureList,
    offers: {
      '@type': 'Offer',
      '@id': `${SITE_URL}/pricing#personal`,
      name: 'Personal',
      price: options.monthlyPriceUsd.toFixed(2),
      priceCurrency: 'USD',
      url: canonicalUrl('/pricing'),
      availability: 'https://schema.org/InStock',
      category: 'subscription',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: options.monthlyPriceUsd.toFixed(2),
        priceCurrency: 'USD',
        billingDuration: 1,
        billingIncrement: 1,
        unitCode: 'MON',
      },
      // The trial is Lemon Squeezy's: card up front, charged when it ends.
      // Declaring it as a free trial rather than a free tier is the whole
      // point - the free tier this site used to advertise did not exist.
      //
      // During the free preview the price stays the published price - it is
      // what the store will charge, and scripts/verify-seo-contract.mjs holds
      // the structured number to the visible one - but the *terms* must not
      // claim a card is taken, because checkout is shut and none can be.
      eligibleCustomerType: 'https://schema.org/Enduser',
      description: FREE_PREVIEW
        ? `Free for everyone while Memoire is in preview: the full product, no card taken at signup and nothing charged. $${options.monthlyPriceUsd} a month for one person once the preview ends. There is no free tier after it.`
        : `${options.trialDays}-day free trial with the full product, card taken up front and charged only when the trial ends. Cancel inside the trial and you pay nothing. There is no free tier.`,
    },
  };
}

export function faqPageSchema(faqs: { question: string; answer: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };
}

/**
 * Breadcrumbs.
 *
 * A flat marketing site does not need them for navigation. They exist so a
 * search result shows `memoire-official.com > Legal > Privacy Policy` instead
 * of a bare URL, and so an answer engine can tell a legal page from a product
 * page without reading it.
 */
export function breadcrumbSchema(trail: { name: string; path: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: canonicalUrl(crumb.path),
    })),
  };
}

/** A page that is mostly one list - the use-cases page is exactly this shape. */
export function itemListSchema(options: {
  name: string;
  description: string;
  items: { name: string; description: string }[];
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: options.name,
    description: options.description,
    itemListElement: options.items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      description: item.description,
    })),
  };
}
