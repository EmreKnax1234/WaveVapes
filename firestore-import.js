// ============================================
// FIRESTORE IMPORT SCRIPT - WaveVapes
// Führe aus: node firestore-import.js
// ============================================

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Neues Projekt (serviceAccount-NEU.json in denselben Ordner legen)
const SERVICE_ACCOUNT_PATH = "./serviceAccount-NEU.json";

// ⚠️ HIER: neue Projekt-ID eintragen nach dem Anlegen!
const PROJECT_ID = "wavevapes-22dce";

admin.initializeApp({
  credential: admin.credential.cert(require(path.resolve(SERVICE_ACCOUNT_PATH))),
  projectId: PROJECT_ID,
});

const db = admin.firestore();
const INPUT_FILE = "./firestore-backup.json";

function deserializeData(data) {
  if (data === null || data === undefined) return data;
  if (data && data._type === "timestamp") {
    return admin.firestore.Timestamp.fromDate(new Date(data.value));
  }
  if (Array.isArray(data)) return data.map(deserializeData);
  if (typeof data === "object") {
    const result = {};
    for (const [key, val] of Object.entries(data)) result[key] = deserializeData(val);
    return result;
  }
  return data;
}

async function importCollection(collectionRef, docs) {
  let batch = db.batch();
  let count = 0;
  for (const [docId, docData] of Object.entries(docs)) {
    const { _data, _subcollections } = docData;
    const docRef = collectionRef.doc(docId);
    batch.set(docRef, deserializeData(_data));
    count++;
    process.stdout.write(`  ✓ ${collectionRef.path}/${docId}\n`);
    if (count >= 400) {
      await batch.commit();
      batch = db.batch();
      count = 0;
    }
    if (_subcollections) {
      for (const [subId, subDocs] of Object.entries(_subcollections)) {
        await importCollection(docRef.collection(subId), subDocs);
      }
    }
  }
  if (count > 0) await batch.commit();
}

async function main() {
  console.log("🚀 WaveVapes Firestore Import gestartet...\n");
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ ${INPUT_FILE} nicht gefunden! Erst firestore-export.js ausführen.`);
    process.exit(1);
  }
  const backup = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
  const cols = Object.keys(backup);
  console.log(`📦 Collections: ${cols.join(", ")}\n`);
  for (const colId of cols) {
    console.log(`📁 Importiere: ${colId}`);
    await importCollection(db.collection(colId), backup[colId]);
  }
  console.log("\n✅ Import abgeschlossen!");
  console.log("\nNächste Schritte:");
  console.log("  1. Firebase Config in index.html / admin.html / account.html ersetzen");
  console.log("  2. node auth-migrate.js export  →  node auth-migrate.js import");
  console.log("  3. firebase use <neue-id>  →  firebase deploy");
}

main().catch((err) => {
  console.error("❌ Fehler:", err.message);
  process.exit(1);
});
