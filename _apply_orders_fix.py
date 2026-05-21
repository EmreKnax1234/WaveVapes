#!/usr/bin/env python3
"""
Fix: loadOrders() bekommt Error-Handler + Client-Side Sort Fallback.
Außerdem: switchTab(1) ruft loadOrders() auf falls _ordAllDocs leer.
"""
from pathlib import Path
import shutil, re

SRC = Path(__file__).parent / 'admin.html'
BAK = Path(__file__).parent / 'admin.html.orders_fix_backup'

# Backup
shutil.copy2(SRC, BAK)
print(f"Backup: {BAK}")

content = SRC.read_text(encoding='utf-8', errors='replace')

# ── FIX 1: loadOrders() – Error-Handler + Fallback ohne orderBy ──────────
OLD_LOAD = """function loadOrders() {
    // Bug Fix #4: remove duplicate teardown — after the first block _ordersUnsub is
    // always null, so the second identical check was always false (dead code).
    if (_ordersUnsub) { _ordersUnsub(); _ordersUnsub = null; }
    _ordersUnsub = db.collection('orders').orderBy('date','desc').onSnapshot(snap => {
        _ordAllDocs = snap.docs;
        ordRenderTable();
    });
}"""

NEW_LOAD = """function loadOrders() {
    // Bug Fix #4: remove duplicate teardown — after the first block _ordersUnsub is
    // always null, so the second identical check was always false (dead code).
    if (_ordersUnsub) { _ordersUnsub(); _ordersUnsub = null; }
    // BUG-ORD-01 FIX: Added error handler so a missing Firestore composite index
    // (required for orderBy('date','desc')) does not silently leave _ordAllDocs empty.
    // Fallback: fetch without orderBy and sort client-side so orders always appear.
    _ordersUnsub = db.collection('orders').orderBy('date','desc').onSnapshot(snap => {
        _ordAllDocs = snap.docs;
        ordRenderTable();
    }, async (err) => {
        console.error('loadOrders onSnapshot error:', err);
        // Fallback: no orderBy — avoids composite index requirement
        try {
            if (_ordersUnsub) { _ordersUnsub(); _ordersUnsub = null; }
            _ordersUnsub = db.collection('orders').onSnapshot(snap => {
                // Sort client-side by date desc
                _ordAllDocs = snap.docs.slice().sort((a, b) => {
                    const ta = a.data().date ? a.data().date.toMillis() : 0;
                    const tb = b.data().date ? b.data().date.toMillis() : 0;
                    return tb - ta;
                });
                ordRenderTable();
            }, (err2) => {
                console.error('loadOrders fallback error:', err2);
                const tbody = document.getElementById('orders-tbody');
                if (tbody) tbody.innerHTML = `<tr><td colspan="6"><div class="ord-empty"><i class="fa-solid fa-circle-exclamation" style="color:#f87171"></i><br>Bestellungen konnten nicht geladen werden:<br><span style="font-size:11px;color:#f87171">${err2.message}</span></div></td></tr>`;
            });
        } catch(e) { console.error('loadOrders fallback setup error:', e); }
    });
}"""

if OLD_LOAD in content:
    content = content.replace(OLD_LOAD, NEW_LOAD)
    print("✅ FIX 1 angewendet: loadOrders() Error-Handler + Fallback")
else:
    print("⚠️  FIX 1 NICHT gefunden — exakter Text weicht ab, manuell prüfen!")
    # Fuzzy-Suche zur Diagnose
    idx = content.find('function loadOrders()')
    if idx >= 0:
        print(f"   loadOrders() gefunden bei Zeichen {idx}")
        print(f"   Inhalt: {repr(content[idx:idx+300])}")

# ── FIX 2: switchTab – Tab 1 lädt Bestellungen neu wenn _ordAllDocs leer ──
# Finde "if(n===4)loadCoupons();" und füge davor Tab-1-Check ein
OLD_TAB = "    if(n===4)loadCoupons();"
NEW_TAB = """    if(n===1) {
        // BUG-ORD-02 FIX: Reload orders when switching to tab 1 if listener
        // is not active (e.g. after permission error or first navigation).
        if (!_ordersUnsub || _ordAllDocs.length === 0) loadOrders();
    }
    if(n===4)loadCoupons();"""

if OLD_TAB in content:
    content = content.replace(OLD_TAB, NEW_TAB)
    print("✅ FIX 2 angewendet: switchTab(1) triggert loadOrders() falls nötig")
else:
    print("⚠️  FIX 2 NICHT gefunden")

# Speichern
SRC.write_text(content, encoding='utf-8')
print(f"\n✅ admin.html gespeichert ({len(content)//1024} KB)")
print("   Backup liegt unter admin.html.orders_fix_backup")
