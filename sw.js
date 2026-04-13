// WaveVapes Service Worker — Web Push Notifications + Offline Caching
// Wird unter https://wavevapes.de/sw.js gehostet

const SW_VERSION = 'wv-push-v5';
const STATIC_CACHE  = `wv-static-${SW_VERSION}`;
const RUNTIME_CACHE = `wv-runtime-${SW_VERSION}`;

// Assets die sofort beim Install gecacht werden (Cache-First)
const PRECACHE_ASSETS = [
    '/',
    '/logo.png',
    '/404.html',
];

// Domains für Cache-First (statische Ressourcen von CDNs)
const CACHE_FIRST_ORIGINS = [
    'fonts.gstatic.com',
    'cdnjs.cloudflare.com',
    'cdn.jsdelivr.net',
    'cdn.tailwindcss.com',
];

// ── Install & Activate ────────────────────────────────────────
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(STATIC_CACHE).then(cache =>
            cache.addAll(PRECACHE_ASSETS).catch(err =>
                console.warn('[SW] Precache partial failure:', err)
            )
        )
    );
});

self.addEventListener('activate', event => {
    // Alte Cache-Versionen löschen
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(k => k.startsWith('wv-') && k !== STATIC_CACHE && k !== RUNTIME_CACHE)
                    .map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// ── Fetch: Cache-Strategie ────────────────────────────────────
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Nur GET-Anfragen cachen
    if (request.method !== 'GET') return;

    // Firebase / API-Anfragen NIE cachen (immer Network)
    if (
        url.hostname.includes('firestore.googleapis.com') ||
        url.hostname.includes('firebase.googleapis.com') ||
        url.hostname.includes('identitytoolkit.googleapis.com') ||
        url.hostname.includes('fcm.googleapis.com') ||
        url.hostname.includes('securetoken.googleapis.com') ||
        url.hostname.includes('api.emailjs.com') ||
        url.hostname.includes('googletagmanager.com') ||
        url.hostname.includes('google-analytics.com')
    ) return;

    // ── Cache-First für CDN-Fonts und statische Libraries ──────
    if (CACHE_FIRST_ORIGINS.some(origin => url.hostname.includes(origin))) {
        event.respondWith(
            caches.open(RUNTIME_CACHE).then(async cache => {
                const cached = await cache.match(request);
                if (cached) return cached;
                const response = await fetch(request);
                if (response.ok) cache.put(request, response.clone());
                return response;
            }).catch(() => caches.match(request))
        );
        return;
    }

    // ── Cache-First für eigene statische Assets (Bilder, Logo) ─
    if (
        url.hostname === 'wavevapes.de' &&
        (request.destination === 'image' || request.destination === 'font')
    ) {
        event.respondWith(
            caches.open(STATIC_CACHE).then(async cache => {
                const cached = await cache.match(request);
                if (cached) return cached;
                const response = await fetch(request);
                if (response.ok) cache.put(request, response.clone());
                return response;
            }).catch(() => caches.match(request))
        );
        return;
    }

    // ── Network-First für HTML-Seiten (immer aktuell) ──────────
    if (request.destination === 'document') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(RUNTIME_CACHE).then(c => c.put(request, clone));
                    }
                    return response;
                })
                // BUG-FIX: `caches.match(a) || caches.match(b)` funktioniert nicht korrekt,
                // da Promise-Objekte immer truthy sind. Stattdessen: .then(r => r || fallback)
                .catch(() =>
                    caches.match(request).then(r => r || caches.match('/404.html'))
                )
        );
        return;
    }
});

// ── Push-Event: Benachrichtigung anzeigen ─────────────────────
self.addEventListener('push', event => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch(e) { data = { title: 'WaveVapes', body: event.data?.text() || '' }; }

    const title   = data.title || 'WaveVapes';
    const options = {
        body:    data.body   || '',
        icon:    data.icon   || '/logo.png',
        badge:   data.badge  || '/logo.png',
        image:   data.image  || undefined,
        data:    { url: data.url || 'https://wavevapes.de' },
        actions: data.actions || [
            { action: 'open',    title: '🛒 Zum Shop',    icon: '/logo.png' },
            { action: 'dismiss', title: '✕ Schließen' }
        ],
        tag:              data.tag   || 'wavevapes-push',
        renotify:         true,
        requireInteraction: false,
        vibrate:          [200, 100, 200],
        timestamp:        Date.now(),
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification-Click ────────────────────────────────────────
self.addEventListener('notificationclick', event => {
    event.notification.close();

    if (event.action === 'dismiss') return;

    const url = event.notification.data?.url || 'https://wavevapes.de';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
            // Bereits offenes Fenster fokussieren
            for (const client of clients) {
                if (client.url.includes('wavevapes.de') && 'focus' in client) {
                    client.navigate(url);
                    return client.focus();
                }
            }
            // Neues Fenster öffnen
            if (self.clients.openWindow) return self.clients.openWindow(url);
        })
    );
});

// ── Push-Subscription geändert (Token-Rotation) ───────────────
// Alle offenen Clients per postMessage benachrichtigen,
// damit der App-Code (mit Zugang zu Firebase Auth + SDK) das Token erneuert.
self.addEventListener('pushsubscriptionchange', event => {
    event.waitUntil(
        self.registration.pushManager.subscribe({
            userVisibleOnly:      true,
            applicationServerKey: event.oldSubscription?.options?.applicationServerKey
        }).then(async newSub => {
            const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
            clients.forEach(client => {
                client.postMessage({
                    type:         'FCM_TOKEN_ROTATED',
                    subscription: newSub ? newSub.toJSON() : null,
                });
            });
        }).catch(err => {
            console.warn('[SW] pushsubscriptionchange – Re-Subscribe fehlgeschlagen:', err);
        })
    );
});
