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
  const url = new URL(event.request.url);

  // Share Target: όταν μοιράζεσαι μια φωτογραφία από άλλη εφαρμογή (π.χ. Κάμερα/Gallery) προς το ΩΡΙΩΝ,
  // το λειτουργικό στέλνει ένα POST εδώ. Το αποθηκεύουμε προσωρινά (Cache API) και ανακατευθύνουμε στην
  // κύρια σελίδα με σημάδι ?shared-photo=1 — η ίδια η εφαρμογή (index.html) το παραλαμβάνει από εκεί
  // και ρωτάει σε ποια εξόρμηση να την προσθέσει.
  if (event.request.method === 'POST' && url.pathname.endsWith('/share-photo')) {
    event.respondWith(handleSharePhoto(event.request));
    return;
  }

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

async function handleSharePhoto(request){
  try{
    const formData = await request.formData();
    const file = formData.get('photo');
    if(file && file.size > 0){
      const cache = await caches.open('orion-shared-photo');
      await cache.put('/__shared-photo-pending', new Response(file, {
        headers: {'Content-Type': file.type || 'image/jpeg', 'X-Shared-Name': file.name || 'photo.jpg'}
      }));
    }
  }catch(err){
    console.error('Share target error:', err);
  }
  // 303 See Other: σωστός κώδικας για ανακατεύθυνση μετά από POST (ο browser κάνει GET στο νέο URL, όχι re-POST)
  return Response.redirect('./?shared-photo=1', 303);
}
