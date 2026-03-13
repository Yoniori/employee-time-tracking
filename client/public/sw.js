const CACHE_NAME = 'time-tracking-v4';

// Only cache immutable hashed assets - never cache index.html
const IMMUTABLE_PATTERN = /\/assets\/.+\.(js|css|woff2?|png|svg|ico)$/;

self.addEventListener('install', event => {
  // No pre-caching of index.html - it must always be fresh
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => clients.forEach(client => client.navigate(client.url)))
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Always network-first for API calls
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  // Always network-first for HTML navigation (index.html must never be stale)
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Cache-first only for immutable hashed assets (/assets/index-HASH.js etc.)
  if (IMMUTABLE_PATTERN.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Everything else: network-first
  event.respondWith(fetch(request));
});
