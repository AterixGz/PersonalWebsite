const CACHE_NAME = 'finflow-v50';
const VERSION = "oauth56";
const ASSETS = [
  '/',
  '/static/app.css?v=' + VERSION,
  '/static/js/core.js?v=' + VERSION,
  '/static/js/stores/auth.js?v=' + VERSION,
  '/static/js/stores/notification.js?v=' + VERSION,
  '/static/js/stores/keypass.js?v=' + VERSION,
  '/static/js/stores/ui.js?v=' + VERSION,
  '/static/js/stores/logs.js?v=' + VERSION,
  '/static/js/stores/finance.js?v=' + VERSION,
  '/static/js/stores/workspace.js?v=' + VERSION,
  '/static/js/stores/chat.js?v=' + VERSION,
  '/static/js/stores/aiUsage.js?v=' + VERSION,
  '/static/js/stores/game.js?v=' + VERSION,
  '/static/vendor/tailwind.js',
  '/static/vendor/alpine.min.js',
  '/static/vendor/fontawesome/all.min.css',
  '/static/vendor/fonts/fonts.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(ASSETS);
      })
      .catch(err => console.log('SW install cache error', err))
  );
  // ไม่ใช้ skipWaiting/clients.claim — SW ใหม่รอ activate ตอนเปิดครั้งถัดไป
  // (กัน iOS reload หน้ากำลังเปิด = splash โผล่ซ้ำ)
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // HTML navigations - Cache first (instant open), update in background
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const network = fetch(event.request).then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }
  
  // API Calls - Network first, fallback to empty/error
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: 'Network offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }
  
  // Static Assets - Cache first, network fallback
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then(networkResponse => {
          // Don't cache if not a valid response
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
          return networkResponse;
        }).catch(() => {
          // Offline fallback could go here
        });
      })
  );
});

// iOS Web Push & Local Notification Click Handlers
self.addEventListener('push', event => {
  let data = { title: '🔔 การแจ้งเตือน FinFlow', body: 'ระบบแจ้งเตือนบน iPhone ทำงานได้จริงสมบูรณ์แบบ! 🎉' };
  if (event.data) {
    try { data = event.data.json(); } catch(e) { data.body = event.data.text(); }
  }
  const options = {
    body: data.body,
    icon: '/static/icons/icon-512x512.png',
    badge: '/static/icons/icon-512x512.png',
    vibrate: [200, 100, 200],
    data: data.url || '/'
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return clients.openWindow(event.notification.data || '/');
    })
  );
});
