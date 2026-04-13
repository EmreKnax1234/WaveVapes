// WaveVapes — Firebase Cloud Function: FCM Push Notifications
// Datei: functions/index.js  ← muss in diesem Unterordner liegen!
//
// BUG-FIX: Datei lag im Root des Projekts (functions_index.js).
// firebase.json erwartet sie unter functions/index.js.
//
// Setup:
//   cd functions
//   npm init -y
//   npm install firebase-admin firebase-functions
//   cd ..
//   firebase deploy --only functions

const functions = require('firebase-functions');
const admin     = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// ── Trigger: Neue push_notification → sofort versenden ────────
exports.sendPushOnCreate = functions
    .region('europe-west1')
    .firestore
    .document('push_notifications/{notifId}')
    .onCreate(async (snap, context) => {
        const n = snap.data();
        if (n.scheduledFor) return null; // geplant → später via Scheduler
        return _dispatch(context.params.notifId, n);
    });

// ── Trigger: Geplante Nachrichten stündlich prüfen ─────────────
exports.sendScheduledPush = functions
    .region('europe-west1')
    .pubsub.schedule('every 60 minutes')
    .onRun(async () => {
        const snap = await db.collection('push_notifications')
            .where('scheduledFor', '<=', admin.firestore.Timestamp.now())
            .where('status', '==', 'queued')
            .get();
        await Promise.allSettled(snap.docs.map(d => _dispatch(d.id, d.data())));
    });

// ── Kern: FCM Tokens laden + Notifications senden ─────────────
async function _dispatch(notifId, n) {
    const { title, body, url = 'https://wavevapes.de', target = 'all' } = n;

    // RATE-LIMIT-GUARD: verhindert Doppel-Dispatch bei gleichzeitigen Writes
    // Wir setzen den Status atomar auf 'sending' und prüfen vorher ob schon gesendet
    const docRef = db.collection('push_notifications').doc(notifId);
    const updated = await db.runTransaction(async tx => {
        const doc = await tx.get(docRef);
        const status = doc.data()?.status;
        // Bereits gesendet oder in Bearbeitung → Abbruch
        if (status === 'sending' || status === 'sent') return false;
        tx.update(docRef, { status: 'sending' });
        return true;
    });
    if (!updated) {
        console.log(`[skip] Notification ${notifId} bereits verarbeitet (Race-Condition verhindert)`);
        return;
    }

    // FCM Tokens aus push_subscriptions laden
    const subsSnap = await db.collection('push_subscriptions').get();
    let subs = subsSnap.docs
        .map(d => ({ docId: d.id, ...d.data() }))
        .filter(s => s.fcmToken);  // nur Docs mit gültigem FCM Token

    // Zielgruppen-Filter anwenden
    subs = await _filter(subs, n);
    console.log(`Sende "${title}" → ${subs.length} Tokens (target: ${target})`);

    if (!subs.length) {
        await docRef.update({ status: 'sent', delivered: 0, sentCount: 0, completedAt: admin.firestore.FieldValue.serverTimestamp() });
        return;
    }

    const message = {
        notification: { title, body },
        webpush: {
            notification: {
                title, body,
                icon:  'https://wavevapes.de/logo.png',
                badge: 'https://wavevapes.de/logo.png',
                requireInteraction: false,
            },
            fcmOptions: { link: url }
        },
        data: { url }
    };

    let delivered = 0;
    const toDelete = [];

    // FCM erlaubt max. 500 Tokens pro sendEachForMulticast
    const CHUNK = 500;
    for (let i = 0; i < subs.length; i += CHUNK) {
        const chunk = subs.slice(i, i + CHUNK);
        const tokens = chunk.map(s => s.fcmToken);

        const response = await admin.messaging().sendEachForMulticast({ tokens, ...message });

        response.responses.forEach((r, idx) => {
            if (r.success) {
                delivered++;
            } else {
                const code = r.error?.code || '';
                // Ungültige/abgelaufene Tokens entfernen
                if (code.includes('registration-token-not-registered') ||
                    code.includes('invalid-registration-token') ||
                    code.includes('invalid-argument')) {
                    toDelete.push(chunk[idx].docId);
                }
                console.warn(`Token fehlgeschlagen (${chunk[idx].docId}):`, code);
            }
        });
    }

    // Ungültige Tokens aus Firestore löschen (Batch)
    if (toDelete.length) {
        const batch = db.batch();
        toDelete.forEach(id => batch.delete(db.collection('push_subscriptions').doc(id)));
        await batch.commit();
        console.log(`${toDelete.length} ungültige Tokens gelöscht`);
    }

    await docRef.update({
        status:       'sent',
        delivered,
        sentCount:    subs.length,
        expiredCount: toDelete.length,
        completedAt:  admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ "${title}" — ${delivered}/${subs.length} zugestellt`);
}

// ── Zielgruppen-Filter ────────────────────────────────────────
async function _filter(subs, n) {
    const target = n.target || 'all';
    if (target === 'all') return subs;

    if (target === 'single-user') {
        const uid   = n.recipientUid;
        const email = n.recipientEmail;
        return subs.filter(s =>
            (uid   && s.userId === uid) ||
            (email && s.email  === email)
        );
    }

    const usersSnap  = await db.collection('users').get();
    const ordersSnap = await db.collection('orders').get();

    const userMap   = {};
    usersSnap.docs.forEach(d => { userMap[d.id] = d.data(); });

    const orderData = {};
    ordersSnap.docs.forEach(d => {
        const o = d.data();
        if (!o.userId) return;
        if (!orderData[o.userId]) orderData[o.userId] = { total: 0, last: 0 };
        orderData[o.userId].total += o.total || 0;
        const ts = o.date?.toMillis?.() || 0;
        if (ts > orderData[o.userId].last) orderData[o.userId].last = ts;
    });

    const now = Date.now();

    return subs.filter(s => {
        if (!s.userId) return target === 'all';
        const u = userMap[s.userId] || {};
        const o = orderData[s.userId] || { total: 0, last: 0 };
        switch (target) {
            case 'no-order-30':  return o.last < now - 30 * 86400000;
            case 'no-order-60':  return o.last < now - 60 * 86400000;
            case 'loyalty-high': return (u.totalBonusPoints || 0) > 500;
            case 'loyalty-low':  return (u.totalBonusPoints || 0) < 100;
            case 'new-users':    return (u.createdAt?.toMillis?.() || 0) > now - 7 * 86400000;
            case 'vip':          return o.total >= 200;
            default:             return true;
        }
    });
}
