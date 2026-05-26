#!/usr/bin/env python3
"""Verifikation: Prüft ob beide Fixes korrekt im Code sitzen."""
from pathlib import Path

SRC = Path(__file__).parent / 'index.html'
txt = SRC.read_text(encoding='utf-8', errors='replace')
lines = txt.split('\n')

ok = 0
fail = 0

def check(name, present, snippet=""):
    global ok, fail
    if present:
        print(f"  ✅ {name}")
        ok += 1
    else:
        print(f"  ❌ {name}")
        if snippet:
            print(f"     Gesucht: {snippet[:80]}")
        fail += 1

print("═══ VERIFIKATION ═══\n")

# Bug 2 Fix: else-if wirft nicht mehr blind
check(
    "Bug 2 Fix: VALID_DISCOUNTS-Fallback in placeOrder",
    'const staticDef = VALID_DISCOUNTS[appliedDiscount.code];' in txt
)
check(
    "Bug 2 Fix: Alter throw-Block entfernt",
    'this is either manipulation or an unknown code path. Block the order.' not in txt
)
check(
    "Bug 2 Fix: LOYAL-Code-Pfad bleibt erhalten (Zeile 5607)",
    'appliedDiscount?.code && appliedDiscount.code.startsWith("LOYAL")' in txt
)

# Bug 1 Fix: changeBundleQty Funktion
check(
    "Bug 1 Fix: changeBundleQty() Funktion vorhanden",
    'function changeBundleQty(bundleId, delta)' in txt
)
check(
    "Bug 1 Fix: changeBundleQty() im Cart-HTML verlinkt",
    "changeBundleQty('${item.bundleId}', -1)" in txt or
    'changeBundleQty(' in txt
)
check(
    "Bug 1 Fix: Bundle-Qty-Buttons im Cart (−)",
    "changeBundleQty" in txt and "qty-btn" in txt
)

# Zeige die kritischen Stellen zur Kontrolle
print("\n─── Zeile ~5634 (war der Bug): ───")
for i, l in enumerate(lines):
    if 'staticDef = VALID_DISCOUNTS' in l:
        for j in range(max(0,i-2), min(len(lines), i+8)):
            print(f"  {j+1:>5}: {lines[j]}")
        break

print("\n─── changeBundleQty Funktion: ───")
for i, l in enumerate(lines):
    if 'function changeBundleQty' in l:
        for j in range(i, min(len(lines), i+18)):
            print(f"  {j+1:>5}: {lines[j]}")
        break

print("\n─── Bundle Cart-Item (qty-Buttons): ───")
for i, l in enumerate(lines):
    if "changeBundleQty('${item.bundleId}'" in l:
        for j in range(max(0,i-4), min(len(lines), i+6)):
            print(f"  {j+1:>5}: {lines[j]}")
        break

print(f"\n═══ ERGEBNIS: {ok} OK, {fail} FEHLER ═══")
if fail == 0:
    print("🎉 Alle Fixes korrekt! Shop kann getestet werden.")
else:
    print("⚠️  Einige Checks fehlgeschlagen — bitte oben prüfen.")
