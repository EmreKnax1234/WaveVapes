// WaveVapes — Firebase Cloud Messaging Service Worker
// Pflicht-Datei für FCM Web Push (muss im Root unter /firebase-messaging-sw.js liegen)
// Wird automatisch von Firebase Messaging beim Aufruf von getToken() registriert.

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey:            "AIzaSyDsIUl-iYmH42MPbusFLhGhj5oGLh01BzI",
    authDomain:        "wavevapes-7a960.firebaseapp.com",
    projectId:         "wavevapes-7a960",
    storageBucket:     "wavevapes-7a960.firebasestorage.app",
    messagingSenderId: "1093624390275",
    appId:             "1:1093624390275:web:b1b8ae17bcf1b59dffb1b6",
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
