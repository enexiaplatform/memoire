import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PUBLIC_PAGES, ROBOTS_PRIVATE, SITE_URL, canonicalUrl } from '../src/config/seo.ts';
import { PERSONAL_MONTHLY_PRICE_USD, TRIAL_DAYS } from '../src/utils/entitlement.ts';

/**
 * The site is findable, and only the public half of it is.
 *
 * Until 2026-08-11 this project shipped `noindex, nofollow` in three places at
 * once and a contract that made sure it stayed there. The decision to open the
 * marketing pages to search reversed that, and reversing a safety rail is
 * exactly when you want a new one: the failure modes on this side are quieter
 * than the old one and cost more.
 *
 * Four of them, in order of how expensive they are:
 *
 * 1. A private surface becomes indexable. `/share/brief` renders one seller's
 *    deal names and amounts to anyone holding the link. Nothing about it is
 *    secret to a crawler that finds the URL in a public paste.
 * 2. The prerender silently stops running. The build still succeeds, the site
 *    still works in a browser, and every answer engine goes back to seeing a
 *    blank page. Nobody notices for a quarter.
 * 3. The structured price drifts from the visible price. Google treats a
 *    machine-readable price that contradicts the page as a reason to distrust
 *    the markup on the whole domain.
 * 4. A new marketing page ships without a sitemap entry, or the sitemap keeps
 *    a URL that now 404s.
 *
 * Every check below is against a real artifact - the built `dist/`, the parsed
 * `vercel.json`, the actual `robots.txt` - rather than against source text that
 * happens to contain the right words. Run `npm run build` first; `npm run
 * check` already does.
 */

const read = (path) => readFileSync(path, 'utf8');

