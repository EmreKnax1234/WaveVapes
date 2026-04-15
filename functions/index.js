// WaveVapes — Firebase Cloud Functions
// Datei: functions/index.js
//
// Setup:
//   cd functions
//   npm init -y
//   npm install firebase-admin firebase-functions node-fetch
//   cd ..
//   firebase deploy --only functions
//
// Secrets (einmalig setzen):
//   firebase functions:secrets:set EMAIL_WORKER_URL
//   firebase functions:secrets:set EMAIL_WORKER_KEY

const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const fetch     = require('node-fetch');

admin.initializeApp();
const db = admin.firestore();

// ── Email Worker helpers ───────────────────────────────────────
/**
 * Sendet einen Email-Request an den Cloudflare Email Worker.
 * URL + Key kommen aus Firebase Secrets (nie hardcoden!).
 */
async function emailWorker(type, data) {
    const url = process.env.EMAIL_WORKER_URL;   // z.B. https://wavevapes-email.workers.dev/send
    const key = process.env.EMAIL_WORKER_KEY;   // 32-char random key
    if (!url || !key) {
        console.warn('[emailWorker] EMAIL_WORKER_URL oder EMAIL_WORKER_KEY nicht gesetzt – E-Mail übersprungen');
        return;
    }
    const res = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
        body:    JSON.stringify({ type, data }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Email Worker ${res.status}: ${text}`);
    }
}

// ── Trigger: Neue Bestellung → Bestätigung + Admin-Alert ──────
exports.onOrderCreate = functions
    .region('europe-west1')
    .runWith({ secrets: ['EMAIL_WORKER_URL', 'EMAIL_WORKER_KEY'] })
    .firestore
    .document('orders/{orderId}')
    .onCreate(async (snap, context) => {
        const order = snap.data();
        const orderId = context.params.orderId;

        // Kundendaten aus order-Doc oder users-Collection
        let customerEmail = order.email || order.customerEmail || '';
        let customerName  = order.customerName || order.name || 'Kunde';

        if (!customerEmail && order.userId) {
            const userDoc = await db.collection('users').doc(order.userId).get();
            if (userDoc.exists) {
                customerEmail = userDoc.data().email || '';
                if (!order.customerName) customerName = userDoc.data().displayName || userDoc.data().name || 'Kunde';
            }
        }

        const items = (order.items || order.cart || []).map(i => ({
            name:  i.name  || i.title || 'Produkt',
            qty:   i.qty   || i.quantity || 1,
            price: i.price || i.unitPrice || 0,
        }));

        try {
            // Bestellbestätigung an Kunden
            if (customerEmail) {
                await emailWorker('order_confirmation', {
                    orderId,
                    customerEmail,
                    customerName,
                    items,
                    total: order.total || order.totalAmount || 0,
                });
                console.log(`[onOrderCreate] Bestätigung an ${customerEmail} gesendet`);
            }

            // Admin-Alert
            await emailWorker('admin_alert', {
                orderId,
                customerName,
                customerEmail,
                total: order.total || order.totalAmount || 0,
                items,
            });
            console.log(`[onOrderCreate] Admin-Alert für Bestellung ${orderId} gesendet`);

        } catch (err) {
            // E-Mail-Fehler dürfen die Bestellung nicht blockieren
            console.error(`[onOrderCreate] E-Mail fehlgeschlagen für ${orderId}:`, err);
        }
    });

// ── Trigger: Neue push_notification → sofort versenden ────────
exports.sendPushOnCreate = functions
    .region('europe-west1')
    .firestore
    .document('push_notifications/{notifId}')
    .onCreate(async (snap, context) => {
        const n = snap.data();
        if (n.scheduledFor) return null; // geplant → später via Scheduler
        try {
            return await _dispatch(context.params.notifId, n);
        } catch (err) {
            console.error(`[sendPushOnCreate] Fehler bei ${context.params.notifId}:`, err);
            await snap.ref.update({ status: 'error', errorMessage: String(err.message || err) }).catch(() => {});
            return null;
        }
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
        const results = await Promise.allSettled(snap.docs.map(d => _dispatch(d.id, d.data())));
        results.forEach((r, i) => {
            if (r.status === 'rejected') {
                console.error(`[sendScheduledPush] Fehler bei ${snap.docs[i].id}:`, r.reason);
                snap.docs[i].ref.update({ status: 'error', errorMessage: String(r.reason?.message || r.reason) }).catch(() => {});
            }
        });
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
        // Bereits gesendet, in Bearbeitung, oder steckengeblieben (>5 Min.) → Abbruch oder Retry
        if (status === 'sent') return false;
        if (status === 'sending') {
            // Sicherheitsnetz: falls ein voriger Lauf abgestürzt ist (z.B. Cold-Start),
            // erlauben wir nach 5 Minuten einen erneuten Versuch.
            const updatedAt = doc.data()?.updatedAt?.toMillis?.() || 0;
            if (Date.now() - updatedAt < 5 * 60 * 1000) return false; // noch frisch → wirklich in Arbeit
        }
        tx.update(docRef, { status: 'sending', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
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
