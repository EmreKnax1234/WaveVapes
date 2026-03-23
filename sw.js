// WaveVapes Service Worker — Web Push Notifications
// Wird unter https://wavevapes.de/sw.js gehostet

const SW_VERSION = 'wv-push-v1';

// ── Install & Activate ────────────────────────────────────────
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

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
self.addEventListener('pushsubscriptionchange', event => {
    // Wird im Client-Code behandelt (neu registrieren)
    event.waitUntil(
        self.registration.pushManager.subscribe({
            userVisibleOnly:      true,
            applicationServerKey: event.oldSubscription?.options?.applicationServerKey
        }).then(sub => {
            // Neue Subscription per fetch an Firestore schicken
            return fetch('https://firestore.googleapis.com/v1/projects/wavevapes/databases/(default)/documents/push_subscriptions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields: { endpoint: { stringValue: sub.endpoint } } })
            });
        })
    );
});
