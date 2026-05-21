// ============================================
// FIRESTORE EXPORT SCRIPT - WaveVapes
// Führe aus: node firestore-export.js
// ============================================

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Altes Projekt (serviceAccount-ALT.json in denselben Ordner legen)
const SERVICE_ACCOUNT_PATH = "./serviceAccount-ALT.json";
const PROJECT_ID = "wavevapes-7a960"; // ← bereits eingetragen!

admin.initializeApp({
  credential: admin.credential.cert(require(path.resolve(SERVICE_ACCOUNT_PATH))),
  projectId: PROJECT_ID,
});

const db = admin.firestore();
const OUTPUT_FILE = "./firestore-backup.json";

function serializeData(data) {
  if (data === null || data === undefined) return data;
  if (data && typeof data.toDate === "function") {
    return { _type: "timestamp", value: data.toDate().toISOString() };
  }
  if (Array.isArray(data)) return data.map(serializeData);
  if (typeof data === "object") {
    const result = {};
    for (const [key, val] of Object.entries(data)) result[key] = serializeData(val);
    return result;
  }
  return data;
}

async function exportCollection(collectionRef) {
  const snapshot = await collectionRef.get();
  const result = {};
  for (const doc of snapshot.docs) {
    const subs = {};
    const subcollections = await doc.ref.listCollections();
    for (const sub of subcollections) {
      subs[sub.id] = await exportCollection(sub);
    }
    result[doc.id] = {
      _data: serializeData(doc.data()),
      ...(Object.keys(subs).length > 0 ? { _subcollections: subs } : {}),
    };
    process.stdout.write(`  ✓ ${collectionRef.path}/${doc.id}\n`);
  }
  return result;
}

async function main() {
  console.log("🚀 WaveVapes Firestore Export gestartet...\n");
  const collections = await db.listCollections();
  const backup = {};
  for (const col of collections) {
    console.log(`📁 ${col.id}`);
    backup[col.id] = await exportCollection(col);
  }
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(backup, null, 2), "utf-8");
  const size = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1);
  console.log(`\n✅ Export fertig! → ${OUTPUT_FILE} (${size} KB)`);
  console.log(`📦 Collections: ${Object.keys(backup).join(", ")}`);
  console.log(`\nNächster Schritt: node firestore-import.js`);
}

main().catch((err) => {
  console.error("❌ Fehler:", err.message);
  process.exit(1);
});
