// 7F FIT Service Worker — enables offline use after first visit
const CACHE_NAME = '7ffit-v2';

// Only cache LOCAL files — external CDN URLs can cause SW install to fail
const LOCAL_ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './logo.png',
    './manifest.json'
];

// Install: cache local assets only
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(LOCAL_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate: remove old caches
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((k) => k !== CACHE_NAME)
                    .map((k) => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// Fetch: serve from cache first, fall back to network
self.addEventListener('fetch', (e) => {
    // Only intercept same-origin requests to avoid CORS issues
    if (!e.request.url.startsWith(self.location.origin)) {
        return;
    }
    e.respondWith(
        caches.match(e.request).then((cached) => cached || fetch(e.request))
    );
});
