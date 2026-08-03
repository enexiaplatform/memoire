/**
 * Why this exists: without it, "capture works offline" is false at the first
 * step. The records were always written to this device first, so nothing was
 * lost - but a phone with no signal could not open the app at all. Tapping the
 * installed icon in a hospital basement produced the browser's offline page,
 * and the note went into the operator's memory instead, which is the exact
 * failure this product was built to end.
 *
 * Deliberately small, and deliberately not a caching framework:
 *
 * - Only same-origin GET navigations and build assets are touched. Supabase,
 *   /api/* and every other cross-origin request go straight to the network. A
 *   cached answer to "what is in my account" would be worse than no answer -
 *   it is stale commercial data presented as current.
 * - HTML is network-first. An operator who is online always runs the version
 *   that was deployed; the cached copy exists for the moment there is no
 *   network, not to save a round trip.
 * - Hashed build assets are cache-first, because a hashed filename can only
 *   ever mean one file.
 * - One cache, versioned by name. Activation deletes every other cache this
 *   origin holds, so a bad shell cannot outlive a deploy.
 */

const CACHE = 'memoire-shell-v1';
const APP_SHELL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll([APP_SHELL, '/manifest.webmanifest']))
      // A failed precache must not block activation: the runtime cache below
      // fills in on the first online visit, and a worker stuck in "installing"
      // would leave the app with no offline support at all and no way to say so.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never the API. An offline "your digest preferences saved" is a lie, and a
  // replayed authentication response is a security problem, not a convenience.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request));
    return;
  }

  if (/\.(js|css|woff2?|svg|png|webmanifest)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirstShell(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(APP_SHELL, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(APP_SHELL);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}
