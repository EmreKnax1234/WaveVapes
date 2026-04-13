#!/usr/bin/env python3
"""
WaveVapes Bug-Fix-Script — automatisch generiert von Claude
Behebt 3 Bugs in index.html:
  Bug 1: XSS — email unescaped in submitPasswordReset innerHTML
  Bug 2: Passwort-Mindestlänge — Inkonsistenz zwischen Placeholder (6) und Validierung (8)
  Bug 3: password.trim() — löscht lautlos gültige Leerzeichen aus Passwörtern
"""

import os, shutil, sys

TARGET = os.path.join(os.path.dirname(__file__), "index.html")
BACKUP = TARGET + ".bak"

if not os.path.exists(TARGET):
    print("❌ index.html nicht gefunden!")
    input("Enter drücken zum Beenden...")
    sys.exit(1)

# Backup erstellen
shutil.copy2(TARGET, BACKUP)
print(f"💾 Backup erstellt: {BACKUP}")

with open(TARGET, "r", encoding="utf-8") as f:
    content = f.read()

original = content
fixes = []

# ─────────────────────────────────────────────────────────────────────
# BUG 2a FIX: Placeholder "min. 6 Zeichen" → "min. 8 Zeichen"
# ─────────────────────────────────────────────────────────────────────
old = 'placeholder="Passwort (min. 6 Zeichen)"'
new = 'placeholder="Passwort (min. 8 Zeichen)"'
if old in content:
    content = content.replace(old, new, 1)
    fixes.append("✅ Bug 2a: Placeholder '6 Zeichen' → '8 Zeichen' korrigiert")
else:
    fixes.append("⚠️  Bug 2a: Pattern nicht gefunden (möglicherweise schon gepatcht)")

# ─────────────────────────────────────────────────────────────────────
# BUG 2b FIX: Firebase weak-password Fehlermeldung 6→8 Zeichen
# ─────────────────────────────────────────────────────────────────────
old = ": e.code === 'auth/weak-password' ? 'Passwort zu schwach (min. 6 Zeichen).'"
new = ": e.code === 'auth/weak-password' ? 'Passwort zu schwach (min. 8 Zeichen).'"
if old in content:
    content = content.replace(old, new, 1)
    fixes.append("✅ Bug 2b: Firebase-Fehlermeldung '6 Zeichen' → '8 Zeichen' korrigiert")
else:
    fixes.append("⚠️  Bug 2b: Pattern nicht gefunden (möglicherweise schon gepatcht)")

# ─────────────────────────────────────────────────────────────────────
# BUG 3a FIX: registerUser — password.trim() entfernt
# ─────────────────────────────────────────────────────────────────────
old = ('            const password = document.getElementById("register-password").value.trim();\n'
       '            if (!email || password.length < 8)')
new = ('            const password = document.getElementById("register-password").value; // BUG-3 FIX: kein .trim() – Leerzeichen im Passwort sind gültig\n'
       '            if (!email || password.length < 8)')
if old in content:
    content = content.replace(old, new, 1)
    fixes.append("✅ Bug 3a: registerUser — password.trim() entfernt")
else:
    fixes.append("⚠️  Bug 3a: Pattern nicht gefunden (möglicherweise schon gepatcht)")

# ─────────────────────────────────────────────────────────────────────
# BUG 3b FIX: loginUser — password.trim() entfernt
# ─────────────────────────────────────────────────────────────────────
old = ('            const password = document.getElementById("login-password").value.trim();\n'
       '            if (!email || !password)')
new = ('            const password = document.getElementById("login-password").value; // BUG-3 FIX: kein .trim() – Leerzeichen im Passwort sind gültig\n'
       '            if (!email || !password)')
if old in content:
    content = content.replace(old, new, 1)
    fixes.append("✅ Bug 3b: loginUser — password.trim() entfernt")
else:
    fixes.append("⚠️  Bug 3b: Pattern nicht gefunden (möglicherweise schon gepatcht)")

# ─────────────────────────────────────────────────────────────────────
# BUG 1 FIX: XSS — esc(email) statt email in innerHTML
# ─────────────────────────────────────────────────────────────────────
old = "Wir haben einen Passwort-Reset-Link an <strong>' + email + '</strong> geschickt."
new = "Wir haben einen Passwort-Reset-Link an <strong>' + esc(email) + '</strong> geschickt."
if old in content:
    content = content.replace(old, new, 1)
    fixes.append("✅ Bug 1:  XSS-Lücke — email mit esc() escaped in submitPasswordReset")
else:
    fixes.append("⚠️  Bug 1: Pattern nicht gefunden (möglicherweise schon gepatcht)")

# ─────────────────────────────────────────────────────────────────────
# Schreiben wenn Änderungen vorhanden
# ─────────────────────────────────────────────────────────────────────
print("\n" + "─" * 60)
print("  BUG-FIX ERGEBNIS")
print("─" * 60)
for f in fixes:
    print(" ", f)

if content != original:
    with open(TARGET, "w", encoding="utf-8") as f:
        f.write(content)
    changed = sum(1 for f in fixes if f.startswith("  ✅"))
    print(f"\n🎉 {sum(1 for x in fixes if '✅' in x)} Fix(es) angewendet und gespeichert!")
    print(f"   Backup liegt unter: {BACKUP}")
else:
    print("\nℹ️  Keine Änderungen — alle Fixes waren bereits vorhanden.")
    os.remove(BACKUP)

print("\n" + "─" * 60)
input("\nEnter drücken zum Beenden...")
