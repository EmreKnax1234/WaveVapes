const SW_VERSION    = 'wv-push-v9';
const STATIC_CACHE  = `wv-static-${SW_VERSION}`;
const RUNTIME_CACHE = `wv-runtime-${SW_VERSION}`;

const PRECACHE_ASSETS = [
    '/logo.png',
    '/404.html',
];

const CACHE_FIRST_ORIGINS = [
    'fonts.gstatic.com',
    'cdnjs.cloudflare.com',
    'cdn.jsdelivr.net',
    'cdn.tailwindcss.com',
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(STATIC_CACHE).then(cache =>
            Promise.allSettled(
                PRECACHE_ASSETS.map(url =>
                    cache.add(url).catch(err =>
                        console.warn(`[SW] Precache fehlgeschlagen: ${url}`, err)
                    )
                )
            )
        )
    );
});

self.addEventListener('activate', event => {
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

self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET') return;

    if (
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('firebaseapp.com') ||
        url.hostname.includes('api.emailjs.com') ||
        url.hostname.includes('googletagmanager.com') ||
        url.hostname.includes('google-analytics.com') ||
        url.hostname.includes('tawk.to') ||
        url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1'
    ) return;

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

    if (url.hostname === 'wavevapes.de' &&
        (request.destination === 'image' || request.destination === 'font')) {
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

    // BUG-2 FIX: HTML-Dokumente offline korrekt ausliefern.
    // ignoreSearch: true damit ?product=xyz trotzdem einen Cache-Treffer findet.
    // Fallback-Kette: gecachte Seite → Startseite → 404.
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
                .catch(() =>
                    caches.match(request, { ignoreSearch: true })
                        .then(r => r || caches.match('/'))
                        .then(r => r || caches.match('/404.html'))
                )
        );
        return;
    }
});

self.addEventListener('push', event => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch(e) { data = { title: 'WaveVapes', body: event.data?.text() || '' }; }

    const title   = data.title || 'WaveVapes';
    const options = {
        body:               data.body  || '',
        icon:               data.icon  || '/logo.png',
        badge:              data.badge || '/logo.png',
        image:              data.image || undefined,
        data:               { url: data.url || 'https://wavevapes.de' },
        actions:            data.actions || [
            { action: 'open',    title: '🛒 Zum Shop', icon: '/logo.png' },
            { action: 'dismiss', title: '✕ Schließen' }
        ],
        tag:                data.tag || 'wavevapes-push',
        renotify:           true,
        requireInteraction: false,
        vibrate:            [200, 100, 200],
        timestamp:          Date.now(),
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    if (event.action === 'dismiss') return;
    const url = event.notification.data?.url || 'https://wavevapes.de';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
            for (const client of clients) {
                if (client.url.includes('wavevapes.de') && 'focus' in client) {
                    client.navigate(url);
                    return client.focus();
                }
            }
            if (self.clients.openWindow) return self.clients.openWindow(url);
        })
    );
});

// BUG-3 FIX: applicationServerKey korrekt konvertieren.
// event.oldSubscription?.options?.applicationServerKey gibt ein ArrayBuffer zurück,
// kein Uint8Array. Beide Typen werden jetzt korrekt behandelt.
self.addEventListener('pushsubscriptionchange', event => {
    const oldKey = event.oldSubscription?.options?.applicationServerKey;
    let appServerKey;
    if (oldKey) {
        appServerKey = oldKey instanceof ArrayBuffer ? new Uint8Array(oldKey) : oldKey;
    }
    event.waitUntil(
        self.registration.pushManager.subscribe({
            userVisibleOnly:      true,
            applicationServerKey: appServerKey,
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