// ---------------------------------------------------------------------------
// 1. The static template says "index", and nothing in it says otherwise.
// ---------------------------------------------------------------------------
{
  const html = read('index.html');
  const robots = html.match(/<meta\s+name="robots"\s+content="([^"]*)"/i);
  assert.ok(robots, 'index.html must declare a robots directive');
  assert.ok(
    robots[1].includes('index') && !robots[1].includes('noindex'),
    `index.html robots directive must be indexable, got "${robots[1]}"`,
  );
  assert.ok(
    !/<link\s+rel="canonical"/i.test(html),
    'index.html must not hard-code a canonical: it is also the SPA fallback, and a canonical there points every 404 at the home page',
  );
  assert.ok(html.includes('/sitemap.xml'), 'index.html must point at the sitemap');

  // Icons. The search result showed a generic globe because /favicon.ico did
  // not exist - the SPA rewrite answered it with the HTML shell, a 200 of type
  // text/html to a request for an image - and because the only icon declared
  // was an SVG, which Google's own format list does not mention.
  assert.ok(
    /<link rel="icon" href="\/favicon\.ico"/.test(html),
    'index.html must declare the root .ico: it is the path clients probe by convention',
  );
  assert.ok(
    /<link rel="icon" type="image\/png"[^>]*href="\/favicon-96\.png"/.test(html),
    'index.html must declare a PNG icon of at least 48px - a raster is what a search result renders',
  );
  assert.ok(
    /<link rel="apple-touch-icon"[^>]*href="\/favicon-180\.png"/.test(html),
    'the apple-touch-icon must be a PNG; iOS ignores SVG here and shows no home-screen icon at all',
  );
  for (const [, href] of html.matchAll(/<link rel="(?:shortcut )?icon"[^>]*href="([^"]+)"/g)) {
    assert.ok(
      !href.includes('?'),
      `favicon URLs must be stable, and a cache-busting query is not: ${href}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 2. Deployment headers: no blanket noindex, and the private paths keep theirs.
// ---------------------------------------------------------------------------
{
  const config = JSON.parse(read('vercel.json'));
  const headers = config.headers ?? [];

  const blanket = headers.find(
    (entry) => entry.source === '/(.*)' && entry.headers?.some((header) => header.key === 'X-Robots-Tag'),
  );
  assert.equal(blanket, undefined, 'a blanket X-Robots-Tag on /(.*) would un-launch the whole site');

  const noindexed = new Set(
    headers
      .filter((entry) =>
        entry.headers?.some((header) => header.key === 'X-Robots-Tag' && header.value === ROBOTS_PRIVATE),
      )
      .map((entry) => entry.source),
  );
  for (const source of ['/app/:path*', '/share/:path*', '/api/(.*)', '/spa-fallback.html']) {
    assert.ok(noindexed.has(source), `${source} must be served with X-Robots-Tag: ${ROBOTS_PRIVATE}`);
  }
  assert.ok(
    [...noindexed].some((source) => source.includes('login') && source.includes('reset-password')),
    'the auth screens must be served with X-Robots-Tag: noindex',
  );

  const fallback = config.rewrites?.find((entry) => entry.source === '/(.*)');
  assert.equal(
    fallback?.destination,
    '/spa-fallback.html',
    'the SPA fallback must be the shell; pointing it at index.html flashes the landing page on every /app load',
  );
}

// ---------------------------------------------------------------------------
// 3. robots.txt: open to search and to answer engines, closed on the app.
// ---------------------------------------------------------------------------
{
  const robots = read('public/robots.txt');
  assert.ok(/^User-agent:\s*\*$/m.test(robots), 'robots.txt must address the default crawler');
  assert.ok(/^Allow:\s*\/$/m.test(robots), 'robots.txt must allow the site root');
  for (const path of ['/app', '/share/', '/api/']) {
    assert.ok(
      new RegExp(`^Disallow:\\s*${path.replace(/\//g, '\\/')}$`, 'm').test(robots),
      `robots.txt must disallow ${path}`,
    );
  }
  assert.equal(
    robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`),
    true,
    'robots.txt must name the sitemap at its absolute URL',
  );

  // The GEO half. These are named individually because the wildcard block does
  // not reach several of them in practice, and because an answer engine that is
  // not permitted to fetch the page will paraphrase whatever it remembers.
  for (const agent of ['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) {
    assert.ok(
      new RegExp(`^User-agent:\\s*${agent}$`, 'm').test(robots),
      `robots.txt must give ${agent} an explicit rule`,
    );
  }
}

// ---------------------------------------------------------------------------
// 4. llms.txt states the same offer the product charges.
// ---------------------------------------------------------------------------
{
  const llms = read('public/llms.txt');
  assert.ok(
    llms.includes(`$${PERSONAL_MONTHLY_PRICE_USD} per month`),
    `llms.txt must quote the real price ($${PERSONAL_MONTHLY_PRICE_USD} per month)`,
  );
  assert.ok(
    llms.includes(`${TRIAL_DAYS}-day free trial`),
    `llms.txt must quote the real trial length (${TRIAL_DAYS} days)`,
  );
  // The three claims the codebase enforces. An answer engine repeats what it
  // reads, so the file that exists to be read must not soften any of them.
  assert.ok(llms.includes('There is no free tier'), 'llms.txt must state there is no free tier');
  assert.ok(llms.includes('No AI service'), 'llms.txt must state there is no AI service');
  assert.ok(llms.includes('No CRM writeback'), 'llms.txt must state there is no CRM writeback');
}

// ---------------------------------------------------------------------------
// 5. The prerendered routes and the sitemap describe the same site.
// ---------------------------------------------------------------------------
{
  const app = read('src/App.tsx');
  const listed = new Set(PUBLIC_PAGES.map((page) => page.path));

  // Every public marketing route in the router is in the sitemap. The auth,
  // share and validation routes are public in the routing sense and private in
  // the search sense, so they are excluded by name rather than by pattern.
  const routed = [...app.matchAll(/<Route path="(\/[^"]*)"/g)].map((match) => match[1]);
  const shouldBeListed = routed.filter((path) =>
    ['/', '/pricing', '/use-cases', '/request-access'].includes(path),
  );
  for (const path of shouldBeListed) {
    assert.ok(listed.has(path), `${path} is a public route but is missing from PUBLIC_PAGES`);
  }
  assert.ok(
    app.includes('<Route path="/legal/:document"'),
    'PUBLIC_PAGES lists the legal documents individually because the route is parameterised - if that route is gone, the list is stale',
  );
}

// ---------------------------------------------------------------------------
// 6. The private surfaces opt out in the markup as well as in the headers.
// ---------------------------------------------------------------------------
{
  const surfaces = {
    'src/components/layout/AppShell.tsx': 'every /app route',
    'src/features/pipeline/SharedBriefPage.tsx': 'the shared brief link',
    'src/pages/NotFoundPage.tsx': 'the soft 404',
  };
  for (const [file, what] of Object.entries(surfaces)) {
    assert.ok(read(file).includes('<NoIndex />'), `${what} must render <NoIndex /> (${file})`);
  }

  // The other half of the prerender marker: without this line the browser ends
  // up with the prerendered head *and* Helmet's copy of it.
  assert.ok(
    read('src/main.tsx').includes("document.querySelectorAll('[data-prerendered-seo]')"),
    'main.tsx must clear the prerendered head tags before Helmet adds its own',
  );
}

// ---------------------------------------------------------------------------
// 7. The build output. This is the check that catches a prerender that stopped
//    running, which is invisible in every other way.
// ---------------------------------------------------------------------------
{
  assert.ok(existsSync('dist/index.html'), 'run `npm run build` before this contract');

  assert.ok(
    existsSync('dist/spa-fallback.html'),
    'the SPA shell is missing - vercel.json rewrites every unmatched URL to it',
  );
  const fallback = read('dist/spa-fallback.html');
  assert.ok(
    fallback.includes('<div id="root"></div>'),
    'the SPA fallback must stay an empty shell; a prerendered page there flashes on every /app load',
  );
  // Every public page is prerendered, so this file only ever answers /app, the
  // auth screens, /share and URLs that do not exist.
  assert.ok(
    /<meta name="robots" content="noindex, nofollow"/.test(fallback),
    'the SPA fallback must declare noindex - it serves only private surfaces and soft 404s',
  );

  const prerendered = [
    ['/', 'dist/index.html'],
    ['/pricing', 'dist/pricing/index.html'],
    ['/use-cases', 'dist/use-cases/index.html'],
    ['/request-access', 'dist/request-access/index.html'],
    ['/legal/privacy', 'dist/legal/privacy/index.html'],
    ['/legal/terms', 'dist/legal/terms/index.html'],
    ['/legal/boundaries', 'dist/legal/boundaries/index.html'],
  ];

  for (const [route, file] of prerendered) {
    assert.ok(existsSync(file), `${route} was not prerendered (${file})`);
    const html = read(file);
    const head = html.slice(0, html.indexOf('<body>'));
    const body = html.slice(html.indexOf('<body>'));

    // Real content, not a shell. The whole point of prerendering is that a
    // crawler which never runs JavaScript still gets the page.
    assert.ok(
      !body.includes('<div id="root"></div>'),
      `${route} shipped an empty root - the prerender did not run for it`,
    );
    assert.ok(body.includes('<h1'), `${route} has no <h1> in its prerendered markup`);
    assert.ok(body.length > 4000, `${route} prerendered only ${body.length} bytes of body`);

    // Exactly one of each directive. Two canonicals are worth less than none:
    // Google discards conflicting pairs.
    assert.equal((head.match(/<title[\s>]/g) ?? []).length, 1, `${route} must have exactly one <title>`);
    assert.equal(
      (head.match(/rel="canonical"/g) ?? []).length,
      1,
      `${route} must have exactly one canonical link`,
    );
    assert.equal(
      (head.match(/name="robots"/g) ?? []).length,
      1,
      `${route} must have exactly one robots directive`,
    );

    // Every injected tag is marked so the client can remove it before Helmet
    // adds its own copy. Without the marker the rendered DOM carries two of
    // each - and a page with two canonical links is one bad merge from having
    // two different ones, which Google resolves by ignoring both.
    assert.ok(
      head.includes('data-prerendered-seo'),
      `${route} head tags are not marked for client-side removal`,
    );

    const canonical = head.match(/<link\s+data-prerendered-seo\s+rel="canonical"\s+href="([^"]+)"/);
    assert.equal(canonical[1], canonicalUrl(route), `${route} declares the wrong canonical URL`);

    const robots = head.match(/<meta\s+data-prerendered-seo\s+name="robots"\s+content="([^"]+)"/);
    assert.ok(!robots[1].includes('noindex'), `${route} must be indexable, got "${robots[1]}"`);

    // Google renders roughly 155 characters. The home page shipped 262, which
    // put the price and the trial - the two facts a searcher decides on - in
    // the half that got cut, and ended the visible half mid-clause.
    const description = head.match(/<meta\s+data-prerendered-seo\s+name="description"\s+content="([^"]+)"/);
    assert.ok(description, `${route} has no meta description`);
    assert.ok(
      description[1].length <= 160,
      `${route} description is ${description[1].length} chars; Google truncates around 155`,
    );

    // Nothing head-shaped may be left behind in the body, where it means
    // nothing at all.
    assert.ok(
      !/<link[^>]*rel="canonical"|<meta\s+name="robots"/.test(body),
      `${route} left head tags in the body - the head merge in scripts/prerender.mjs is broken`,
    );

    for (const block of head.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) ?? []) {
      const json = block.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
      assert.doesNotThrow(() => JSON.parse(json), `${route} shipped unparseable JSON-LD`);
    }
  }

  // The structured price is the visible price.
  const landing = read('dist/index.html');
  const offer = landing.match(/"price":"([\d.]+)","priceCurrency":"USD"/);
  assert.ok(offer, 'the landing page must carry a machine-readable Offer');
  assert.equal(
    Number(offer[1]),
    PERSONAL_MONTHLY_PRICE_USD,
    'the structured price must equal PERSONAL_MONTHLY_PRICE_USD',
  );
  assert.ok(
    landing.includes(`$${PERSONAL_MONTHLY_PRICE_USD}`),
    'the landing page must show the same price it declares',
  );
  assert.ok(landing.includes('"@type":"FAQPage"'), 'the landing page must carry its FAQ as structured data');
  assert.ok(
    landing.includes('"@type":"Organization"'),
    'the landing page must carry the Organization node the other pages reference',
  );

  // The sitemap lists every public page, and only pages that exist.
  const sitemap = read('dist/sitemap.xml');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.equal(locs.length, PUBLIC_PAGES.length, 'the sitemap must list every entry in PUBLIC_PAGES, once');
  for (const page of PUBLIC_PAGES) {
    const expected = page.path === '/' ? `${SITE_URL}/` : `${SITE_URL}${page.path}`;
    assert.ok(locs.includes(expected), `sitemap is missing ${expected}`);
  }
  for (const loc of locs) {
    assert.ok(loc.startsWith(`${SITE_URL}/`), `sitemap URL ${loc} is not on the canonical host`);
  }

  assert.ok(existsSync('dist/robots.txt'), 'robots.txt must be published');
  assert.ok(existsSync('dist/llms.txt'), 'llms.txt must be published');

  // The icons are shipped, and are the format they claim to be. Declaring
  // /favicon.ico in the head while no such file exists is worse than declaring
  // nothing: the rewrite answers with HTML and the crawler records a failure.
  const magic = (file) => readFileSync(file).subarray(0, 4);
  assert.ok(existsSync('dist/favicon.ico'), 'favicon.ico must be published, or the SPA rewrite answers with HTML');
  const ico = magic('dist/favicon.ico');
  assert.ok(
    ico[0] === 0 && ico[1] === 0 && ico[2] === 1 && ico[3] === 0,
    'dist/favicon.ico is not an ICO file',
  );
  for (const size of [16, 32, 48, 96, 180, 192, 512]) {
    const file = `dist/favicon-${size}.png`;
    assert.ok(existsSync(file), `${file} must be published (npm run generate:favicons)`);
    const png = magic(file);
    assert.ok(png[0] === 0x89 && png[1] === 0x50, `${file} is not a PNG`);
  }
}

console.log('SEO contract verified: public pages indexable and prerendered, private surfaces excluded.');
