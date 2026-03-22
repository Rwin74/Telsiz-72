const CACHE_NAME = 'telsiz-ui-v1';
const SOS_QUEUE_STORE = 'sos-queue';
const DB_NAME = 'telsiz-72-db';
const OFFLINE_URLS = ['/', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_URLS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.url.includes('/api/sos') && request.method === 'POST') {
    event.respondWith(
      fetch(request.clone()).catch(async (error) => {
        // Network failed or offline - save to IndexedDB
        const requestClone = request.clone();
        const payload = await requestClone.json();
        await saveToIndexedDB(payload);
        
        // Register sync if possible
        if ('sync' in self.registration) {
          try {
            await self.registration.sync.register('sync-sos');
          } catch(e) {}
        }
        
        return new Response(JSON.stringify({ success: true, queued: true }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200
        });
      })
    );
    return;
  }

  // UI Pre-caching Strategy: Stale-While-Revalidate
  if (request.method === 'GET' && !request.url.includes('/api/')) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request).then((networkResponse) => {
          // Cache successful responses
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        }).catch((err) => {
          // Fallback to offline shell if it's a page navigation
          if (request.mode === 'navigate') {
            return caches.match('/');
          }
          throw err;
        });
        
        // Return 0.1s cached response instantly, while silently updating cache in background
        return cachedResponse || fetchPromise;
      })
    );
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-sos') {
    event.waitUntil(flushQueue());
  }
});

// Since Background Sync is not deeply supported on all mobile browsers (e.g. iOS Safari),
// we also listen for messages from the client when it detects it's back online via 'window.addEventListener("online")'
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FLUSH_QUEUE') {
    event.waitUntil(flushQueue());
  }
});

async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(SOS_QUEUE_STORE)) {
        db.createObjectStore(SOS_QUEUE_STORE, { autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveToIndexedDB(payload) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SOS_QUEUE_STORE, 'readwrite');
    const store = transaction.objectStore(SOS_QUEUE_STORE);
    store.add(payload);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function flushQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SOS_QUEUE_STORE, 'readonly');
    const store = transaction.objectStore(SOS_QUEUE_STORE);
    
    let items = [];
    let keys = [];
    
    const request = store.getAll();
    const keysRequest = store.getAllKeys();
    
    let itemsDone = false;
    let keysDone = false;

    const checkDone = async () => {
      if (!itemsDone || !keysDone) return;
      
      if (items.length === 0) return resolve();
      
      try {
        for (let i = 0; i < items.length; i++) {
          const payload = items[i];
          const response = await fetch('/api/sos', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify(payload)
          });
          if (response.ok) {
            // Remove from DB
            const tx2 = db.transaction(SOS_QUEUE_STORE, 'readwrite');
            tx2.objectStore(SOS_QUEUE_STORE).delete(keys[i]);
          }
        }
        resolve();
      } catch (err) {
         reject(err);
      }
    };

    request.onsuccess = () => {
      items = request.result;
      itemsDone = true;
      checkDone();
    };
    
    keysRequest.onsuccess = () => {
      keys = keysRequest.result;
      keysDone = true;
      checkDone();
    };

    request.onerror = () => reject();
    keysRequest.onerror = () => reject();
  });
}
