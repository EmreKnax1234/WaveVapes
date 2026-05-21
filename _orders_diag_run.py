#!/usr/bin/env python3
"""Extrahiert Orders-relevante Zeilen aus admin.html und schreibt sie in _orders_diag_out.txt"""
from pathlib import Path
import re, io, sys

SRC  = Path(__file__).parent / 'admin.html'
OUT  = Path(__file__).parent / '_orders_diag_out.txt'

content = SRC.read_text(encoding='utf-8', errors='replace')
lines   = content.split('\n')

buf = io.StringIO()

def w(*args): buf.write(' '.join(str(a) for a in args) + '\n')

w(f"=== admin.html  {len(lines)} Zeilen  {len(content)//1024} KB ===\n")

def show_context(idx, before=2, after=30, label=""):
    start = max(0, idx - before)
    end   = min(len(lines), idx + after)
    w(f"\n{'='*70}")
    w(f"  {label}  [Zeile {idx+1}]")
    w('='*70)
    for i in range(start, end):
        marker = ">>>" if i == idx else "   "
        w(f"  {marker} {i+1:>5}: {lines[i]}")

keywords = [
    (r'loadOrders', 'loadOrders'),
    (r'fetchOrders', 'fetchOrders'),
    (r"collection\(['\"]orders['\"]", "collection(orders)"),
    (r'ordersLoaded', 'ordersLoaded'),
    (r'onSnapshot', 'onSnapshot'),
]

found = {}
for pat, label in keywords:
    for i, line in enumerate(lines):
        if re.search(pat, line, re.I):
            found.setdefault(label, []).append(i)

w("=== TREFFER ===")
for label, idxs in found.items():
    w(f"  [{label}]  Zeilen: {[x+1 for x in idxs[:15]]}")

shown = set()
for label, idxs in found.items():
    for idx in idxs:
        if idx not in shown:
            show_context(idx, label=label)
            shown.add(idx)

w("\n=== AUFRUFE loadOrders() ===")
calls = [(i+1, lines[i].strip()) for i,l in enumerate(lines) if re.search(r'loadOrders\s*\(', l)]
if calls:
    for ln, txt in calls:
        w(f"  Zeile {ln}: {txt[:150]}")
else:
    w("  !! KEIN AUFRUF gefunden!!")

w("\n=== TAB-SWITCH LOGIK ===")
for i, l in enumerate(lines):
    if re.search(r'(showTab|switchTab|activateTab|openTab)\s*\(', l, re.I):
        w(f"  Zeile {i+1}: {l.strip()[:150]}")

w("\n=== onAuthStateChanged ===")
for i, l in enumerate(lines):
    if 'onAuthStateChanged' in l:
        show_context(i, before=0, after=25, label='onAuthStateChanged')

w("\n=== FERTIG ===")

OUT.write_text(buf.getvalue(), encoding='utf-8')
print(f"Output: {OUT}")
