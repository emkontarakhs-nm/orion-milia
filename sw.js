const CACHE_NAME = 'orion-milia-v4';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // {cache:'reload'} αγνοεί οποιαδήποτε παλιά, κρυμμένη έκδοση στην κανονική cache του browser —
      // εξασφαλίζει ότι η πρώτη φορά που ο service worker αποθηκεύει το index.html, παίρνει πάντα το πιο φρέσκο.
      Promise.allSettled(['./', './index.html'].map((url) =>
        fetch(url, {cache: 'reload'}).then((resp) => cache.put(url, resp))
      ))
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

  // Το version.json ΠΟΤΕ δεν πρέπει να έρχεται από την cache — είναι το "ρολόι" που
  // λέει στην εφαρμογή αν υπάρχει νεότερη έκδοση ζωντανή. Πάντα κατευθείαν από το δίκτυο.
  if (event.request.url.includes('version.json')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(() => new Response('{}', { headers: { 'Content-Type': 'application/json' } }))
    );
    return;
  }

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
