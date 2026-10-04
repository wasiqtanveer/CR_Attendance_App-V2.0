const CACHE_NAME = 'cr-attendance-__BUILD_HASH__';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const html = await fetch('/index.html');
      await cache.put('/index.html', html);
      const manifest = await fetch('/precache.json');
      if (!manifest.ok) throw new Error('Offline asset manifest unavailable.');
      await cache.addAll(await manifest.json());
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Skip Supabase API calls — always network-first for data freshness
  if (e.request.url.includes('supabase.co')) return;

  // For navigation requests: try network, fall back to cached index.html (SPA routing)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  const path = new URL(e.request.url).pathname;
  if (!path.startsWith('/assets/') && !['/icon-192.png', '/icon-512.png', '/manifest.json', '/favicon.svg'].includes(path)) return;

  // Cache every same-origin static asset after its first successful response.
  e.respondWith(
    caches.match(e.request, { ignoreVary: true }).then(async (cached) => {
      if (cached) return cached;
      const response = await fetch(e.request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(e.request, response.clone());
      }
      return response;
    })
  );
});
