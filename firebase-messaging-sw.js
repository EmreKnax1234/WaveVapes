// WaveVapes — Firebase Cloud Messaging Service Worker
// Pflicht-Datei für FCM Web Push (muss im Root unter /firebase-messaging-sw.js liegen)
// Wird automatisch von Firebase Messaging beim Aufruf von getToken() registriert.

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey:            "AIzaSyC6KnU7vUJVQLXz3hTqPtLpv0irXcSU-Ac",
    authDomain:        "wavevapes-22dce.firebaseapp.com",
    projectId:         "wavevapes-22dce",
    storageBucket:     "wavevapes-22dce.firebasestorage.app",
    messagingSenderId: "469991790134",
    appId:             "1:469991790134:web:1b96e5ba06367168436a97",
    measurementId:     "G-MY07QG84Z0",
});

const messaging = firebase.messaging();

// ── Hintergrund-Nachrichten (Tab nicht aktiv / App im Hintergrund) ───────────
messaging.onBackgroundMessage(payload => {
    const title   = payload.notification?.title || 'WaveVapes';
    const options = {
        body:    payload.notification?.body || '',
        icon:    '/logo.png',
        badge:   '/logo.png',
        data:    { url: payload.data?.url || payload.fcmOptions?.link || 'https://wavevapes.de' },
        tag:     'wavevapes-push',
        renotify: true,
        requireInteraction: false,
        vibrate: [200, 100, 200],
    };
    return self.registration.showNotification(title, options);
});

// ── Notification-Klick ────────────────────────────────────────────────────────
// BUG-FIX: `clients` → `self.clients` (im SW-Scope gibt es kein globales `clients`)
self.addEventListener('notificationclick', event => {
    event.notification.close();
    const url = event.notification.data?.url || 'https://wavevapes.de';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cls => {
            for (const c of cls) {
                if (c.url.includes('wavevapes.de') && 'focus' in c) {
                    c.navigate(url);
                    return c.focus();
                }
            }
            if (self.clients.openWindow) return self.clients.openWindow(url);
        })
    );
});
