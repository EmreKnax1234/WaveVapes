importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

const CACHE_NAME = 'wavevapes-v1';
const urlsToCache = [
  '/', '/index.html', '/logo.png', '/og-image.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});

firebase.initializeApp({
  apiKey: "AIzaSyDsIUl-iYmH42MPbusFLhGhj5oGLh01BzI",
  authDomain: "wavevapes-7a960.firebaseapp.com",
  projectId: "wavevapes-7a960",
  storageBucket: "wavevapes-7a960.firebasestorage.app",
  messagingSenderId: "1093624390275",
  appId: "1:1093624390275:web:b1b8ae17bcf1b59dffb1b6"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const notificationTitle = payload.notification.title || "WaveVapes";
  const notificationOptions = {
    body: payload.notification.body,
    icon: "/logo.png"
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});
