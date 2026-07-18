import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Capture is the spine of the product and it happens away from the desk, so
 * the app has to be installable and has to behave at phone width. Two rules,
 * both cheap to break by accident.
 */

const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// 1. The manifest says enough for a browser to offer installation.
{
  assert.ok(manifest.name && manifest.short_name, 'the app names itself');
  assert.equal(manifest.display, 'standalone', 'installed, it opens as an app rather than a tab');
  assert.ok(manifest.icons.length >= 1, 'an installed app needs an icon');
  assert.ok(
    manifest.icons.some((icon) => icon.purpose === 'maskable'),
    'a maskable icon, or Android crops the glyph off its own logo',
  );

  // The install lands on the workspace, not the marketing page - somebody who
  // installed the app has already been sold.
  assert.match(manifest.start_url, /^\/app\//, 'start_url opens the workspace');

  // The shortcut exists because the whole point of having this on a phone is
  // logging what just happened before it is forgotten.
  assert.ok(
    manifest.shortcuts?.some((shortcut) => shortcut.url === '/app/capture'),
    'capture is one long-press away',
  );
}

// 2. The document actually references it, and every icon it promises exists.
{
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/, 'the manifest is linked');
  assert.match(html, /name="viewport"[^>]*width=device-width/, 'the viewport is device-width');

  manifest.icons.forEach((icon) => {
    const path = new URL(`../public${icon.src}`, import.meta.url);
    assert.doesNotThrow(() => readFileSync(path), `manifest icon is missing from public/: ${icon.src}`);
  });
}

// 3. Machine-made tags must be breakable. A capture tag arrives as one
//    unbroken token ("source-label:Pasted_email:_Orion_Pharma_tender_review")
//    and, in a chip that could not wrap, it widened the whole document - every
//    page in the app scrolled sideways on a phone because of one span.
{
  const capture = readFileSync(new URL('../src/features/dailyCapture/DailyCapturePage.tsx', import.meta.url), 'utf8');
  const chip = capture.slice(capture.indexOf('{activity.tags.map('), capture.indexOf('{activity.tags.map(') + 400);
  assert.match(chip, /break-all/, 'tag chips break long tokens');
  assert.match(chip, /max-w-full/, 'tag chips never exceed their container');
}

console.log('Installable + mobile-width contract verified.');
