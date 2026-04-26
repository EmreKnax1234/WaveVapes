// ═══════════════════════════════════════════════════════════════════════════
//  STAISY FORTSCHRITT  —  Tab 19
//  Nur für den primären Superadmin sichtbar und bearbeitbar.
//  Datenhaltung in Firestore:  superadminPrivate/staisy_program
// ═══════════════════════════════════════════════════════════════════════════

// ── State ────────────────────────────────────────────────────────────────────
let _staisyLoaded      = false;
let _staisyOrders      = [];
let _staisyOrderIds    = new Set();
let _staisyCheckedIds  = new Set();
let _staisyRewards     = [];
let _staisyFilter      = 'staisy';

// ── Sidebar anzeigen, sobald Login-Status klar ist ───────────────────────────
(function staisyInitSidebar() {
    const TRY_MAX = 40;
    let attempts = 0;
    const timer = setInterval(() => {
        attempts++;
        if (typeof saIsPrimaryAdmin !== 'undefined') {
            clearInterval(timer);
            const el = document.getElementById('sidebar-19');
            if (el) el.style.display = saIsPrimaryAdmin ? '' : 'none';
        }
        if (attempts >= TRY_MAX) clearInterval(timer);
    }, 250);
})();

// ── Alles laden ───────────────────────────────────────────────────────────────
async function loadStaisyTab() {
    if (!saIsPrimaryAdmin) {
        showToast('⛔ Kein Zugriff – nur der primäre Superadmin', 'error');
        return;
    }

    if (!_staisyLoaded) {
        try {
            const [ordersSnap, progSnap] = await Promise.all([
                db.collection('orders').orderBy('createdAt', 'desc').limit(500).get(),
                db.collection('superadminPrivate').doc('staisy_program').get()
            ]);

            _staisyOrders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            if (progSnap.exists) {
                const data = progSnap.data();
                _staisyOrderIds   = new Set(data.staisyOrderIds  || []);
                _staisyCheckedIds = new Set(data.checkedOrderIds  || []);
                _staisyRewards    = (data.rewards || []).sort((a, b) => a.threshold - b.threshold);
            }
            _staisyLoaded = true;
        } catch (e) {
            console.error('[Staisy] Load error:', e);
            showToast('❌ Fehler beim Laden: ' + e.message, 'error');
            return;
        }
    }

    staisyRenderRewards();
    staisyRenderOrders();
    staisyRenderProgress();
}

// ── Fortschritts-Banner rendern ───────────────────────────────────────────────
function staisyRenderProgress() {
    const checkedCount = _staisyCheckedIds.size;
    document.getElementById('stp-checked-count').textContent = checkedCount;

    const sorted     = [..._staisyRewards].sort((a, b) => a.threshold - b.threshold);
    const nextReward = sorted.find(r => r.threshold > checkedCount);
    const prevReward = [...sorted].reverse().find(r => r.threshold <= checkedCount);

    const nameEl  = document.getElementById('stp-next-reward-name');
    const remEl   = document.getElementById('stp-next-reward-remaining');
    const barFill = document.getElementById('stp-bar-fill');

    if (nextReward) {
        const from  = prevReward ? prevReward.threshold : 0;
        const range = nextReward.threshold - from;
        const done  = checkedCount - from;
        const pct   = Math.max(0, Math.min(100, (done / range) * 100));
        const rem   = nextReward.threshold - checkedCount;

        nameEl.textContent = '🎁 ' + nextReward.name;
        remEl.textContent  = `Noch ${rem} Bestellung${rem !== 1 ? 'en' : ''} bis du das bekommst!`;
        barFill.style.width = pct + '%';
    } else if (sorted.length > 0) {
        nameEl.textContent = '🏆 Alle Belohnungen erreicht! 🎉';
        remEl.textContent  = '';
        barFill.style.width = '100%';
    } else {
        nameEl.textContent = 'Noch keine Belohnungen konfiguriert';
        remEl.textContent  = '';
        barFill.style.width = '0%';
    }

    const chips = document.getElementById('stp-reward-chips');
    chips.innerHTML = sorted.map(r => {
        const reached = checkedCount >= r.threshold;
        const isNext  = nextReward && r.id === nextReward.id;
        const cls     = reached ? 'reached' : isNext ? 'next' : '';
        return `<span class="stp-reward-chip ${cls}">
            ${reached ? '✅' : isNext ? '🎯' : '⏳'} ${escA(r.name)} (${r.threshold})
        </span>`;
    }).join('');
}

