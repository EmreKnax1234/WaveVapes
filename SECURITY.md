# Security Hinweise – WaveVapes

## ⚠️ Firebase Security Rules (KRITISCH – manuell prüfen!)

Der Firebase API-Key in `firebase-messaging-sw.js` ist technisch öffentlich (client-seitig).
Das ist für Firebase Web-Apps normal — **der Schutz liegt ausschließlich in den Security Rules**.

### Firestore Rules prüfen (Firebase Console → Firestore → Regeln)

Mindest-Anforderungen:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Produkte: Jeder lesen, niemand schreiben (nur Admin via Server-SDK)
    match /products/{id} {
      allow read: if true;
      allow write: if false;
    }

    // Bestellungen: Nur eingeloggte Nutzer ihre eigenen lesen
    match /orders/{id} {
      allow read: if request.auth != null && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null;
      allow update, delete: if false;
    }

    // Nutzer: Nur der eigene Account
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }

    // Push-Subscriptions: Jeder eingeloggte Nutzer kann seinen Token speichern
    match /push_subscriptions/{docId} {
      allow create, update: if request.auth != null;
      allow read, delete: if false; // Nur Server (Admin SDK) darf lesen/löschen
    }

    // Push-Notifications: Nur Server
    match /push_notifications/{id} {
      allow read, write: if false;
    }

    // Reviews: Lesen für alle, Schreiben nur eingeloggt
    match /reviews/{id} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if false;
    }
  }
}
```

### Firebase App Check aktivieren (empfohlen)
Firebase Console → App Check → Aktivieren mit reCAPTCHA v3.
Verhindert, dass der öffentliche API-Key von fremden Domains missbraucht wird.

---

## ✅ Bereits behobene Sicherheitsprobleme

| # | Problem | Fix |
|---|---------|-----|
| 1 | `download`-Datei (Apache .htaccess) lag im Root | Umbenannt zu `.htaccess` → wird von Firebase/Vercel ignoriert |
| 2 | CSP-Header erlaubte AI-Worker für alle Seiten | Getrennte CSP: Hauptseite ohne Worker-URL, `/admin.html` mit Worker-URL |
| 3 | `push.bat` / `push.sh` nicht in .gitignore | In `.gitignore` aufgenommen |
| 4 | Service Worker cached `'/'` beim Install | `'/'` aus `PRECACHE_ASSETS` entfernt (SW-Version auf v7 angehoben) |
| 5 | `functions/package.json` ohne Linting | ESLint als devDependency + `lint`-Script hinzugefügt |
| 6 | Groq API-Key war im Worker-Code hardcoded | Korrekt: Nur noch via `wrangler secret put GROQ_API_KEY` |
