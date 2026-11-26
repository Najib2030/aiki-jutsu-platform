// public/sw.js
const CACHE_NAME = 'aiki-jutsu-v2'; // Bump version to force update
const FONT_CACHE_NAME = 'aiki-jutsu-fonts-v1';

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json', // Added manifest to core cache
  '/favicon.ico',
  '/favicon-96x96.png',
  '/apple-touch-icon.png'
];

// Install: Pre-cache core assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS);
    })
  );
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== FONT_CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => clients.claim())
  );
});

// Fetch: Intercept and route requests
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-GET requests and non-http schemes
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) return;

  // --- STRATEGY 1: Google Fonts (Cache First) ---
  // Handle requests for Google Fonts CSS and font files.
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        // Return cached font if available, otherwise fetch and cache it.
        return cachedResponse || fetch(request).then((networkResponse) => {
          return caches.open(FONT_CACHE_NAME).then((cache) => {
            cache.put(request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // Ignore other third-party requests (e.g., Firebase, APIs)
  if (url.origin !== self.location.origin) return;

  // --- STRATEGY 2: Navigation Requests (Network First with Offline Fallback) ---
  if (request.mode === 'navigate') {
    event.respondWith(
      // 1. Check for a navigation preload response. If it fails (e.g., offline), ignore the error.
      (event.preloadResponse ? event.preloadResponse.catch(() => undefined) : Promise.resolve(undefined))
        .then((preloadResponse) => {
          // If a preload response exists, use it.
          if (preloadResponse) return preloadResponse;
          // Otherwise, try the network.
          return fetch(request);
        })
        .then((networkResponse) => {
          // Cache the new HTML page for next time.
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          return networkResponse;
        })
        .catch(() => {
          // If the network fails entirely, return the cached index.html.
          return caches.match('/index.html');
        })
    );
    return;
  }

  // --- STRATEGY 3: Static Assets (Stale-While-Revalidate) ---
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return networkResponse;
      }).catch(() => {
        // Ignore network errors for background updates.
      });

      // Return cached response immediately, or wait for the network.
      return cachedResponse || fetchPromise;
    })
  );
});