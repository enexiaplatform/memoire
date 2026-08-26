#!/usr/bin/env node
/**
 * Draw the link-preview card and rasterise it to PNG.
 *
 * ## Why this exists
 *
 * `public/social-card.svg` was the og:image for the whole site, and `index.html`
 * said so in a comment: "The card is an SVG, which Slack, Discord and iMessage
 * render and X does not - export it to social-card.png and swap the two URLs
 * below when there is a moment."
 *
 * The moment mattered more than that comment suggests. SVG is not a supported
 * og:image anywhere that a B2B seller actually shares a link: not X, not
 * LinkedIn, not Facebook, not WhatsApp. LinkedIn is where this product's buyers
 * are, and every post linking to Memoire rendered there as a bare grey box with
 * a URL under it - the least clickable thing a feed can contain. A product whose
 * own feature is "send this brief to your manager" was the one thing on the page
 * that would not preview.
 *
 * ## Why a browser, and why not sharp
 *
 * Same trade as `generate-favicons.mjs`: the card sets type in Outfit, the brand
 * display face, and rasterising that needs a font engine and a shaper. Node has
 * neither. Playwright is already a devDependency here (two measurement scripts
 * use it), and a headless Chromium has both. The woff2 files are inlined as data
 * URIs so the render needs no server and no network.
 *
 * Not part of `npm run build` - it runs when the card changes, and the PNG is
 * committed:
 *
 *   npm run generate:social-card
 *
 * ## Why the offer is not on the card
 *
 * The card deliberately carries the product's identity and its durable promise,
 * and says nothing about price or the free preview. A PNG cannot read
 * `FREE_PREVIEW`, so an offer baked into it goes stale the day the flag flips -
 * and a link preview advertising a preview that ended is worse than one that
 * never mentioned it. The offer belongs on the page the card links to, which is
 * rendered from the flag.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

const WIDTH = 1200;
const HEIGHT = 630;

/** The brand gradient, from tailwind.config.js `backgroundImage.brand-gradient`. */
const BRAND_GRADIENT = 'linear-gradient(135deg,#43A047,#00ACC1,#1976D2,#3949AB,#7B1FA2,#C2185B,#FF5722)';

async function inlineFont(file) {
  const bytes = await readFile(join(PUBLIC, 'fonts', file));
  return `url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2')`;
}

/**
 * The card, as one HTML document.
 *
 * Every word here is the same claim the landing page makes at the same altitude
 * - the eyebrow, the headline and the three failures are lifted from the hero,
 * not written fresh for the card. A preview that promises something the page
 * does not is a bounce.
 */
async function cardHtml() {
  const [outfit, outfitExt, inter, interExt] = await Promise.all([
    inlineFont('outfit-latin.woff2'),
    inlineFont('outfit-latin-ext.woff2'),
    inlineFont('inter-latin.woff2'),
    inlineFont('inter-latin-ext.woff2'),
  ]);

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  @font-face { font-family: 'Outfit'; font-weight: 200 800; src: ${outfit}; }
  @font-face { font-family: 'Outfit'; font-weight: 200 800; src: ${outfitExt}; }
  @font-face { font-family: 'Inter'; font-weight: 300 700; src: ${inter}; }
  @font-face { font-family: 'Inter'; font-weight: 300 700; src: ${interExt}; }

  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden;
    background: linear-gradient(135deg, #0F1C28 0%, #1B2B3A 62%, #243447 100%);
    font-family: 'Inter', sans-serif; color: #F8FAFC;
    display: flex; flex-direction: column;
  }
  /* The brand's actual signature: the seven-stop spectrum, as a rule across
     the top. The old card used a single flat blue that appears nowhere in the
     product. */
  .rule { height: 10px; background: ${BRAND_GRADIENT}; flex: none; }
  .body { flex: 1; padding: 62px 80px 56px; display: flex; flex-direction: column; }

  /* inline-block and align-self are load-bearing here, not tidiness. A
     block-level box is 1040px wide while the word is 185px, so the gradient's
     seven stops spread across the container and the glyphs sample only the
     first two - the wordmark came out green, a colour the brand never uses
     alone. Shrink the box to the word and the whole spectrum lands on it,
     matching the rule above and BrandWordmark in the app. */
  .wordmark {
    display: inline-block; align-self: flex-start;
    font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 46px;
    letter-spacing: -0.02em; padding-right: 0.08em;
    background-image: linear-gradient(100deg,#43A047,#00ACC1,#1976D2,#3949AB,#7B1FA2,#C2185B,#FF5722);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .eyebrow {
    margin-top: 40px; font-size: 20px; font-weight: 700;
    letter-spacing: 0.22em; text-transform: uppercase; color: #7FB3EA;
  }
  h1 {
    margin-top: 20px; font-family: 'Outfit', sans-serif; font-weight: 700;
    font-size: 68px; line-height: 1.06; letter-spacing: -0.025em; color: #FFFFFF;
  }
  .lede {
    margin-top: 26px; font-size: 26px; line-height: 1.45; color: #B9C6D4;
    max-width: 940px;
  }
  .foot {
    margin-top: auto; display: flex; align-items: center; gap: 18px;
    font-size: 21px; font-weight: 700; color: #7FB3EA;
  }
  .foot .dot { width: 5px; height: 5px; border-radius: 999px; background: #40566E; }
  .foot .quiet { color: #8FA3B8; font-weight: 500; }
</style></head>
<body>
  <div class="rule"></div>
  <div class="body">
    <div class="wordmark">Memoire</div>
    <div class="eyebrow">Personal Commercial Control Tower</div>
    <h1>Nothing in your business&nbsp;goes&nbsp;silent.</h1>
    <p class="lede">
      The quote nobody chased. The delivery nobody invoiced. The payment nobody
      noticed was late. Memoire watches every customer thread from the first
      conversation to the money in the bank.
    </p>
    <div class="foot">
      <span>memoire-official.com</span>
      <span class="dot"></span>
      <span class="quiet">No AI service &middot; No CRM writeback &middot; Export anytime</span>
    </div>
  </div>
</body></html>`;
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  await page.setContent(await cardHtml(), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);

  const out = join(PUBLIC, 'social-card.png');
  await writeFile(out, await page.screenshot({ type: 'png' }));
  console.log(`wrote ${out.replace(ROOT, '.')} (${WIDTH}x${HEIGHT})`);
} finally {
  await browser.close();
}
