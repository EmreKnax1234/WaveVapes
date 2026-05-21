#!/usr/bin/env python3
"""
WaveVapes FIX PART 2 — Bundle-Qty-Buttons im Warenkorb
Fügt −/+ Steuerung in das Bundle-Cart-Item HTML ein.
"""
import shutil
from pathlib import Path

SRC = Path(__file__).parent / 'index.html'
bak = SRC.with_suffix('.html.fix2_backup')
shutil.copy2(SRC, bak)

txt = SRC.read_text(encoding='utf-8', errors='replace')
original = txt
fixes = []

# ════════════════════════════════════════════════════════════
# Das Bundle-Cart-Item HTML (Zeile 5161–5173+) hat diese Struktur:
#
#   <div class="flex items-center gap-3" style="flex-shrink:0;margin-left:12px">
#       <div class="font-bold text-xl whitespace-nowrap" style="color:#fbbf24">${bundleTotal} €</div>
#       ${item.selectedFlavors ... ? `<button ...edit...</button>` : ''}
#   </div>
#
# Wir ersetzen den inneren flex-Bereich um Qty-Buttons hinzuzufügen.
# ════════════════════════════════════════════════════════════

OLD_BUNDLE_CONTROLS = '''                        <div class="flex items-center gap-3" style="flex-shrink:0;margin-left:12px">
                             <div class="font-bold text-xl whitespace-nowrap" style="color:#fbbf24">${bundleTotal} €</div>
                             ${item.selectedFlavors && item.selectedFlavors.length ? `<button onclick="editBundleFlavors(\'${item.bundleId}\'); event.stopImmediatePropagation()" title="Sorten ändern" style="width:32px;height:32px;border-radius:10px;background:rgba(103,232,249,.1);border:1px solid rgba(103,232,249,.25);color:#67e8f9;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0" onmouseover="this.style.background=\'rgba(103,232,249,.22)\'" onmouseout="this.style.background=\'rgba(103,232,249,.1)\'"><i class="fa-solid fa-pen"></i></button>` : ''}'''

NEW_BUNDLE_CONTROLS = '''                        <div class="flex flex-col items-end gap-2" style="flex-shrink:0;margin-left:12px">
                             <div class="font-bold text-xl whitespace-nowrap" style="color:#fbbf24">${bundleTotal} €</div>
                             <div class="flex items-center gap-2">
                                 <button onclick="changeBundleQty('${item.bundleId}', -1); event.stopImmediatePropagation()" class="qty-btn" style="width:30px;height:30px;border-radius:8px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0" title="Weniger">−</button>
                                 <span style="font-size:14px;font-weight:700;color:#fff;min-width:18px;text-align:center">${item.qty}</span>
                                 <button onclick="changeBundleQty('${item.bundleId}', +1); event.stopImmediatePropagation()" class="qty-btn" style="width:30px;height:30px;border-radius:8px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0" title="Mehr">+</button>
                                 ${item.selectedFlavors && item.selectedFlavors.length ? `<button onclick="editBundleFlavors('${item.bundleId}'); event.stopImmediatePropagation()" title="Sorten ändern" style="width:30px;height:30px;border-radius:8px;background:rgba(103,232,249,.1);border:1px solid rgba(103,232,249,.25);color:#67e8f9;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0"><i class="fa-solid fa-pen"></i></button>` : ''}
                             </div>
                         </div>'''

if OLD_BUNDLE_CONTROLS in txt:
    txt = txt.replace(OLD_BUNDLE_CONTROLS, NEW_BUNDLE_CONTROLS, 1)
    fixes.append("FIX-3 (Bug 1): Bundle-Cart-Item bekommt −/+ Qty-Buttons")
    print("✅ FIX-3: Bundle Qty-Buttons im Warenkorb eingefügt")
else:
    print("❌ FIX-3: Exakter String nicht gefunden — versuche Variante...")
    # Suche mit flexibleren Whitespace
    import re
    pattern = re.compile(
        r'(<div class="flex items-center gap-3" style="flex-shrink:0;margin-left:12px">\s*'
        r'<div class="font-bold text-xl whitespace-nowrap" style="color:#fbbf24">\$\{bundleTotal\} €</div>\s*'
        r'\$\{item\.selectedFlavors)',
        re.DOTALL
    )
    m = pattern.search(txt)
    if m:
        # Finde das Ende dieses Blocks (schließendes </div> nach dem ternary)
        start = m.start()
        # Suche nach dem Ende des äußeren flex-divs
        end_marker = "\n                        </div>"
        end_pos = txt.find(end_marker, start)
        if end_pos > 0:
            old_block = txt[start:end_pos]
            print(f"  Gefunden (Variante): {old_block[:100]}...")
            new_block = NEW_BUNDLE_CONTROLS
            txt = txt[:start] + new_block + txt[end_pos:]
            fixes.append("FIX-3b (Bug 1): Bundle Qty-Buttons (Variante)")
            print("✅ FIX-3b angewendet")
        else:
            print("   End-Marker nicht gefunden")
    else:
        print("   Auch Variante nicht gefunden")
        # Zeige was wirklich da steht
        lines = txt.split('\n')
        for i, l in enumerate(lines):
            if 'bundleTotal' in l and 'fbbf24' in l:
                print(f"\n  Aktueller Code um Zeile {i+1}:")
                for j in range(max(0,i-3), min(len(lines),i+10)):
                    print(f"  {j+1}: {repr(lines[j])}")
                break

# ════════════════════════════════════════════════════════════
# SCHREIBEN
# ════════════════════════════════════════════════════════════
print(f"\n══════════ ERGEBNIS ══════════")
if txt != original:
    SRC.write_text(txt, encoding='utf-8')
    print(f"✅ index.html gespeichert. {len(fixes)} Fix(e):")
    for f in fixes:
        print(f"   • {f}")
else:
    print("⚠️  Keine Änderungen — Muster nicht gefunden")
print(f"\n   Backup: {bak.name}")