// ── Belohnungsliste rendern ───────────────────────────────────────────────────
function staisyRenderRewards() {
    const container = document.getElementById('stp-reward-list');
    if (!_staisyRewards.length) {
        container.innerHTML = '<div style="font-size:13px;color:rgba(255,255,255,.25);padding:12px 0">Noch keine Belohnungen. Füge welche unten hinzu!</div>';
        return;
    }
    const sorted = [..._staisyRewards].sort((a, b) => a.threshold - b.threshold);
    container.innerHTML = sorted.map(r => `
        <div class="stp-reward-row" id="stp-rrow-${escA(r.id)}">
            <div class="stp-reward-num">${r.threshold}</div>
            <div class="stp-reward-text">
                <span>${escA(r.name)}</span>
                <div style="font-size:10px;color:rgba(255,255,255,.2);margin-top:2px">Bei ${r.threshold} abgehakten Bestellungen</div>
            </div>
            <button class="stp-reward-del" onclick="staisyDeleteReward('${escA(r.id)}')" title="Löschen">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    `).join('');
}

// ── Belohnung hinzufügen ──────────────────────────────────────────────────────
function staisyAddReward() {
    const thresholdEl = document.getElementById('stp-new-threshold');
    const nameEl      = document.getElementById('stp-new-reward-name');
    const threshold   = parseInt(thresholdEl.value, 10);
    const name        = nameEl.value.trim();

    if (!threshold || threshold < 1) { showToast('❗ Bitte eine gültige Anzahl eingeben', 'error'); return; }
    if (!name)                       { showToast('❗ Bitte einen Namen eingeben', 'error'); return; }
    if (_staisyRewards.some(r => r.threshold === threshold)) {
        showToast('❗ Diese Anzahl ist bereits vergeben', 'error'); return;
    }

    _staisyRewards.push({ id: 'r_' + Date.now(), threshold, name });
    thresholdEl.value = '';
    nameEl.value = '';

    staisyRenderRewards();
    staisyRenderProgress();
    showToast('✅ Belohnung hinzugefügt – noch nicht gespeichert', 'success');
}

// ── Belohnung löschen ─────────────────────────────────────────────────────────
function staisyDeleteReward(id) {
    _staisyRewards = _staisyRewards.filter(r => r.id !== id);
    staisyRenderRewards();
    staisyRenderProgress();
}

// ── Bestellungsliste rendern ──────────────────────────────────────────────────
function staisyRenderOrders() {
    const container = document.getElementById('stp-orders-list');
    const query     = (document.getElementById('stp-order-search')?.value || '').toLowerCase().trim();

    let filtered = _staisyOrders;

    if (query) {
        filtered = filtered.filter(o => {
            const name  = (o.name  || o.customerName  || '').toLowerCase();
            const email = (o.email || o.customerEmail || '').toLowerCase();
            const id    = (o.id || '').toLowerCase();
            return name.includes(query) || email.includes(query) || id.includes(query);
        });
    }

    if (_staisyFilter === 'staisy')   filtered = filtered.filter(o => _staisyOrderIds.has(o.id));
    if (_staisyFilter === 'checked')  filtered = filtered.filter(o => _staisyCheckedIds.has(o.id));

    if (!filtered.length) {
        container.innerHTML = `
            <div class="stp-empty">
                <i class="fa-solid fa-heart-crack"></i>
                ${_staisyFilter === 'staisy' && !query
                    ? 'Noch keine Bestellungen als Staisys markiert.<br><small>Filter auf „Alle" setzen und Bestellungen auswählen.</small>'
                    : 'Keine Bestellungen gefunden'}
            </div>`;
        return;
    }

    container.innerHTML = filtered.map(o => {
        const isStaisy  = _staisyOrderIds.has(o.id);
        const isChecked = _staisyCheckedIds.has(o.id);
        const name  = escA(o.name  || o.customerName  || '—');
        const email = escA(o.email || o.customerEmail || '');
        const price = o.total       != null ? (parseFloat(o.total) / 100).toFixed(2) + ' €'
                    : o.totalAmount != null ? parseFloat(o.totalAmount).toFixed(2) + ' €'
                    : '—';
        const dateRaw = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt ? new Date(o.createdAt) : null);
        const dateStr = dateRaw ? dateRaw.toLocaleDateString('de-DE') : '—';
        const rowCls  = isChecked ? 'is-checked' : isStaisy ? 'is-staisy' : '';

        return `
        <div class="stp-order-row ${rowCls}" id="stp-orow-${escA(o.id)}">
            <div class="stp-order-id">#${escA(o.id).substring(0, 8)}</div>
            <div class="stp-order-info">
                <div class="stp-order-name">${name}</div>
                <div class="stp-order-date">${email ? email + ' · ' : ''}${dateStr}</div>
            </div>
            <div class="stp-order-price">${price}</div>
            <label class="stp-chk-label staisy-label${isStaisy ? ' on' : ''}" title="Als Staisys Bestellung markieren">
                <input type="checkbox" class="stp-chk" ${isStaisy ? 'checked' : ''}
                    onchange="staisyToggleOrderId('${escA(o.id)}', 'staisy', this.checked)">
                <i class="fa-solid fa-heart"></i> Staisys
            </label>
            <label class="stp-chk-label done-label${isChecked ? ' on' : ''}" title="Abgehakt (zählt als Fortschritt)">
                <input type="checkbox" class="stp-chk" ${isChecked ? 'checked' : ''} ${!isStaisy ? 'disabled style="opacity:.3;pointer-events:none"' : ''}
                    onchange="staisyToggleOrderId('${escA(o.id)}', 'checked', this.checked)">
                <i class="fa-solid fa-check"></i> Abgehakt
            </label>
        </div>`;
    }).join('');
}

