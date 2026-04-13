#!/usr/bin/env python3
"""
WaveVapes Tawk.to Fix — automatisch generiert von Claude
Entfernt den hardcodierten Cloudflare email-decode Script-Tag aus index.html.
(Die CSP in vercel.json wurde bereits direkt gepatcht)
"""
import os, shutil, sys

BASE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(BASE, "index.html")
BACKUP = TARGET + ".tawk_bak"

if not os.path.exists(TARGET):
    print("❌ index.html nicht gefunden!")
    input("Enter drücken zum Beenden..."); sys.exit(1)

shutil.copy2(TARGET, BACKUP)
print(f"💾 Backup erstellt: {BACKUP}")

with open(TARGET, "r", encoding="utf-8") as f:
    content = f.read()

OLD = '<script data-cfasync="false" src="/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js"></script>'
if OLD in content:
    content = content.replace(OLD, "", 1)
    with open(TARGET, "w", encoding="utf-8") as f:
        f.write(content)
    print("✅ Cloudflare email-decode script aus index.html entfernt")
else:
    print("ℹ️  Script war bereits entfernt oder nicht gefunden")
    os.remove(BACKUP)

print("\n✅ Fertig! Jetzt 'git add . && git commit && git push' ausführen.")
input("\nEnter drücken zum Beenden...")
