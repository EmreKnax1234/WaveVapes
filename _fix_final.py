#!/usr/bin/env python3
"""
WaveVapes FINALER FIX
Bug 1: Bundle-Qty im Warenkorb (+ Qty-Steuerung)
Bug 2: placeOrder wirft für normale VALID_DISCOUNTS-Codes
"""
import shutil, re
from pathlib import Path

SRC = Path(__file__).parent / 'index.html'
bak = SRC.with_suffix('.html.fix_backup')
shutil.copy2(SRC, bak)
print(f"✅ Backup → {bak.name}")

txt = SRC.read_text(encoding='utf-8', errors='replace')
original = txt
fixes = []

# ════════════════════════════════════════════════════════════
# FIX 1 — Bug 2: placeOrder — else if (appliedDiscount) throw
#
# Problem: Zeile 5634–5638:
#   } else if (appliedDiscount) {
#       // this is either manipulation or an unknown code path. Block the order.
#       throw new Error("Ungültiger Rabatt-Code. Bitte neu eingeben.");
#   }
#
# Trifft normale VALID_DISCOUNTS-Codes (haben kein couponId, starten nicht mit LOYAL)
# → Bestellung kann nie abgeschickt werden wenn so ein Code eingelöst ist.
#
# Fix: Den Block so umschreiben dass normale VALID_DISCOUNTS-Codes korrekt verarbeitet
# werden, statt einen Error zu werfen.
# ════════════════════════════════════════════════════════════

OLD_THROW = '''                } else if (appliedDiscount) {
                    // appliedDiscount is set but has no valid couponId or LOYAL code —
                    // this is either manipulation or an unknown code path. Block the order.
                    throw new Error("Ungültiger Rabatt-Code. Bitte neu eingeben.");
                }'''

NEW_THROW = '''                } else if (appliedDiscount?.code) {
                    // --- Normal VALID_DISCOUNTS code (no couponId, no LOYAL prefix) ---
                    // e.g. referral codes, static discount codes defined in VALID_DISCOUNTS
                    const staticDef = VALID_DISCOUNTS[appliedDiscount.code];
                    if (!staticDef) {
                        throw new Error("Ungültiger Rabatt-Code. Bitte neu eingeben.");
                    }
                    // SECURITY: Use value from VALID_DISCOUNTS, not from client appliedDiscount
                    if (staticDef.type === "percent") {
                        verifiedDiscountAmount = serverSubtotal * (staticDef.value / 100);
                    } else {
                        verifiedDiscountAmount = staticDef.value || 0;
                    }
                    savedCouponInfo = { code: appliedDiscount.code, type: staticDef.type, value: staticDef.value };
                }'''

if OLD_THROW in txt:
    txt = txt.replace(OLD_THROW, NEW_THROW, 1)
    fixes.append("FIX-1 (Bug 2): placeOrder — else-if-Block verarbeitet jetzt VALID_DISCOUNTS-Codes statt Error zu werfen")
    print("✅ FIX-1 angewendet: placeOrder else-if-Block gefixt")
else:
    print("❌ FIX-1 NICHT gefunden — exakter String fehlt. Suche Variante...")
    # Fallback: suche nach dem throw-Kommentar
    alt = re.search(
        r'(\} else if \(appliedDiscount\) \{[^\}]{0,300}?throw new Error\("Ungültiger Rabatt-Code\. Bitte neu eingeben\."\);\s*\})',
        txt, re.DOTALL
    )
    if alt:
        txt = txt.replace(alt.group(0), NEW_THROW, 1)
        fixes.append("FIX-1b (Bug 2): placeOrder else-if-Block (Variante) gefixt")
        print("✅ FIX-1b angewendet (Variante)")
    else:
        print("   → Fallback auch nicht gefunden. Bitte manuell prüfen.")

# ════════════════════════════════════════════════════════════
# FIX 2 — Bug 1: Bundle-Qty-Steuerung im Warenkorb
#
# addBundleToCart() ist bereits korrekt (hat qty++).
# Das Problem: Im Warenkorb (updateCartDisplay) haben Bundle-Items
# keine −/+ Buttons, daher kann man die Menge nicht erhöhen/verringern.
#
# Lösung: changeBundleQty()-Funktion hinzufügen und im Cart-HTML
# für Bundle-Items Qty-Buttons einfügen.
# ════════════════════════════════════════════════════════════

# Prüfe ob changeBundleQty bereits existiert
if 'function changeBundleQty' in txt:
    print("ℹ️  changeBundleQty bereits vorhanden — kein Fix nötig")
