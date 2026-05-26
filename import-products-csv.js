// ============================================
// PRODUKT-CSV IMPORT ins neue Firestore
// Führe aus: node import-products-csv.js
// ============================================

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const SERVICE_ACCOUNT_PATH = "./serviceAccount-NEU.json";
const PROJECT_ID = "wavevapes-22dce";
const CSV_FILE = "./wavevapes_products_backup_2026-03-16.csv";

admin.initializeApp({
  credential: admin.credential.cert(require(path.resolve(SERVICE_ACCOUNT_PATH))),
  projectId: PROJECT_ID,
});

const db = admin.firestore();

function parseCSV(content) {
  const lines = content.split("\n").filter(l => l.trim());
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    if (vals.length < 2) continue;
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = vals[idx] ?? ""; });
    rows.push(obj);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function coerce(row) {
  return {
    name:          row.name || "",
    price:         parseFloat(row.price) || 0,
    originalPrice: row.originalPrice ? parseFloat(row.originalPrice) : null,
    stock:         parseInt(row.stock) || 0,
    category:      row.category || "",
    isNew:         row.isNew === "true",
    available:     row.available === "true",
    hasNicotine:   row.hasNicotine === "true",
    description:   row.description || "",
    image:         row.image || "",
    sold:          parseInt(row.sold) || 0,
  };
}

async function main() {
  console.log("🚀 Produkt-Import gestartet...\n");

  if (!fs.existsSync(CSV_FILE)) {
    console.error(`❌ CSV nicht gefunden: ${CSV_FILE}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(CSV_FILE, "utf-8").replace(/^\uFEFF/, ""); // BOM entfernen
  const rows = parseCSV(raw);
  console.log(`📦 ${rows.length} Produkte gefunden\n`);

  let batch = db.batch();
  let count = 0;
  let total = 0;

  for (const row of rows) {
    const docId = row.id || db.collection("products").doc().id;
    const ref = db.collection("products").doc(docId);
    batch.set(ref, coerce(row));
    count++;
    total++;

    if (count >= 400) {
      await batch.commit();
      batch = db.batch();
      count = 0;
      console.log(`  ... ${total} committed`);
    }

    console.log(`  ✓ ${row.name}`);
  }

  if (count > 0) await batch.commit();

  console.log(`\n✅ ${total} Produkte erfolgreich importiert!`);
  console.log("\nNächster Schritt: firebase deploy --only hosting");
}

main().catch(err => {
  console.error("❌ Fehler:", err.message);
  process.exit(1);
});
