// WaveVapes Service Worker — Web Push Notifications
// Wird unter https://wavevapes.de/sw.js gehostet

const SW_VERSION = 'wv-push-v2';

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
// BUG-FIX: Der alte Code versuchte direkt in die Firestore-REST-API zu schreiben
// ohne Auth-Token — das schlägt immer mit 403 fehl.
// Korrekte Lösung: Alle offenen Clients per postMessage benachrichtigen,
// damit der App-Code (mit Zugang zu Firebase Auth + SDK) das Token erneuert.
self.addEventListener('pushsubscriptionchange', event => {
    event.waitUntil(
        self.registration.pushManager.subscribe({
            userVisibleOnly:      true,
            applicationServerKey: event.oldSubscription?.options?.applicationServerKey
        }).then(async newSub => {
            // Alle offenen Tabs/Fenster über die neue Subscription informieren
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
