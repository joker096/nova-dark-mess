/**
 * Nova Dark Messenger Service Worker
 *
 * Handles:
 * - Offline caching (static assets)
 * - Web Push notifications
 * - Background sync for messages
 */

const CACHE_NAME = 'nova-messenger-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip cross-origin requests
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        // Don't cache non-successful responses
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        // Clone response for cache
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      });
    })
  );
});

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { body: event.data.text() };
  }

  const title = payload.title || 'Nova Dark Messenger';
  const options = {
    body: payload.body || 'New message',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    tag: payload.tag || 'nova-message',
    data: payload.data || {},
    requireInteraction: payload.requireInteraction || false,
    actions: payload.actions || [],
    vibrate: [100, 50, 100],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click event - open app and focus
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action;
  const data = event.notification.data || {};

  // Handle action buttons
  if (action) {
    // Send action back to app
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'notification-action',
          action,
          data,
        });
      });
    });
    return;
  }

  // Default click - open/focus app
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Find existing window
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({
            type: 'notification-click',
            data,
          });
          return client.focus();
        }
      }

      // Open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});

// Background sync for offline messages
self.addEventListener('sync', (event) => {
  if (event.tag === 'nova-send-messages') {
    event.waitUntil(sendOfflineMessages());
  }
});

async function sendOfflineMessages() {
  // Get pending messages from IndexedDB or localStorage
  // and send them when online
  try {
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((client) => {
      client.postMessage({ type: 'sync-messages' });
    });
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
  }
}

// Message event - communicate with app
self.addEventListener('message', (event) => {
  if (!event.data) return;

  switch (event.data.type) {
    case 'skipWaiting':
      self.skipWaiting();
      break;
    case 'getVersion':
      event.ports[0].postMessage({ version: CACHE_NAME });
      break;
  }
});

console.log('[SW] Nova Messenger Service Worker loaded');