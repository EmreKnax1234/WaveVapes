#!/usr/bin/env python3
"""Fix: orders-Dokument date-Feld — Timestamp.now() → serverTimestamp()"""
import shutil
from pathlib import Path

SRC = Path(__file__).parent / 'index.html'
bak = SRC.with_suffix('.html.date_backup')
shutil.copy2(SRC, bak)

txt = SRC.read_text(encoding='utf-8', errors='replace')
original = txt
fixes = []

# Fix 1: date: firebase.firestore.Timestamp.now()
for old, new in [
    ('date: firebase.firestore.Timestamp.now()',
     'date: firebase.firestore.FieldValue.serverTimestamp()'),
    ('date: Timestamp.now()',
     'date: firebase.firestore.FieldValue.serverTimestamp()'),
    ('createdAt: firebase.firestore.Timestamp.now()',
     'createdAt: firebase.firestore.FieldValue.serverTimestamp()'),
    ('updatedAt: firebase.firestore.Timestamp.now()',
     'updatedAt: firebase.firestore.FieldValue.serverTimestamp()'),
    ('timestamp: firebase.firestore.Timestamp.now()',
     'timestamp: firebase.firestore.FieldValue.serverTimestamp()'),
]:
    if old in txt:
        count = txt.count(old)
        txt = txt.replace(old, new)
        fixes.append(f"'{old}' → serverTimestamp() ({count}×)")
        print(f"✅ {count}× ersetzt: {old}")

# Zeige alle Timestamp.now() die noch übrig sind
import re
remaining = re.findall(r'Timestamp\.now\(\)', txt)
if remaining:
    print(f"\n⚠️  Noch {len(remaining)} 'Timestamp.now()' im Code — suche Kontext:")
    lines = txt.split('\n')
    for i, l in enumerate(lines):
        if 'Timestamp.now()' in l:
            print(f"  Zeile {i+1}: {l.strip()}")

if txt != original:
    SRC.write_text(txt, encoding='utf-8')
    print(f"\n✅ Gespeichert. {len(fixes)} Fix(e):")
    for f in fixes:
        print(f"   • {f}")
    print("\n→ Cmd+Shift+R und nochmal testen!")
else:
    print("\n❌ Kein Timestamp.now() gefunden — zeige date:-Stellen:")
    lines = txt.split('\n')
    for i, l in enumerate(lines):
        if 'date:' in l and ('Timestamp' in l or 'firestore' in l or 'Date' in l):
            print(f"  Zeile {i+1}: {l.strip()}")
