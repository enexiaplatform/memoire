import { Helmet } from 'react-helmet-async';
import {
  ROBOTS_INDEXABLE,
  ROBOTS_PRIVATE,
  SITE_NAME,
  SITE_OG_IMAGE,
  SITE_OG_IMAGE_ALT,
  SITE_OG_IMAGE_HEIGHT,
  SITE_OG_IMAGE_TYPE,
  SITE_OG_IMAGE_WIDTH,
  canonicalUrl,
} from '../../config/seo';

/**
 * The head of one page.
 *
 * Three public pages used to write their own `<Helmet>` and each wrote a
 * different subset: the landing page had Open Graph tags, pricing and use-cases
 * had none, none of the three had a canonical URL, and all three carried
 * `noindex`. In a single-page app that is not cosmetic - every route serves the
 * same `index.html`, so a page that does not name its own canonical URL is
 * indistinguishable from the home page to a crawler.
 *
 * One component so a new page cannot ship with half a head.
 */

export type PageSeoProps = {
  title: string;
  description: string;
  /** Route path, e.g. `/pricing`. Becomes the canonical and `og:url`. */
  path: string;
  /** Defaults to `title` - override when the share card should read differently. */
  socialTitle?: string;
  /** Defaults to `description`. */
  socialDescription?: string;
  image?: string;
  /** `article` for anything dated, `website` for the rest. */
  type?: 'website' | 'article';
  /**
   * Set on anything behind a login or private to one recipient. It emits
   * `noindex, nofollow` and skips the canonical: a page that should not be in
   * the index has no business claiming to be the canonical version of
   * anything.
   */
  noindex?: boolean;
  /**
   * JSON-LD for this page. Emitted as one `application/ld+json` block per
   * entry, which is what Google's parser expects; an array inside one block
   * works too but a single malformed entry then invalidates the rest.
   */
  jsonLd?: Record<string, unknown>[];
};

/**
 * `noindex, nofollow` and nothing else.
 *
 * For everything behind the login, the auth screens themselves, and the
 * read-only share links. `vercel.json` already sends the same directive as a
 * header on those paths, and the header is the one that works without
 * JavaScript - this is the second lock, for the case where a private surface
 * moves to a path the header pattern does not cover.
 *
 * A share link is the reason this is not optional. `/share/brief?...` is a URL
 * one person sends to their manager; it carries deal names and amounts, and it
 * needs no password. It must never be a search result.
 */
export function NoIndex() {
  return (
    <Helmet>
      <meta name="robots" content={ROBOTS_PRIVATE} />
      <meta name="googlebot" content={ROBOTS_PRIVATE} />
    </Helmet>
  );
}

export function PageSeo({
  title,
  description,
  path,
  socialTitle,
  socialDescription,
  image = SITE_OG_IMAGE,
  type = 'website',
  noindex = false,
  jsonLd = [],
}: PageSeoProps) {
  const url = canonicalUrl(path);
  const shareTitle = socialTitle ?? title;
  const shareDescription = socialDescription ?? description;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={noindex ? ROBOTS_PRIVATE : ROBOTS_INDEXABLE} />
      {noindex ? null : <link rel="canonical" href={url} />}

      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={shareTitle} />
      <meta property="og:description" content={shareDescription} />
      <meta property="og:url" content={url} />
      {/*
        * The card's dimensions, type and alt text travel with its URL.
        *
        * They used to sit in `index.html` and only half of them existed: width
        * and height, no type, no alt. The prerender drops a template tag only
        * when the page emits the same key, so those two survived from the
        * template while the URL beside them came from here - one card described
        * in two files. Declaring all five together means a card that changes
        * shape cannot leave a stale 1200x630 behind it, and a scraper that
        * needs the type before it will fetch the bytes (X is one) gets it.
        */}
      <meta property="og:image" content={image} />
      <meta property="og:image:type" content={SITE_OG_IMAGE_TYPE} />
      <meta property="og:image:width" content={String(SITE_OG_IMAGE_WIDTH)} />
      <meta property="og:image:height" content={String(SITE_OG_IMAGE_HEIGHT)} />
      <meta property="og:image:alt" content={SITE_OG_IMAGE_ALT} />
      <meta property="og:locale" content="en_US" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={shareTitle} />
      <meta name="twitter:description" content={shareDescription} />
      <meta name="twitter:image" content={image} />
      <meta name="twitter:image:alt" content={SITE_OG_IMAGE_ALT} />

      {jsonLd.map((entry, index) => (
        // The index is the key because these are a fixed, ordered list per page
        // - they are never reordered or filtered at runtime.
        <script key={index} type="application/ld+json">
          {JSON.stringify(entry)}
        </script>
      ))}
    </Helmet>
  );
}
