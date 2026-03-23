// WaveVapes — Firebase Cloud Function: Push Notifications versenden
// Datei: functions/index.js
//
// Setup:
//   npm install firebase-admin firebase-functions web-push
//   firebase deploy --only functions

const functions  = require('firebase-functions');
const admin      = require('firebase-admin');
const webpush    = require('web-push');

admin.initializeApp();
const db = admin.firestore();

// ── VAPID Keys ────────────────────────────────────────────────
// Public Key auch in index.html hinterlegt
webpush.setVapidDetails(
    'mailto:info@wavevapes.de',
    'BE-rYQ5kRvk31rN63FAd9edEOGoFozah0WB-zc4jlWOzcGCFeBnPTW7nd9qeNNiLQ7VjNOmIyngAVF0q6ZzzyXw',  // Public
    'cSidcgy-6OTh1_yTG4Apaa27zoJWx7gOQfseal6f1zY'                                                  // Private
);

// ── Trigger: Neue push_notification Doc → automatisch versenden ──
exports.sendPushOnCreate = functions
    .region('europe-west1')
    .firestore
    .document('push_notifications/{notifId}')
    .onCreate(async (snap, context) => {
        const notif = snap.data();

        // Geplante Nachrichten überspringen (werden via scheduledSend verarbeitet)
        if (notif.scheduledFor) {
            console.log('Geplante Nachricht — wird später versendet:', notif.scheduledFor.toDate());
            return null;
        }

        await _dispatchPush(context.params.notifId, notif);
    });

// ── Trigger: Stündlich geplante Nachrichten prüfen ────────────
exports.sendScheduledPush = functions
    .region('europe-west1')
    .pubsub
    .schedule('every 60 minutes')
    .onRun(async () => {
        const now = admin.firestore.Timestamp.now();
        const snap = await db.collection('push_notifications')
            .where('scheduledFor', '<=', now)
            .where('status', '==', 'queued')
            .get();

        const promises = snap.docs.map(doc =>
            _dispatchPush(doc.id, doc.data())
        );
        await Promise.allSettled(promises);
    });

// ── Kern-Logik: Push versenden ────────────────────────────────
async function _dispatchPush(notifId, notif) {
    const { title, body, url = 'https://wavevapes.de', icon = '/logo.png', target = 'all' } = notif;

    // Status auf "sending" setzen
    await db.collection('push_notifications').doc(notifId).update({ status: 'sending' });

    // Abonnenten laden
    const subsSnap = await db.collection('push_subscriptions').get();
    let subscribers = subsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Zielgruppen-Filter
    subscribers = await _filterByTarget(subscribers, target);
    console.log(`Versende "${title}" an ${subscribers.length} Abonnenten (Ziel: ${target})`);

    const payload = JSON.stringify({ title, body, url, icon, badge: '/logo.png', tag: notifId });

    let delivered = 0;
    const expired = [];

    await Promise.allSettled(
        subscribers.map(async (sub) => {
            if (!sub.endpoint || !sub.keys) return;
            const pushSub = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.keys.p256dh,
                    auth:   sub.keys.auth,
                }
            };
            try {
                await webpush.sendNotification(pushSub, payload, { TTL: 86400 });
                delivered++;
                // lastSeen aktualisieren
                await db.collection('push_subscriptions').doc(sub.id)
                    .update({ lastSeen: admin.firestore.FieldValue.serverTimestamp() })
                    .catch(() => {});
            } catch (err) {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    // Subscription abgelaufen → aus DB löschen
                    expired.push(sub.id);
                } else {
                    console.warn(`Push fehlgeschlagen für ${sub.id}:`, err.statusCode, err.body);
                }
            }
        })
    );

    // Abgelaufene Subscriptions bereinigen
    if (expired.length) {
        const batch = db.batch();
        expired.forEach(id => batch.delete(db.collection('push_subscriptions').doc(id)));
        await batch.commit();
        console.log(`${expired.length} abgelaufene Subscriptions gelöscht`);
    }

    // Status aktualisieren
    await db.collection('push_notifications').doc(notifId).update({
        status:      'sent',
        delivered,
        sentCount:   subscribers.length,
        expiredCount: expired.length,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ Push "${title}" — ${delivered}/${subscribers.length} zugestellt, ${expired.length} abgelaufen`);
}

// ── Zielgruppen-Filter ────────────────────────────────────────
async function _filterByTarget(subscribers, target) {
    if (target === 'all') return subscribers;

    const now30  = Date.now() - 30 * 86400000;
    const now60  = Date.now() - 60 * 86400000;
    const now7   = Date.now() - 7  * 86400000;
    const now24h = Date.now() - 86400000;

    if (target === 'no-order-30' || target === 'no-order-60' || target === 'vip') {
        // Nutzer-UIDs der Abonnenten sammeln
        const uids = subscribers.filter(s => s.userId).map(s => s.userId);
        if (!uids.length) return [];

        // Bestellungen laden
        const ordersSnap = await db.collection('orders').get();
        const userLastOrder = {};
        const userTotal     = {};
        ordersSnap.docs.forEach(d => {
            const o = d.data();
            if (!o.userId) return;
            const ts = o.date?.toMillis?.() || 0;
            if (!userLastOrder[o.userId] || ts > userLastOrder[o.userId]) {
                userLastOrder[o.userId] = ts;
            }
            userTotal[o.userId] = (userTotal[o.userId] || 0) + (o.total || 0);
        });

        const threshold = target === 'no-order-60' ? now60 : now30;

        return subscribers.filter(s => {
            if (!s.userId) return false;
            if (target === 'vip') return (userTotal[s.userId] || 0) >= 200;
            return (userLastOrder[s.userId] || 0) < threshold;
        });
    }

    if (target === 'loyalty-high' || target === 'loyalty-low') {
        const usersSnap = await db.collection('users').get();
        const loyaltyMap = {};
        usersSnap.docs.forEach(d => { loyaltyMap[d.id] = d.data().totalBonusPoints || 0; });
        return subscribers.filter(s => {
            if (!s.userId) return false;
            const pts = loyaltyMap[s.userId] || 0;
            return target === 'loyalty-high' ? pts > 500 : pts < 100;
        });
    }

    if (target === 'new-users') {
        return subscribers.filter(s => {
            const subMs = s.subscribedAt?.toMillis?.() || 0;
            return subMs > now7;
        });
    }

    if (target === 'cart-abandon') {
        // Nutzer mit Aktivität in den letzten 24h (via presence) aber keiner Bestellung
        const presenceSnap = await db.collection('presence').get();
        const recentUids = new Set();
        presenceSnap.docs.forEach(d => {
            const p = d.data();
            if ((p.lastSeen?.toMillis?.() || 0) > now24h && p.cartSize > 0) {
                recentUids.add(p.uid);
            }
        });
        return subscribers.filter(s => s.userId && recentUids.has(s.userId));
    }

    return subscribers;
}
