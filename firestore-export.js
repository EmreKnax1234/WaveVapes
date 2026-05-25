// ============================================
// FIRESTORE EXPORT SCRIPT - WaveVapes
// Führe aus: node firestore-export.js
// ============================================

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const SERVICE_ACCOUNT_PATH = "./serviceAccount-ALT.json";
const PROJECT_ID = "wavevapes-7a960";
const OUTPUT_FILE = "./firestore-backup.json";
const DELAY_MS = 300;        // Pause zwischen Docs (ms)
const RETRY_DELAY_MS = 15000; // Pause bei Quota-Error (ms)
const MAX_RETRIES = 5;

admin.initializeApp({
  credential: admin.credential.cert(require(path.resolve(SERVICE_ACCOUNT_PATH))),
  projectId: PROJECT_ID,
});

const db = admin.firestore();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function retryOp(fn, label) {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await fn();
    } catch (e) {
      const isQuota = e.code === 8 || (e.message || "").includes("RESOURCE_EXHAUSTED") || (e.message || "").includes("Quota");
      if (isQuota && i < MAX_RETRIES - 1) {
        console.log(`\n  ⏳ Quota erreicht bei "${label}" – warte ${RETRY_DELAY_MS/1000}s... (Versuch ${i+1}/${MAX_RETRIES})`);
        await sleep(RETRY_DELAY_MS);
      } else {
        throw e;
      }
    }
  }
}

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

async function exportCollection(collectionRef, backup) {
  const snapshot = await retryOp(() => collectionRef.get(), collectionRef.path);
  const result = {};
  for (const doc of snapshot.docs) {
    const subs = {};
    const subcollections = await retryOp(() => doc.ref.listCollections(), doc.ref.path);
    for (const sub of subcollections) {
      subs[sub.id] = await exportCollection(sub, backup);
    }
    result[doc.id] = {
      _data: serializeData(doc.data()),
      ...(Object.keys(subs).length > 0 ? { _subcollections: subs } : {}),
    };
    process.stdout.write(`  ✓ ${collectionRef.path}/${doc.id}\n`);
    // Zwischenspeichern nach jedem Dokument
    if (backup) fs.writeFileSync(OUTPUT_FILE, JSON.stringify(backup, null, 2), "utf-8");
    await sleep(DELAY_MS);
  }
  return result;
}

async function main() {
  console.log("🚀 WaveVapes Firestore Export (Quota-Safe Mode)...\n");
  console.log(`  Delay: ${DELAY_MS}ms/Doc | Retry-Pause: ${RETRY_DELAY_MS/1000}s | Max-Retries: ${MAX_RETRIES}\n`);

  // Lade vorhandenes Backup falls vorhanden (Resume-Support)
  let backup = {};
  if (fs.existsSync(OUTPUT_FILE)) {
    backup = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8"));
    console.log(`  📂 Vorhandenes Backup gefunden – setze fort...`);
    console.log(`  Bereits exportiert: ${Object.keys(backup).join(", ")}\n`);
  }

  const collections = await retryOp(() => db.listCollections(), "root");
  for (const col of collections) {
    if (backup[col.id]) {
      console.log(`📁 ${col.id} → bereits exportiert, überspringe.`);
      continue;
    }
    console.log(`📁 ${col.id}`);
    backup[col.id] = await exportCollection(col, backup);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(backup, null, 2), "utf-8");
    console.log(`  💾 ${col.id} gespeichert.\n`);
  }

  const size = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1);
  console.log(`\n✅ Export fertig! → ${OUTPUT_FILE} (${size} KB)`);
  console.log(`📦 Collections: ${Object.keys(backup).join(", ")}`);
  console.log(`\nNächster Schritt: node firestore-import.js`);
}

main().catch((err) => {
  console.error("❌ Fehler:", err.message);
  process.exit(1);
});
