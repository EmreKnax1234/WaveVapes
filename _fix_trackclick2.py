#!/usr/bin/env python3
"""Fix: trackClick ts-Feld — serverTimestamp() schlägt fehl wenn extra-Payload
gemergd wird (Firestore-Compat-Bug mit spread + FieldValue).
Fix: ts als new Date().toISOString() — immer serialisierbar, nie ein Uc-Objekt.
"""
import shutil
from pathlib import Path

SRC = Path(__file__).parent / 'index.html'
bak = SRC.with_suffix('.html.ts_backup')
shutil.copy2(SRC, bak)

txt = SRC.read_text(encoding='utf-8', errors='replace')

OLD = '''        function trackClick(label, extra = {}) {
            const key = label;
            const now = Date.now();
            // Ignore same label within 800 ms (e.g. rapid +/- taps)
            if (_trackDebounce[key] && now - _trackDebounce[key] < 800) return;
            _trackDebounce[key] = now;
            const payload = {
                label,
                isGuest:   !currentUser,
                userId:    currentUser ? currentUser.uid  : null,
                userEmail: currentUser ? currentUser.email : null,
                page:      window.location.pathname + (window.location.search || ''),
                ts:        firebase.firestore.FieldValue.serverTimestamp(),
                ...extra
            };
            db.collection('click_events').add(payload).catch(err => {
                console.debug('trackClick write failed (non-critical):', err.code);
            });
        }'''

NEW = '''        function trackClick(label, extra = {}) {
            const key = label;
            const now = Date.now();
            // Ignore same label within 800 ms (e.g. rapid +/- taps)
            if (_trackDebounce[key] && now - _trackDebounce[key] < 800) return;
            _trackDebounce[key] = now;
            // BUG FIX: serverTimestamp() als FieldValue funktioniert nicht zuverlässig
            // wenn es zusammen mit ...extra (spread) in ein Payload-Objekt gemergd wird —
            // Firestore-Compat serialisiert das als "custom Uc object" und wirft einen Fehler.
            // Fix: ISO-String statt FieldValue — immer plain serialisierbar.
            const payload = {
                label,
                isGuest:   !currentUser,
                userId:    currentUser ? currentUser.uid  : null,
                userEmail: currentUser ? currentUser.email : null,
                page:      window.location.pathname + (window.location.search || ''),
                ts:        new Date().toISOString(),
                ...extra
            };
            db.collection('click_events').add(payload).catch(err => {
                console.debug('trackClick write failed (non-critical):', err.code);
            });
        }'''

if OLD in txt:
    txt = txt.replace(OLD, NEW, 1)
    SRC.write_text(txt, encoding='utf-8')
    print("✅ Fix angewendet: trackClick ts → new Date().toISOString()")
    print("   Backup: index.html.ts_backup")
    print("\n🎉 Bestellungen sollten jetzt funktionieren!")
    print("   → Seite neu laden (Cmd+Shift+R) und nochmal testen.")
else:
    print("❌ Exakter String nicht gefunden — Whitespace-Problem?")
    # Zeige was wirklich da steht
    lines = txt.split('\n')
    for i, l in enumerate(lines):
        if 'function trackClick' in l:
            for j in range(i, min(len(lines), i+20)):
                print(repr(lines[j]))
            break
