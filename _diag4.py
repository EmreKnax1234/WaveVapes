#!/usr/bin/env python3
"""Zeige den kompletten placeOrder-Block nochmal zur Kontrolle"""
from pathlib import Path

SRC = Path(__file__).parent / 'index.html'
lines = SRC.read_text(encoding='utf-8', errors='replace').split('\n')

def show(start, end, label=""):
    print(f"\n{'═'*60}")
    print(f"  {label}  [Zeile {start}–{end}]")
    print('═'*60)
    for i in range(start-1, min(end, len(lines))):
        print(f"  {i+1:>5}: {lines[i]}")

# Finde placeOrder und zeige den try-Block mit allen Validierungen
print("=== SUCHE: alle showToast / throw in placeOrder ===")
in_place = False
for i, l in enumerate(lines):
    if 'async function placeOrder' in l:
        in_place = True
    if in_place:
        if 'showToast' in l or 'throw new Error' in l or 'throw new' in l:
            show(i+1-2, i+1+3, f"Zeile {i+1}")
    if in_place and i > 5900:
        break

# Zeige auch den catch-Block am Ende von placeOrder
print("\n=== SUCHE: catch-Block in placeOrder ===")
in_place = False
for i, l in enumerate(lines):
    if 'async function placeOrder' in l:
        in_place = True
    if in_place and '} catch' in l and i > 5376:
        show(i+1-1, i+1+20, f"catch-Block Zeile {i+1}")
        break
