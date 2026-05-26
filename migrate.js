const admin = require('firebase-admin');

const OLD_KEY = require('./wavevapes-7a960-firebase-adminsdk-fbsvc-d0fea9121e.json');
const NEW_KEY = require('./wavevapes-22dce-firebase-adminsdk-fbsvc-24750f8518.json');

const oldApp = admin.initializeApp({ credential: admin.credential.cert(OLD_KEY) }, 'old');
const newApp = admin.initializeApp({ credential: admin.credential.cert(NEW_KEY) }, 'new');

const oldDb = oldApp.firestore();
const newDb = newApp.firestore();

async function migrate() {
    console.log('🔍 Lade Collections aus altem Projekt...\n');
    const collections = await oldDb.listCollections();

    let totalDocs = 0;

    for (const colRef of collections) {
        const colId = colRef.id;
        const snap = await oldDb.collection(colId).get();

        if (snap.empty) {
            console.log(`⚠️  ${colId} — leer, übersprungen.`);
            continue;
        }

        console.log(`📦 ${colId} — ${snap.size} Dokumente...`);

        let batch = newDb.batch();
        let count = 0;

        for (const doc of snap.docs) {
            batch.set(newDb.collection(colId).doc(doc.id), doc.data());
            count++;

            if (count === 499) {
                await batch.commit();
                batch = newDb.batch();
                count = 0;
            }
        }

        if (count > 0) await batch.commit();

        totalDocs += snap.size;
        console.log(`   ✅ ${snap.size} Dokumente migriert.`);
    }

    console.log(`\n🎉 Fertig! ${totalDocs} Dokumente insgesamt migriert.`);
    process.exit(0);
}

migrate().catch(err => {
    console.error('❌ Fehler:', err.message);
    process.exit(1);
});
