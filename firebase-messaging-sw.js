// WaveVapes — Firebase Messaging Service Worker
// MUSS unter https://wavevapes.de/firebase-messaging-sw.js erreichbar sein

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey:            'AIzaSyDsIUl-iYmH42MPbusFLhGhj5oGLh01BzI',
    authDomain:        'wavevapes-7a960.firebaseapp.com',
    projectId:         'wavevapes-7a960',
    storageBucket:     'wavevapes-7a960.firebasestorage.app',
    messagingSenderId: '1093624390275',
    appId:             '1:1093624390275:web:b1b8ae17bcf1b59dffb1b6'
});

const messaging = firebase.messaging();

// Hintergrund-Benachrichtigungen (Tab geschlossen / im Hintergrund)
messaging.onBackgroundMessage(payload => {
    const title   = payload.notification?.title || 'WaveVapes';
    const options = {
        body:    payload.notification?.body || '',
        icon:    '/logo.png',
        badge:   '/logo.png',
        data:    { url: payload.data?.url || payload.fcmOptions?.link || 'https://wavevapes.de' },
        actions: [
            { action: 'open',    title: '🛒 Zum Shop' },
            { action: 'dismiss', title: '✕ Schließen' }
        ],
        tag:     'wavevapes-push',
        renotify: true,
    };
    return self.registration.showNotification(title, options);
});

// Klick auf Notification → Shop öffnen
self.addEventListener('notificationclick', event => {
    event.notification.close();
    if (event.action === 'dismiss') return;
    const url = event.notification.data?.url || 'https://wavevapes.de';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
            for (const c of cs) {
                if (c.url.includes('wavevapes.de') && 'focus' in c) {
                    c.navigate(url);
                    return c.focus();
                }
            }
            return clients.openWindow(url);
        })
    );
});
