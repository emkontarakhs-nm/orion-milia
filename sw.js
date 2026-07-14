const CACHE_NAME = 'orion-milia-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(['./', './index.html'].map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          // response.status === 200 για ίδιας-προέλευσης αιτήματα.
          // response.type === 'opaque' για cross-origin (π.χ. Firebase SDK, γραμματοσειρές) —
          // δεν μπορούμε να δούμε το πραγματικό status τους, αλλά πρέπει να τα αποθηκεύσουμε ούτως ή άλλως
          // αλλιώς ποτέ δεν μπαίνουν στην cache και η εφαρμογή σπάει offline.
          if (response && (response.status === 200 || response.type === 'opaque')) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
