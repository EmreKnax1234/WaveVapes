#!/usr/bin/env python3
"""
BUG-1 FIX: Ersetzt das kaputte Replacement-Character (U+FFFD / ??? / 0xEF BF BD)
im showSwipeHint der index.html durch den korrekten Rechtspfeil (→).

Ausführen:
    python3 fix_bug1.py
"""
import os

path = os.path.join(os.path.dirname(__file__), "index.html")

with open(path, "rb") as f:
    raw = f.read()

# Das kaputte Zeichen: UTF-8-Encoding von U+FFFD ist 0xEF 0xBF 0xBD (3 Bytes)
# Es erscheint dreimal hintereinander als "���" (9 Bytes total)
broken = b"\xef\xbf\xbd\xef\xbf\xbd\xef\xbf\xbd"
# Ersetzen durch → (U+2192), UTF-8: 0xE2 0x86 0x92
fixed  = "\u2192".encode("utf-8")

count = raw.count(broken)
if count == 0:
    print("Zeichen nicht gefunden — Bug möglicherweise schon gefixt.")
else:
    patched = raw.replace(broken, fixed)
    with open(path, "wb") as f:
        f.write(patched)
    print(f"✅ Bug 1 gefixt: {count} Vorkommen von '���' durch '→' ersetzt.")
