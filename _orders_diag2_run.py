#!/usr/bin/env python3
"""Extrahiert switchTab und ordRenderTable aus admin.html"""
from pathlib import Path
import re

SRC = Path(__file__).parent / 'admin.html'
OUT = Path(__file__).parent / '_orders_diag2_out.txt'
lines = SRC.read_text(encoding='utf-8', errors='replace').split('\n')

import io
buf = io.StringIO()
def w(*a): buf.write(' '.join(str(x) for x in a) + '\n')

def show(start, end, label=""):
    w(f"\n{'='*70}")
    w(f"  {label}  [Zeile {start}-{end}]")
    w('='*70)
    for i in range(start-1, min(end, len(lines))):
        w(f"  {i+1:>5}: {lines[i]}")

# switchTab Funktion
for i, l in enumerate(lines):
    if 'function switchTab' in l:
        show(i+1, i+80, 'switchTab()')
        break

# ordRenderTable Funktion
for i, l in enumerate(lines):
    if 'function ordRenderTable' in l:
        show(i+1, i+60, 'ordRenderTable()')
        break

# _ordAllDocs deklaration
for i, l in enumerate(lines):
    if '_ordAllDocs' in l and ('let ' in l or 'var ' in l or 'const ' in l):
        show(i+1, i+5, '_ordAllDocs deklaration')

# Bestellungs-Tab HTML-Element
for i, l in enumerate(lines):
    if 'tab-content' in l.lower() and ('order' in l.lower() or 'bestell' in l.lower()):
        show(i+1, i+10, 'orders tab HTML')
        break

# id="tab-1" oder id="orders-tab"
for i, l in enumerate(lines):
    if re.search(r'id=["\']tab-1["\']', l) or re.search(r'id=["\']orders["\']', l):
        show(i+1, i+8, 'orders tab div')

# order-search element
for i, l in enumerate(lines):
    if 'order-search' in l and 'id=' in l:
        show(i+1, i+3, 'order-search element')
        break

# orders-tbody element
for i, l in enumerate(lines):
    if 'orders-tbody' in l:
        show(i+1, i+3, 'orders-tbody element')
        break

OUT.write_text(buf.getvalue(), encoding='utf-8')
print(f"Output: {OUT}")
