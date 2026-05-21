// ============================================
// AUTH NUTZER MIGRATION - WaveVapes
// Export:  node auth-migrate.js export
// Import:  node auth-migrate.js import
// ============================================

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const MODE = process.argv[2];
if (!MODE || !["export", "import"].includes(MODE)) {
  console.error("❌ Verwendung: node auth-migrate.js export|import");
  process.exit(1);
}

const SA = MODE === "export" ? "./serviceAccount-ALT.json" : "./serviceAccount-NEU.json";
const USERS_FILE = "./auth-users-backup.json";

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(SA))) });

async function exportUsers() {
  console.log("👥 Exportiere Auth-Nutzer...\n");
  const users = [];
  let pageToken;
  do {
    const result = await admin.auth().listUsers(1000, pageToken);
    for (const u of result.users) {
      users.push({
        uid: u.uid,
        email: u.email || null,
        displayName: u.displayName || null,
        phoneNumber: u.phoneNumber || null,
        photoURL: u.photoURL || null,
        disabled: u.disabled,
        emailVerified: u.emailVerified,
        customClaims: u.customClaims || null,
      });
      console.log(`  ✓ ${u.email || u.uid}`);
    }
    pageToken = result.pageToken;
  } while (pageToken);

  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
  console.log(`\n✅ ${users.length} Nutzer exportiert → ${USERS_FILE}`);
  console.log("⚠️  Passwörter können nicht migriert werden → Nutzer kriegen Reset-Mail beim Import.");
}

async function importUsers() {
  console.log("👥 Importiere Auth-Nutzer...\n");
  if (!fs.existsSync(USERS_FILE)) {
    console.error(`❌ ${USERS_FILE} nicht gefunden!`);
    process.exit(1);
  }
  const users = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
  let ok = 0, fail = 0;

  for (const u of users) {
    try {
      const d = { uid: u.uid, disabled: u.disabled, emailVerified: u.emailVerified };
      if (u.email) d.email = u.email;
      if (u.displayName) d.displayName = u.displayName;
      if (u.phoneNumber) d.phoneNumber = u.phoneNumber;
      if (u.photoURL) d.photoURL = u.photoURL;
      await admin.auth().createUser(d);
      if (u.customClaims) await admin.auth().setCustomUserClaims(u.uid, u.customClaims);
      if (u.email) {
        const link = await admin.auth().generatePasswordResetLink(u.email);
        console.log(`  ✓ ${u.email}`);
        // Reset-Link in Datei loggen (optional per Mail verschicken)
        fs.appendFileSync("./reset-links.txt", `${u.email}: ${link}\n`);
      }
      ok++;
    } catch (e) {
      console.error(`  ❌ ${u.email || u.uid}: ${e.message}`);
      fail++;
    }
  }
  console.log(`\n✅ ${ok} importiert, ${fail} fehlgeschlagen`);
  if (ok > 0) console.log("📋 Reset-Links gespeichert in: reset-links.txt");
}

if (MODE === "export") exportUsers().catch(console.error);
else importUsers().catch(console.error);
