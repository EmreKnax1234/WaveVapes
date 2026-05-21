#!/usr/bin/env python3
"""
Extrahiert Bundle- und Checkout-Funktionen aus index.html
Einfach ausführen: python3 _extract_bugs.py
"""

with open('index.html', 'r', encoding='utf-8', errors='replace') as f:
    lines = f.readlines()

total = len(lines)
print(f"Datei: {total} Zeilen")

# Suche nach relevanten Zeilen
targets = [
    'addBundleToCart', 'submitOrder', 'placeOrder', 'createOrder',
    'Bestellung abschicken', 'sendOrder', 'bestellungAbschicken',
    'function submitOrder', 'function placeOrder',
    'bundle.*qty', 'qty.*bundle',
    'isBundle', 'bundleId',
]

import re
hits = {}
for i, line in enumerate(lines):
    for t in targets:
        if re.search(t, line, re.IGNORECASE):
            hits[i] = line.rstrip()

# Für jeden Treffer: zeige 40 Zeilen Kontext
with open('_bugs_extracted.txt', 'w', encoding='utf-8') as out:
    shown = set()
    for lineno in sorted(hits.keys()):
        start = max(0, lineno - 5)
        end   = min(total, lineno + 60)
        block_key = f"{start}-{end}"
        if block_key in shown:
            continue
        shown.add(block_key)
        out.write(f"\n{'='*60}\n")
        out.write(f"=== TREFFER bei Zeile {lineno+1}: {hits[lineno].strip()[:80]}\n")
        out.write(f"{'='*60}\n")
        for j in range(start, end):
            marker = ">>>" if j == lineno else "   "
            out.write(f"{marker} {j+1:5d}: {lines[j].rstrip()}\n")

print(f"Fertig! {len(shown)} Blöcke -> _bugs_extracted.txt")
print("Öffne _bugs_extracted.txt um die Funktionen zu sehen")
