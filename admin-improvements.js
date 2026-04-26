/**
 * admin-improvements.js  — v1.1 (bugfixes)
 * WaveVapes Admin Panel – Erweiterungen
 *
 * BUGFIXES in v1.1:
 * - BUG-FIX 1: injectMobileSidebar() wurde doppelt aufgerufen → einmaliger Aufruf
 * - BUG-FIX 2: blur/change Race-Condition beim Inline-Status-Update → blur-Listener
 *              wird vor change-Verarbeitung entfernt, kein Badge-Flackern mehr
 * - BUG-FIX 3: injectTodayOrderFilter() entfernt — ord-date-filter Select in
 *              admin-tab-1.html übernimmt diese Funktion bereits; Duplikat würde
 *              zwei konkurrierende Filter-Mechanismen erzeugen
 * - BUG-FIX 4: Stornierte Bestellungen werden im Heute-Umsatz nicht mehr gezählt
 */

(function () {
    'use strict';

    /* ═══════════════════════════════════════════════
       HELPERS
    ═══════════════════════════════════════════ */
    const g = id => document.getElementById(id);
    function fmt(n) { return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function today() {
        const d = new Date(); d.setHours(0, 0, 0, 0); return d;
    }

    /* ═══════════════════════════════════════════════
       1. HEUTE-STATS WIDGET (injects above main content)
    ═══════════════════════════════════════════ */
    async function injectTodayStats() {
        if (g('wv-today-stats') || typeof db === 'undefined') return;

        const widget = document.createElement('div');
        widget.id = 'wv-today-stats';
        widget.style.cssText = [
            'display:flex', 'gap:10px', 'flex-wrap:wrap',
            'background:linear-gradient(135deg,rgba(103,232,249,.04),rgba(167,139,250,.03))',
            'border:1px solid rgba(103,232,249,.12)',
            'border-radius:20px', 'padding:14px 18px',
            'margin-bottom:16px',
            'animation:wvStatsIn .4s cubic-bezier(0.34,1.56,0.64,1)',
        ].join(';');

        widget.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:100px">
                <div style="width:34px;height:34px;border-radius:10px;background:rgba(103,232,249,.1);border:1px solid rgba(103,232,249,.2);display:flex;align-items:center;justify-content:center;font-size:15px;color:#67e8f9">
                    <i class="fa-solid fa-calendar-day"></i>
                </div>
                <div>
                    <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.3)">Heute</div>
                    <div id="wv-ts-date" style="font-size:12px;font-weight:600;color:rgba(255,255,255,.7)">—</div>
                </div>
            </div>
            <div class="wv-ts-kpi" id="wv-ts-orders" title="Bestellungen heute">
                <span class="wv-ts-icon" style="color:#67e8f9"><i class="fa-solid fa-receipt"></i></span>
                <span class="wv-ts-num" id="wv-ts-orders-val">—</span>
                <span class="wv-ts-lbl">Bestellungen</span>
            </div>
            <div class="wv-ts-kpi" id="wv-ts-revenue" title="Umsatz heute (ohne Storniert)">
                <span class="wv-ts-icon" style="color:#34d399"><i class="fa-solid fa-euro-sign"></i></span>
                <span class="wv-ts-num" id="wv-ts-revenue-val" style="color:#34d399">—</span>
                <span class="wv-ts-lbl">Umsatz</span>
            </div>
            <div class="wv-ts-kpi" id="wv-ts-pending" title="Offene Bestellungen (Zahlung erwartet)">
                <span class="wv-ts-icon" style="color:#facc15"><i class="fa-solid fa-hourglass-half"></i></span>
                <span class="wv-ts-num" id="wv-ts-pending-val" style="color:#facc15">—</span>
                <span class="wv-ts-lbl">Offen</span>
            </div>
            <div class="wv-ts-kpi" id="wv-ts-users" title="Neue Nutzer heute">
                <span class="wv-ts-icon" style="color:#a78bfa"><i class="fa-solid fa-user-plus"></i></span>
                <span class="wv-ts-num" id="wv-ts-users-val" style="color:#a78bfa">—</span>
                <span class="wv-ts-lbl">Neue User</span>
            </div>
            <button id="wv-ts-refresh" title="Aktualisieren" style="width:30px;height:30px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.35);font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-left:auto;align-self:center;transition:all .15s">
                <i class="fa-solid fa-rotate-right"></i>
            </button>
        `;

        if (!g('wv-admin-imp-css')) {
            const s = document.createElement('style');
            s.id = 'wv-admin-imp-css';
            s.textContent = `
                @keyframes wvStatsIn { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
                @keyframes wvSpinOnce { to { transform:rotate(360deg); } }
                .wv-ts-kpi {
                    display:flex; flex-direction:column; align-items:center; justify-content:center;
                    padding:8px 14px; border-radius:12px; gap:2px;
                    background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06);
                    min-width:80px; cursor:default; transition:all .2s;
                }
                .wv-ts-kpi:hover { background:rgba(255,255,255,.06); border-color:rgba(255,255,255,.12); }
                .wv-ts-icon { font-size:13px; }
                .wv-ts-num { font-family:'JetBrains Mono',monospace; font-size:18px; font-weight:700; color:#fff; line-height:1.1; }
                .wv-ts-lbl { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:rgba(255,255,255,.28); margin-top:1px; }

                /* Live Clock */
                #wv-live-clock {
                    font-family:'JetBrains Mono',monospace; font-size:11px;
                    color:rgba(255,255,255,.35); display:flex; align-items:center; gap:5px;
                    padding:4px 10px; border-radius:99px;
                    background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.06);
                }
                #wv-live-clock .wv-clock-dot {
                    width:6px; height:6px; border-radius:50%; background:#34d399;
                    box-shadow:0 0 6px #34d399; animation:wvClockPulse 2s ease-in-out infinite;
                }
                @keyframes wvClockPulse { 0%,100%{opacity:1} 50%{opacity:.3} }

                /* Keyboard shortcut hints */
                .wv-kbd {
                    display:inline-flex; align-items:center; justify-content:center;
                    padding:1px 5px; border-radius:4px; font-size:9px; font-weight:700;
                    background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.15);
                    color:rgba(255,255,255,.4); font-family:'JetBrains Mono',monospace;
                    margin-left:4px;
                }

                /* Mobile swipe-to-close sidebar overlay */
                #wv-sidebar-overlay {
                    position:fixed; inset:0; z-index:49;
                    background:rgba(0,0,0,.5); backdrop-filter:blur(4px);
                    display:none;
                }
                @media (max-width:1023px) {
                    #wv-sidebar-overlay.active { display:block; animation:fadeIn .2s; }
                }
            `;
            document.head.appendChild(s);
        }

        const mainContent = document.querySelector('#tab-content-1')?.parentElement
            || document.querySelector('[id^="tab-content-"]')?.parentElement;
        if (mainContent) {
            mainContent.insertBefore(widget, mainContent.firstChild);
        }

        const dateEl = g('wv-ts-date');
        if (dateEl) {
            dateEl.textContent = new Date().toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' });
        }

        g('wv-ts-refresh')?.addEventListener('click', () => {
            const icon = g('wv-ts-refresh')?.querySelector('i');
            if (icon) { icon.style.animation = 'wvSpinOnce .5s linear'; setTimeout(() => icon.style.animation = '', 500); }
            loadTodayStats();
        });

        loadTodayStats();
    }

    async function loadTodayStats() {
        if (typeof db === 'undefined') return;
        try {
            const start = firebase.firestore.Timestamp.fromDate(today());

            const ordSnap = await db.collection('orders')
                .where('createdAt', '>=', start)
                .get().catch(() => null);

            if (ordSnap) {
                const orders  = ordSnap.docs.map(d => d.data());
                const total   = orders.length;
                // BUG-FIX 4: Stornierte Bestellungen aus Umsatz ausschließen
                const revenue = orders
                    .filter(o => (o.status || '') !== 'Storniert')
                    .reduce((s, o) => s + (o.total || o.totalPrice || 0), 0);
                const pending = orders.filter(o => (o.status || '').includes('Zahlung')).length;

                setKpi('wv-ts-orders-val', total);
                setKpi('wv-ts-revenue-val', fmt(revenue) + ' €');
                setKpi('wv-ts-pending-val', pending);
            }

            const usrSnap = await db.collection('users')
                .where('createdAt', '>=', start)
                .get().catch(() => null);

            if (usrSnap) {
                setKpi('wv-ts-users-val', usrSnap.size);
            }
        } catch (e) {
            console.warn('[wv-admin-improvements] loadTodayStats:', e.message);
        }
    }

    function setKpi(id, val) {
        const el = g(id);
        if (!el) return;
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = 'wvStatsIn .3s ease';
        el.textContent = val;
    }

    /* ═══════════════════════════════════════════════
       2. LIVE-UHR IN DER TOPBAR
    ═══════════════════════════════════════════ */
    function injectLiveClock() {
        const topbarRight = document.querySelector('#admin-user-info')
            || document.querySelector('[id*="logout"], [onclick*="logout"]')?.closest('div')?.parentElement;

        if (!topbarRight || g('wv-live-clock')) return;

        const clock = document.createElement('div');
        clock.id = 'wv-live-clock';
        clock.innerHTML = '<div class="wv-clock-dot"></div><span id="wv-clock-time">--:--:--</span>';

        const insertTarget = topbarRight.parentElement;
        if (insertTarget) {
            insertTarget.insertBefore(clock, topbarRight);
        }

        function tick() {
            const el = g('wv-clock-time');
            if (el) el.textContent = new Date().toLocaleTimeString('de-DE');
        }
        tick();
        setInterval(tick, 1000);
    }

    /* ═══════════════════════════════════════════════
       3. KEYBOARD SHORTCUTS
    ═══════════════════════════════════════════ */
    const TAB_SHORTCUTS = { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7 };

    function initKeyboardShortcuts() {
        document.addEventListener('keydown', e => {
            if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;

            if ((e.ctrlKey || e.metaKey) && TAB_SHORTCUTS[e.key]) {
                e.preventDefault();
                const tabNum = TAB_SHORTCUTS[e.key];
                if (typeof switchTab === 'function') switchTab(tabNum);
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                const searchEl = g('order-search') || g('product-search') || document.querySelector('.ord-search');
                if (searchEl) {
                    e.preventDefault();
                    searchEl.focus();
                    searchEl.select();
                }
                return;
            }
        });

        setTimeout(() => {
            document.querySelectorAll('[onclick*="switchTab("]').forEach(btn => {
                const match = btn.getAttribute('onclick')?.match(/switchTab\((\d+)\)/);
                if (!match) return;
                const num = match[1];
                if (btn.querySelector('.wv-kbd')) return;
                const kbd = document.createElement('span');
                kbd.className = 'wv-kbd';
                kbd.textContent = '⌃' + num;
                btn.appendChild(kbd);
            });
        }, 1500);
    }

    /* ═══════════════════════════════════════════════
       4. MOBILE SIDEBAR OVERLAY
       BUG-FIX 1: initMobileSidebar nur einmal aufrufen
    ═══════════════════════════════════════════ */
    function initMobileSidebar() {
        if (g('wv-sidebar-overlay')) return; // Guard gegen Doppel-Init

        const overlay = document.createElement('div');
        overlay.id = 'wv-sidebar-overlay';
        document.body.appendChild(overlay);

        const sidebar = document.querySelector('.sidebar') || g('sidebar');
        if (!sidebar) return;

        const observer = new MutationObserver(() => {
            const isOpen = !sidebar.classList.contains('-translate-x-full')
                && !sidebar.classList.contains('hidden')
                && sidebar.getBoundingClientRect().left >= 0;
            overlay.classList.toggle('active', isOpen && window.innerWidth < 1024);
        });
        observer.observe(sidebar, { attributes: true, attributeFilter: ['class', 'style'] });

        overlay.addEventListener('click', () => {
            const closeBtn = document.querySelector('[onclick*="toggleSidebar"], [onclick*="sidebar"]');
            if (closeBtn) closeBtn.click();
            else if (typeof toggleSidebar === 'function') toggleSidebar();
            overlay.classList.remove('active');
        });
    }

    /* ═══════════════════════════════════════════════
       5. PRODUKT-LAGERBESTAND WIDGET
    ═══════════════════════════════════════════ */
    async function injectStockAlertWidget() {
        if (typeof db === 'undefined' || g('wv-stock-alert')) return;

        try {
            const snap = await db.collection('products')
                .where('stock', '<=', 5)
                .get().catch(() => null);

            if (!snap || snap.empty) return;

            const criticalItems = snap.docs
                .map(d => ({ name: d.data().name, stock: d.data().stock }))
                .filter(p => p.stock !== undefined && p.stock !== null)
                .sort((a, b) => a.stock - b.stock)
                .slice(0, 5);

            if (!criticalItems.length) return;

            const widget = document.createElement('div');
            widget.id = 'wv-stock-alert';
            widget.style.cssText = [
                'background:rgba(239,68,68,.05)',
                'border:1px solid rgba(239,68,68,.2)',
                'border-radius:16px',
                'padding:12px 16px',
                'margin-bottom:14px',
                'animation:wvStatsIn .4s ease',
            ].join(';');

            widget.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px">
                    <div style="font-size:12px;font-weight:700;color:#f87171;display:flex;align-items:center;gap:7px">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        Niedriger Lagerbestand (${criticalItems.length} Produkte)
                    </div>
                    <button onclick="this.closest('#wv-stock-alert').remove()" style="background:none;border:none;color:rgba(255,255,255,.3);font-size:12px;cursor:pointer">✕</button>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px">
                    ${criticalItems.map(p => `
                        <span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);color:#fca5a5">
                            ${escHtml(p.name)} <b style="color:${p.stock <= 0 ? '#f87171' : '#fbbf24'}">${p.stock <= 0 ? 'AUSVERKAUFT' : p.stock + 'x'}</b>
                        </span>`).join('')}
                </div>
            `;

            const mainContent = document.querySelector('#tab-content-1')?.parentElement;
            if (mainContent && g('wv-today-stats')) {
                mainContent.insertBefore(widget, g('wv-today-stats').nextSibling);
            } else if (mainContent) {
                mainContent.insertBefore(widget, mainContent.firstChild);
            }
        } catch (e) {
            console.warn('[wv-admin-improvements] injectStockAlertWidget:', e.message);
        }
    }

    function escHtml(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    /* ═══════════════════════════════════════════════
       6. BESTELLTABELLE: INLINE QUICK-STATUS
       BUG-FIX 2: blur/change Race-Condition behoben
       BUG-FIX 3: injectTodayOrderFilter() entfernt —
                  ord-date-filter Select in admin-tab-1.html übernimmt das
    ═══════════════════════════════════════════ */
    function patchOrdersTableForQuickStatus() {
        const tbody = g('orders-tbody');
        if (!tbody || tbody.dataset.wvPatched) return;
        tbody.dataset.wvPatched = '1';

        tbody.addEventListener('dblclick', async e => {
            const badge = e.target.closest('.status-badge, .ord-status');
            if (!badge) return;
            const row = badge.closest('tr');
            if (!row) return;

            // Bestellungs-ID aus data-Attribut oder onclick ermitteln
            const orderId = row.dataset.orderId
                || row.querySelector('[data-order-id]')?.dataset.orderId
                || row.getAttribute('onclick')?.match(/showOrderModal\(['"]([^'"]+)['"]\)/)?.[1];

            if (!orderId) return;

            const statuses = ['Zahlung erwartet','Wird bearbeitet','Versendet','Zugestellt','Storniert'];
            const current  = badge.textContent.trim();

            const sel = document.createElement('select');
            sel.style.cssText = 'background:#18181b;border:1px solid rgba(103,232,249,.4);border-radius:8px;padding:3px 8px;color:#fff;font-size:11px;font-weight:600;cursor:pointer;outline:none;color-scheme:dark;';
            statuses.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s; opt.textContent = s;
                if (s === current) opt.selected = true;
                sel.appendChild(opt);
            });

            const originalHTML = badge.innerHTML;
            const originalClass = badge.className;

            badge.innerHTML = '';
            badge.appendChild(sel);
            sel.focus();

            let committed = false; // Guard: verhindert blur-cleanup nach change

            // BUG-FIX 2: blur nur aufrufen wenn change noch nicht gefeuert hat
            const onBlur = () => {
                if (!committed) {
                    badge.innerHTML = originalHTML;
                    badge.className = originalClass;
                }
            };

            sel.addEventListener('blur', onBlur, { once: true });

            sel.addEventListener('change', async () => {
                committed = true;
                sel.removeEventListener('blur', onBlur); // Blur-Listener entfernen
                const newStatus = sel.value;
                sel.disabled = true;
                try {
                    await db.collection('orders').doc(orderId).update({ status: newStatus });
                    if (typeof showToast === 'function') showToast('✅ Status: ' + newStatus, 'success');
                    // Badge-Klasse aktualisieren
                    const cls = newStatus.split(' ')[0];
                    badge.className = originalClass.replace(/status-\S+|ord-st-\S+/g, '').trim()
                        + ' status-' + cls + ' ord-st-' + cls.toLowerCase();
                    badge.textContent = newStatus;
                } catch (err) {
                    badge.innerHTML = originalHTML;
                    badge.className = originalClass;
                    if (typeof showToast === 'function') showToast('❌ ' + err.message, 'error');
                }
            });
        });

        // Tooltip-Hint
        const hint = document.createElement('div');
        hint.style.cssText = 'font-size:10px;color:rgba(255,255,255,.18);text-align:right;padding:4px 18px 0;font-style:italic;pointer-events:none';
        hint.textContent = 'Tipp: Doppelklick auf Status → direktes Ändern';
        tbody.closest('table')?.parentElement?.appendChild(hint);
    }

    /* ═══════════════════════════════════════════════
       INIT
    ═══════════════════════════════════════════ */
    function waitForAdminReady() {
        if (typeof db === 'undefined' || typeof auth === 'undefined') {
            setTimeout(waitForAdminReady, 200);
            return;
        }

        auth.onAuthStateChanged(user => {
            if (!user) return;
            setTimeout(() => {
                injectTodayStats();
                injectLiveClock();
                initMobileSidebar(); // BUG-FIX 1: Nur einmal aufrufen (kein Duplikat mehr)
                initKeyboardShortcuts();
                injectStockAlertWidget();

                // Bestellungen-Tab beobachten für Quick-Status-Patch
                const ordTab = g('tab-content-1');
                if (ordTab) {
                    const ordObs = new MutationObserver(() => {
                        patchOrdersTableForQuickStatus();
                    });
                    ordObs.observe(ordTab, { childList: true, subtree: true });
                    patchOrdersTableForQuickStatus();
                }
                // BUG-FIX 3: injectTodayOrderFilter() wurde entfernt.
                // Die Funktion fügte einen redundanten "Heute"-Button ein,
                // obwohl admin-tab-1.html bereits ein ord-date-filter-Select hat.
            }, 800);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForAdminReady);
    } else {
        waitForAdminReady();
    }

    console.log('[wv-admin-improvements] v1.1 geladen ✓');
})();
