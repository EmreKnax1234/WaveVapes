#!/usr/bin/env python3
"""Zeige den Rest von placeOrder nach Zeile 5592, und den Bundle-Cart-Render"""
from pathlib import Path

SRC = Path(__file__).parent / 'index.html'
lines = SRC.read_text(encoding='utf-8', errors='replace').split('\n')

def show(start, end, label=""):
    print(f"\n{'═'*60}")
    print(f"  {label}  [Zeile {start}–{end}]")
    print('═'*60)
    for i in range(start-1, min(end, len(lines))):
        print(f"  {i+1:>5}: {lines[i]}")

# Der appliedDiscount-Block nach 5592
show(5592, 5720, "placeOrder — appliedDiscount-Block Fortsetzung")

# Bundle Cart render — suche updateCartDisplay / renderCartItem
print("\n\n═══ SUCHE: Bundle im Cart-HTML render ═══")
for i, l in enumerate(lines):
    if 'isBundle' in l and ('innerHTML' in l or 'template' in l.lower() or '`' in l):
        show(i+1-2, i+1+30, f"Bundle HTML render Zeile {i+1}")
        break

# Suche changeBundleQty oder äquivalent im Cart-render
print("\n\n═══ SUCHE: Cart-Item render für Bundle (qty) ═══")
for i, l in enumerate(lines):
    if 'isBundle' in l and 'qty' in lines[max(0,i-3):i+10].__str__():
        ctx = lines[max(0,i-2):i+25]
        if any('qty-btn' in x or 'changeQty' in x or 'qty' in x for x in ctx):
            show(i+1-2, i+1+25, f"Bundle+qty Zeile {i+1}")
            break

# updateCartDisplay komplett — suche Funktion
print("\n\n═══ SUCHE: function updateCartDisplay ═══")
for i, l in enumerate(lines):
    if 'function updateCartDisplay' in l:
        show(i+1, i+1+80, f"updateCartDisplay Zeile {i+1}")
        break
