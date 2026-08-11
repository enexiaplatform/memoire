#!/usr/bin/env node
/**
 * Turn the marketing routes into real HTML files, and write the sitemap.
 *
 * Runs straight after `vite build`, on the output that build produced.
 *
 * ## What it writes
 *
 *   dist/index.html          the landing page, fully rendered
 *   dist/pricing/index.html  ) the rest of the marketing site, one directory
 *   dist/use-cases/...       ) per route so the host serves them without
 *   dist/legal/privacy/...   ) needing extensionless-URL configuration
 *   dist/spa-fallback.html   the untouched SPA shell
 *   dist/sitemap.xml
 *
 * ## Why spa-fallback.html exists
 *
 * `vercel.json` rewrites every unmatched URL to the SPA shell. That used to be
 * `index.html` - which now contains the landing page's markup, so a logged-in
 * operator opening /app/today would get a flash of the marketing hero before
 * React replaced it. The shell keeps its own filename, the rewrite points at
 * it, and `/` gets the real page. Vercel checks the filesystem before applying
 * rewrites, so a prerendered file always wins over the fallback.
 *
 * The name avoids `app.html` on purpose: that would be reachable at `/app`
 * under clean-URL handling, which is a real route in the router.
 *
 * ## The head merge
 *
 * On React 19 the pages' `<PageSeo />` renders its tags as ordinary elements,
 * inline, wherever the component sits in the tree - which is inside
 * `<div id="root">`. A `<link rel="canonical">` in the body is not a canonical;
 * a `<meta name="robots">` in the body is not a directive. So each tag is
 * lifted out of the body and merged into the template's head *by key*, so the
 * page's title replaces the template's title rather than joining it. Two
 * canonicals or two robots directives are worse than none: Google discards
 * conflicting pairs outright.
 */

import { build } from 'vite';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const SSR_OUT = join(ROOT, '.prerender');

/** Everything between `<!--` and `-->`, so tag scanning never reads a comment. */
function commentRanges(html) {
  const ranges = [];
  const pattern = /<!--[\s\S]*?-->/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}

function isInside(ranges, index) {
  return ranges.some(([start, end]) => index >= start && index < end);
}

/**
 * The identity of a head tag, for replacement purposes.
 *
 * Two tags with the same key are the same statement made twice, and the page's
 * version wins. Tags with no key (JSON-LD, preloads) are additive - a page can
 * carry four structured-data blocks and they do not conflict.
 */
function tagKey(tag) {
  if (/^<title[\s>]/i.test(tag)) return 'title';
  const name = tag.match(/\sname=["']([^"']+)["']/i);
  if (name) return `meta:name:${name[1].toLowerCase()}`;
  const property = tag.match(/\sproperty=["']([^"']+)["']/i);
  if (property) return `meta:property:${property[1].toLowerCase()}`;
  const rel = tag.match(/^<link\b[^>]*\srel=["']([^"']+)["']/i);
  if (rel && rel[1].toLowerCase() === 'canonical') return 'link:canonical';
  return null;
}

const HEAD_TAG_PATTERN = /<title\b[^>]*>[\s\S]*?<\/title>|<meta\b[^>]*?\/?>|<link\b[^>]*?\/?>|<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi;

/** Pull head-worthy tags out of rendered body markup, returning both halves. */
function extractHeadTags(markup) {
  const tags = [];
  const body = markup.replace(HEAD_TAG_PATTERN, (tag) => {
    tags.push(tag);
    return '';
  });
  return { tags, body };
}

/**
 * Mark a tag as this script's work, so the client can take it back out.
 *
 * When the SPA boots over a prerendered page, Helmet knows nothing about the
 * head that is already there and adds its own copy of every tag - two
 * canonicals, two robots directives, eight JSON-LD blocks. The copies are
 * identical, so nothing is *wrong*, but Google evaluates the rendered DOM and a
 * page with two canonical links is one bad merge away from having two
 * *different* canonical links, which it resolves by ignoring both.
 *
 * `src/main.tsx` removes everything carrying this attribute before the first
 * render. The crawler that never runs JavaScript keeps the whole head; the
 * browser hands it over to Helmet.
 */
function markPrerendered(tag) {
  return tag.replace(/^<(title|meta|link|script)\b/i, '<$1 data-prerendered-seo');
}