// ── Bestellung umschalten ─────────────────────────────────────────────────────
function staisyToggleOrderId(orderId, type, value) {
    if (type === 'staisy') {
        if (value) {
            _staisyOrderIds.add(orderId);
        } else {
            _staisyOrderIds.delete(orderId);
            _staisyCheckedIds.delete(orderId);
        }
    } else if (type === 'checked') {
        if (value && _staisyOrderIds.has(orderId)) {
            _staisyCheckedIds.add(orderId);
        } else {
            _staisyCheckedIds.delete(orderId);
        }
    }

    const row = document.getElementById('stp-orow-' + orderId);
    if (row) {
        const isSt = _staisyOrderIds.has(orderId);
        const isCh = _staisyCheckedIds.has(orderId);
        row.className = 'stp-order-row' + (isCh ? ' is-checked' : isSt ? ' is-staisy' : '');
        const stLbl = row.querySelector('.staisy-label');
        const doLbl = row.querySelector('.done-label');
        if (stLbl) stLbl.classList.toggle('on', isSt);
        if (doLbl) {
            doLbl.classList.toggle('on', isCh);
            const chk = doLbl.querySelector('input');
            if (chk) {
                chk.disabled = !isSt;
                chk.style.opacity = isSt ? '' : '.3';
                chk.style.pointerEvents = isSt ? '' : 'none';
            }
        }
    }

    staisyRenderProgress();
}

// ── Filter setzen ─────────────────────────────────────────────────────────────
function staisySetFilter(filter) {
    _staisyFilter = filter;
    document.getElementById('stp-filter-all').classList.toggle('active',    filter === 'all');
    document.getElementById('stp-filter-staisy').classList.toggle('active', filter === 'staisy');
    document.getElementById('stp-filter-checked').classList.toggle('active',filter === 'checked');
    staisyRenderOrders();
}

// ── In Firestore speichern ────────────────────────────────────────────────────
async function staisySaveAll() {
    if (!saIsPrimaryAdmin) { showToast('⛔ Nur primärer Superadmin', 'error'); return; }

    const btn = document.getElementById('stp-save-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Speichern…'; }

    try {
        await db.collection('superadminPrivate').doc('staisy_program').set({
            staisyOrderIds : [..._staisyOrderIds],
            checkedOrderIds: [..._staisyCheckedIds],
            rewards        : _staisyRewards,
            updatedAt      : firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('💾 Erfolgreich gespeichert ✅', 'success');
        if (typeof logAction === 'function') logAction('Staisy-Fortschritt gespeichert');
    } catch (e) {
        console.error('[Staisy] Save error:', e);
        showToast('❌ Fehler beim Speichern: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Speichern'; }
    }
}
