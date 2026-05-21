#!/usr/bin/env python3
"""
WaveVapes Präzise Diagnose v3
Liest die kritischen Codeabschnitte exakt aus.
"""
from pathlib import Path

SRC = Path(__file__).parent / 'index.html'
lines = SRC.read_text(encoding='utf-8', errors='replace').split('\n')

def show(start, end, label=""):
    print(f"\n{'═'*60}")
    print(f"  {label}  [Zeile {start}–{end}]")
    print('═'*60)
    for i in range(start-1, min(end, len(lines))):
        print(f"  {i+1:>5}: {lines[i]}")

# placeOrder ab Zeile 5376, 120 Zeilen
show(5376, 5500, "placeOrder() — komplett")

# Bundle cart render um Zeile 1468
show(1460, 1560, "Bundle Cart Render")

# changeQty / Bundle-Qty Funktion suchen
print("\n\n═══ SUCHE: changeQty / bundleQty / cart-item html ═══")
for i, l in enumerate(lines):
    if any(x in l for x in ['changeQty', 'bundleQty', 'changeBundleQty', 'bundle-qty', 'bnd-qty']):
        show(i+1-2, i+1+6, f"Treffer Zeile {i+1}")

# applyDiscountCode vollständig (LOYAL-Teil)
print("\n\n═══ SUCHE: appliedDiscount Setter in applyDiscountCode ═══")
for i, l in enumerate(lines):
    if 'appliedDiscount = {' in l or 'appliedDiscount={' in l:
        show(i+1-5, i+1+20, f"appliedDiscount setter Zeile {i+1}")

# placeOrder — suche den appliedDiscount-Block darin
print("\n\n═══ SUCHE: appliedDiscount in placeOrder ═══")
in_fn = False
for i, l in enumerate(lines):
    if 'async function placeOrder' in l:
        in_fn = True
    if in_fn and 'appliedDiscount' in l:
        show(i+1-3, i+1+15, f"appliedDiscount in placeOrder Zeile {i+1}")
    if in_fn and i > 5376 + 200:
        break
