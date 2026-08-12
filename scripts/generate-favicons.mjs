#!/usr/bin/env node
/**
 * Rasterise the brand mark into the favicon formats Google Search can use.
 *
 * ## Why this exists
 *
 * The site shipped an SVG favicon and nothing else. Browsers were happy;
 * Google's search result showed the generic globe. Two things were wrong, and
 * only one of them was the format:
 *
 * 1. `/favicon.ico` did not exist, so the SPA rewrite answered it with the
 *    HTML shell - a 200 response, of type text/html, to a request for an
 *    image. Every client that probes the root by convention got that.
 * 2. Google documents "any valid favicon format" but does not list SVG, and
 *    in practice the search-result icon comes from a raster. A PNG at 48px or
 *    larger plus a real .ico is the combination that is known to work.
 *
 * ## Why a browser
 *
 * `public/favicon.svg` draws its letter with `<text>`, so rasterising it needs
 * a font engine and a shaper. Node has neither, and adding sharp or resvg to a
 * project that has kept its dependency list this short for a favicon would be
 * a poor trade. A browser already has both, and this repo already drives one.
 *
 * So: this serves a page that draws the mark on a canvas with the real brand
 * font, posts each size back, and writes the files. It is not part of `npm run
 * build` - it runs when the mark changes, and the output is committed.
 *
 *   npm run generate:favicons     (then open the URL it prints)
 *
 * The canvas draw is a transcription of public/favicon.svg, not an import of
 * it: same gradient stops, same 14/64 corner radius, same baseline. If that
 * file changes, change this one.
 */

import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PUBLIC = join(ROOT, 'public');
const PORT = 4180;

/** Sizes to emit as standalone PNGs, and the subset the .ico carries. */
const PNG_SIZES = [16, 32, 48, 96, 180, 192, 512];
const ICO_SIZES = [16, 32, 48];

const received = new Map();

const PAGE = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@800&display=swap');
  body { font: 14px system-ui; padding: 2rem; background: #0f172a; color: #e2e8f0; }
  canvas { margin-right: 12px; vertical-align: middle; background: #1e293b; }
</style>
</head>
<body>
<h1>Memoire favicon generator</h1>
<p id="status">Waiting for the brand font...</p>
<div id="preview"></div>
<script>
const SIZES = ${JSON.stringify(PNG_SIZES)};

// A transcription of public/favicon.svg. Kept in the same proportions: the
// source is a 64x64 box, so every measurement scales by size/64.
function render(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const s = size / 64;

  const g = x.createLinearGradient(0, 0, size, size);
  for (const [stop, colour] of [
    [0, '#43A047'], [0.18, '#00ACC1'], [0.36, '#1976D2'], [0.52, '#3949AB'],
    [0.68, '#7B1FA2'], [0.84, '#C2185B'], [1, '#FF5722'],
  ]) g.addColorStop(stop, colour);

  const r = 14 * s;
  x.beginPath();
  x.moveTo(r, 0); x.lineTo(size - r, 0); x.quadraticCurveTo(size, 0, size, r);
  x.lineTo(size, size - r); x.quadraticCurveTo(size, size, size - r, size);
  x.lineTo(r, size); x.quadraticCurveTo(0, size, 0, size - r);
  x.lineTo(0, r); x.quadraticCurveTo(0, 0, r, 0);
  x.closePath();
  x.fillStyle = g;
  x.fill();

  x.fillStyle = '#FFFFFF';
  x.font = '800 ' + (38 * s) + 'px Outfit, Inter, Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';
  x.fillText('M', size / 2, 45 * s);
  return c;
}

(async () => {
  // Without this the first sizes render in the fallback face and the set comes
  // out inconsistent - the small ones Arial, the large ones Outfit.
  await document.fonts.load('800 38px Outfit');
  await document.fonts.ready;
  const status = document.getElementById('status');
  status.textContent = document.fonts.check('800 38px Outfit')
    ? 'Brand font ready. Rendering...'
    : 'WARNING: Outfit did not load - output would use the fallback face. Stopping.';
  if (!document.fonts.check('800 38px Outfit')) return;

  for (const size of SIZES) {
    const canvas = render(size);
    if (size <= 192) document.getElementById('preview').append(canvas);
    const base64 = canvas.toDataURL('image/png').split(',')[1];
    await fetch('/icon?size=' + size, { method: 'POST', body: base64 });
  }
  const done = await fetch('/done', { method: 'POST' });
  status.textContent = await done.text();
})();
</script>
</body>
</html>`;

/**
 * An .ico is a 6-byte header, one 16-byte directory entry per image, then the
 * image payloads. Since Vista the payload may be a PNG rather than a BMP,
 * which is what makes this buildable without an encoder.
 */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = [];
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette size, 0 for true colour
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/icon') {
    const size = Number(url.searchParams.get('size'));
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      const data = Buffer.from(body, 'base64');
      received.set(size, data);
      await writeFile(join(PUBLIC, `favicon-${size}.png`), data);
      console.log(`wrote public/favicon-${size}.png (${(data.length / 1024).toFixed(1)} kB)`);
      res.writeHead(204);
      res.end();
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/done') {
    const images = ICO_SIZES.map((size) => ({ size, data: received.get(size) })).filter((i) => i.data);
    if (images.length !== ICO_SIZES.length) {
      res.writeHead(500);
      res.end('missing sizes for the .ico');
      return;
    }
    writeFile(join(PUBLIC, 'favicon.ico'), buildIco(images)).then(() => {
      const message = `wrote public/favicon.ico (${ICO_SIZES.join(', ')}px). Done - you can close this tab.`;
      console.log(message);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(message);
      setTimeout(() => server.close(() => process.exit(0)), 500);
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`favicon generator on http://localhost:${PORT} - open it to write the files`);
});
