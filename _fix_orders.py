#!/usr/bin/env python3
"""
Diagnose & Fix: Bestellungen laden im Admin Panel
"""
from pathlib import Path
import re, sys

SRC = Path(__file__).parent / 'admin.html'
content = SRC.read_text(encoding='utf-8', errors='replace')
lines = content.split('\n')

print(f"Datei: {SRC.name}  ({len(lines)} Zeilen, {len(content)//1024} KB)\n")

def show_context(idx, before=2, after=25, label=""):
    start = max(0, idx - before)
    end   = min(len(lines), idx + after)
    print(f"\n{'='*70}")
    print(f"  {label}  [Zeile {idx+1}]")
    print('='*70)
    for i in range(start, end):
        marker = ">>>" if i == idx else "   "
        print(f"  {marker} {i+1:>5}: {lines[i]}")

# ── 1. Alle Treffer ────────────────────────────────────────────────────────
keywords = [
    r'loadOrders', r'fetchOrders', r'renderOrders',
    r"collection\(['\"]orders['\"]",
    r'onSnapshot', r'ordersLoaded', r'tab.*orders', r'orders.*tab',
    r'showTab', r'switchTab', r'activateTab',
]
found = {}
for i, line in enumerate(lines):
    for kw in keywords:
        if re.search(kw, line, re.I):
            found.setdefault(kw, []).append(i)

print("=== TREFFER-ÜBERSICHT ===")
for kw, idxs in found.items():
    print(f"  [{kw}]  → Zeilen: {[x+1 for x in idxs[:10]]}")

# ── 2. Zeige loadOrders-Funktion ──────────────────────────────────────────
shown = set()
for kw in [r'loadOrders', r"collection\(['\"]orders['\"]", r'onSnapshot']:
    for idx in found.get(kw, []):
        if idx not in shown:
            show_context(idx, label=kw)
            shown.add(idx)

# ── 3. Wird loadOrders() aufgerufen? ──────────────────────────────────────
print("\n\n=== AUFRUFE loadOrders() ===")
calls = [(i+1, lines[i].strip()) for i,l in enumerate(lines) if re.search(r'loadOrders\s*\(', l)]
if calls:
    for ln, txt in calls:
        print(f"  Zeile {ln}: {txt[:130]}")
else:
    print("  !! KEIN AUFRUF gefunden!!")

# ── 4. Tab-Logik ──────────────────────────────────────────────────────────
print("\n=== TAB-LOGIK ===")
for i, l in enumerate(lines):
    if re.search(r'(showTab|switchTab|activateTab|openTab)\s*\(', l, re.I):
        print(f"  Zeile {i+1}: {l.strip()[:130]}")

# ── 5. onAuthStateChanged ─────────────────────────────────────────────────
print("\n=== AUTH onAuthStateChanged ===")
for i, l in enumerate(lines):
    if 'onAuthStateChanged' in l:
        show_context(i, before=0, after=20, label='onAuthStateChanged')
        break

print("\n=== FERTIG ===")
