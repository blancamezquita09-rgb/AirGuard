/**
 * AirGuard – Portal web de calidad del aire y salud ambiental El Salvador
 * Cache offline básico
 * Notificaciones push y clic en la notificación
 */

const CACHE_NAME = 'airguard-v1';
const OFFLINE_URLS = ['/', '/index.html'];

// ── Install: cachear recursos básicos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

// ── Activate: limpiar caches viejos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Push: mostrar notificación ────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch (_) {}

  const title   = data.title   || '⚠️ Alerta AirGuard';
  const options = {
    body:    data.body    || 'Se detectó un nivel de aire elevado en san salvador.',
    icon:    data.icon    || '/icon-192.png',
    badge:   data.badge   || '/badge-96.png',
    tag:     data.tag     || 'airguard-alert',
    renotify: data.renotify ?? true,
    data:    { url: data.data?.url || '/' },
    actions: [
      { action: 'view', title: '📊 Ver datos' },
      { action: 'dismiss', title: 'Cerrar' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click: abrir la app ─────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

// ── Fetch: network-first con fallback a cache ─────────────────────
self.addEventListener('fetch', (event) => {
  // Solo cachear GET del mismo origen, no la API
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
