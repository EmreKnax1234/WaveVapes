// WaveVapes — Firebase Cloud Function: Web Push Notifications versenden
// Datei: functions/index.js
//
// Setup:
//   cd functions
//   npm install firebase-admin firebase-functions web-push
//   firebase deploy --only functions

const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const webpush   = require('web-push');

admin.initializeApp();
const db = admin.firestore();

// ── VAPID Keys ────────────────────────────────────────────────
webpush.setVapidDetails(
    'mailto:info@wavevapes.de',
    'BE-rYQ5kRvk31rN63FAd9edEOGoFozah0WB-zc4jlWOzcGCFeBnPTW7nd9qeNNiLQ7VjNOmIyngAVF0q6ZzzyXw',
    'cSidcgy-6OTh1_yTG4Apaa27zoJWx7gOQfseal6f1zY'
);

// ── Trigger: Neue push_notification → sofort versenden ────────
exports.sendPushOnCreate = functions
    .region('europe-west1')
    .firestore
    .document('push_notifications/{notifId}')
    .onCreate(async (snap, context) => {
        const n = snap.data();
        if (n.scheduledFor) return null; // geplant → später
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

// ── Kern: Subscriptions laden + Notifications senden ──────────
async function _dispatch(notifId, n) {
    const { title, body, url = 'https://wavevapes.de', target = 'all' } = n;

    await db.collection('push_notifications').doc(notifId).update({ status: 'sending' });

    // Subscriptions laden (alle Browser die "Ja" geklickt haben)
    let subsSnap = await db.collection('push_subscriptions').get();
    let subs = subsSnap.docs.map(d => ({ docId: d.id, ...d.data() }))
        .filter(s => s.endpoint && s.keys && s.keys.p256dh && s.keys.auth);

    // Zielgruppen-Filter
    subs = await _filter(subs, n);
    console.log(`Sende "${title}" → ${subs.length} Abonnenten (target: ${target})`);

    const payload = JSON.stringify({ title, body, url,
        icon:  '/logo.png',
        badge: '/logo.png',
        tag:   notifId,
    });

    let delivered = 0;
    const toDelete = [];

    await Promise.allSettled(subs.map(async sub => {
        try {
            await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
                payload,
                { TTL: 86400 }
            );
            delivered++;
            // lastSeen aktuell halten
            await db.collection('push_subscriptions').doc(sub.docId)
                .update({ lastSeen: admin.firestore.FieldValue.serverTimestamp() })
                .catch(() => {});
        } catch (err) {
            // 410/404 = Subscription abgelaufen, Browser hat sie widerrufen
            if (err.statusCode === 410 || err.statusCode === 404) {
                toDelete.push(sub.docId);
            } else {
                console.warn(`Push fehlgeschlagen (${sub.docId}):`, err.statusCode);
            }
        }
    }));

    // Abgelaufene Subscriptions aus Firestore entfernen
    if (toDelete.length) {
        const batch = db.batch();
        toDelete.forEach(id => batch.delete(db.collection('push_subscriptions').doc(id)));
        await batch.commit();
        console.log(`${toDelete.length} abgelaufene Subscriptions gelöscht`);
    }

    await db.collection('push_notifications').doc(notifId).update({
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

    // Einzelner Nutzer: Subscription per userId oder email suchen
    if (target === 'single-user') {
        const uid   = n.recipientUid;
        const email = n.recipientEmail;
        return subs.filter(s =>
            (uid   && s.userId === uid) ||
            (email && s.email  === email)
        );
    }

    // Für Segmentierung: Nutzerdaten aus Firestore holen
    const usersSnap  = await db.collection('users').get();
    const ordersSnap = await db.collection('orders').get();

    const userMap = {};   // uid → userData
    usersSnap.docs.forEach(d => { userMap[d.id] = { ...d.data(), uid: d.id }; });

    const orderData = {}; // uid → {total, last}
    ordersSnap.docs.forEach(d => {
        const o = d.data();
        if (!o.userId) return;
        if (!orderData[o.userId]) orderData[o.userId] = { total: 0, last: 0, count: 0 };
        orderData[o.userId].total += o.total || 0;
        orderData[o.userId].count++;
        const ts = o.date?.toMillis?.() || 0;
        if (ts > orderData[o.userId].last) orderData[o.userId].last = ts;
    });

    const now  = Date.now();
    const d30  = now - 30 * 86400000;
    const d60  = now - 60 * 86400000;
    const d7   = now -  7 * 86400000;

    return subs.filter(s => {
        if (!s.userId) return false;
        const u = userMap[s.userId];
        const o = orderData[s.userId] || { total: 0, last: 0, count: 0 };
        if (!u) return false;

        switch (target) {
            case 'no-order-30':   return o.last < d30;
            case 'no-order-60':   return o.last < d60;
            case 'loyalty-high':  return (u.totalBonusPoints || 0) > 500;
            case 'loyalty-low':   return (u.totalBonusPoints || 0) < 100;
            case 'new-users': {
                const reg = u.createdAt?.toMillis?.() || 0;
                return reg > d7;
            }
            case 'vip':           return o.total >= 200;
            default:              return true;
        }
    });
}
