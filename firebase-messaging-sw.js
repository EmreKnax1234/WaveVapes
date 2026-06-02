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

messaging.onBackgroundMessage(payload => {
    const title   = payload.notification?.title || 'WaveVapes';
    // BUG-FIX: Fehlende Felder aus payload.data als Fallback nutzen
    const body    = payload.notification?.body  || payload.data?.body || '';
    const iconUrl = payload.data?.icon  || '/logo.png';
    const options = {
        body,
        icon:               iconUrl,
        badge:              '/logo.png',
        data:               { url: payload.data?.url || payload.fcmOptions?.link || 'https://wavevapes.de' },
        tag:                payload.data?.tag || 'wavevapes-push',
        renotify:           true,
        requireInteraction: false,
        vibrate:            [200, 100, 200],
    };
    return self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    // BUG-FIX: 'dismiss'-Action soll still schließen ohne Navigation
    if (event.action === 'dismiss') return;
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