else:
    # Füge changeBundleQty nach addBundleToCart ein
    INSERT_AFTER = '            manageMysteryVape(); // BUG-04 FIX: Mystery Vape bei Bundle-Kauf korrekt auslösen\n            saveUserCart();\n            updateCartDisplay();\n            showToast(`🎁 „${esc(bundle.name)}" zum Warenkorb hinzugefügt!`);\n        }'

    NEW_FUNC = INSERT_AFTER + '''

        function changeBundleQty(bundleId, delta) {
            const item = cart.find(i => i.bundleId === bundleId);
            if (!item) return;
            const BUNDLE_MAX_QTY = 10;
            const newQty = (item.qty || 1) + delta;
            if (newQty <= 0) {
                cart = cart.filter(i => i.bundleId !== bundleId);
                showToast('🗑️ Bundle entfernt');
            } else if (newQty > BUNDLE_MAX_QTY) {
                showToast(`⚠️ Maximal ${BUNDLE_MAX_QTY}× pro Bundle`, "error");
                return;
            } else {
                item.qty = newQty;
            }
            manageMysteryVape();
            saveUserCart();
            updateCartDisplay();
        }'''

    if INSERT_AFTER in txt:
        txt = txt.replace(INSERT_AFTER, NEW_FUNC, 1)
        fixes.append("FIX-2a (Bug 1): changeBundleQty() Funktion hinzugefügt")
        print("✅ FIX-2a: changeBundleQty() eingefügt")
    else:
        print("⚠️  FIX-2a: Insert-Stelle nicht gefunden, suche Alternative...")
        alt2 = 'showToast(`🎁 „${esc(bundle.name)}" zum Warenkorb hinzugefügt!`);\n        }'
        if alt2 in txt:
            txt = txt.replace(alt2,
                alt2 + '''\n\n        function changeBundleQty(bundleId, delta) {
            const item = cart.find(i => i.bundleId === bundleId);
            if (!item) return;
            const BUNDLE_MAX_QTY = 10;
            const newQty = (item.qty || 1) + delta;
            if (newQty <= 0) {
                cart = cart.filter(i => i.bundleId !== bundleId);
                showToast('🗑️ Bundle entfernt');
            } else if (newQty > BUNDLE_MAX_QTY) {
                showToast(`⚠️ Maximal ${BUNDLE_MAX_QTY}× pro Bundle`, "error");
                return;
            } else {
                item.qty = newQty;
            }
            manageMysteryVape();
            saveUserCart();
            updateCartDisplay();
        }''', 1)
            fixes.append("FIX-2a-alt: changeBundleQty() eingefügt (Alternative)")
            print("✅ FIX-2a-alt angewendet")

# ════════════════════════════════════════════════════════════
# FIX 3 — Bundle Cart-Item HTML: Qty-Buttons hinzufügen
#
# Suche den updateCartDisplay-Teil der Bundle-Items rendert
# und füge −/+ Buttons ein wenn noch nicht vorhanden.
# ════════════════════════════════════════════════════════════

# Suche den Bundle-spezifischen Cart-HTML-Block
# Typisches Muster in updateCartDisplay: item.isBundle check + HTML template

lines = txt.split('\n')

# Finde updateCartDisplay und suche den isBundle-HTML-Render-Block darin
in_update = False
bundle_html_start = None
for i, l in enumerate(lines):
    if 'function updateCartDisplay' in l:
        in_update = True
    if in_update and 'isBundle' in l and ('cart-item' in l or 'innerHTML' in l or ('`' in l and 'bundle' in l.lower())):
        bundle_html_start = i
        print(f"\n  Bundle-Cart-HTML Zeile {i+1}: {l.strip()[:80]}")
        # Zeige Kontext
        for j in range(max(0,i-2), min(len(lines), i+40)):
            print(f"  {j+1:>5}: {lines[j]}")
        break
    if in_update and i > 5200:
        break

# Gezielt: suche den HTML-String der ein Bundle-Cart-Item rendert ohne qty-btn
print("\n\n═══ Suche Bundle-Cart-Item ohne qty-btn ═══")
for i, l in enumerate(lines):
    if ('bundleId' in l or 'isBundle' in l) and 'cart-item' in ''.join(lines[max(0,i-5):i+30]):
        ctx = lines[max(0,i-5):i+35]
        ctx_str = '\n'.join(ctx)
        if 'qty-btn' not in ctx_str and 'changeBundleQty' not in ctx_str and 'cart-item' in ctx_str:
            print(f"\n  Möglicher Bundle-Cart-Block ohne qty-btn ab Zeile {i+1-5}:")
            for j in range(max(0,i-5), min(len(lines), i+35)):
                print(f"  {j+1:>5}: {lines[j]}")
            break

# ════════════════════════════════════════════════════════════
# SCHREIBEN
# ════════════════════════════════════════════════════════════
print("\n\n══════════ ERGEBNIS ══════════")
if txt != original:
    SRC.write_text(txt, encoding='utf-8')
    print(f"✅ index.html gespeichert. {len(fixes)} Fix(e):")
    for f in fixes:
        print(f"   • {f}")
else:
    print("⚠️  Keine Änderungen — Muster nicht gefunden")

print(f"\n   Backup: {bak.name}")