/** Drop any template head tag the page overrides, then insert the page's. */
function mergeHead(template, rawTags) {
  const tags = rawTags.map(markPrerendered);
  const keys = new Set(tags.map(tagKey).filter(Boolean));
  const comments = commentRanges(template);

  let merged = template.replace(HEAD_TAG_PATTERN, (tag, offset) => {
    if (isInside(comments, offset)) return tag;
    const key = tagKey(tag);
    return key && keys.has(key) ? '' : tag;
  });

  const headClose = merged.indexOf('</head>');
  if (headClose === -1) throw new Error('prerender: template has no </head>');
  return `${merged.slice(0, headClose)}    ${tags.join('\n    ')}\n  ${merged.slice(headClose)}`;
}

function injectBody(html, body) {
  const marker = '<div id="root"></div>';
  if (!html.includes(marker)) {
    throw new Error(`prerender: template is missing ${marker}`);
  }
  return html.replace(marker, `<div id="root">${body}</div>`);
}

/** `/` is index.html; every other route becomes its own directory. */
function outputPathFor(route) {
  if (route === '/') return join(DIST, 'index.html');
  return join(DIST, route.replace(/^\//, ''), 'index.html');
}

/**
 * The sitemap, from the same `PUBLIC_PAGES` list the app imports.
 *
 * `lastmod` is the build date rather than a per-page timestamp. Faking a
 * per-page date from `git log` would be more precise and less honest: a rebuild
 * that changes nothing on `/pricing` should not tell a crawler that `/pricing`
 * changed.
 */
function buildSitemap(siteUrl, pages, lastmod) {
  const urls = pages
    .map(
      ({ path, priority, changefreq }) => `  <url>
    <loc>${path === '/' ? `${siteUrl}/` : `${siteUrl}${path}`}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority.toFixed(1)}</priority>
  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

async function main() {
  // The SSR bundle is built with Vite rather than tsx/ts-node so the module
  // graph, aliases and JSX transform are the ones the app itself is built
  // with. A prerender that resolves imports differently from the client build
  // is a prerender that can render a different page.
  await rm(SSR_OUT, { recursive: true, force: true });
  await build({
    root: ROOT,
    logLevel: 'warn',
    build: {
      ssr: 'src/prerender.tsx',
      outDir: '.prerender',
      emptyOutDir: true,
      // The client build already produced the CSS. Anything this bundle emits
      // would be a second copy nothing links to.
      cssCodeSplit: false,
      minify: false,
    },
  });

  const bundle = await import(pathToFileURL(join(SSR_OUT, 'prerender.js')).href);

  // `vite build` empties dist, so a fallback file here means this script has
  // already run against this build - and dist/index.html is now the landing
  // page, not the shell. Reading the shell back keeps a second run idempotent
  // instead of prerendering the landing page into itself.
  const shellPath = join(DIST, 'spa-fallback.html');
  const template = existsSync(shellPath)
    ? await readFile(shellPath, 'utf8')
    : await readFile(join(DIST, 'index.html'), 'utf8');

  // The SPA fallback keeps the shell exactly as Vite emitted it, with one
  // change: its robots directive is flipped to noindex.
  //
  // Every public page is prerendered, so the only URLs this file ever answers
  // are /app, the auth screens, /share, /validate and anything that does not
  // exist. All of them should be excluded from search, and all of them render a
  // <NoIndex /> of their own once React boots - which, left as "index, follow",
  // would mean two contradictory directives in the head. Google resolves a
  // contradiction by taking the restrictive one, so the outcome was already
  // correct; being correct by tie-break rather than by statement is not a thing
  // to leave in place.
  await writeFile(
    shellPath,
    template.replace(
      /<meta name="robots" content="index[^"]*"\s*\/?>/,
      '<meta name="robots" content="noindex, nofollow" />',
    ),
    'utf8',
  );

  for (const route of bundle.PRERENDER_ROUTES) {
    const markup = bundle.renderRoute(route);
    const { tags, body } = extractHeadTags(markup);
    if (tags.length === 0) {
      throw new Error(`prerender: ${route} rendered no head tags - is <PageSeo /> still on the page?`);
    }
    const html = injectBody(mergeHead(template, tags), body);
    const outputPath = outputPathFor(route);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, html, 'utf8');
    console.log(`prerendered ${route} -> ${outputPath.replace(ROOT, '.')} (${(html.length / 1024).toFixed(0)} kB)`);
  }

  const lastmod = new Date().toISOString().slice(0, 10);
  const sitemap = buildSitemap(bundle.SITE_URL, bundle.PUBLIC_PAGES, lastmod);
  await writeFile(join(DIST, 'sitemap.xml'), sitemap, 'utf8');
  console.log(`sitemap: ${bundle.PUBLIC_PAGES.length} urls, lastmod ${lastmod}`);

  await rm(SSR_OUT, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
