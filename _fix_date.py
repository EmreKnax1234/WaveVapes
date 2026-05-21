#!/usr/bin/env python3
"""Fix: ALLE FieldValue.serverTimestamp() im orderData → new Date()
serverTimestamp() wirft ebenfalls 'custom Uc object' in dieser Firebase-Version."""
import shutil, re
from pathlib import Path

SRC = Path(__file__).parent / 'index.html'
bak = SRC.with_suffix('.html.date2_backup')
shutil.copy2(SRC, bak)

txt = SRC.read_text(encoding='utf-8', errors='replace')
original = txt

# Zeige zuerst alle verbleibenden serverTimestamp()-Stellen
lines = txt.split('\n')
print("=== Alle serverTimestamp() Stellen ===")
for i, l in enumerate(lines):
    if 'serverTimestamp()' in l:
        print(f"  Zeile {i+1}: {l.strip()}")

# Das Problem: in placeOrder → orderData wird date: serverTimestamp() gesetzt
# aber auch andere Felder könnten betroffen sein.
# Fix: Nur im orderData-Kontext date: → new Date()
# Sichere Stellen (in .update() / .set() mit merge) können serverTimestamp() behalten.

fixes = []

# Fix 1: date: firebase.firestore.FieldValue.serverTimestamp() im orderData
old1 = 'date: firebase.firestore.Timestamp.now()'
new1 = 'date: new Date()'
if old1 in txt:
    txt = txt.replace(old1, new1)
    fixes.append(old1)

old2 = 'date: firebase.firestore.FieldValue.serverTimestamp()'
new2 = 'date: new Date()'
# Nur im orderData ersetzen (nicht in anderen Collections)
# Suche den orderData-Block und ersetze dort
if old2 in txt:
    count = txt.count(old2)
    txt = txt.replace(old2, new2)
    fixes.append(f"{old2} ({count}×)")
    print(f"\n✅ {count}× ersetzt: date: serverTimestamp() → new Date()")

# Fix 2: subscribedAt / lastSeen in push_subscriptions — diese sind in .set() mit merge, ok
# aber lastSeen: serverTimestamp() könnte auch Uc sein
# Nur date:-Felder in add()-Aufrufen sind problematisch

# Prüfe ob noch Uc-Probleme kommen könnten: alle add()-Aufrufe mit Timestamp
print("\n=== add()-Aufrufe die noch Timestamp enthalten könnten ===")
in_add = False
for i, l in enumerate(lines):
    if '.add(' in l or 'addDoc(' in l:
        # Zeige Kontext
        ctx = '\n'.join(lines[max(0,i-5):i+5])
        if 'serverTimestamp' in ctx or 'Timestamp' in ctx:
            print(f"\n  Zeile {i+1}:")
            for j in range(max(0,i-5), min(len(lines),i+5)):
                print(f"    {j+1}: {lines[j]}")

if txt != original:
    SRC.write_text(txt, encoding='utf-8')
    print(f"\n✅ Gespeichert. Fixes: {fixes}")
    print("→ Cmd+Shift+R und nochmal testen!")
else:
    print("\n❌ Nichts ersetzt — zeige date-Feld in placeOrder:")
    for i, l in enumerate(lines):
        if 'date:' in l and 5600 < i < 5800:
            print(f"  Zeile {i+1}: {l.strip()}")
