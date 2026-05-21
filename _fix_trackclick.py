#!/usr/bin/env python3
"""Fix: trackClick() übergibt invalides Firestore-Objekt (Uc/Timestamp)
Der Fehler: 'Unsupported field value: a custom Uc object (found in field ts)'
trackClick() schreibt in click_events und übergibt firebase.firestore.FieldValue.serverTimestamp()
oder ein Timestamp-Objekt direkt — das ist in addDoc() nicht erlaubt als plain value.
Fix: ts-Feld auf serverTimestamp() setzen (korrekt), oder Date().toISOString() als String.
"""
import shutil, re
from pathlib import Path

SRC = Path(__file__).parent / 'index.html'
bak = SRC.with_suffix('.html.trackclick_backup')
shutil.copy2(SRC, bak)

txt = SRC.read_text(encoding='utf-8', errors='replace')
original = txt
lines = txt.split('\n')

# Zeige trackClick
print("=== trackClick Funktion ===")
for i, l in enumerate(lines):
    if 'function trackClick' in l:
        for j in range(i, min(len(lines), i+25)):
            print(f"  {j+1:>5}: {lines[j]}")
        break

# Der Bug: irgendwo in trackClick wird ts: mit einem Firestore-Objekt gesetzt
# das nicht serialisierbar ist. Typisch: ts: firebase.firestore.Timestamp.now()
# oder ts: new Date() als Firestore-Objekt.
# Fix-Strategie: Suche den trackClick addDoc-Aufruf und ersetze ts-Feld

# Pattern 1: ts: firebase.firestore.Timestamp.now()
fixes = []

p1_old = 'ts: firebase.firestore.Timestamp.now()'
p1_new = 'ts: firebase.firestore.FieldValue.serverTimestamp()'
if p1_old in txt:
    txt = txt.replace(p1_old, p1_new)
    fixes.append(f"trackClick: '{p1_old}' → serverTimestamp()")
    print(f"\n✅ Fix: {p1_old} → serverTimestamp()")

# Pattern 2: ts: Timestamp.now() (ohne firebase.firestore prefix)
p2_old = 'ts: Timestamp.now()'
p2_new = 'ts: firebase.firestore.FieldValue.serverTimestamp()'
if p2_old in txt:
    txt = txt.replace(p2_old, p2_new)
    fixes.append(f"trackClick: Timestamp.now() → serverTimestamp()")
    print(f"✅ Fix: {p2_old} → serverTimestamp()")

# Pattern 3: Suche den konkreten addDoc/set-Aufruf in trackClick
# und schau was ts dort ist
print("\n=== Suche ts:-Felder in click_events / trackClick ===")
for i, l in enumerate(lines):
    if ('click_events' in l or 'trackClick' in l) and 'ts' in l:
        for j in range(max(0,i-3), min(len(lines), i+10)):
            print(f"  {j+1:>5}: {lines[j]}")
        print()

# Wenn kein direkter Fix, suche den db.collection("click_events") Block
print("=== db.collection click_events ===")
for i, l in enumerate(lines):
    if 'click_events' in l:
        for j in range(max(0,i-5), min(len(lines), i+15)):
            print(f"  {j+1:>5}: {lines[j]}")
        break

if txt != original:
    SRC.write_text(txt, encoding='utf-8')
    print(f"\n✅ Gespeichert. Fixes: {fixes}")
else:
    print("\nℹ️  Kein direkter Pattern-Fix — bitte Ausgabe oben prüfen")
    print("   Der manuelle Fix wird danach angewendet.")
