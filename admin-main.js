// ====================== FIREBASE CONFIG ======================
const firebaseConfig = {
    apiKey: "AIzaSyDsIUl-iYmH42MPbusFLhGhj5oGLh01BzI",
    authDomain: "wavevapes-7a960.firebaseapp.com",
    projectId: "wavevapes-7a960",
    storageBucket: "wavevapes-7a960.firebasestorage.app",
    messagingSenderId: "1093624390275",
    appId: "1:1093624390275:web:b1b8ae17bcf1b59dffb1b6"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const MYSTERY_ID = 999; // BUG FIX: single constant — mirrors index.html

// ── Globale HTML-Escape — muss früh deklariert sein (vor openBanIPModal etc.) ──
var escA = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
var csvSafe = s => { const str = String(s == null ? '' : s); return /^[=+\-@\t\r]/.test(str) ? "'" + str : str; }; // F-05 FIX: CSV-Injection

// EmailJS — same service/key as shop frontend
const ADMIN_EMAILJS_SERVICE    = "service_lzvte0x";
const ADMIN_EMAILJS_PUBLIC     = "t19pJAHgBpbKpZFGU";
const ADMIN_EMAILJS_TEMPLATE   = "template_cgcu1m8";   // Bestellbestätigung
const ADMIN_BROADCAST_TEMPLATE = "template_dugkpau";   // Broadcast
emailjs.init(ADMIN_EMAILJS_PUBLIC);

// ====================== GLOBALE VARIABLEN ======================
let currentEditId = null;
let selectedFile = null;
let currentOrderId = null;
let removeCurrentImage = false;
let allCategories = [];
let allCoupons = [];
let revenueChart = null;
let dailyOrdersChart = null;
let topProductsChart = null;
let referralChart = null;
let logsUnsubscribe = null;
let _ordersUnsub = null;
let _watchOrdersUnsub = null;
let allProducts = [];
let productOrder = [];
let sortableInstance = null;
let adminSortColumn = 'name';
let adminSortDirection = 'asc';
let adminCategoryFilter = 'Alle';
let adminStatusFilter = '';
let selectedProductIds = [];
let presenceRefreshInterval = null;
let stockCriticalThreshold = 3;
let stockWarningThreshold = 10;

// ====================== LOG ACTION ======================

// ═══════════════════════════════════════════════════════════
//  CustomSelect — dark dropdown replacing native <select>
//  Usage: initCustomSelect(id, options, value, onChange)
//  getValue: document.getElementById(id)?.dataset.csValue
// ═══════════════════════════════════════════════════════════
function initCustomSelect(id, options, currentValue, onChange) {
    const hidden = document.getElementById(id);
    if (!hidden) return;

    // Build wrapper around the hidden select
    const parent = hidden.parentElement;
    const triggerClass  = hidden.className || '';

    // Get initial placeholder from first option or attribute
    const placeholder = hidden.options[0]?.value === '' ? hidden.options[0].textContent : 'Wählen...';

    // Remove existing custom select if re-initializing
    const existing = parent.querySelector('.cs-wrap');
    if (existing) existing.remove();

    const wrap = document.createElement('div');
    wrap.className = 'cs-wrap';

    const trigger = document.createElement('div');
    trigger.className = 'cs-trigger ' + triggerClass;
    trigger.innerHTML = `<span class="cs-label">${escA(placeholder)}</span><i class="fa-solid fa-chevron-down cs-trigger-arrow"></i>`;

    const dropdown = document.createElement('div');
    dropdown.className = 'cs-dropdown';

    let selectedValue = currentValue || '';

    function renderOptions(opts) {
        dropdown.innerHTML = '';
        opts.forEach(opt => {
            const div = document.createElement('div');
            div.className = 'cs-option' + (opt.value === '' ? ' placeholder' : '') + (opt.value === selectedValue ? ' selected' : '');
            div.textContent = opt.label;
            div.dataset.value = opt.value;
            div.addEventListener('click', e => {
                e.stopPropagation();
                selectedValue = opt.value;
                hidden.value = selectedValue;
                hidden.dataset.csValue = selectedValue;
                trigger.querySelector('.cs-label').textContent = opt.value === '' ? placeholder : opt.label;
                dropdown.querySelectorAll('.cs-option').forEach(o => o.classList.toggle('selected', o.dataset.value === selectedValue));
                wrap.classList.remove('open');
                if (onChange) onChange(selectedValue);
            });
            dropdown.appendChild(div);
        });
    }

    renderOptions(options);

    trigger.addEventListener('click', e => {
        e.stopPropagation();
        const wasOpen = wrap.classList.contains('open');
        // Close all other open selects
        document.querySelectorAll('.cs-wrap.open').forEach(w => w.classList.remove('open'));
        if (!wasOpen) wrap.classList.add('open');
    });

    wrap.appendChild(trigger);
    wrap.appendChild(dropdown);

    // Hide native select but keep it in DOM for form compatibility
    hidden.style.display = 'none';
    parent.insertBefore(wrap, hidden);

    // Set initial label if value present
    if (currentValue) {
        const found = options.find(o => o.value === currentValue);
        if (found) trigger.querySelector('.cs-label').textContent = found.label;
    }

    // Expose update method on the wrap for re-rendering options
    wrap._updateOptions = (newOpts, newVal) => {
        options = newOpts;
        if (newVal !== undefined) selectedValue = newVal;
        renderOptions(options);
        const found = options.find(o => o.value === selectedValue);
        trigger.querySelector('.cs-label').textContent = found ? found.label : placeholder;
    };
    wrap._setValue = (val) => {
        selectedValue = val;
        hidden.value = val;
        hidden.dataset.csValue = val;
        const found = options.find(o => o.value === val);
        trigger.querySelector('.cs-label').textContent = found ? found.label : placeholder;
        dropdown.querySelectorAll('.cs-option').forEach(o => o.classList.toggle('selected', o.dataset.value === val));
    };

    return wrap;
}

// Close custom selects when clicking outside
document.addEventListener('click', () => {
    document.querySelectorAll('.cs-wrap.open').forEach(w => w.classList.remove('open'));
});

// Helper: get value from a custom-select-enhanced element
function csGetValue(id) {
    const el = document.getElementById(id);
    return el ? (el.dataset.csValue ?? el.value) : '';
}

// Helper: set value
function csSetValue(id, val) {
    const el = document.getElementById(id);
    if (!el) return;
    el.dataset.csValue = val;
    el.value = val;
    const wrap = el.parentElement?.querySelector('.cs-wrap');
    if (wrap?._setValue) wrap._setValue(val);
}

async function logAction(action, target = "", details = {}) {
    if (!auth.currentUser) return;
    target = target || "";
    // BUG FIX: Wrapped in try/catch. Without this, a transient Firestore error
    // (network blip, permission issue) threw an unhandled rejection that bubbled up
    // into the calling function (quickStatus, saveOrderChanges, etc.) and showed
    // the admin a misleading error even though the actual operation had succeeded.
    try {
        await db.collection("admin_logs").add({
            action, target,
            adminEmail: auth.currentUser.email,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            details: details || {}
        });
    } catch(e) {
        console.warn('logAction failed (non-critical):', e.code, e.message);
    }
}

// ====================== LAGERWARNUNG ======================
// ── Stock Alert Deduplication ─────────────────────────────────────────────
// Alerts are persisted in Firestore: settings/stockAlerts
// Structure: { [productId]: { stock: N, sentAt: Timestamp } }
// A new alert is only sent when the stock dropped BELOW the previously recorded level.
// This survives page refreshes and multiple admin sessions.

let _stockAlertsCache = null; // local mirror of Firestore state

async function _loadStockAlerts() {
    if (_stockAlertsCache !== null) return _stockAlertsCache;
    try {
        const snap = await db.collection('settings').doc('stockAlerts').get();
        _stockAlertsCache = snap.exists ? (snap.data().alerts || {}) : {};
    } catch(e) {
        _stockAlertsCache = {};
    }
    return _stockAlertsCache;
}

async function _saveStockAlerts(alerts) {
    _stockAlertsCache = alerts;
    try {
        await db.collection('settings').doc('stockAlerts').set({ alerts }, { merge: false });
    } catch(e) {
        console.warn('stockAlerts speichern fehlgeschlagen:', e);
    }
}

async function checkStockWarnings() {
    const critical = allProducts.filter(p => p.available !== false && (p.stock || 0) <= stockCriticalThreshold);
    const warning  = allProducts.filter(p => p.available !== false && (p.stock || 0) > stockCriticalThreshold && (p.stock || 0) <= stockWarningThreshold);
    const all = [...critical, ...warning];
    const banner = document.getElementById('stock-warning-banner');
    const list   = document.getElementById('stock-warning-list');
    if (all.length === 0) { banner.classList.add('hidden'); return; }
    banner.classList.remove('hidden');
    list.innerHTML = all.map(p => {
        const isCrit = (p.stock || 0) <= stockCriticalThreshold;
        return `<div class="prd-warn-item">
            ${p.image
                ? `<img src="${p.image}" class="prd-warn-thumb" loading="lazy">`
                : `<div class="prd-warn-thumb-ph">📦</div>`}
            <div style="flex:1;min-width:0">
                <div class="prd-warn-name">${escA(p.name)}</div>
                <div class="prd-warn-cat">${escA(p.category || '—')}</div>
            </div>
            <span class="prd-warn-badge ${isCrit ? 'prd-warn-crit' : 'prd-warn-low'}">
                ${isCrit ? '⚠ KRITISCH' : '⚠ NIEDRIG'} · ${p.stock || 0} Stk.
            </span>
        </div>`;
    }).join('');

    // ── Notify only for genuinely new/worsened critical products ──────────
    const alerts = await _loadStockAlerts();
    const toAlert = [];

    for (const p of critical) {
        const prev = alerts[p.id];
        const currentStock = p.stock || 0;
        // Send alert if: never alerted before, OR stock dropped further since last alert
        if (!prev || currentStock < prev.stock) {
            toAlert.push(p);
        }
    }

    // Clean up alert records for products that recovered above critical threshold
    let changed = false;
    for (const id of Object.keys(alerts)) {
        const p = allProducts.find(pr => pr.id === id);
        if (!p || (p.stock || 0) > stockCriticalThreshold) {
            delete alerts[id];
            changed = true;
        }
    }

    // Record new alerts and persist
    for (const p of toAlert) {
        alerts[p.id] = { stock: p.stock || 0, sentAt: Date.now() };
        changed = true;
    }
    if (changed) await _saveStockAlerts(alerts);

    if (toAlert.length === 0) return;

    // Fire notifications only for genuinely new alerts
    toAlert.forEach(p => {
        // In-app push notification
        pushNotification(
            'warning',
            `⚠ Kritischer Lagerbestand: ${p.name}`,
            `Noch ${p.stock || 0} Stk. — bitte nachbestellen!`,
            () => switchTab(0)
        );

        // Email alert (only if admin has set a notification address)
        const notifyEmail = window._adminNotifyEmail;
        if (!notifyEmail) return;
        emailjs.send(
            ADMIN_EMAILJS_SERVICE,
            ADMIN_EMAILJS_TEMPLATE,
            {
                email:          notifyEmail,
                order_id:       "LAGERWARNUNG",
                orders:         [{ name: `⚠ ${p.name}`, units: p.stock || 0, price: "Stk. verbleibend", image_url: p.image || "https://wavevapes.de/logo.png" }],
                cost:           { shipping: "—", tax: "—", total: "Bitte sofort nachbestellen!" },
                loyalty_earned: 0
            }
        ).catch(err => console.warn("Lagerwarnung E-Mail fehlgeschlagen:", err));
    });
}

async function updateStats() {
    const active = allProducts.filter(p => p.available !== false).length;
    document.getElementById('active-products').textContent = active;
    document.getElementById('top-seller').textContent    = '…';
    document.getElementById('total-sold').textContent    = '…';
    document.getElementById('total-revenue').textContent = '…';

    try {
        const snap = await db.collection('orders')
            .where('status', '!=', 'Storniert')
            .get();

        let totalRevenue = 0;
        let totalSold    = 0;
        // E-04 FIX: Compute top seller from real order data, not the stale p.sold product field
        const soldMap = new Map();
        snap.forEach(doc => {
            const o = doc.data();
            totalRevenue += o.total || 0;
            if (Array.isArray(o.items)) {
                o.items.forEach(item => {
                    // M-NEW-03 FIX: Exclude Mystery Vape and Bundle items from unit counts
                    if (item.id === MYSTERY_ID) return;
                    if (item.isBundle || String(item.id).startsWith('bundle_')) return;
                    totalSold += item.qty || 0;
                    soldMap.set(item.name, (soldMap.get(item.name) || 0) + (item.qty || 0));
                });
            }
        });

        // Top seller by units sold across all orders
        let topName = '—', topQty = 0;
        soldMap.forEach((qty, name) => { if (qty > topQty) { topQty = qty; topName = name; } });

        document.getElementById('top-seller').textContent    = topQty > 0 ? `${topName} (${topQty}×)` : '—';
        document.getElementById('total-sold').textContent    = totalSold.toLocaleString('de-DE');
        document.getElementById('total-revenue').textContent = totalRevenue.toFixed(0) + ' €';
    } catch(e) {
        // Fallback auf Produktfelder wenn Orders-Query fehlschlägt
        const soldTotal = allProducts.reduce((sum, p) => sum + (p.sold || 0), 0);
        const revenue   = allProducts.reduce((sum, p) => sum + (p.sold || 0) * (p.price || 0), 0);
        const top = [...allProducts].sort((a, b) => (b.sold || 0) - (a.sold || 0))[0];
        document.getElementById('top-seller').textContent    = top ? `${top.name} (${top.sold || 0}×)` : '—';
        document.getElementById('total-sold').textContent    = soldTotal.toLocaleString('de-DE');
        document.getElementById('total-revenue').textContent = revenue.toFixed(0) + ' €';
        console.warn('updateStats: Orders-Query fehlgeschlagen, Fallback aktiv:', e);
    }

    checkStockWarnings();
}

// ====================== PRODUKTE ======================
// K-04 FIX: Track listener so repeated calls don't stack multiple onSnapshot listeners
let _adminProductsUnsub = null;
function loadProducts() {
    if (_adminProductsUnsub) { _adminProductsUnsub(); _adminProductsUnsub = null; }
    let _firstProductLoad = true; // E-08 FIX
    _adminProductsUnsub = db.collection('products').onSnapshot(snap => {
        allProducts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // E-08 FIX: Call updateStats on first snapshot so it always runs with real data
        if (_firstProductLoad) { _firstProductLoad = false; updateStats(); }
        else { updateStats(); }
        renderProductTable();
    });
}
function applyAdminFilters() {
    adminCategoryFilter = csGetValue('admin-category-filter') || 'Alle';
    adminStatusFilter   = csGetValue('admin-status-filter')   || '';
    renderProductTable();
}
function sortAdminTable(column) {
    if (adminSortColumn === column) adminSortDirection = adminSortDirection === 'asc' ? 'desc' : 'asc';
    else { adminSortColumn = column; adminSortDirection = 'asc'; }
    renderProductTable();
}
// ── Produkte v2 helpers ──
function prdToggleAddPanel() {
    const panel = document.getElementById('prd-add-panel');
    panel.classList.toggle('open');
}

function renderProductTable() {
    const tbody      = document.getElementById('products-tbody');
    const searchTerm = (document.getElementById('product-search').value || '').toLowerCase().trim();
    let filtered = allProducts.filter(p => {
        const matchSearch   = !searchTerm || p.name.toLowerCase().includes(searchTerm);
        const matchCategory = adminCategoryFilter === 'Alle' || p.category === adminCategoryFilter;
        let matchStatus = true;
        if (adminStatusFilter === 'available')   matchStatus = p.available !== false;
        if (adminStatusFilter === 'unavailable') matchStatus = p.available === false;
        if (adminStatusFilter === 'new')         matchStatus = p.isNew === true;
        if (adminStatusFilter === 'tornado')     matchStatus = p.category === "WaveVapes Tornado 30000";
        if (adminStatusFilter === 'lowstock')    matchStatus = (p.stock || 0) <= stockWarningThreshold;
        return matchSearch && matchCategory && matchStatus;
    });
    filtered.sort((a, b) => {
        let valA, valB;
        switch(adminSortColumn) {
            case 'name':          valA = a.name;                    valB = b.name; break;
            case 'category':      valA = a.category || '';          valB = b.category || ''; break;
            case 'price':         valA = a.price;                   valB = b.price; break;
            case 'originalPrice': valA = a.originalPrice || 0;      valB = b.originalPrice || 0; break;
            case 'stock':         valA = a.stock || 0;              valB = b.stock || 0; break;
            case 'sold':          valA = a.sold || 0;               valB = b.sold || 0; break;
            case 'revenue':       valA = (a.sold||0)*a.price;       valB = (b.sold||0)*b.price; break;
            case 'isNew':         valA = a.isNew ? 1 : 0;           valB = b.isNew ? 1 : 0; break;
            case 'available':     valA = a.available!==false?1:0;   valB = b.available!==false?1:0; break;
            default:              valA = a.name;                    valB = b.name;
        }
        if (typeof valA === 'string') return adminSortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        return adminSortDirection === 'asc' ? valA - valB : valB - valA;
    });

    // update result count + filtered bulk button
    const rc = document.getElementById('prd-result-count');
    const filteredBtn = document.getElementById('bke-filtered-btn');
    const filteredLabel = document.getElementById('bke-filtered-label');
    const isFiltered = filtered.length !== allProducts.length;
    if (rc) rc.textContent = isFiltered
        ? `${filtered.length} von ${allProducts.length} Produkten`
        : `${allProducts.length} Produkte`;
    if (filteredBtn) {
        filteredBtn.style.display = isFiltered && filtered.length > 0 ? 'inline-flex' : 'none';
        if (filteredLabel) filteredLabel.textContent = `${filtered.length} sichtbare bulk-editieren`;
    }

    // update sort headers
    document.querySelectorAll('.prd-table thead th').forEach(th => {
        th.classList.remove('prd-sort-asc','prd-sort-desc');
    });
    // Re-add sort indicator to active column
    const sortColMap = { name:1, category:2, price:3, stock:4, available:5, sold:6, revenue:7 };
    if (adminSortColumn && sortColMap[adminSortColumn]) {
        const ths = document.querySelectorAll('.prd-table thead th');
        if (ths[sortColMap[adminSortColumn]]) {
            ths[sortColMap[adminSortColumn]].classList.add(
                adminSortDirection === 'asc' ? 'prd-sort-asc' : 'prd-sort-desc'
            );
        }
    }

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="9"><div class="prd-empty"><i class="fa-solid fa-box-open"></i>Keine Produkte gefunden</div></td></tr>`;
        return;
    }

    let html = '';
    filtered.forEach(p => {
        const stock     = p.stock || 0;
        const isCrit    = stock <= stockCriticalThreshold;
        const isWarn    = !isCrit && stock <= stockWarningThreshold;
        const isUnavail = p.available === false;
        const rowClass  = isCrit ? 'prd-row-crit' : isWarn ? 'prd-row-warn' : isUnavail ? 'prd-row-unavail' : '';
        const stockClass= isCrit ? 'prd-stock-crit' : isWarn ? 'prd-stock-warn' : 'prd-stock-ok';

        const chips = [];
        if (p.isNew)           chips.push(`<span class="prd-chip prd-chip-new">NEW</span>`);
        if (p.hasNicotine !== false) chips.push(`<span class="prd-chip prd-chip-nic">NIC</span>`);

        const catShort = p.category
            ? (p.category.length > 20 ? p.category.slice(0,18)+'…' : p.category)
            : '—';

        html += `<tr class="${rowClass}">
            <td style="text-align:center;padding-left:12px"><input type="checkbox" class="product-checkbox accent-cyan-400 w-4 h-4" data-id="${p.id}"></td>
            <td>
                <div class="prd-name-cell">
                    ${p.image
                        ? `<img src="${p.image}" class="prd-thumb" loading="lazy">`
                        : `<div class="prd-thumb-ph">📦</div>`}
                    <div>
                        <div class="prd-name">${escA(p.name)}</div>
                        ${chips.length ? `<div class="prd-name-chips">${chips.join('')}</div>` : ''}
                    </div>
                </div>
            </td>
            <td style="font-size:11px;color:var(--prd-muted)">${catShort}</td>
            <td style="text-align:right">
                <div class="prd-price">${(p.price||0).toFixed(2)} €</div>
                ${p.originalPrice ? `<div class="prd-price-orig">${p.originalPrice.toFixed(2)} €</div>` : ''}
            </td>
            <td style="text-align:center">
                <span class="prd-stock-val ${stockClass}">${stock}</span>
                ${isCrit||isWarn ? `<i class="fa-solid fa-triangle-exclamation" style="font-size:9px;margin-left:4px;color:${isCrit?'var(--prd-red)':'var(--prd-amber)'}"></i>` : ''}
            </td>
            <td style="text-align:center">
                <label class="prd-avail-sw">
                    <input type="checkbox" ${p.available !== false ? 'checked' : ''} onchange="toggleAvailable('${p.id}',this.checked)">
                    <span class="prd-avail-pill">${p.available !== false ? 'Aktiv' : 'Inaktiv'}</span>
                </label>
            </td>
            <td style="text-align:right"><span class="prd-sold-val">${p.sold || 0}</span></td>
            <td style="text-align:right"><span class="prd-rev-val" title="Näherung: sold × akt. Preis. Exakter Gesamtumsatz oben im KPI.">${((p.sold||0)*(p.price||0)).toFixed(2)} €</span></td>
            <td style="text-align:right;padding-right:12px">
                <div class="prd-actions">
                    <button class="prd-act-btn cyan"   onclick="openEditModal('${p.id}')"      title="Bearbeiten"><i class="fa-solid fa-pen"></i></button>
                    <button class="prd-act-btn violet" onclick="duplicateProduct('${p.id}')"   title="Duplizieren"><i class="fa-solid fa-copy"></i></button>
                    <button class="prd-act-btn red"    onclick="deleteProduct('${p.id}')"      title="Löschen"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        </tr>`;
    });
    tbody.innerHTML = html;
}
document.getElementById('product-search').addEventListener('input', applyAdminFilters);

async function toggleAvailable(id, val) {
    const cb = (typeof event !== 'undefined' && event.target) || document.querySelector(`[onchange*="toggleAvailable('${id}'"]`);
    const pill = cb ? cb.parentElement.querySelector('.prd-avail-pill') : null;
    // Optimistic UI update — revert on error
    if (pill) pill.textContent = val ? 'Aktiv' : 'Inaktiv';
    try {
        // FIX: When marking as unavailable, also reset stock to 0
        const update = val ? { available: true } : { available: false, stock: 0 };
        await db.collection('products').doc(id).update(update);
        await logAction("product_availability_changed", id, { available: val });
        showToast(val ? '✅ Produkt aktiviert' : '⏸ Produkt deaktiviert – Lagerbestand auf 0 gesetzt');
    } catch(e) {
        // Revert optimistic UI change
        if (pill) pill.textContent = val ? 'Inaktiv' : 'Aktiv';
        if (cb) cb.checked = !val;
        showToast('❌ Fehler: ' + e.message, 'error');
    }
}
async function deleteProduct(id) {
    if (!confirm('⚠️ Produkt WIRKLICH PERMANENT löschen?\n\nDas kann nicht rückgängig gemacht werden!')) return;
    try { await db.collection('products').doc(id).delete(); await logAction("product_deleted", id); showToast('✅ Produkt erfolgreich gelöscht'); }
    catch (e) { showToast('❌ Fehler beim Löschen: ' + e.message, 'error'); }
}
async function duplicateProduct(id) {
    try {
        const doc = await db.collection('products').doc(id).get();
        if (!doc.exists) return showToast('Produkt nicht gefunden', 'error');
        const original = doc.data();
        const clone = { ...original, name: original.name + ' (Kopie)', sold: 0, available: false, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
        const newRef = await db.collection('products').add(clone);
        await logAction("product_duplicated", id, { newId: newRef.id, name: clone.name });
        showToast(`✅ „${original.name}" wurde dupliziert!`, 'success');
    } catch (e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

function toggleSelectAllProducts(cb) { document.querySelectorAll('.product-checkbox').forEach(ch => ch.checked = cb.checked); }
// [old bulk modal removed — new bottom-sheet version below]

async function enforceCategories() {
    if (!confirm('Alle Produkte automatisch kategorisieren? (WaveVapes Tornado-Produkte werden NICHT verändert)')) return;
    const snap = await db.collection('products').get();
    // BUG FIX: Use chunked batches of 499 — a single batch silently fails above 500 writes
    const docs = snap.docs;
    let changed = 0;
    for (let i = 0; i < docs.length; i += 499) {
        const batch = db.batch();
        docs.slice(i, i + 499).forEach(doc => {
            const p = doc.data();
            // BUG-02 FIX: Tornado-Produkte ausdrücklich ausnehmen — der Confirm-Dialog
            // versprach dies, aber der Code hatte keine solche Bedingung.
            if (p.category === 'WaveVapes Tornado 30000') return;
            const targetCat = p.isNew === true ? "Neue Sorten" : "Normale Sorten";
            if (p.category !== targetCat) { batch.update(doc.ref, { category: targetCat }); changed++; }
        });
        await batch.commit();
    }
    if (changed > 0) { await logAction("auto_category_assignment", "", { changed }); showToast(`✅ ${changed} Produkte kategorisiert!`, "success"); }
    else showToast("✅ Alles war schon korrekt");
    loadProducts();
}

async function exportOrdersWithTracking() {
    const snapshot = await db.collection("orders").orderBy("date", "desc").get();
    if (snapshot.empty) { showToast('Keine Bestellungen vorhanden', 'error'); return; }
    let csv = "Bestellnr.,Datum,Kunde,Gesamt,Status,Tracking-Nummer,Tracking-Link\n";
    snapshot.forEach(doc => {
        const o = doc.data();
        const dateStr = o.date ? o.date.toDate().toISOString().slice(0,19).replace('T',' ') : '';
        const trackingLink = o.trackingNumber && o.carrier === "DHL" ? `https://www.dhl.de/de/privatkunden/dhl-sendungsverfolgung.html?piececode=${encodeURIComponent(o.trackingNumber)}` : (o.trackingNumber || '');
        csv += [`"${o.orderNumber||''}"`,`"${dateStr}"`,`"${o.userEmail||''}"`,o.total||0,`"${o.status||''}"`,`"${o.trackingNumber||''}"`,`"${trackingLink}"`].join(",") + "\n";
    });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob);
    link.download = `wavevapes_bestellungen_mit_tracking_${new Date().toISOString().slice(0,10)}.csv`; link.click();
    showToast("✅ Export mit Tracking-Links heruntergeladen!", "success");
    await logAction("orders_export_with_tracking");
}

// [old modal-based openEditModal/saveEdit/closeEditModal removed — new Drawer versions below]

document.getElementById('add-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('prod-name').value.trim();
    const price = parseFloat(document.getElementById('prod-price').value);
    const originalPrice = parseFloat(document.getElementById('prod-original-price').value) || null;
    const costPrice = parseFloat(document.getElementById('prod-cost-price').value) || null;
    const stock = parseInt(document.getElementById('prod-stock').value, 10);
    const isNew = document.getElementById('prod-new').checked;
    const unavailable = document.getElementById('prod-unavailable').checked;
    const hasNicotine = document.getElementById('prod-has-nicotine').checked;
    const description = document.getElementById('prod-description').value.trim();
    const categorySelect = document.getElementById('prod-category');
    const category = categorySelect && categorySelect.value ? categorySelect.value : (isNew ? "Neue Sorten" : "Normale Sorten");
    // BUG FIX: Wrap in try/catch — previously a Firestore or Cloudinary error
    // would silently fail with no feedback to the admin.
    const submitBtn = e.target.querySelector('[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Wird gespeichert…'; }
    try {
        const docRef = await db.collection('products').add({ name, price, originalPrice, costPrice, stock, category, isNew: isNew||false, available: !unavailable, hasNicotine, description: description||"", sold: 0 });
        if (selectedFile) {
            const formData = new FormData(); formData.append("file", selectedFile); formData.append("upload_preset", "wavevapes");
            const res = await fetch("https://api.cloudinary.com/v1_1/dbbkmjsr5/image/upload", { method: "POST", body: formData });
            const json = await res.json(); if (json.secure_url) await docRef.update({ image: json.secure_url });
        }
        await logAction("product_created", docRef.id, { name, category });
        e.target.reset(); document.getElementById('preview-thumb').classList.add('hidden'); selectedFile = null;
        showToast('✅ Produkt erfolgreich angelegt!');
    } catch(err) {
        showToast('❌ Fehler beim Anlegen: ' + err.message, 'error');
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Produkt anlegen'; }
    }
});
const dropzone = document.getElementById('dropzone');
dropzone.addEventListener('click', () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
    input.onchange = e => { selectedFile = e.target.files[0]; const url = URL.createObjectURL(selectedFile); document.getElementById('preview-thumb').src = url; document.getElementById('preview-thumb').classList.remove('hidden'); };
    input.click();
});

async function exportProductsToCSV() {
    const snapshot = await db.collection("products").get();
    if (snapshot.empty) { showToast('Keine Produkte vorhanden', 'error'); return; }
    let csv = "id,name,price,originalPrice,stock,category,isNew,available,hasNicotine,description,image,sold\n";
    snapshot.forEach(doc => { const p = doc.data(); csv += [`"${doc.id}"`,`"${(p.name||"").replace(/"/g,'""')}"`,p.price||0,p.originalPrice||"",p.stock||0,`"${p.category||""}"`,p.isNew===true?"true":"false",p.available!==false?"true":"false",p.hasNicotine!==false?"true":"false",`"${(p.description||"").replace(/"/g,'""').replace(/\n/g,"\\n")}"`,`"${p.image||""}"`,p.sold||0].join(",") + "\n"; });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob);
    link.download = `wavevapes_products_backup_${new Date().toISOString().slice(0,10)}.csv`; link.click();
    showToast("✅ CSV-Datei heruntergeladen!", "success");
}
async function importProductsFromCSV(e) {
    const file = e.target.files[0]; if (!file) return;
    if (!confirm("⚠️ WARNUNG!\n\nAlle aktuellen Produkte werden GELÖSCHT und durch die CSV ersetzt.\n\nWirklich fortfahren?")) { e.target.value=""; return; }
    const reader = new FileReader();
    reader.onload = async function(event) {
        try {
            const text = event.target.result; const rows = text.trim().split("\n");
            // Delete existing in chunks of 499
            const deleteSnapshot = await db.collection("products").get();
            const deleteDocs = deleteSnapshot.docs;
            for (let i = 0; i < deleteDocs.length; i += 499) {
                const b = db.batch();
                deleteDocs.slice(i, i + 499).forEach(doc => b.delete(doc.ref));
                await b.commit();
            }
            // Import in chunks of 499
            let batch = db.batch(); let count = 0;
            for (let i = 1; i < rows.length; i++) {
                if (!rows[i].trim()) continue;
                const v = parseCSVLine(rows[i]);
                batch.set(db.collection("products").doc(v[0]), { name:v[1], price:parseFloat(v[2]), originalPrice:v[3]?parseFloat(v[3]):null, stock:parseInt(v[4], 10), category:v[5], isNew:v[6]==="true", available:v[7]==="true", hasNicotine:v[8]==="true", description:v[9], image:v[10]||null, sold:parseInt(v[11], 10)||0 });
                count++;
                if (count % 499 === 0) { await batch.commit(); batch = db.batch(); }
            }
            if (count % 499 !== 0) await batch.commit();
            showToast(`✅ ${count} Produkte wiederhergestellt!`, "success"); loadProducts();
        } catch(err) { showToast("❌ Import fehlgeschlagen: " + err.message, "error"); }
    };
    reader.readAsText(file); e.target.value = "";
}

async function exportOrdersToCSV() {
    const snapshot = await db.collection("orders").orderBy("date", "desc").get();
    if (snapshot.empty) { showToast('Keine Bestellungen vorhanden', 'error'); return; }
    let csv = "docId,orderNumber,datum,email,gesamt,status,items,street,zip,city,kundenwunsch\n";
    snapshot.forEach(doc => {
        const o = doc.data(); const dateStr = o.date ? o.date.toDate().toISOString().slice(0,19).replace('T',' ') : '';
        const itemsStr = (o.items||[]).map(i => {
            if (i.isBundle) {
                const flavors = i.selectedFlavors && i.selectedFlavors.length
                    ? ' [' + i.selectedFlavors.map(sf => `${sf.slot}. ${sf.flavor}${sf.nicotine ? ' ' + sf.nicotine : ''}`).join(', ') + ']'
                    : '';
                return `🎁 ${i.name} x${i.qty}${flavors}`;
            }
            return `${i.name} x${i.qty}${i.nicotine ? ' (' + i.nicotine + ')' : ''}`;
        }).join(' | ');
        const safeStreet = (o.address?.street||"").replace(/"/g,'""')
        const safeZip    = (o.address?.zip||"").replace(/"/g,'""')
        const safeCity   = (o.address?.city||"").replace(/"/g,'""')
        csv += [`"${doc.id}"`,`"${o.orderNumber||''}"`,`"${dateStr}"`,`"${o.userEmail||''}"`,o.total||0,`"${o.status||'Zahlung erwartet'}"`,`"${itemsStr.replace(/"/g,'""')}"`,`"${safeStreet}"`,`"${safeZip}"`,`"${safeCity}"`,`"${csvSafe(o.orderNote||'').replace(/"/g,'""')}"`].join(",") + "\n";
    });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob);
    link.download = `wavevapes_bestellungen_${new Date().toISOString().slice(0,10)}.csv`; link.click();
    showToast("✅ Bestellungen exportiert!", "success");
}
async function importOrdersFromCSV(e) {
    const file = e.target.files[0]; if (!file) return;
    if (!confirm("⚠️ Bestellungen werden ZUSÄTZLICH hinzugefügt. Fortfahren?")) { e.target.value=""; return; }
    const reader = new FileReader();
    reader.onload = async function(event) {
        try {
            const rows = event.target.result.trim().split("\n");
            let batch = db.batch(); let count = 0;
            for (let i = 1; i < rows.length; i++) {
                if (!rows[i].trim()) continue;
                const v = parseCSVLine(rows[i]);
                batch.set(db.collection("orders").doc(v[0]), { orderNumber:v[1], date:firebase.firestore.Timestamp.fromDate(new Date(v[2])), userEmail:v[3], total:parseFloat(v[4]), status:v[5], items:v[6].split(' | ').map(item=>{const p=item.match(/(.*?) x(\d+)(?:\s*\((.*)\))?/);return p?{name:p[1].trim(),qty:parseInt(p[2], 10),nicotine:p[3]||""}:{}}).filter(Boolean), // BUG FIX: address now stored as 3 separate CSV columns (street, zip, city)
                    address:{street:v[7]||"",zip:v[8]||"",city:v[9]||""} });
                count++;
                if (count % 499 === 0) { await batch.commit(); batch = db.batch(); }
            }
            if (count % 499 !== 0) await batch.commit();
            showToast(`✅ ${count} Bestellungen importiert!`, "success"); loadOrders();
        } catch(err) { showToast("❌ Import fehlgeschlagen: " + err.message, "error"); }
    };
    reader.readAsText(file); e.target.value = "";
}

async function exportUsersToCSV() {
    const snapshot = await db.collection("users").get();
    if (snapshot.empty) { showToast('Keine Benutzer vorhanden', 'error'); return; }
    let csv = "uid,email,username,referralCode,loyaltyPoints,freeShipping,disabled,referralCount\n";
    snapshot.forEach(doc => { const u = doc.data(); csv += [`"${doc.id}"`,`"${csvSafe(u.email||'')}"`,`"${csvSafe(u.username||'')}"`,`"${csvSafe(u.referralCode||'')}"`,u.totalBonusPoints||0,u.freeShipping===true?"JA":"NEIN",u.disabled===true?"JA":"NEIN",u.referralCount||0].join(",") + "\n"; });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob);
    link.download = `wavevapes_benutzer_${new Date().toISOString().slice(0,10)}.csv`; link.click();
    showToast("✅ Benutzer exportiert!", "success");
}
async function importUsersFromCSV(e) {
    const file = e.target.files[0]; if (!file) return;
    if (!confirm("⚠️ Benutzer werden ZUSÄTZLICH hinzugefügt. Fortfahren?")) { e.target.value=""; return; }
    const reader = new FileReader();
    reader.onload = async function(event) {
        try {
            const rows = event.target.result.trim().split("\n");
            let batch = db.batch(); let count = 0;
            for (let i = 1; i < rows.length; i++) {
                if (!rows[i].trim()) continue;
                const v = parseCSVLine(rows[i]);
                batch.set(db.collection("users").doc(v[0]), { email:v[1], username:v[2], referralCode:v[3], totalBonusPoints:parseInt(v[4], 10), freeShipping:v[5]==="JA", disabled:v[6]==="JA", referralCount:parseInt(v[7], 10)||0 });
                count++;
                if (count % 499 === 0) { await batch.commit(); batch = db.batch(); }
            }
            if (count % 499 !== 0) await batch.commit();
            showToast(`✅ ${count} Benutzer importiert!`, "success"); loadUsers();
        } catch(err) { showToast("❌ Import fehlgeschlagen: " + err.message, "error"); }
    };
    reader.readAsText(file); e.target.value = "";
}
function parseCSVLine(line) { return line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(f => f.replace(/^"|"$/g,'').replace(/""/g,'"')); }

// ====================== KATEGORIEN v2 ======================
let _catEditId = null;


// ═══════════════════════════════════════════════════
//  CATEGORY OFFER CONFIGURATOR
// ═══════════════════════════════════════════════════
function catToggleOfferBox(boxId, show) {
    const box = document.getElementById(boxId);
    if (!box) return;
    box.classList.toggle('open', show);
    const ctx = boxId.includes('edit') ? 'edit' : 'add';
    if (show) catRenderOfferFields(ctx, document.getElementById(`cat-offer-type-val-${ctx}`).value);
}

function catSelectOfferType(ctx, btn) {
    const type = btn.dataset.type;
    document.getElementById(`cat-offer-type-val-${ctx}`).value = type;
    document.querySelectorAll(`#cat-offer-type-row-${ctx} .cat-offer-type-btn`).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    catRenderOfferFields(ctx, type);
    catUpdateOfferPreview(ctx);
}

function catRenderOfferFields(ctx, type) {
    const container = document.getElementById(`cat-offer-fields-${ctx}`);
    if (!container) return;
    if (type === 'nforn') {
        const n = document.getElementById(`cat-offer-n-${ctx}`)?.value || 4;
        const m = document.getElementById(`cat-offer-m-${ctx}`)?.value || 3;
        container.innerHTML = `
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                <label style="font-size:11px;color:rgba(255,255,255,.4)">Kaufe</label>
                <input type="number" min="2" max="99" value="${n}" style="width:52px" class="cat-offer-input" oninput="document.getElementById('cat-offer-n-${ctx}').value=this.value;catUpdateOfferPreview('${ctx}')" placeholder="4">
                <label style="font-size:11px;color:rgba(255,255,255,.4)">zahle</label>
                <input type="number" min="1" max="98" value="${m}" style="width:52px" class="cat-offer-input" oninput="document.getElementById('cat-offer-m-${ctx}').value=this.value;catUpdateOfferPreview('${ctx}')" placeholder="3">
            </div>`;
    } else if (type === 'percent') {
        const v = document.getElementById(`cat-offer-n-${ctx}`)?.value || 10;
        container.innerHTML = `
            <div style="display:flex;align-items:center;gap:6px">
                <input type="number" min="1" max="99" value="${v}" style="width:70px" class="cat-offer-input" oninput="document.getElementById('cat-offer-n-${ctx}').value=this.value;catUpdateOfferPreview('${ctx}')" placeholder="10">
                <label style="font-size:11px;color:rgba(255,255,255,.4)">% Rabatt auf alle Produkte</label>
            </div>`;
    } else if (type === 'fixed') {
        const v = document.getElementById(`cat-offer-n-${ctx}`)?.value || 2;
        container.innerHTML = `
            <div style="display:flex;align-items:center;gap:6px">
                <input type="number" min="0.01" step="0.01" value="${v}" style="width:80px" class="cat-offer-input" oninput="document.getElementById('cat-offer-n-${ctx}').value=this.value;catUpdateOfferPreview('${ctx}')" placeholder="2.00">
                <label style="font-size:11px;color:rgba(255,255,255,.4)">€ Rabatt pro Produkt</label>
            </div>`;
    } else {
        container.innerHTML = '<div style="font-size:11px;color:rgba(255,255,255,.3)">Nur Badge-Text wird angezeigt – keine Rabattlogik.</div>';
    }
    catUpdateOfferPreview(ctx);
}

function catUpdateOfferPreview(ctx) {
    const type  = document.getElementById(`cat-offer-type-val-${ctx}`)?.value || 'nforn';
    const n     = document.getElementById(`cat-offer-n-${ctx}`)?.value;
    const m     = document.getElementById(`cat-offer-m-${ctx}`)?.value;
    const badge = document.getElementById(`cat-badge-text-${ctx}`)?.value;
    const prev  = document.getElementById(`cat-offer-preview-${ctx}`);
    if (!prev) return;
    let text = '';
    if (type === 'nforn') text = badge || `${n} FÜR ${m}`;
    else if (type === 'percent') text = badge || `-${n}%`;
    else if (type === 'fixed') text = badge || `-${n}€`;
    else text = badge || '–';
    prev.textContent = `Vorschau Badge: ⚡ ${text}`;
    // Also update badge text placeholder if empty
    const bi = document.getElementById(`cat-badge-text-${ctx}`);
    if (bi && !bi.value) {
        if (type === 'nforn') bi.placeholder = `${n} FÜR ${m}`;
        else if (type === 'percent') bi.placeholder = `-${n}%`;
        else if (type === 'fixed') bi.placeholder = `-${n}€`;
    }
}

function catGetOfferData(ctx) {
    const special  = document.getElementById(`${ctx === 'edit' ? 'edit-' : ''}cat-special`)?.checked || false;
    if (!special) return { special: false, offerType: null, offerN: null, offerM: null, specialText: null };
    const offerType = document.getElementById(`cat-offer-type-val-${ctx}`)?.value || 'nforn';
    const offerN    = parseFloat(document.getElementById(`cat-offer-n-${ctx}`)?.value) || (offerType === 'nforn' ? 4 : 10);
    const offerM    = parseFloat(document.getElementById(`cat-offer-m-${ctx}`)?.value) || 3;
    const badgeInput = document.getElementById(`cat-badge-text-${ctx}`)?.value.trim();
    let specialText;
    if (badgeInput) specialText = badgeInput;
    else if (offerType === 'nforn') specialText = `${offerN} FÜR ${offerM}`;
    else if (offerType === 'percent') specialText = `-${offerN}%`;
    else if (offerType === 'fixed') specialText = `-${offerN}€`;
    else specialText = 'SPECIAL';
    return { special: true, offerType, offerN, offerM, specialText };
}

function catLoadOfferIntoForm(ctx, c) {
    const isEdit = ctx === 'edit';
    const specialCb = document.getElementById(`${isEdit ? 'edit-' : ''}cat-special`);
    if (!specialCb) return;
    specialCb.checked = !!c.special;
    const boxId = `cat-offer-box-${ctx}`;
    catToggleOfferBox(boxId, !!c.special);
    if (!c.special) return;
    const type = c.offerType || 'nforn';
    document.getElementById(`cat-offer-type-val-${ctx}`).value = type;
    document.querySelectorAll(`#cat-offer-type-row-${ctx} .cat-offer-type-btn`).forEach(b => {
        b.classList.toggle('active', b.dataset.type === type);
    });
    if (c.offerN) document.getElementById(`cat-offer-n-${ctx}`).value = c.offerN;
    if (c.offerM) document.getElementById(`cat-offer-m-${ctx}`).value = c.offerM;
    if (c.specialText) document.getElementById(`cat-badge-text-${ctx}`).value = c.specialText;
    catRenderOfferFields(ctx, type);
}

function catCloseInlineEdit() {
    _catEditId = null;
    document.getElementById('cat-edit-panel').classList.remove('open');
}

function catOpenInlineEdit(id) {
    const c = allCategories.find(x => x.id === id);
    if (!c) return;
    _catEditId = id;
    document.getElementById('edit-cat-name').value  = c.name;
    document.getElementById('edit-cat-order').value = c.order;
    catLoadOfferIntoForm('edit', c);
    document.getElementById('cat-edit-panel').classList.add('open');
    document.getElementById('edit-cat-name').focus();
}

async function catSaveInlineEdit() {
    if (!_catEditId) return;
    const name      = document.getElementById('edit-cat-name').value.trim();
    const order     = parseInt(document.getElementById('edit-cat-order').value, 10) || 999;
    const offerData = catGetOfferData('edit');
    if (!name) return showToast('Name erforderlich','error');
    try {
        await db.collection('categories').doc(_catEditId).update({ name, order, ...offerData });
        await logAction("category_updated", _catEditId, { name, ...offerData });
        catCloseInlineEdit();
        showToast('✅ Kategorie gespeichert!');
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

// E-NEW-03 FIX: Track listener for consistency with other loaders
let _categoriesUnsub = null;
function loadCategories() {
    if (_categoriesUnsub) { _categoriesUnsub(); _categoriesUnsub = null; }
    let _firstCatLoad = true; // E-08 FIX
    _categoriesUnsub = db.collection('categories').orderBy('order').onSnapshot(snap => {
        allCategories = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCategoryTable();
        populateCategorySelects();
        // E-08 FIX: Populate filter on first snapshot – replaces the removed setTimeout
        if (_firstCatLoad) { _firstCatLoad = false; populateAdminCategoryFilter(); }
        else { populateAdminCategoryFilter(); }
    });
}

function renderCategoryTable() {
    const grid  = document.getElementById('cat-grid');
    const badge = document.getElementById('cat-total-badge');
    if (badge) badge.textContent = allCategories.length + ' Kategorie' + (allCategories.length !== 1 ? 'n' : '');

    if (!allCategories.length) {
        grid.innerHTML = `<div class="cat-empty"><i class="fa-solid fa-tags"></i>Noch keine Kategorien.<br>Nutze „Standard laden" oder erstelle eine.</div>`;
        return;
    }

    // count products per category
    const prodCount = {};
    allProducts.forEach(p => {
        if (p.category) prodCount[p.category] = (prodCount[p.category]||0) + 1;
    });

    let html = '';
    allCategories.forEach((c, idx) => {
        const rankClass = idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : '';
        const pCount    = prodCount[c.name] || 0;
        const isEdit    = _catEditId === c.id;

        html += `<div class="cat-row" style="animation-delay:${Math.min(idx,10)*.025}s" id="cat-row-${c.id}">
            <div class="cat-rank ${rankClass}">${c.order}</div>
            <div class="cat-info">
                <div class="cat-name">${escA(c.name)}</div>
                <div class="cat-meta-row">
                    ${c.special ? `<span class="cat-pill cat-pill-special"><i class="fa-solid fa-bolt" style="margin-right:3px"></i>${c.specialText || (c.offerType === 'percent' ? c.offerN+'%' : c.offerType === 'fixed' ? '-'+c.offerN+'€' : (c.offerN||4)+' FÜR '+(c.offerM||3))}</span>` : ''}
                    <span class="cat-pill cat-pill-products">${pCount} Produkt${pCount!==1?'e':''}</span>
                </div>
            </div>
            <div class="cat-actions">
                <button class="cat-act-btn cyan" onclick="catOpenInlineEdit('${c.id}')" title="Bearbeiten"><i class="fa-solid fa-pen"></i></button>
                <button class="cat-act-btn red"  onclick="deleteCategory('${c.id}')"   title="Löschen"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>`;
    });
    grid.innerHTML = html;
}

document.getElementById('add-category-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name   = document.getElementById('cat-name').value.trim();
    const order  = parseInt(document.getElementById('cat-order').value, 10) || 999;
    const offerData = catGetOfferData('add');
    if (!name) return showToast('Name erforderlich','error');
    await db.collection('categories').add({ name, order, ...offerData });
    await logAction("category_created", "", { name, ...offerData });
    e.target.reset();
    document.getElementById('cat-special').checked = false;
    catToggleOfferBox('cat-offer-box-add', false);
    showToast('✅ Kategorie erstellt!');
});

// keep openEditCategoryModal as alias for any other callers
async function openEditCategoryModal(id) { catOpenInlineEdit(id); }
async function saveEditCategory(id)      { await catSaveInlineEdit(); }

async function deleteCategory(id) {
    if (!confirm('Kategorie wirklich löschen?')) return;
    if (_catEditId === id) catCloseInlineEdit();
    try {
        await db.collection('categories').doc(id).delete();
        await logAction("category_deleted", id);
        showToast('✅ Kategorie gelöscht');
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

function seedDefaultCategories() {
    if (allCategories.length > 0 && !confirm('Standard-Kategorien laden? Bestehende bleiben erhalten.')) return;
    [
        { name:"WaveVapes Tornado 30000", order:1, special:true  },
        { name:"Normale Sorten",          order:2, special:false },
        { name:"Neue Sorten",             order:3, special:false },
    ].forEach(d => db.collection('categories').add(d));
    showToast('✅ Standard-Kategorien angelegt!');
}

function populateCategorySelects() {
    const opts = [{ value:'', label:'Kategorie wählen...' }, ...allCategories.map(c=>({ value:c.name, label:c.name }))];
    ['prod-category', 'edit-category-select', 'bulk-category', 'ped-cat-select', 'bke-cat-select'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const cur = el.dataset.csValue || el.value || '';
        const wrap = el.parentElement?.querySelector('.cs-wrap');
        if (wrap?._updateOptions) {
            wrap._updateOptions(opts, cur);
        } else {
            // First time init
            el.innerHTML = '<option value="">Kategorie wählen...</option>';
            allCategories.forEach(c => { const o=document.createElement('option'); o.value=c.name; o.textContent=c.name; el.appendChild(o); });
            initCustomSelect(id, opts, cur, id === 'bulk-category' ? null : null);
        }
    });
}

function populateAdminCategoryFilter() {
    const opts = [{ value:'Alle', label:'Alle Kategorien' }, ...allCategories.map(c=>({ value:c.name, label:c.name }))];
    const wrap = document.getElementById('admin-category-filter')?.parentElement?.querySelector('.cs-wrap');
    if (wrap?._updateOptions) {
        wrap._updateOptions(opts, adminCategoryFilter || 'Alle');
    } else {
        initCustomSelect('admin-category-filter', opts, adminCategoryFilter || 'Alle', val => {
            adminCategoryFilter = val;
            renderProductTable();
        });
    }
}

// ====================== GUTSCHEINE BULK GENERATOR ======================

let _bulkLastCodes = []; // store for copy/download

function cpnSwitchMode(mode) {
    const isBulk = mode === 'bulk';
    document.getElementById('add-coupon-form').style.display   = isBulk ? 'none' : 'flex';
    document.getElementById('cpn-bulk-panel').style.display    = isBulk ? 'flex' : 'none';
    // Button styles
    const btnSingle = document.getElementById('cpn-mode-single');
    const btnBulk   = document.getElementById('cpn-mode-bulk');
    if (isBulk) {
        btnBulk.style.cssText   = btnBulk.style.cssText.replace(/border:[^;]+;background:[^;]+;color:[^;]+/g,'') + ';border:1px solid rgba(167,139,250,.4);background:rgba(167,139,250,.12);color:#a78bfa';
        btnSingle.style.cssText = btnSingle.style.cssText.replace(/border:[^;]+;background:[^;]+;color:[^;]+/g,'') + ';border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);color:rgba(255,255,255,.4)';
    } else {
        btnSingle.style.cssText = btnSingle.style.cssText.replace(/border:[^;]+;background:[^;]+;color:[^;]+/g,'') + ';border:1px solid rgba(251,191,36,.4);background:rgba(251,191,36,.12);color:#fbbf24';
        btnBulk.style.cssText   = btnBulk.style.cssText.replace(/border:[^;]+;background:[^;]+;color:[^;]+/g,'') + ';border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);color:rgba(255,255,255,.4)';
    }
}

function cpnBulkSelectType(val, el) {
    document.querySelectorAll('#bulk-type-toggle .cpn-type-opt').forEach(o => o.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('bulk-type').value = val;
}

function cpnBulkPreview() {
    const prefix = document.getElementById('bulk-prefix').value || 'CODE';
    const count  = parseInt(document.getElementById('bulk-count').value) || 10;
    const ex1 = prefix + '-' + _cpnRandSuffix();
    const ex2 = prefix + '-' + _cpnRandSuffix();
    document.getElementById('bulk-preview-line').textContent =
        `z.B. ${ex1}, ${ex2}, … (${count} Codes)`;
}

function _cpnRandSuffix(len = 6) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0,O,1,I to avoid confusion
    let s = '';
    for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
}

function _cpnGenerateCodes(prefix, count) {
    const codes = new Set();
    while (codes.size < count) {
        codes.add((prefix ? prefix + '-' : '') + _cpnRandSuffix());
    }
    return [...codes];
}

async function cpnBulkGenerate() {
    const prefix  = document.getElementById('bulk-prefix').value.trim().toUpperCase() || 'CODE';
    const count   = parseInt(document.getElementById('bulk-count').value) || 10;
    const type    = document.getElementById('bulk-type').value;
    const value   = parseFloat(document.getElementById('bulk-value').value);
    const expiryV = document.getElementById('bulk-expiry').value;

    if (!value || value <= 0) return showToast('❌ Bitte einen Wert eingeben.', 'error');
    if (!expiryV)             return showToast('❌ Bitte ein Ablaufdatum wählen.', 'error');

    const expiry = new Date(expiryV);
    const btnLabel = document.getElementById('bulk-btn-label');
    btnLabel.innerHTML = '<span class="eu-spinner" style="width:14px;height:14px;border-width:2px"></span> Erstelle Codes…';

    // Check for existing codes to avoid collisions
    let existingCodes = new Set();
    try {
        const snap = await db.collection('coupons').get();
        snap.forEach(d => existingCodes.add(d.data().code));
    } catch(e) {}

    // Generate unique codes
    let codes = _cpnGenerateCodes(prefix, count);
    // Retry any collisions
    codes = codes.map(c => {
        let attempt = c;
        while (existingCodes.has(attempt)) { attempt = (prefix ? prefix + '-' : '') + _cpnRandSuffix(); }
        return attempt;
    });

    // Batch write to Firestore
    const batch = db.batch();
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const expTs = firebase.firestore.Timestamp.fromDate(expiry);
    codes.forEach(code => {
        const ref = db.collection('coupons').doc();
        batch.set(ref, {
            code,
            type,
            value,
            expiresAt: expTs,
            oneTimeUse: true,      // nur 1× pro User
            maxUsages: 1,          // ← global: nur 1 Person kann diesen Code je einlösen
            usedBy: [],
            totalUsages: 0,
            active: true,
            bulkGenerated: true,
            bulkPrefix: prefix,
            createdAt: now
        });
    });

    try {
        await batch.commit();
        await logAction('bulk_coupons_created', `${prefix} ×${count}`);
        showToast(`✅ ${count} Codes erfolgreich erstellt!`);
    } catch(e) {
        showToast('❌ Fehler beim Speichern: ' + e.message, 'error');
        btnLabel.textContent = 'Codes generieren';
        return;
    }

    btnLabel.innerHTML = '<i class="fa-solid fa-layer-group"></i> Nochmal generieren';

    // Store for copy/download
    _bulkLastCodes = codes;

    // Render result list
    const discountStr = type === 'percent' ? value + '%' : value.toFixed(2) + ' €';
    document.getElementById('bulk-result-title').textContent = `${count} Codes erstellt · ${discountStr} · nur 1× einlösbar`;
    const listEl = document.getElementById('bulk-code-list');
    listEl.innerHTML = codes.map(c =>
        `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 11px;background:rgba(167,139,250,.05);border:1px solid rgba(167,139,250,.12);border-radius:9px;gap:8px">
            <span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:rgba(255,255,255,.85);letter-spacing:.06em">${c}</span>
            <button onclick="navigator.clipboard.writeText('${c}').then(()=>showToast('📋 ${c} kopiert'))"
                style="padding:3px 9px;border-radius:6px;border:1px solid rgba(167,139,250,.25);background:rgba(167,139,250,.07);color:#a78bfa;font-size:10px;font-weight:600;cursor:pointer;flex-shrink:0;transition:all .15s"
                onmouseover="this.style.background='rgba(167,139,250,.18)'" onmouseout="this.style.background='rgba(167,139,250,.07)'">
                <i class="fa-solid fa-copy"></i>
            </button>
        </div>`
    ).join('');
    document.getElementById('bulk-result-panel').style.display = 'flex';

    loadCoupons();
}

function cpnBulkCopyAll() {
    if (!_bulkLastCodes.length) return;
    navigator.clipboard.writeText(_bulkLastCodes.join('\n')).then(() => {
        showToast(`📋 ${_bulkLastCodes.length} Codes kopiert`);
    });
}

function cpnBulkDownloadCSV() {
    if (!_bulkLastCodes.length) return;
    const type    = document.getElementById('bulk-type').value;
    const value   = parseFloat(document.getElementById('bulk-value').value) || 0;
    const expiryV = document.getElementById('bulk-expiry').value;
    const discStr = type === 'percent' ? value + '%' : value.toFixed(2) + ' EUR';

    const header = 'Code,Rabatt,Typ,Gültig bis,Max. Einlösungen\n';
    const rows   = _bulkLastCodes.map(c =>
        `${c},${discStr},${type === 'percent' ? 'Prozent' : 'Festbetrag'},${expiryV},1`
    ).join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `wavevapes-gutscheine-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('⬇️ CSV heruntergeladen');
}

// ====================== GUTSCHEINE v2 ======================
function cpnSelectType(val, el) {
    document.querySelectorAll('.cpn-type-opt').forEach(o => o.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('coupon-type').value = val;
}

function cpnCloseHistory() {
    document.getElementById('cpn-overlay').classList.remove('open');
    document.getElementById('cpn-hist-drawer').classList.remove('open');
}

function cpnFilterRender() {
    const q = (document.getElementById('cpn-search')?.value || '').toLowerCase();
    const filtered = q ? allCoupons.filter(c => c.code.toLowerCase().includes(q)) : allCoupons;
    cpnRenderGrid(filtered);
}

function cpnRenderGrid(coupons) {
    const grid = document.getElementById('cpn-grid');
    const badge = document.getElementById('cpn-total-badge');
    if (badge) badge.textContent = allCoupons.length + ' Gutschein' + (allCoupons.length !== 1 ? 'e' : '');

    if (!coupons.length) {
        grid.innerHTML = `<div class="cpn-empty"><i class="fa-solid fa-ticket"></i>${allCoupons.length ? 'Keine Treffer' : 'Noch keine Gutscheine'}</div>`;
        return;
    }

    const now = new Date();
    let html = '';
    coupons.forEach((c, idx) => {
        // BUG FIX: expiresAt kann undefined sein (manuell angelegte Gutscheine).
        // Ohne Null-Check wirft .toDate() einen TypeError und die gesamte Tabelle rendert nicht.
        const expiryDate = c.expiresAt ? c.expiresAt.toDate() : null;
        const expired    = expiryDate ? expiryDate < now : false;
        const uses       = c.totalUsages !== undefined ? c.totalUsages : (c.usedBy ? c.usedBy.length : 0);
        // K-06 FIX: Use real maxUsages from Firestore, not uses*2 which always produced ~50%
        const maxUses    = c.oneTimeUse ? 1 : (c.maxUsages || null);
        const pct        = maxUses !== null ? Math.min(100, Math.round(uses / Math.max(maxUses, 1) * 100)) : null;
        const discount   = c.type === 'percent' ? (c.value||0) + '%' : (c.value||0).toFixed(2) + ' €';
        const typeLabel  = c.type === 'percent' ? 'Prozent-Rabatt' : 'Festbetrag';
        const expiryStr  = expiryDate ? expiryDate.toLocaleDateString('de-DE') : '—';
        const daysLeft   = expiryDate ? Math.ceil((expiryDate - now) / 86400000) : null;
        const accent     = expired ? 'rgba(248,113,113,.4)' : 'rgba(251,191,36,.5)';

        html += `<div class="cpn-card${expired ? ' expired' : ''}" style="--cpn-card-accent:${accent};animation-delay:${Math.min(idx,10)*.03}s">
            <div class="cpn-card-top">
                <div>
                    <div class="cpn-card-code">${c.code}</div>
                    <div style="margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                        <span class="cpn-pill ${expired ? 'cpn-pill-expired' : 'cpn-pill-active'}">${expired ? '⏱ ABGELAUFEN' : (daysLeft !== null && daysLeft <= 7) ? `⚠ ${daysLeft}T` : '● AKTIV'}</span>
                        <span class="cpn-pill ${c.oneTimeUse ? 'cpn-pill-once' : 'cpn-pill-multi'}">${c.oneTimeUse ? '1× einmalig' : '∞ mehrfach'}</span>
                        ${c.globalOnce ? '<span class="cpn-pill" style="background:rgba(251,191,36,.15);border:1px solid rgba(251,191,36,.3);color:#fbbf24;font-size:10px"><i class="fa-solid fa-globe" style="margin-right:3px;font-size:9px"></i>Global 1×</span>' : ''}
                    </div>
                </div>
                <div style="text-align:right;flex-shrink:0">
                    <div class="cpn-card-discount">${discount}</div>
                    <div class="cpn-card-type-lbl">${typeLabel}</div>
                    <div style="font-size:9px;color:var(--cpn-muted);margin-top:2px">${expired ? '⚠ ' : ''}${expiryStr}</div>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.05)">
                <div class="cpn-usage-wrap">
                    <div class="cpn-usage-label">Einlösungen</div>
                    ${pct !== null
                        ? `<div class="cpn-usage-bar-bg"><div class="cpn-usage-bar" style="width:${pct}%"></div></div>`
                        : `<div style="font-size:10px;color:rgba(255,255,255,.3);font-style:italic">unbegrenzt</div>`}
                </div>
                <div class="cpn-usage-count">${uses}${c.oneTimeUse ? '/1' : maxUses !== null ? '/'+maxUses : ''}</div>
                <div class="cpn-card-actions">
                    <button class="cpn-act-btn amber" onclick="showCouponHistory('${c.id}')" title="Einlösungs-History"><i class="fa-solid fa-clock-rotate-left"></i></button>
                    <button class="cpn-act-btn" onclick="resetCoupon('${c.id}','${c.code}')" title="Einlösungen zurücksetzen" style="background:rgba(52,211,153,.12);border-color:rgba(52,211,153,.3);color:#34d399"><i class="fa-solid fa-rotate-left"></i></button>
                    <button class="cpn-act-btn red"   onclick="deleteCoupon('${c.id}')" title="Löschen"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        </div>`;
    });
    grid.innerHTML = html;
}

document.getElementById('add-coupon-form').addEventListener('submit', async e => {
    e.preventDefault();
    const code    = document.getElementById('coupon-code').value.trim().toUpperCase();
    const type    = document.getElementById('coupon-type').value;
    const value   = parseFloat(document.getElementById('coupon-value').value);
    const expiry  = new Date(document.getElementById('coupon-expiry').value);
    const oneTime    = document.getElementById('coupon-onetime').checked;
    const globalOnce = document.getElementById('coupon-global-once').checked;
    // NEU-02 FIX: maxUsages aus neuem Formularfeld lesen
    // globalOnce setzt maxUsages hart auf 1 (Code ist insgesamt nur 1× einlösbar)
    const maxUsagesRaw = document.getElementById('coupon-maxusages')?.value;
    const maxUsages = globalOnce ? 1
        : (maxUsagesRaw && parseInt(maxUsagesRaw, 10) > 0 ? parseInt(maxUsagesRaw, 10) : null);
    await db.collection('coupons').add({
        code, type, value,
        expiresAt: firebase.firestore.Timestamp.fromDate(expiry),
        oneTimeUse: oneTime, usedBy: [], totalUsages: 0,
        globalOnce,                                           // NEU: global nur 1× einlösbar
        ...(maxUsages !== null ? { maxUsages } : {}),
        active: true, // NEU-06 FIX: active explizit setzen statt undefined (semantisch korrekt)
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await logAction("coupon_created", code);
    e.target.reset();
    // reset type toggle to percent
    document.querySelectorAll('.cpn-type-opt').forEach(o => o.classList.toggle('active', o.dataset.val === 'percent'));
    document.getElementById('coupon-type').value = 'percent';
    // reset global-once toggle
    document.getElementById('coupon-global-once').checked = false;
    showToast('✅ Gutschein erstellt!');
    loadCoupons();
});

async function resetCoupon(id, code) {
    if (!confirm(`Gutschein „${code}" zurücksetzen?\n\nDies setzt alle Einlösungen (usedBy & totalUsages) auf 0 zurück — der Gutschein kann danach von allen Nutzern erneut eingelöst werden.`)) return;
    try {
        await db.collection('coupons').doc(id).update({
            usedBy: [],
            totalUsages: 0
        });
        await logAction('coupon_reset', code, { couponId: id });
        showToast(`✅ Gutschein „${code}" zurückgesetzt`, 'success');
        loadCoupons();
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

async function loadCoupons() {
    const snap = await db.collection('coupons').orderBy('createdAt','desc').get();
    allCoupons = snap.docs.map(d => ({id:d.id,...d.data()}));
    cpnFilterRender();
}

function renderCouponsTable() { cpnFilterRender(); } // legacy alias

async function showCouponHistory(couponId) {
    const couponDoc = await db.collection('coupons').doc(couponId).get();
    if (!couponDoc.exists) return showToast("Gutschein nicht gefunden","error");
    const coupon = couponDoc.data();
    const uses   = coupon.totalUsages !== undefined ? coupon.totalUsages : (coupon.usedBy ? coupon.usedBy.length : 0);
    const discount = coupon.type === 'percent' ? (coupon.value || 0) + '%' : (coupon.value || 0).toFixed(2) + ' €';

    document.getElementById('cpn-hist-code').textContent     = coupon.code;
    document.getElementById('cpn-hist-stat-uses').textContent = uses + '×';
    document.getElementById('cpn-hist-stat-val').textContent  = discount;
    // BUG FIX: expiresAt kann undefined sein — Null-Check vor .toDate()
    document.getElementById('cpn-hist-stat-exp').textContent  = coupon.expiresAt ? coupon.expiresAt.toDate().toLocaleDateString('de-DE') : '—';

    const body = document.getElementById('cpn-hist-body');
    body.innerHTML = '<div class="cpn-hist-empty"><span class="eu-spinner"></span><br><br>Lade...</div>';

    document.getElementById('cpn-overlay').classList.add('open');
    document.getElementById('cpn-hist-drawer').classList.add('open');

    if (!coupon.usedBy || coupon.usedBy.length === 0) {
        body.innerHTML = `<div class="cpn-hist-empty"><i class="fa-solid fa-clock-rotate-left"></i>Noch von niemandem eingelöst.</div>`;
        return;
    }

    let html = '';
    for (let uid of coupon.usedBy) {
        let email = uid, username = '—';
        try {
            const ud = await db.collection('users').doc(uid).get();
            if (ud.exists) { email = ud.data().email || uid; username = ud.data().username || '—'; }
        } catch(err) {}
        const initials = email.slice(0,2).toUpperCase();
        html += `<div class="cpn-hist-user">
            <div class="cpn-hist-av">${initials}</div>
            <div class="cpn-hist-info">
                <div class="cpn-hist-email">${email}</div>
                <div class="cpn-hist-uname">${username}</div>
            </div>
            <span class="cpn-hist-check"><i class="fa-solid fa-check" style="margin-right:3px"></i>eingelöst</span>
        </div>`;
    }
    body.innerHTML = html;
}

async function deleteCoupon(id) {
    if (!confirm('Gutschein wirklich löschen?')) return;
    // BUG FIX: No try/catch — a Firestore error silently left the coupon in the list.
    try {
        await db.collection('coupons').doc(id).delete();
        await logAction("coupon_deleted", id);
        showToast('🗑️ Gutschein gelöscht');
        loadCoupons();
    } catch(e) {
        showToast('❌ Löschen fehlgeschlagen: ' + e.message, 'error');
    }
}

// ====================== BESTELLUNGEN v2 ======================
const ORD_STATUS_CLASS = {
    'Zahlung erwartet': 'ord-st-zahlung',
    'Wird bearbeitet':  'ord-st-wird',
    'Versendet':        'ord-st-versendet',
    'Zugestellt':       'ord-st-zugestellt',
    'Storniert':        'ord-st-storniert',
};
const ORD_KPI_IDS = {
    'Zahlung erwartet': 'ord-cnt-zahlung',
    'Wird bearbeitet':  'ord-cnt-wird',
    'Versendet':        'ord-cnt-versendet',
    'Zugestellt':       'ord-cnt-zugestellt',
};
let _ordAllDocs = [];

function ordSetFilter(status) {
    document.getElementById('status-filter').value = status;
    // update active KPI
    document.querySelectorAll('.ord-kpi').forEach(k => k.classList.remove('active'));
    if (!status) document.getElementById('ord-kpi-all')?.classList.add('active');
    else {
        const map = { 'Zahlung erwartet':'ord-kpi-zahlung','Wird bearbeitet':'ord-kpi-wird','Versendet':'ord-kpi-versendet','Zugestellt':'ord-kpi-zugestellt' };
        if (map[status]) document.getElementById(map[status])?.classList.add('active');
    }
    ordRenderTable();
}
function ordSyncKpiFilter() {
    ordSetFilter(document.getElementById('status-filter').value);
}
function ordSelectStatus(el) {
    document.querySelectorAll('.ord-status-opt').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    // sync hidden select
    const sel = document.getElementById('modal-status');
    if (sel) {
        sel.innerHTML = `<option value="${escA(el.dataset.s)}" selected>${escA(el.dataset.s)}</option>`;
    }
}

function ordRenderTable() {
    const search = (document.getElementById('order-search')?.value || '').toLowerCase();
    const statusF = document.getElementById('status-filter')?.value || '';
    const docs = _ordAllDocs.filter(doc => {
        const o = doc.data();
        const status = o.status || 'Zahlung erwartet';
        if (statusF && status !== statusF) return false;
        if (search && !String(o.orderNumber||'').toLowerCase().includes(search) && !String(o.userEmail||'').toLowerCase().includes(search)) return false;
        return true;
    });

    // update counts
    const counts = {};
    _ordAllDocs.forEach(doc => {
        const s = doc.data().status || 'Zahlung erwartet';
        counts[s] = (counts[s]||0) + 1;
    });
    const total = _ordAllDocs.length;
    const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
    set('ord-cnt-all',       total);
    set('ord-cnt-zahlung',   counts['Zahlung erwartet']||0);
    set('ord-cnt-wird',      counts['Wird bearbeitet']||0);
    set('ord-cnt-versendet', counts['Versendet']||0);
    set('ord-cnt-zugestellt',counts['Zugestellt']||0);

    const rc = document.getElementById('ord-result-count');
    if (rc) rc.textContent = docs.length !== total ? `${docs.length} von ${total}` : `${total} Bestellungen`;

    if (!docs.length) {
        document.getElementById('orders-tbody').innerHTML =
            `<tr><td colspan="6"><div class="ord-empty"><i class="fa-solid fa-receipt"></i>Keine Bestellungen gefunden</div></td></tr>`;
        return;
    }

    let html = '';
    docs.forEach(doc => {
        const o = doc.data();
        const date   = o.date ? o.date.toDate().toLocaleDateString('de-DE', {day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';
        const status = o.status || 'Zahlung erwartet';
        const stCls  = ORD_STATUS_CLASS[status] || 'ord-st-zahlung';
        const email  = o.userEmail || '—';
        const initials = email.slice(0,2).toUpperCase();
        const hasTracking = !!o.trackingNumber;

        html += `<tr onclick="showOrderModal('${doc.id}')">
            <td style="padding-left:18px">
                <div class="ord-num">#${escA(String(o.orderNumber||'—'))}</div>
                ${hasTracking ? `<div style="font-size:9px;color:var(--ord-purple);margin-top:2px;font-family:'JetBrains Mono',monospace">${escA(o.carrier||'')} ${escA(o.trackingNumber)}</div>` : ''}
                ${o.orderNote ? `<div style="font-size:9px;color:#f59e0b;margin-top:2px" title="${(o.orderNote||'').replace(/"/g,'&quot;')}"><i class="fa-solid fa-comment-dots" style="margin-right:3px"></i>Wunsch</div>` : ''}
            </td>
            <td style="white-space:nowrap;color:var(--ord-muted);font-size:11px">${date}</td>
            <td>
                <div class="ord-customer">
                    <div class="ord-customer-av">${initials}</div>
                    <div class="ord-customer-email">${email}</div>
                </div>
            </td>
            <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--ord-green)">${(o.total||0).toFixed(2)} €</td>
            <td style="text-align:center"><span class="ord-status ${stCls}">${status}</span></td>
            <td style="text-align:right;padding-right:18px">
                <div class="ord-actions" onclick="event.stopPropagation()">
                    <button class="ord-act-btn green" onclick="quickStatus('${doc.id}','Versendet')" title="Als Versendet markieren"><i class="fa-solid fa-truck"></i></button>
                    <button class="ord-act-btn cyan"  onclick="showOrderModal('${doc.id}')"          title="Details öffnen"><i class="fa-solid fa-pen-to-square"></i></button>
                </div>
            </td>
        </tr>`;
    });
    document.getElementById('orders-tbody').innerHTML = html;
}

function loadOrders() {
    // Bug Fix #4: remove duplicate teardown — after the first block _ordersUnsub is
    // always null, so the second identical check was always false (dead code).
    if (_ordersUnsub) { _ordersUnsub(); _ordersUnsub = null; }
    _ordersUnsub = db.collection('orders').orderBy('date','desc').onSnapshot(snap => {
        _ordAllDocs = snap.docs;
        ordRenderTable();
    });
}
document.getElementById('order-search').addEventListener('input', ordRenderTable);
document.getElementById('status-filter').addEventListener('change', ordSyncKpiFilter);

// Bug Fix #3: Per-order lock Set prevents a race condition where two rapid
// clicks fire handleStockOnStatusChange twice before Firestore has written
// the new status — which would decrement/increment stock twice.
const _quickStatusLocks = new Set();

async function quickStatus(id, status) {
    if (_quickStatusLocks.has(id)) return; // already in flight for this order
    _quickStatusLocks.add(id);
    try {
        await handleStockOnStatusChange(id, status);
        await db.collection('orders').doc(id).update({ status });
        if (status === "Wird bearbeitet") await awardLoyaltyIfProcessed(id);
        if (status === "Storniert") await reverseLoyaltyIfCredited(id);
        await logAction("order_status_changed", id, { status });
        showToast(`Status auf „${status}" gesetzt`);
    } catch(e) {
        console.error('quickStatus error:', e);
        showToast('❌ Status konnte nicht gesetzt werden: ' + e.message, 'error');
    } finally {
        _quickStatusLocks.delete(id);
    }
}

async function showOrderModal(orderId) {
    currentOrderId = orderId;
    try {
        const doc   = await db.collection('orders').doc(orderId).get();
        if (!doc.exists) return showToast('❌ Bestellung nicht gefunden', 'error');
        const order = doc.data();
        const date  = order.date ? order.date.toDate().toLocaleString('de-DE') : '—';

    // header
    document.getElementById('ord-d-num').textContent = '#' + (order.orderNumber || '—');

    // meta
    document.getElementById('ord-d-date').textContent   = date;
    document.getElementById('ord-d-email').textContent  = order.userEmail || '—';
    document.getElementById('ord-d-street').textContent = order.address?.street || '—';
    document.getElementById('ord-d-city').textContent   = `${order.address?.zip||''} ${order.address?.city||''}`.trim() || '—';

    // items
    let itemsHTML = '';
    (order.items||[]).forEach(item => {
        if (item.isBundle) {
            // Bundle: Sorten anzeigen wenn vorhanden
            let flavorHTML = '';
            if (item.selectedFlavors && item.selectedFlavors.length) {
                const tags = item.selectedFlavors.map(sf =>
                    `<span style="font-size:10px;background:rgba(103,232,249,.1);color:#67e8f9;border:1px solid rgba(103,232,249,.22);border-radius:99px;padding:1px 7px">${sf.slot}. ${escA(sf.flavor)}${sf.nicotine ? ' · ' + escA(sf.nicotine) : ''}</span>`
                ).join(' ');
                flavorHTML = `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px">${tags}</div>`;
            } else if (item.bundleItems && item.bundleItems.length) {
                const tags = item.bundleItems.slice(0,4).map(bi =>
                    `<span style="font-size:10px;background:rgba(167,139,250,.1);color:#a78bfa;border:1px solid rgba(167,139,250,.2);border-radius:99px;padding:1px 7px">${escA(bi.name)} ×${bi.qty}</span>`
                ).join(' ');
                flavorHTML = `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px">${tags}</div>`;
            }
            itemsHTML += `<div class="ord-d-item" style="flex-direction:column;align-items:flex-start;gap:4px">
                <div style="display:flex;justify-content:space-between;width:100%">
                    <span class="ord-d-item-name"><span style="font-size:10px;background:linear-gradient(135deg,#a78bfa,#7c3aed);color:#fff;border-radius:99px;padding:1px 7px;font-weight:800;margin-right:6px">🎁 BUNDLE</span>${escA(item.name)} × ${item.qty}</span>
                    <span class="ord-d-item-price">${((item.price||0) * (item.qty||1)).toFixed(2)} €</span>
                </div>
                ${flavorHTML}
            </div>`;
        } else {
            itemsHTML += `<div class="ord-d-item">
                <span class="ord-d-item-name">${escA(item.name)} × ${item.qty}${item.nicotine ? ` <span style="color:var(--ord-muted)">(${escA(item.nicotine)})</span>` : ''}</span>
                <span class="ord-d-item-price">${((item.price||0) * (item.qty||1)).toFixed(2)} €</span>
            </div>`;
        }
    });
    document.getElementById('ord-d-items').innerHTML = itemsHTML;
    document.getElementById('ord-d-total').textContent = (order.total||0).toFixed(2) + ' €';

    // Shipping row — show whenever shipping info is stored on the order
    const shippingRow = document.getElementById('ord-d-shipping-row');
    const shippingVal = document.getElementById('ord-d-shipping-val');
    const shippingLbl = document.getElementById('ord-d-shipping-label');
    if (shippingRow && shippingVal && shippingLbl) {
        const hasFree   = order.freeShipping === true;
        const shipAmt   = typeof order.shipping === 'number' ? order.shipping : null;
        // Show the row if we have explicit shipping data or a freeShipping flag
        if (hasFree || shipAmt !== null) {
            shippingRow.style.display = 'flex';
            if (hasFree || shipAmt === 0) {
                shippingLbl.innerHTML = '<i class="fa-solid fa-truck" style="margin-right:5px"></i>Versand <span style="font-size:9px;background:rgba(52,211,153,.15);color:#34d399;border:1px solid rgba(52,211,153,.3);border-radius:99px;padding:1px 7px;margin-left:5px;font-weight:800">GRATIS</span>';
                shippingVal.style.color = '#34d399';
                shippingVal.textContent = '0,00 €';
                shippingRow.style.background = 'rgba(52,211,153,.04)';
                shippingRow.style.borderColor = 'rgba(52,211,153,.2)';
            } else {
                shippingLbl.innerHTML = '<i class="fa-solid fa-truck" style="margin-right:5px"></i>Versand';
                shippingVal.style.color = '#67e8f9';
                shippingVal.textContent = shipAmt.toFixed(2).replace('.', ',') + ' €';
                shippingRow.style.background = 'rgba(103,232,249,.04)';
                shippingRow.style.borderColor = 'rgba(103,232,249,.12)';
            }
        } else {
            shippingRow.style.display = 'none';
        }
    }
    // Show discount row if order has a verified coupon
    const discRow = document.getElementById('ord-d-discount');
    if (order.discountCode && order.discountAmount > 0) {
        const discLabel = order.discountType === 'percent'
            ? `${order.discountCode} (${order.discountValue}%)`
            : `${order.discountCode} (${order.discountValue} € fix)`;
        document.getElementById('ord-d-discount-code').textContent = discLabel;
        document.getElementById('ord-d-discount-val').textContent  = '−' + (order.discountAmount||0).toFixed(2) + ' €';
        discRow.style.display = 'flex';
    } else {
        discRow.style.display = 'none';
    }

    // M-06 FIX: Populate select with ALL status options (not just current)
    const curStatus = order.status || 'Zahlung erwartet';
    // saved the original status regardless of which .ord-status-opt was clicked.
    const ALL_STATUSES = ['Zahlung erwartet','Wird bearbeitet','Versendet','Zugestellt','Storniert'];
    document.getElementById('modal-status').innerHTML = ALL_STATUSES.map(s =>
        `<option value="${s}"${s === curStatus ? ' selected' : ''}>${s}</option>`
    ).join('');
    // Keep visual button highlight in sync when select changes
    document.getElementById('modal-status').onchange = function() {
        document.querySelectorAll('.ord-status-opt').forEach(o => {
            o.classList.toggle('selected', o.dataset.s === this.value);
        });
    };
    // Keep select in sync when status-opt buttons are clicked
    document.querySelectorAll('.ord-status-opt').forEach(o => {
        o.classList.toggle('selected', o.dataset.s === curStatus);
        o.onclick = function() {
            document.querySelectorAll('.ord-status-opt').forEach(x => x.classList.remove('selected'));
            this.classList.add('selected');
            document.getElementById('modal-status').value = this.dataset.s;
        };
    });

    // carrier + tracking
    document.getElementById('modal-carrier').value   = order.carrier || 'DHL';
    document.getElementById('modal-tracking').value  = order.trackingNumber || '';
    document.getElementById('modal-internal-notes').value = order.internalNotes || '';

    // Kundenwunsch anzeigen (falls vorhanden)
    const noteSection = document.getElementById('ord-d-note-section');
    const noteEl      = document.getElementById('ord-d-note');
    if (noteSection && noteEl) {
        if (order.orderNote) {
            noteEl.textContent  = order.orderNote;
            noteSection.style.display = 'block';
        } else {
            noteSection.style.display = 'none';
        }
    }

    // open drawer
    document.getElementById('ord-overlay').classList.add('open');
    document.getElementById('ord-drawer').classList.add('open');
    document.getElementById('ord-drawer').scrollTop = 0;
    } catch(e) { showToast('❌ Bestellung konnte nicht geladen werden: ' + e.message, 'error'); }
}

function closeOrderModal() {
    document.getElementById('ord-overlay').classList.remove('open');
    document.getElementById('ord-drawer').classList.remove('open');
}

let _saveOrderInProgress = false; // Bug Fix #3b: prevent double-submit on save button

async function saveOrderChanges() {
    if (_saveOrderInProgress) return;
    _saveOrderInProgress = true;

    // Disable save button for visual feedback
    const saveBtn = document.querySelector('#ord-drawer button[onclick="saveOrderChanges()"]');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Wird gespeichert…'; }

    const status       = document.getElementById('modal-status').value;
    const carrier      = document.getElementById('modal-carrier').value;
    const tracking     = document.getElementById('modal-tracking').value.trim();
    const internalNotes= document.getElementById('modal-internal-notes').value.trim();
    try {
        await handleStockOnStatusChange(currentOrderId, status);
        const updateData = { status, carrier, trackingNumber: tracking || firebase.firestore.FieldValue.delete() };
        updateData.internalNotes = internalNotes || firebase.firestore.FieldValue.delete();
        await db.collection('orders').doc(currentOrderId).update(updateData);
        if (status === "Wird bearbeitet") await awardLoyaltyIfProcessed(currentOrderId);
        if (status === "Storniert") await reverseLoyaltyIfCredited(currentOrderId);
        await logAction("order_updated", currentOrderId, { status });
        showToast('✅ Bestellung aktualisiert');
        closeOrderModal();
    } catch(e) {
        console.error('saveOrderChanges error:', e);
        showToast('❌ Speichern fehlgeschlagen: ' + e.message, 'error');
    } finally {
        _saveOrderInProgress = false;
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Speichern'; }
    }
}

async function deleteOrder() {
    if (!confirm('Bestellung IRREVERSIBEL löschen?')) return;

    const orderDoc = await db.collection('orders').doc(currentOrderId).get();
    if (orderDoc.exists) {
        const order = orderDoc.data();
        const status = order.status || 'Zahlung erwartet';
        const wasProcessed = ['Wird bearbeitet', 'Versendet', 'Zugestellt'].includes(status);
        const shouldRestoreStock = order.stockReserved || wasProcessed;
        if (shouldRestoreStock && order.items?.length) {
            const batch = db.batch();
            for (const item of order.items) {
                // FIX: Skip Mystery Vape and Bundle items — same as handleStockOnStatusChange
                if (item.id === MYSTERY_ID) continue;
                if (item.isBundle || String(item.id).startsWith('bundle_')) continue;
                const ref = db.collection('products').doc(String(item.id));
                const update = (order.stockReserved && !wasProcessed)
                    ? { stock: firebase.firestore.FieldValue.increment(item.qty) }
                    : { stock: firebase.firestore.FieldValue.increment(item.qty),
                        sold:  firebase.firestore.FieldValue.increment(-item.qty) };
                batch.update(ref, update);
            }
            await batch.commit();
            showToast(`↩ Lager wiederhergestellt`, 'warning');
        }
        // BUG FIX: Reverse loyalty points if they were already credited.
        // Previously deleteOrder() skipped this, meaning customers kept points
        // for orders that were hard-deleted instead of cancelled.
        try { await reverseLoyaltyIfCredited(currentOrderId); } catch(_e) {}
    }

    try {
        await db.collection('orders').doc(currentOrderId).delete();
        await logAction('order_deleted', currentOrderId);
        showToast('🗑️ Bestellung gelöscht');
        closeOrderModal();
    } catch(e) {
        showToast('❌ Löschen fehlgeschlagen: ' + e.message, 'error');
    }
}

// ====================== BENUTZER v2 ======================
const USR_AV_COLORS = [
    ['rgba(103,232,249,.18)','#67e8f9'],
    ['rgba(167,139,250,.18)','#a78bfa'],
    ['rgba(52,211,153,.18)','#34d399'],
    ['rgba(251,191,36,.18)','#fbbf24'],
    ['rgba(244,114,182,.18)','#f472b6'],
    ['rgba(251,146,60,.18)','#fb923c'],
];
function usrAvColor(email='') {
    let h=0; for(let c of email) h=(h*31+c.charCodeAt(0))&0xfff;
    return USR_AV_COLORS[h % USR_AV_COLORS.length];
}

let _usrAllDocs = [];

// K-NEW-01 FIX: Track listener to prevent stacking on repeated calls
let _usersUnsub = null;
function loadUsers() {
    if (_usersUnsub) { _usersUnsub(); _usersUnsub = null; }
    _usersUnsub = db.collection('users').onSnapshot(snapshot => {
        _usrAllDocs = snapshot.docs;
        usrRenderTable();
    });
}

function usrRenderTable() {
    const search = (document.getElementById('user-search')?.value || '').toLowerCase();
    const docs = _usrAllDocs.filter(doc => {
        const u = doc.data();
        if (!search) return true;
        return (u.email||'').toLowerCase().includes(search) || (u.username||'').toLowerCase().includes(search);
    });

    // KPIs
    const allU = _usrAllDocs.map(d=>d.data());
    const total   = allU.length;
    const active  = allU.filter(u=>!u.disabled).length;
    const blocked = allU.filter(u=>u.disabled).length;
    const avgPts  = total ? Math.round(allU.reduce((s,u)=>s+(u.totalBonusPoints||0),0)/total) : 0;
    const maxPts  = Math.max(...allU.map(u=>u.totalBonusPoints||0), 1);

    const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
    set('usr-kpi-total',   total);
    set('usr-kpi-active',  active);
    set('usr-kpi-pts',     avgPts.toLocaleString('de-DE'));
    set('usr-kpi-blocked', blocked);
    const badge = document.getElementById('usr-count-badge');
    if (badge) badge.textContent = docs.length + ' User';

    if (!docs.length) {
        document.getElementById('users-tbody').innerHTML =
            `<tr><td colspan="7"><div class="usr-empty"><i class="fa-solid fa-users-slash"></i>Keine Benutzer gefunden</div></td></tr>`;
        return;
    }

    let html = '';
    docs.forEach(doc => {
        const u = doc.data();
        const email       = u.email || '—';
        const username    = u.username || '';
        const refCode     = u.referralCode || '—';
        const points      = u.totalBonusPoints || 0;
        const disabled    = u.disabled === true;
        const freeShipping= u.freeShipping === true;
        const lastIp      = u.lastIp || null;
        const [avBg, avColor] = usrAvColor(email);
        const initials    = ((username || email).slice(0,2)).toUpperCase();
        const pct         = Math.min(100, Math.round(points / maxPts * 100));
        const isAdmin     = u.role === 'admin';

        const ipCell = lastIp
            ? `<div style="display:flex;align-items:center;justify-content:center;gap:6px">
                 <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:rgba(255,255,255,.7);background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:2px 8px">${lastIp}</span>
                 <button onclick="quickBanIp('${lastIp}','${email.replace(/'/g,"\\'")}') " title="IP bannen" style="background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.3);color:#f87171;border-radius:6px;padding:2px 6px;cursor:pointer;font-size:10px;font-weight:700" onmouseover="this.style.background='rgba(239,68,68,.3)'" onmouseout="this.style.background='rgba(239,68,68,.15)'">
                   <i class="fa-solid fa-ban"></i>
                 </button>
               </div>`
            : `<span style="font-size:11px;color:rgba(255,255,255,.2)">—</span>`;

        html += `<tr class="${disabled ? 'usr-row-blocked' : ''}">
            <td style="padding-left:18px;min-width:220px">
                <div class="usr-cell-user">
                    <div class="usr-avatar" style="background:${avBg};color:${avColor}">${initials}</div>
                    <div>
                        <div class="usr-email">${email}${isAdmin ? ' <span style="font-size:9px;background:rgba(167,139,250,.15);color:#a78bfa;padding:1px 6px;border-radius:5px;font-weight:800;vertical-align:middle">ADMIN</span>' : ''}</div>
                        <div class="usr-uname">${username || 'kein Username'}</div>
                    </div>
                </div>
            </td>
            <td style="text-align:center">
                <span class="usr-ref-chip">${refCode}</span>
            </td>
            <td style="text-align:center">
                <div class="usr-pts-wrap">
                    <div class="usr-pts-val">${points.toLocaleString('de-DE')}</div>
                    <div class="usr-pts-bar-bg"><div class="usr-pts-bar" style="width:${pct}%"></div></div>
                </div>
            </td>
            <td style="text-align:center">${ipCell}</td>
            <td style="text-align:center">
                <label class="usr-ship-label" title="${freeShipping ? 'Gratisversand aktiv' : 'Kein Gratisversand'}">
                    <input type="checkbox" ${freeShipping ? 'checked' : ''} onchange="toggleFreeShipping('${doc.id}',this.checked)">
                    <span class="usr-ship-pill"><i class="fa-solid fa-truck"></i>${freeShipping ? 'Gratis' : 'Standard'}</span>
                </label>
            </td>
            <td style="text-align:center">
                <span class="usr-badge ${disabled ? 'usr-badge-blocked' : 'usr-badge-active'}">${disabled ? 'GESPERRT' : 'AKTIV'}</span>
            </td>
            <td style="text-align:right;padding-right:18px">
                <div class="usr-actions">
                    <button class="usr-action-btn amber" onclick="resetPassword('${email}')" title="Passwort zurücksetzen"><i class="fa-solid fa-key"></i></button>
                    <button class="usr-action-btn red"   onclick="resetUserPoints('${doc.id}')" title="Punkte auf 0"><i class="fa-solid fa-rotate-left"></i></button>
                    <button class="usr-action-btn ${disabled ? 'green' : 'red'}" onclick="toggleDisable('${doc.id}',${!disabled})" title="${disabled ? 'Entsperren' : 'Sperren'}"><i class="fa-solid fa-${disabled ? 'unlock' : 'lock'}"></i></button>
                    <button class="usr-action-btn red"   onclick="deleteUser('${doc.id}','${email}')" title="Account löschen"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        </tr>`;
    });
    document.getElementById('users-tbody').innerHTML = html;
}

document.getElementById('user-search').addEventListener('input', usrRenderTable);
async function toggleFreeShipping(uid, enable) {
    // BUG FIX: Use implicit event safely with a fallback instead of assuming it always exists
    const cb = (typeof event !== 'undefined' && event.target) || null;
    const pill = cb ? cb.parentElement.querySelector('.usr-ship-pill') : null;
    if (pill) pill.innerHTML = `<i class="fa-solid fa-truck"></i>${enable ? 'Gratis' : 'Standard'}`;
    await db.collection('users').doc(uid).update({freeShipping:enable});
    await logAction(enable?"free_shipping_enabled":"free_shipping_disabled",uid);
    showToast(enable?'✅ Gratisversand AKTIVIERT':'Gratisversand deaktiviert','success');
}
async function resetPassword(email) { if (!confirm(`Passwort-Reset an ${email} senden?`)) return; try { await auth.sendPasswordResetEmail(email); showToast(`✅ Reset-E-Mail gesendet!`); await logAction("password_reset_requested",email); } catch(e) { showToast("Fehler: "+e.message,"error"); } }
// ═══════════════════════════════════════════════════════
//  IP-BAN BEI NUTZER-SPERRUNG – zentrale Hilfsfunktion
// ═══════════════════════════════════════════════════════

/**
 * Sperrt einen User-Account UND bannt automatisch alle bekannten IPs
 * die mit diesem Account in Verbindung stehen (unauthorized_access logs
 * + optionale direkte IP-Übergabe). Gibt die Anzahl der gebannten IPs zurück.
 */
async function banUserWithIPs(uid, email, reason = 'Account gesperrt', skipDisable = false) {
    // 1. Account deaktivieren (optional, wenn schon von Caller gemacht)
    if (!skipDisable) {
        await db.collection('users').doc(uid).update({ disabled: true });
    }

    // 2. Alle IPs aus unauthorized_access sammeln die diese E-Mail haben
    const knownIPs = new Set();
    try {
        const uaSnap = await db.collection('unauthorized_access')
            .where('email', '==', email).get();
        uaSnap.forEach(doc => {
            const ip = doc.data().ip;
            if (ip && ip !== 'unbekannt') knownIPs.add(ip);
        });
    } catch(e) { /* collection leer oder kein Index */ }

    // 3. Auch IPs aus presence collection holen (falls vorhanden)
    try {
        const pSnap = await db.collection('presence')
            .where('userId', '==', uid).get();
        pSnap.forEach(doc => {
            const ip = doc.data().ip;
            if (ip && ip !== 'unbekannt') knownIPs.add(ip);
        });
    } catch(e) {}

    // 4. Jede IP permanent bannen (falls noch nicht gebannt)
    let bannedCount = 0;
    for (const ip of knownIPs) {
        try {
            const existing = await db.collection('banned_ips')
                .where('ip', '==', ip).limit(1).get();
            if (!existing.empty) continue; // bereits gebannt
            await db.collection('banned_ips').add({
                ip,
                permanent: true,
                bannedUntil: null,
                reason: `${reason} (User: ${email})`,
                bannedAt: firebase.firestore.FieldValue.serverTimestamp(),
                bannedBy: auth.currentUser?.email || 'Admin',
                linkedUserId: uid,
                linkedEmail: email,
            });
            bannedCount++;
        } catch(e) {}
    }

    await logAction('user_disabled_with_ip_ban', uid, {
        email, ipsFound: knownIPs.size, ipsBanned: bannedCount
    });

    return { ipsFound: knownIPs.size, ipsBanned: bannedCount };
}

async function toggleDisable(uid, disable) {
    if (disable) {
        // Sperren inkl. IP-Ban
        const u = await db.collection('users').doc(uid).get();
        const email = u.exists ? (u.data().email || uid) : uid;
        const { ipsFound, ipsBanned } = await banUserWithIPs(uid, email, 'Manuell gesperrt via Admin-Panel');
        const msg = ipsBanned > 0
            ? `✅ Gesperrt + ${ipsBanned} IP${ipsBanned!==1?'s':''} gebannt`
            : ipsFound > 0
                ? `✅ Gesperrt (IPs bereits bekannt gebannt)`
                : `✅ Benutzer gesperrt (keine bekannte IP)`;
        showToast(msg);
        if (ipsBanned > 0) pushNotification('warning',
            `User gesperrt + ${ipsBanned} IP${ipsBanned!==1?'s':''} gebannt`,
            email, () => switchTab(6));
    } else {
        await db.collection('users').doc(uid).update({ disabled: false });
        await logAction('user_enabled', uid);
        showToast('✅ Benutzer entsperrt');
    }
}

async function euBulkAction(action){
    const ids=[...euSelectedIds]; if(!ids.length)return;
    if(action==='disable'){
        if(!confirm(`Wirklich ${ids.length} User SPERREN?\n\nBekannte IPs werden automatisch mitgebannt.`))return;
        let totalIPs = 0;
        for (const id of ids) {
            const u = euAllUsers.find(x => x.id === id);
            const email = u?.email || id;
            const { ipsBanned } = await banUserWithIPs(id, email, `Bulk-Sperre (${ids.length} User)`);
            totalIPs += ipsBanned;
        }
        await logAction('bulk_users_disabled','',{count:ids.length, ipsBanned:totalIPs});
        showToast(`✅ ${ids.length} User gesperrt${totalIPs>0?' + '+totalIPs+' IPs gebannt':''}`);
        euClearSelection();
    } else if(action==='enable'){
        if(!confirm(`Wirklich ${ids.length} User entsperren?`))return;
        const batch=db.batch();ids.forEach(id=>batch.update(db.collection('users').doc(id),{disabled:false}));await batch.commit();
        await logAction('bulk_users_enabled','',{count:ids.length});showToast(`✅ ${ids.length} User entsperrt!`);euClearSelection();
    } else if(action==='addpoints'){
        const p=prompt('Wie viele Punkte addieren?','500');if(!p)return;const pts=parseInt(p, 10);
        const batch=db.batch();ids.forEach(id=>batch.update(db.collection('users').doc(id),{totalBonusPoints:firebase.firestore.FieldValue.increment(pts)}));await batch.commit();
        await logAction('bulk_points_added','',{pts,count:ids.length});showToast(`✅ +${pts} Punkte an ${ids.length} User!`);euClearSelection();
    } else if(action==='freeship'){
        const batch=db.batch();ids.forEach(id=>batch.update(db.collection('users').doc(id),{freeShipping:true}));await batch.commit();
        await logAction('bulk_freeship_enabled','',{count:ids.length});showToast(`🚚 Gratisversand für ${ids.length} User!`);euClearSelection();
    } else if(action==='delete'){
        if(!confirm(`⚠️ WIRKLICH ${ids.length} Accounts PERMANENT löschen?`))return;
        if(!confirm('LETZTE WARNUNG!'))return;
        const batch=db.batch();ids.forEach(id=>batch.delete(db.collection('users').doc(id)));await batch.commit();
        await logAction('bulk_users_deleted','',{count:ids.length});showToast(`🗑️ ${ids.length} Accounts gelöscht!`,'error');euClearSelection();
    }
}

async function euDrawerDanger(action){
    if(!euCurrentUid)return; const u=euAllUsers.find(x=>x.id===euCurrentUid);
    if(action==='resetpoints'){
        if(!confirm('Punkte auf 0 setzen?'))return;
        await db.collection('users').doc(euCurrentUid).update({totalBonusPoints:0});
        await logAction('user_loyalty_reset',euCurrentUid);
        document.getElementById('eu-d-pts').value='0'; document.getElementById('eu-d-pts-kpi').textContent='0';
        showToast('✅ Punkte auf 0 gesetzt');
    } else if(action==='resetpw'){
        if(!u?.email)return showToast('Keine E-Mail','error');
        if(!confirm(`Passwort-Reset an ${u.email} senden?`))return;
        try{await auth.sendPasswordResetEmail(u.email);showToast('✅ Reset-E-Mail gesendet!');}catch(e){showToast('Fehler: '+e.message,'error');}
        await logAction('password_reset_requested',u.email);
    } else if(action==='delete'){
        if(!confirm(`⚠️ Account von ${u?.email} WIRKLICH LÖSCHEN?\n\nBekannte IPs werden automatisch gebannt.`))return;
        if(!confirm('LETZTE WARNUNG!'))return;
        // IP-Ban vor dem Löschen
        const { ipsBanned } = await banUserWithIPs(euCurrentUid, u?.email || euCurrentUid, 'Account gelöscht');
        await db.collection('users').doc(euCurrentUid).delete();
        const orders = await db.collection('orders').where('userId','==',euCurrentUid).get();
        // Bug A Fix: restore stock for ALL orders that ever touched inventory:
        // 1) stockReserved=true orders (stock taken at placement, any status)
        // 2) legacy processed orders without the stockReserved flag
        const statsBatch = db.batch();
        let statsReversed = 0;
        orders.forEach(doc => {
            const o = doc.data();
            const wasProcessed = ['Wird bearbeitet','Versendet','Zugestellt'].includes(o.status);
            const isCancelled  = o.status === 'Storniert';
            // stockReserved + not yet cancelled → stock was taken, give it back
            // legacy processed + not cancelled → stock was decremented, give it back
            const shouldRestoreStock = !isCancelled && (o.stockReserved || wasProcessed);
            if (shouldRestoreStock && o.items?.length) {
                o.items.forEach(item => {
                    if (item.id === MYSTERY_ID) return;
                    if (item.isBundle || String(item.id).startsWith('bundle_')) return;
                    const wasAlreadySold = wasProcessed;
                    const update = wasAlreadySold
                        ? { stock: firebase.firestore.FieldValue.increment(item.qty),
                           sold:   firebase.firestore.FieldValue.increment(-item.qty) }
                        : { stock: firebase.firestore.FieldValue.increment(item.qty) };
                    statsBatch.update(db.collection('products').doc(String(item.id)), update);
                    statsReversed++;
                });
            }
        });
        if (statsReversed > 0) await statsBatch.commit();
        const delBatch = db.batch();
        orders.forEach(doc => delBatch.delete(doc.ref));
        await delBatch.commit();
        await logAction('user_deleted_with_ip_ban', euCurrentUid, { ipsBanned });
        showToast(`🗑️ Account gelöscht${ipsBanned>0?' + '+ipsBanned+' IPs gebannt':''}`, 'error');
        euCloseDrawer();
    }
}
async function deleteUser(uid, email) {
    if (!confirm(`⚠️ Account von ${email} WIRKLICH LÖSCHEN?`)) return;
    if (!confirm('LETZTE WARNUNG – unwiderruflich!')) return;
    try {
        await db.collection('users').doc(uid).delete();
        const orders = await db.collection('orders').where('userId','==',uid).get();
        // Bug A Fix: same logic as euDrawerDanger — restore stock for stockReserved
        // AND legacy processed orders, but skip already-cancelled orders.
        const statsBatch = db.batch();
        orders.forEach(doc => {
            const o = doc.data();
            const wasProcessed = ['Wird bearbeitet','Versendet','Zugestellt'].includes(o.status);
            const isCancelled  = o.status === 'Storniert';
            const shouldRestoreStock = !isCancelled && (o.stockReserved || wasProcessed);
            if (shouldRestoreStock && o.items?.length) {
                o.items.forEach(item => {
                    if (item.id === MYSTERY_ID) return;
                    if (item.isBundle || String(item.id).startsWith('bundle_')) return;
                    const update = wasProcessed
                        ? { stock: firebase.firestore.FieldValue.increment(item.qty),
                           sold:   firebase.firestore.FieldValue.increment(-item.qty) }
                        : { stock: firebase.firestore.FieldValue.increment(item.qty) };
                    statsBatch.update(db.collection('products').doc(String(item.id)), update);
                });
            }
        });
        await statsBatch.commit();
        const delBatch = db.batch();
        orders.forEach(doc => delBatch.delete(doc.ref));
        await delBatch.commit();
        showToast(`✅ Account ${email} gelöscht`);
        await logAction('user_deleted', uid);
    } catch(e) {
        showToast('Fehler: ' + e.message, 'error');
    }
}
async function resetAllLoyaltyPoints() {
    if (!saUnlocked) { showToast('⛔ Nur Superadmin kann alle Punkte zurücksetzen.', 'error'); return; }
    if (!confirm("⚠️ WIRKLICH ALLE Loyalty-Punkte auf 0?")) return;
    if (!confirm("LETZTE WARNUNG! Diese Aktion kann nicht rückgängig gemacht werden!")) return;
    try {
        const snapshot = await db.collection("users").get();
        const docs = snapshot.docs;
        for (let i = 0; i < docs.length; i += 499) {
            const batch = db.batch();
            docs.slice(i, i + 499).forEach(doc => batch.update(doc.ref, { totalBonusPoints: 0 }));
            await batch.commit();
        }
        showToast(`✅ Alle Punkte (${docs.length} Nutzer) auf 0 gesetzt!`, "success");
        await logAction("all_loyalty_reset");
        loadUsers();
    } catch(err) { showToast("❌ Fehler: " + err.message, "error"); }
}
async function resetUserPoints(uid) { if (!confirm("Punkte auf 0 setzen?")) return; await db.collection("users").doc(uid).update({totalBonusPoints:0}); showToast("✅ Punkte auf 0 gesetzt"); await logAction("user_loyalty_reset",uid); }

// ====================== ANALYTICS v2 ======================
let anCurrentPeriod = 30;

function anSetPeriod(days) {
    anCustomFrom = null;
    anCustomTo   = null;
    anCurrentPeriod = days;
    // Reset date input highlights
    const df = document.getElementById('an-date-from');
    const dt = document.getElementById('an-date-to');
    if (df) df.style.borderColor = '';
    if (dt) dt.style.borderColor = '';
    document.querySelectorAll('.an-period-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('an-btn-' + days);
    if (btn) btn.classList.add('active');
    const lbl = document.getElementById('an-period-lbl');
    if (lbl) lbl.textContent = days + ' Tage';
    const badge = document.getElementById('an-rev-badge');
    if (badge) badge.textContent = days + ' Tage';
    loadAnalytics();
}

const AN_CHART_DEFAULTS = {
    color: { grid:'rgba(255,255,255,.04)', tick:'rgba(255,255,255,.25)', tooltip:'#13131f' },
    font: { family:"'Inter', system-ui, sans-serif", size:11 }
};

function anChartOpts(extra={}) {
    return {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend:{display:false}, tooltip:{ backgroundColor:'#1a1a2e', borderColor:'rgba(103,232,249,.25)', borderWidth:1, titleColor:'#67e8f9', bodyColor:'rgba(255,255,255,.75)', padding:12, cornerRadius:10 } },
        scales: {
            x: { grid:{ color:'rgba(255,255,255,.04)' }, ticks:{ color:'rgba(255,255,255,.3)', font:{size:10} }, border:{color:'transparent'} },
            y: { grid:{ color:'rgba(255,255,255,.04)' }, ticks:{ color:'rgba(255,255,255,.3)', font:{size:10} }, border:{color:'transparent'} }
        },
        ...extra
    };
}

async function loadAnalytics() {
    // Support both fixed period (days) and custom date range
    let since, until, days, labelDays;
    if (anCustomFrom && anCustomTo) {
        since = firebase.firestore.Timestamp.fromDate(anCustomFrom);
        until = firebase.firestore.Timestamp.fromDate(anCustomTo);
        days  = Math.max(1, Math.ceil((anCustomTo - anCustomFrom) / 86400000));
        labelDays = days;
    } else {
        days  = anCurrentPeriod || 30;
        labelDays = days;
        since = firebase.firestore.Timestamp.fromDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
        until = null;
    }
    let query = db.collection("orders").where("date",">=",since);
    if (until) query = query.where("date","<=",until);

    // BUG FIX: No try/catch — a Firestore error (missing index, permissions) left
    // the analytics tab blank with no explanation.
    let ordersSnap;
    try {
        ordersSnap = await query.get();
    } catch(e) {
        console.error('loadAnalytics query failed:', e);
        showToast('❌ Analytics konnten nicht geladen werden: ' + e.message, 'error');
        return;
    }

    let dailyRevenue={}, dailyOrdersCount={}, totalRevenue=0, totalOrders=0;
    let productMap=new Map(), userMap=new Map(), statusMap=new Map();

    ordersSnap.forEach(doc=>{
        const o=doc.data();
        // BUG FIX: Stornierte Bestellungen wurden im Umsatz mitgezählt —
        // sie liefern keinen echten Umsatz, da die Zahlung nie eingegangen ist.
        const st=o.status||'Zahlung erwartet';
        statusMap.set(st,(statusMap.get(st)||0)+1);
        if (st === 'Storniert') return; // Nicht in Umsatz/Produktzählung
        // BUG FIX: o.date kann undefined sein (manuell angelegte Testbestellungen).
        // Ohne Null-Check crasht .toDate() und das gesamte Analytics-Dashboard rendert nicht.
        if (!o.date) return;
        const day=o.date.toDate().toISOString().slice(0,10);
        dailyRevenue[day]=(dailyRevenue[day]||0)+o.total;
        dailyOrdersCount[day]=(dailyOrdersCount[day]||0)+1;
        totalRevenue+=o.total; totalOrders++;
        (o.items||[]).forEach(item=>productMap.set(item.name,(productMap.get(item.name)||0)+item.qty));
        if(o.userEmail) userMap.set(o.userEmail,(userMap.get(o.userEmail)||0)+1);
    });

    // KPIs
    const anm = v => { const el=document.getElementById(v[0]); if(el) el.textContent=v[1]; };
    anm(['metric-revenue', totalRevenue.toFixed(0)+' €']);
    anm(['metric-orders',  totalOrders]);
    anm(['metric-users',   userMap.size]);
    anm(['metric-avg',     totalOrders>0?(totalRevenue/totalOrders).toFixed(2)+' €':'0 €']);

    const labels = [];
    const startDate = anCustomFrom ? new Date(anCustomFrom) : new Date(Date.now() - (labelDays-1)*86400000);
    for (let i=0; i<labelDays; i++) {
        const d = new Date(startDate); d.setDate(d.getDate()+i);
        labels.push(d.toISOString().slice(0,10));
    }
    const shortLabels = labels.map(l=>{ const p=l.slice(5).split('-'); return p[1]+'.'+p[0]; });

    // Revenue chart – area with gradient
    if(revenueChart) revenueChart.destroy();
    const revCtx = document.getElementById("revenueChart").getContext('2d');
    const revGrad = revCtx.createLinearGradient(0,0,0,290);
    revGrad.addColorStop(0,'rgba(52,211,153,.22)');
    revGrad.addColorStop(1,'rgba(52,211,153,.0)');
    revenueChart = new Chart(revCtx, {
        type:'line',
        data:{ labels:shortLabels, datasets:[{ label:'Umsatz €', data:labels.map(d=>dailyRevenue[d]||0), borderColor:'#34d399', borderWidth:2.5, tension:0.45, fill:true, backgroundColor:revGrad, pointBackgroundColor:'#34d399', pointRadius:3, pointHoverRadius:6 }] },
        options: anChartOpts({ plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label: ctx=>' '+ctx.parsed.y.toFixed(2)+' €' } }, backgroundColor:'#1a2e22', borderColor:'rgba(52,211,153,.25)', borderWidth:1, titleColor:'#34d399', bodyColor:'rgba(255,255,255,.75)', padding:12, cornerRadius:10 } })
    });

    // Orders chart – bars
    if(dailyOrdersChart) dailyOrdersChart.destroy();
    const ordCtx = document.getElementById("dailyOrdersChart").getContext('2d');
    const ordGrad = ordCtx.createLinearGradient(0,0,0,240);
    ordGrad.addColorStop(0,'rgba(103,232,249,.5)');
    ordGrad.addColorStop(1,'rgba(103,232,249,.05)');
    dailyOrdersChart = new Chart(ordCtx, {
        type:'bar',
        data:{ labels:shortLabels, datasets:[{ label:'Bestellungen', data:labels.map(d=>dailyOrdersCount[d]||0), backgroundColor:ordGrad, borderColor:'rgba(103,232,249,.4)', borderWidth:1, borderRadius:6, borderSkipped:false }] },
        options: anChartOpts({ scales:{ x:{ grid:{color:'rgba(255,255,255,.04)'}, ticks:{color:'rgba(255,255,255,.3)',font:{size:10}}, border:{color:'transparent'} }, y:{ grid:{color:'rgba(255,255,255,.04)'}, ticks:{color:'rgba(255,255,255,.3)',font:{size:10},stepSize:1}, border:{color:'transparent'} } } })
    });

    // Top products – custom list (no canvas)
    const sortedProds = Array.from(productMap.entries()).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const maxQty = sortedProds[0]?.[1]||1;
    const rankLabels=['🥇','🥈','🥉'];
    const rankClasses=['gold','silver','bronze'];
    const prodList = document.getElementById('an-prod-list');
    if(prodList) {
        prodList.innerHTML = sortedProds.map(([name,qty],i)=>`
        <div class="an-prod-row">
            <div class="an-prod-rank ${rankClasses[i]||''}">${rankLabels[i]||('#'+(i+1))}</div>
            <div class="an-prod-name">${name}</div>
            <div class="an-prod-bar-wrap"><div class="an-prod-bar" style="width:${Math.round(qty/maxQty*100)}%"></div></div>
            <div class="an-prod-qty">${qty}×</div>
        </div>`).join('')||'<div style="text-align:center;padding:20px;color:rgba(255,255,255,.25);font-size:12px">Keine Daten</div>';
    }

    // Status distribution
    const STATUS_CFG = {
        'Zahlung erwartet': { color:'#facc15', dot:'#facc15' },
        'Wird bearbeitet':  { color:'#60a5fa', dot:'#60a5fa' },
        'Versendet':        { color:'#a78bfa', dot:'#a78bfa' },
        'Zugestellt':       { color:'#34d399', dot:'#34d399' },
        'Storniert':        { color:'#f87171', dot:'#f87171' },
    };
    const statusEl = document.getElementById('an-status-list');
    const totalStatusEl = document.getElementById('an-status-total-badge');
    // Bug E Fix: totalOrders excludes cancelled orders, but statusMap includes ALL statuses.
    // Using totalOrders as the denominator inflates the % for cancelled orders and means
    // percentages never sum to 100. Use the sum of all statusMap values instead.
    const totalAllOrders = Array.from(statusMap.values()).reduce((s,v)=>s+v, 0);
    if(totalStatusEl) totalStatusEl.textContent = totalAllOrders+' gesamt';
    if(statusEl && totalAllOrders>0) {
        statusEl.innerHTML = Object.entries(STATUS_CFG).map(([label,cfg])=>{
            const cnt = statusMap.get(label)||0;
            const pct = Math.round(cnt/totalAllOrders*100);
            return `<div class="an-status-row">
                <div class="an-status-dot" style="background:${cfg.dot}"></div>
                <div class="an-status-label">${label}</div>
                <div class="an-status-bar-bg"><div class="an-status-bar-fill" style="width:${pct}%;background:${cfg.color};"></div></div>
                <div class="an-status-pct">${pct}%</div>
            </div>`;
        }).join('');
    } else if(statusEl) {
        statusEl.innerHTML='<div style="text-align:center;padding:20px;color:rgba(255,255,255,.25);font-size:12px">Keine Bestellungen im Zeitraum</div>';
    }

    // Referrer chart
    const usersSnap = await db.collection("users").orderBy("referralCount","desc").limit(8).get();
    const refLabels=[], refData=[];
    usersSnap.forEach(doc=>{ const u=doc.data(); refLabels.push(u.username||(u.email||'').split("@")[0]||'Anonym'); refData.push(u.referralCount||0); });
    if(referralChart) referralChart.destroy();
    const refCtx = document.getElementById("referralChart").getContext('2d');
    const refColors = ['#f472b6','#a78bfa','#67e8f9','#34d399','#fbbf24','#fb923c','#22d3ee','#8b5cf6'];
    referralChart = new Chart(refCtx, {
        type:'bar',
        data:{ labels:refLabels, datasets:[{ label:'Referrals', data:refData, backgroundColor:refColors.map(c=>c+'99'), borderColor:refColors, borderWidth:1.5, borderRadius:8, borderSkipped:false }] },
        options: anChartOpts({ indexAxis:'y', scales:{ x:{ grid:{color:'rgba(255,255,255,.04)'}, ticks:{color:'rgba(255,255,255,.3)',font:{size:10},stepSize:1}, border:{color:'transparent'} }, y:{ grid:{display:false}, ticks:{color:'rgba(255,255,255,.55)',font:{size:11,weight:'600'}}, border:{color:'transparent'} } } })
    });
}
async function generatePDFReport() {
    const {jsPDF}=window.jspdf; const pdfDoc=new jsPDF();
    pdfDoc.setFontSize(22);pdfDoc.text("WaveVapes Monatsbericht",20,20); pdfDoc.setFontSize(11);pdfDoc.text(`Erstellt am: ${new Date().toLocaleDateString("de-DE")} ${new Date().toLocaleTimeString("de-DE")}`,20,30);
    const thirtyDaysAgo=firebase.firestore.Timestamp.fromDate(new Date(Date.now()-30*24*60*60*1000)); const ordersSnap=await db.collection("orders").where("date",">=",thirtyDaysAgo).get();
    // BUG FIX: Stornierte Bestellungen wurden mitgezählt — excluded now.
    let totalRevenue=0,orderCount=0;const productMap=new Map(); ordersSnap.forEach(doc=>{const o=doc.data();if((o.status||'')===('Storniert'))return;totalRevenue+=o.total||0;orderCount++;o.items.forEach(item=>productMap.set(item.name,(productMap.get(item.name)||0)+item.qty));});
    const topProducts=Array.from(productMap.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5);
    pdfDoc.setFontSize(14);pdfDoc.text("Zusammenfassung letzte 30 Tage",20,45); pdfDoc.setFontSize(11);pdfDoc.text(`Gesamtumsatz: ${totalRevenue.toFixed(2)} €`,20,55);pdfDoc.text(`Bestellungen: ${orderCount}`,20,62);pdfDoc.text("Top 5 Produkte:",20,75);
    // M-03 FIX: Auto page break to prevent content overflow
    let y=82;topProducts.forEach(([name,qty])=>{ if(y>260){pdfDoc.addPage();y=20;} pdfDoc.text(`${name}: ${qty} Stück`,25,y);y+=7;});
    const usersSnap=await db.collection("users").orderBy("referralCount","desc").limit(10).get(); if(y>245){pdfDoc.addPage();y=20;} pdfDoc.text("Top Referrer:",20,y+10);y+=17;
    usersSnap.forEach(doc=>{const u=doc.data(); if(y>260){pdfDoc.addPage();y=20;} pdfDoc.text(`${u.username||(u.email||'').split("@")[0]||'Anonym'} – ${u.referralCount||0} Freunde`,25,y);y+=7;});
    pdfDoc.setFontSize(10);pdfDoc.text("WaveVapes Admin Panel v2.0",20,280); pdfDoc.save(`wavevapes-monatsbericht_${new Date().toISOString().slice(0,10)}.pdf`);
    await logAction("monthly_report_generated"); showToast("✅ PDF heruntergeladen!","success");
}

// ── Neu: Kategorie-Umsatz und Wochentag-Chart ─────────────
let categoryRevenueChart = null;
let weekdayChart = null;
let newVsReturnChart = null;

async function loadAnalyticsExtended(ordersSnap) {
    // Kategorie-Umsatz
    const catRevMap = {};
    const weekdayCounts = [0,0,0,0,0,0,0];
    const knownEmails = new Set();
    const newCounts = {};
    const returnCounts = {};

    ordersSnap.forEach(doc => {
        const o = doc.data();
        if ((o.status || '') === 'Storniert' || !o.date) return;
        const dateObj = o.date.toDate();
        const day = dateObj.toISOString().slice(0,10);
        const wd = dateObj.getDay(); // 0=So
        weekdayCounts[wd]++;
        const isNew = !knownEmails.has(o.userEmail);
        if (isNew) { newCounts[day] = (newCounts[day]||0)+1; knownEmails.add(o.userEmail); }
        else { returnCounts[day] = (returnCounts[day]||0)+1; }
        (o.items||[]).forEach(item => {
            if (!item.name || item.id == 999) return;
            const cat = item.category || 'Sonstige';
            catRevMap[cat] = (catRevMap[cat]||0) + (item.qty||1) * (item.price||0);
        });
    });

    // Kategorie-Chart
    const sortedCats = Object.entries(catRevMap).sort((a,b)=>b[1]-a[1]).slice(0,8);
    const catColors = ['#67e8f9','#a78bfa','#34d399','#fbbf24','#f472b6','#fb923c','#22d3ee','#8b5cf6'];
    if (categoryRevenueChart) categoryRevenueChart.destroy();
    const catCtx = document.getElementById('categoryRevenueChart')?.getContext('2d');
    if (catCtx && sortedCats.length) {
        categoryRevenueChart = new Chart(catCtx, {
            type: 'doughnut',
            data: { labels: sortedCats.map(([k])=>k.replace('WaveVapes ','')), datasets: [{ data: sortedCats.map(([,v])=>v), backgroundColor: catColors.map(c=>c+'bb'), borderColor: catColors, borderWidth: 1.5 }] },
            options: { responsive:true, maintainAspectRatio:false, plugins: { legend:{ position:'right', labels:{ color:'rgba(255,255,255,.6)', font:{size:10}, boxWidth:12 } }, tooltip:{ callbacks:{ label: ctx=>' '+ctx.label+': '+ctx.parsed.toFixed(2)+' €' } }, backgroundColor:'#1a1a2e', borderColor:'rgba(103,232,249,.25)', borderWidth:1 } }
        });
    }

    // Wochentag-Chart
    if (weekdayChart) weekdayChart.destroy();
    const wdCtx = document.getElementById('weekdayChart')?.getContext('2d');
    const wdLabels = ['So','Mo','Di','Mi','Do','Fr','Sa'];
    const wdGrad = wdCtx ? wdCtx.createLinearGradient(0,0,0,200) : null;
    if (wdGrad) { wdGrad.addColorStop(0,'rgba(251,146,60,.55)'); wdGrad.addColorStop(1,'rgba(251,146,60,.08)'); }
    if (wdCtx) {
        weekdayChart = new Chart(wdCtx, {
            type:'bar',
            data:{ labels:wdLabels, datasets:[{ label:'Bestellungen', data:weekdayCounts, backgroundColor:wdGrad||'rgba(251,146,60,.4)', borderColor:'rgba(251,146,60,.7)', borderWidth:1.5, borderRadius:8, borderSkipped:false }] },
            options: anChartOpts({ scales:{ x:{ grid:{display:false}, ticks:{color:'rgba(255,255,255,.5)',font:{size:11,weight:'600'}}, border:{color:'transparent'} }, y:{ grid:{color:'rgba(255,255,255,.04)'}, ticks:{color:'rgba(255,255,255,.3)',font:{size:10},stepSize:1}, border:{color:'transparent'} } } })
        });
    }

    // Neue vs. Wiederkehrende Kunden
    if (newVsReturnChart) newVsReturnChart.destroy();
    const nvrCtx = document.getElementById('newVsReturnChart')?.getContext('2d');
    const allDays = [...new Set([...Object.keys(newCounts),...Object.keys(returnCounts)])].sort();
    if (nvrCtx && allDays.length) {
        const nvrGrad1 = nvrCtx.createLinearGradient(0,0,0,200); nvrGrad1.addColorStop(0,'rgba(103,232,249,.25)'); nvrGrad1.addColorStop(1,'rgba(103,232,249,.0)');
        const nvrGrad2 = nvrCtx.createLinearGradient(0,0,0,200); nvrGrad2.addColorStop(0,'rgba(167,139,250,.25)'); nvrGrad2.addColorStop(1,'rgba(167,139,250,.0)');
        newVsReturnChart = new Chart(nvrCtx, {
            type:'line',
            data:{ labels:allDays.map(l=>{ const p=l.slice(5).split('-'); return p[1]+'.'+p[0]; }), datasets:[
                { label:'Neukunden', data:allDays.map(d=>newCounts[d]||0), borderColor:'#67e8f9', borderWidth:2, tension:0.4, fill:true, backgroundColor:nvrGrad1, pointRadius:2, pointHoverRadius:5 },
                { label:'Wiederkehrend', data:allDays.map(d=>returnCounts[d]||0), borderColor:'#a78bfa', borderWidth:2, tension:0.4, fill:true, backgroundColor:nvrGrad2, pointRadius:2, pointHoverRadius:5 }
            ]},
            options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:true, labels:{ color:'rgba(255,255,255,.6)', font:{size:11}, boxWidth:14 } }, tooltip:{ backgroundColor:'#1a1a2e', borderColor:'rgba(103,232,249,.25)', borderWidth:1, titleColor:'#67e8f9', bodyColor:'rgba(255,255,255,.75)', padding:10, cornerRadius:10 } }, scales:{ x:{ grid:{color:'rgba(255,255,255,.04)'}, ticks:{color:'rgba(255,255,255,.3)',font:{size:10}}, border:{color:'transparent'} }, y:{ grid:{color:'rgba(255,255,255,.04)'}, ticks:{color:'rgba(255,255,255,.3)',font:{size:10},stepSize:1}, border:{color:'transparent'} } } }
        });
    }

    // Push-Abonnenten zählen
    try {
        const pushSnap = await db.collection('push_subscriptions').get().catch(()=>({size:0,docs:[]}));
        const el = document.getElementById('push-sub-count');
        if (el) el.textContent = (pushSnap.size||0)+' Abonnenten';
    } catch(e) {}
    // Aktualisiere das vollständige Push-Center
    if (typeof pushRefreshStats === 'function') pushRefreshStats();
}

// Hook into loadAnalytics to also render extended charts
const _origLoadAnalytics = window.loadAnalytics;
window.loadAnalytics = async function() {
    await _origLoadAnalytics?.();
    // Re-run query for extended charts (reuse period logic)
    let since;
    if (anCustomFrom && anCustomTo) {
        since = firebase.firestore.Timestamp.fromDate(anCustomFrom);
    } else {
        const days = anCurrentPeriod || 30;
        since = firebase.firestore.Timestamp.fromDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
    }
    try {
        let q = db.collection('orders').where('date','>=',since);
        if (anCustomTo) q = q.where('date','<=',firebase.firestore.Timestamp.fromDate(anCustomTo));
        const snap = await q.get();
        await loadAnalyticsExtended(snap);
    } catch(e) { console.warn('Extended analytics error:', e); }
};


// ═══════════════════════════════════════════════════════════════
//  PUSH NOTIFICATION CENTER  — User-basiert (alle User = Abonnenten)
// ═══════════════════════════════════════════════════════════════

// ── Interne State ─────────────────────────────────────────────
var _pushAllUsers = [];   // [{uid, email, username, points, lastOrderDate, orderCount}]
var _pushFiltered = [];   // gefilterte Liste für Suche

// ── Built-in Vorlagen ─────────────────────────────────────────
var PUSH_BUILTIN = [
    { icon:'🔥', color:'rgba(239,68,68,.12)', title:'Neue Aktion!',         body:'Schau dir unsere aktuellen Angebote an – jetzt bis zu 30% sparen! 🎉', target:'all' },
    { icon:'😴', color:'rgba(167,139,250,.12)',title:'Wir vermissen dich!', body:'Lange nicht gesehen 👋 Schau vorbei – neue Produkte & tolle Angebote!', target:'no-order-30' },
    { icon:'🎁', color:'rgba(52,211,153,.12)', title:'Mystery Vape gratis!', body:'Ab 100€ Bestellwert gibt\'s eine Mystery Vape gratis. Jetzt bestellen!', target:'all' },
    { icon:'⭐', color:'rgba(251,191,36,.12)', title:'Deine Punkte warten!', body:'Du hast genug Loyalty-Punkte für einen Rabatt. Jetzt einlösen!',     target:'loyalty-high' },
    { icon:'🆕', color:'rgba(103,232,249,.12)',title:'Neue Produkte da!',   body:'Frischer Nachschub im Shop! Entdecke neue Geschmacksrichtungen 🌊',   target:'all' },
    { icon:'👑', color:'rgba(251,146,60,.12)', title:'VIP-Angebot für dich',body:'Als treuer Kunde erhältst du exklusiven Früh-Zugang zu unserer neuen Kollektion!', target:'vip' },
];

// ── Tab-Switching ─────────────────────────────────────────────
function pushSwitchTab(tab) {
    ['compose','templates','history','subscribers'].forEach(function(t) {
        var panel = document.getElementById('push-panel-' + t);
        var btn   = document.getElementById('push-tab-'  + t);
        var active = t === tab;
        if (panel) panel.style.display = active ? (t === 'compose' ? 'flex' : 'block') : 'none';
        if (btn) {
            btn.style.background   = active ? 'rgba(251,191,36,.08)' : 'transparent';
            btn.style.borderBottom = active ? '2px solid #fbbf24'    : '2px solid transparent';
            btn.style.color        = active ? '#fbbf24' : 'rgba(255,255,255,.4)';
        }
    });
    if (tab === 'history')     pushLoadHistory();
    if (tab === 'subscribers') pushLoadSubscribers();
    if (tab === 'templates')   pushRenderBuiltinTemplates();
}

// ── Vorschau ──────────────────────────────────────────────────
function pushUpdatePreview() {
    var title = (document.getElementById('push-title') || {}).value || 'Titel';
    var body  = (document.getElementById('push-body')  || {}).value || 'Nachricht erscheint hier…';
    var pt = document.getElementById('push-preview-title');
    var pb = document.getElementById('push-preview-body');
    if (pt) pt.textContent = title;
    if (pb) pb.textContent = body;
}

// ── Schnell-Tags ──────────────────────────────────────────────
function pushInsertTag(text) {
    var t = document.getElementById('push-title');
    var b = document.getElementById('push-body');
    if (!t || !b) return;
    if (!t.value.trim()) t.value = text;
    else b.value += (b.value ? ' ' : '') + text;
    pushUpdatePreview();
}

// ── Zielgruppen-Info ──────────────────────────────────────────
function pushUpdateAudienceInfo() {
    var target = (document.getElementById('push-target') || {}).value;
    var info   = document.getElementById('push-audience-info');
    var txt    = document.getElementById('push-audience-info-text');
    var suw    = document.getElementById('push-single-user-wrap');
    var msgs = {
        'all':          '🌐 Wird an alle registrierten Nutzer gesendet',
        'no-order-30':  '😴 Nutzer die seit 30+ Tagen nicht bestellt haben',
        'no-order-60':  '💤 Nutzer die seit 60+ Tagen inaktiv sind',
        'loyalty-high': '⭐ Nutzer mit mehr als 500 Loyalty-Punkten',
        'loyalty-low':  '🌱 Neue Nutzer mit weniger als 100 Punkten',
        'new-users':    '🆕 In den letzten 7 Tagen registriert',
        'vip':          '👑 VIP-Kunden mit Gesamtbestellwert über 200 €',
        'single-user':  '👤 Nachricht an einen einzelnen Nutzer',
    };
    if (txt) txt.textContent = msgs[target] || '';
    if (info) info.style.display = msgs[target] ? 'block' : 'none';
    if (suw)  suw.style.display  = target === 'single-user' ? 'block' : 'none';
}

// ── Vorlagen rendern ──────────────────────────────────────────
function pushRenderBuiltinTemplates() {
    var cont = document.getElementById('push-builtin-templates');
    if (!cont || cont.children.length > 0) return; // schon gerendert
    cont.innerHTML = PUSH_BUILTIN.map(function(t, i) {
        return '<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07)">' +
            '<div style="width:38px;height:38px;border-radius:10px;background:' + t.color + ';display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">' + t.icon + '</div>' +
            '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:#fff;margin-bottom:3px">' + t.title + '</div>' +
            '<div style="font-size:11px;color:rgba(255,255,255,.4);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + t.body + '</div></div>' +
            '<button data-tpl-idx="' + i + '" style="padding:6px 14px;border-radius:8px;background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.25);color:#fbbf24;font-size:11px;font-weight:700;cursor:pointer;flex-shrink:0">Verwenden</button>' +
            '</div>';
    }).join('');
    cont.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-tpl-idx]');
        if (!btn) return;
        pushUseTemplate(PUSH_BUILTIN[parseInt(btn.getAttribute('data-tpl-idx'))]);
    });
    pushLoadCustomTemplates();
}

// ── Vorlage verwenden ─────────────────────────────────────────
function pushUseTemplate(t) {
    var f = ['push-title','push-body','push-target','push-url'];
    var vals = [t.title, t.body, t.target, t.url||''];
    f.forEach(function(id, i) { var el = document.getElementById(id); if (el) el.value = vals[i]||''; });
    pushUpdatePreview();
    pushUpdateAudienceInfo();
    pushSwitchTab('compose');
    showToast('✅ Vorlage geladen', 'success');
}

// ── Eigene Vorlagen speichern/laden ───────────────────────────
async function pushSaveAsTemplate() {
    var title  = (document.getElementById('push-title')||{}).value||'';
    var body   = (document.getElementById('push-body') ||{}).value||'';
    var target = (document.getElementById('push-target')||{}).value||'all';
    var url    = (document.getElementById('push-url')  ||{}).value||'';
    if (!title.trim() || !body.trim()) { showToast('⚠️ Titel & Nachricht ausfüllen', 'error'); return; }
    try {
        await db.collection('push_templates').add({ title, body, target, url, createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: (auth.currentUser||{}).email||'admin' });
        showToast('✅ Vorlage gespeichert', 'success');
        pushLoadCustomTemplates();
    } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

async function pushLoadCustomTemplates() {
    var el = document.getElementById('push-custom-templates-list');
    if (!el) return;
    try {
        var snap = await db.collection('push_templates').orderBy('createdAt','desc').limit(20).get();
        if (snap.empty) { el.innerHTML = '<div style="font-size:12px;color:rgba(255,255,255,.25);text-align:center;padding:16px">Noch keine eigenen Vorlagen</div>'; return; }
        el.innerHTML = snap.docs.map(function(d) {
            var t = d.data();
            return '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);margin-bottom:6px">' +
                '<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;color:#fff">' + escA(t.title||'') + '</div>' +
                '<div style="font-size:11px;color:rgba(255,255,255,.35);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escA(t.body||'') + '</div></div>' +
                '<button data-tpl=\'' + JSON.stringify({title:t.title,body:t.body,target:t.target,url:t.url}).replace(/'/g,"&#39;") + '\' style="padding:5px 12px;border-radius:8px;background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.2);color:#fbbf24;font-size:11px;cursor:pointer;font-weight:700;flex-shrink:0">Verwenden</button>' +
                '<button data-del="' + d.id + '" style="padding:5px 10px;border-radius:8px;background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.15);color:#f87171;font-size:11px;cursor:pointer;flex-shrink:0"><i class="fa-solid fa-trash"></i></button>' +
                '</div>';
        }).join('');
        el.addEventListener('click', function handler(e) {
            var useBtn = e.target.closest('[data-tpl]');
            var delBtn = e.target.closest('[data-del]');
            if (useBtn) { try { pushUseTemplate(JSON.parse(useBtn.getAttribute('data-tpl'))); } catch(ex){} }
            if (delBtn) { db.collection('push_templates').doc(delBtn.getAttribute('data-del')).delete().then(function(){ showToast('🗑️ Gelöscht'); pushLoadCustomTemplates(); }); }
        }, { once: true });
    } catch(e) { /* ignore */ }
}

// ── Stats ─────────────────────────────────────────────────────
async function pushRefreshStats() {
    try {
        var usersSnap = await db.collection('users').get();
        var histSnap  = await db.collection('push_notifications').orderBy('sentAt','desc').limit(100).get().catch(function(){return {docs:[]};});
        var el = document.getElementById('push-kpi-subs');
        if (el) el.textContent = usersSnap.size;
        var sc = document.getElementById('push-sub-count');
        if (sc) sc.textContent = usersSnap.size + ' Nutzer';
        var week7 = Date.now() - 7*86400000;
        var sentTotal = histSnap.docs.length, sentWeek = 0, delivered = 0;
        histSnap.docs.forEach(function(d) {
            var nd = d.data();
            if ((nd.sentAt && nd.sentAt.toMillis && nd.sentAt.toMillis() > week7)) sentWeek++;
            delivered += nd.delivered || 0;
        });
        var ks = document.getElementById('push-kpi-sent');    if(ks) ks.textContent = sentTotal;
        var kw = document.getElementById('push-kpi-week');    if(kw) kw.textContent = sentWeek;
        var kd = document.getElementById('push-kpi-delivered');if(kd) kd.textContent = delivered;
    } catch(e) { console.warn('pushRefreshStats:', e); }
}

// ── Verlauf ───────────────────────────────────────────────────
async function pushLoadHistory() {
    var el = document.getElementById('push-history-list');
    if (!el) return;
    el.innerHTML = '<div style="text-align:center;padding:30px;color:rgba(255,255,255,.2);font-size:12px"><i class="fa-solid fa-spinner fa-spin"></i></div>';
    try {
        var snap = await db.collection('push_notifications').orderBy('sentAt','desc').limit(30).get();
        if (snap.empty) { el.innerHTML = '<div style="text-align:center;padding:30px;color:rgba(255,255,255,.2);font-size:12px">Noch keine Nachrichten versendet</div>'; return; }
        var LABELS = {all:'Alle','no-order-30':'Inaktiv 30T','no-order-60':'Inaktiv 60T','loyalty-high':'Loyalty hoch','loyalty-low':'Neu','new-users':'Neu reg.','vip':'VIP','single-user':'Einzeln'};
        el.innerHTML = snap.docs.map(function(d) {
            var n = d.data();
            var date = n.sentAt && n.sentAt.toDate ? n.sentAt.toDate().toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
            var lbl  = LABELS[n.target] || n.target || 'Alle';
            var recipientInfo = n.recipientEmail ? ' · 👤 ' + n.recipientEmail : '';
            return '<div style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);margin-bottom:8px">' +
                '<div style="width:34px;height:34px;border-radius:9px;background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.2);display:flex;align-items:center;justify-content:center;color:#fbbf24;font-size:14px;flex-shrink:0"><i class="fa-solid fa-bell"></i></div>' +
                '<div style="flex:1;min-width:0">' +
                '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">' +
                '<span style="font-size:13px;font-weight:600;color:#fff">' + escA(n.title||'(kein Titel)') + '</span>' +
                '<span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:99px;background:rgba(251,191,36,.1);color:#fbbf24;border:1px solid rgba(251,191,36,.2)">' + escA(lbl) + escA(recipientInfo) + '</span>' +
                '<span style="font-size:9px;color:rgba(255,255,255,.3);margin-left:auto">' + date + '</span></div>' +
                '<div style="font-size:12px;color:rgba(255,255,255,.45);margin-bottom:6px">' + escA(n.body||'') + '</div>' +
                '<div style="display:flex;gap:10px;font-size:10px;color:rgba(255,255,255,.3)">' +
                (n.delivered ? '<span style="color:#34d399">📬 ' + n.delivered + ' zugestellt</span>' : '') +
                '<button data-resend="' + d.id + '" style="margin-left:auto;padding:2px 10px;border-radius:6px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2);color:#fbbf24;font-size:10px;cursor:pointer;font-weight:700">↻ Erneut</button>' +
                '</div></div></div>';
        }).join('');
        el.addEventListener('click', function(e) {
            var btn = e.target.closest('[data-resend]');
            if (btn) pushResend(btn.getAttribute('data-resend'));
        }, { once: true });
    } catch(e) { el.innerHTML = '<div style="color:#f87171;font-size:12px;padding:16px">Fehler: ' + e.message + '</div>'; }
}

// ── Nutzer / Abonnenten laden ──────────────────────────────────
async function pushLoadSubscribers() {
    var el = document.getElementById('push-subscribers-list');
    if (!el) return;
    el.innerHTML = '<div style="text-align:center;padding:30px;color:rgba(255,255,255,.2);font-size:12px"><i class="fa-solid fa-spinner fa-spin"></i></div>';

    try {
        var usersSnap  = await db.collection('users').get();
        var ordersSnap = await db.collection('orders').get();

        // Bestelldaten pro User aufbauen
        var userOrders = {}; // uid → {count, total, last}
        ordersSnap.docs.forEach(function(d) {
            var o = d.data();
            if (!o.userId) return;
            if (!userOrders[o.userId]) userOrders[o.userId] = {count:0, total:0, last:0};
            userOrders[o.userId].count++;
            userOrders[o.userId].total += o.total || 0;
            var ts = o.date && o.date.toMillis ? o.date.toMillis() : 0;
            if (ts > userOrders[o.userId].last) userOrders[o.userId].last = ts;
        });

        var now = Date.now();
        var day30 = now - 30*86400000;

        _pushAllUsers = usersSnap.docs.map(function(d) {
            var u = d.data();
            var ord = userOrders[d.id] || {count:0, total:0, last:0};
            return { uid: d.id, email: u.email||'', username: u.username||'', points: u.totalBonusPoints||0, orderCount: ord.count, orderTotal: ord.total, lastOrder: ord.last };
        }).filter(function(u){ return u.email; });

        var active = _pushAllUsers.filter(function(u){ return u.lastOrder > day30; }).length;
        var withOrders = _pushAllUsers.filter(function(u){ return u.orderCount > 0; }).length;

        var st = document.getElementById('push-seg-total');   if(st) st.textContent = _pushAllUsers.length;
        var sa = document.getElementById('push-seg-active');  if(sa) sa.textContent = active;
        var so = document.getElementById('push-seg-orders');  if(so) so.textContent = withOrders;

        _pushFiltered = _pushAllUsers;
        pushRenderUserList(_pushFiltered);
    } catch(e) {
        el.innerHTML = '<div style="color:#f87171;font-size:12px;padding:16px">Fehler: ' + e.message + '</div>';
    }
}

function pushFilterUsers() {
    var term = ((document.getElementById('push-user-search')||{}).value||'').toLowerCase().trim();
    _pushFiltered = !term ? _pushAllUsers : _pushAllUsers.filter(function(u){
        return u.email.toLowerCase().includes(term) || u.username.toLowerCase().includes(term);
    });
    pushRenderUserList(_pushFiltered);
}

function pushRenderUserList(users) {
    var el = document.getElementById('push-subscribers-list');
    if (!el) return;
    if (!users.length) { el.innerHTML = '<div style="text-align:center;padding:30px;color:rgba(255,255,255,.2);font-size:12px">Keine Nutzer gefunden</div>'; return; }
    el.innerHTML = users.slice(0,100).map(function(u) {
        var lastStr = u.lastOrder ? new Date(u.lastOrder).toLocaleDateString('de-DE') : '—';
        var active  = u.lastOrder > Date.now() - 30*86400000;
        return '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);margin-bottom:6px">' +
            '<div style="width:8px;height:8px;border-radius:50%;background:' + (active?'#34d399':'rgba(255,255,255,.15)') + ';flex-shrink:0"></div>' +
            '<div style="flex:1;min-width:0">' +
            '<div style="font-size:12px;font-weight:600;color:rgba(255,255,255,.85)">' + (u.username || u.email.split('@')[0]) + '</div>' +
            '<div style="font-size:10px;color:rgba(255,255,255,.35)">' + u.email + ' · ' + u.orderCount + ' Bestellungen · ' + u.points + ' Pts · zuletzt ' + lastStr + '</div>' +
            '</div>' +
            '<button data-send-uid="' + u.uid + '" data-send-email="' + u.email + '" data-send-name="' + (u.username||u.email) + '" ' +
            'style="padding:5px 12px;border-radius:8px;background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.2);color:#fbbf24;font-size:11px;font-weight:700;cursor:pointer;flex-shrink:0;white-space:nowrap">' +
            '<i class="fa-solid fa-paper-plane"></i> Schreiben</button>' +
            '</div>';
    }).join('') + (users.length > 100 ? '<div style="font-size:11px;color:rgba(255,255,255,.25);text-align:center;padding:10px">+ ' + (users.length-100) + ' weitere — Suche verwenden</div>' : '');

    // BUG-6 FIX: { once: true } entfernt — der Listener wurde nach dem ersten Klick
    // permanent entfernt, sodass alle weiteren "Schreiben"-Buttons wirkungslos waren.
    el.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-send-uid]');
        if (!btn) return;
        pushComposeSingle(btn.getAttribute('data-send-uid'), btn.getAttribute('data-send-email'), btn.getAttribute('data-send-name'));
    });
}

// ── Einzelnutzer anschreiben ──────────────────────────────────
function pushComposeSingle(uid, email, name) {
    var targetEl = document.getElementById('push-target');
    var singleOpt= document.getElementById('push-target-single-opt');
    var inputEl  = document.getElementById('push-single-user-input');
    var infoEl   = document.getElementById('push-single-user-info');
    if (singleOpt) singleOpt.style.display = '';
    if (targetEl)  targetEl.value = 'single-user';
    if (inputEl)   inputEl.value  = email;
    if (infoEl)    infoEl.innerHTML = '<i class="fa-solid fa-user" style="color:#fbbf24"></i> <b style="color:#fff">' + name + '</b> · ' + email;
    pushUpdateAudienceInfo();
    pushSwitchTab('compose');
    showToast('✅ Nutzer ausgewählt — jetzt Nachricht verfassen', 'success');
    // Titel-Feld fokussieren
    setTimeout(function(){ var t = document.getElementById('push-title'); if(t) t.focus(); }, 300);
}

// ── Export ────────────────────────────────────────────────────
async function pushExportSubscribers() {
    try {
        // BUG-7 FIX: u.orderCount existiert nicht im User-Dokument — es wird nur lokal
        // durch einen Orders-Join berechnet. Deshalb hier erneut Orders laden und joinen.
        var [usersSnap, ordersSnap] = await Promise.all([
            db.collection('users').get(),
            db.collection('orders').get()
        ]);
        var orderCountMap = {};
        ordersSnap.forEach(function(d) {
            var uid = d.data().userId;
            if (uid) orderCountMap[uid] = (orderCountMap[uid] || 0) + 1;
        });
        var rows = [['E-Mail','Benutzername','Bestellungen','Loyalty-Punkte']];
        usersSnap.forEach(function(d) {
            var u = d.data();
            if (!u.email) return;
            rows.push([u.email, u.username||'', orderCountMap[d.id]||0, u.totalBonusPoints||0]);
        });
        downloadCSV('wavevapes-nutzer.csv', rows);
        showToast('✅ Exportiert', 'success');
    } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

// ── Erneut senden ─────────────────────────────────────────────
async function pushResend(docId) {
    try {
        var doc = await db.collection('push_notifications').doc(docId).get();
        if (!doc.exists) return;
        var n = doc.data();
        var fields = {title:n.title||'',body:n.body||'',target:n.target||'all',url:n.url||''};
        Object.keys(fields).forEach(function(k){ var el=document.getElementById('push-'+k); if(el) el.value=fields[k]; });
        if (n.target === 'single-user' && n.recipientEmail) {
            pushComposeSingle(n.recipientUid||'', n.recipientEmail, n.recipientEmail);
        } else {
            pushUpdateAudienceInfo();
            pushSwitchTab('compose');
        }
        pushUpdatePreview();
        showToast('✅ Kampagne geladen — anpassen & senden', 'success');
    } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

// ── Senden ────────────────────────────────────────────────────
async function sendPushNotification() {
    var title    = ((document.getElementById('push-title')||{}).value||'').trim();
    var body     = ((document.getElementById('push-body') ||{}).value||'').trim();
    var target   = (document.getElementById('push-target')||{}).value || 'all';
    var url      = ((document.getElementById('push-url')  ||{}).value||'').trim() || 'https://wavevapes.de';
    var schedule = (document.getElementById('push-schedule')||{}).value || '';

    if (!title || !body) { showToast('⚠️ Titel und Nachricht sind Pflichtfelder', 'error'); return; }

    // Einzelnutzer: E-Mail prüfen
    var recipientEmail = '', recipientUid = '';
    if (target === 'single-user') {
        recipientEmail = ((document.getElementById('push-single-user-input')||{}).value||'').trim();
        if (!recipientEmail) { showToast('⚠️ Bitte einen Nutzer auswählen (Abonnenten-Tab)', 'error'); return; }
        // UID aus Cache suchen
        var found = _pushAllUsers.find(function(u){ return u.email === recipientEmail; });
        if (found) recipientUid = found.uid;
    }

    var btn = document.getElementById('push-send-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Wird gesendet…'; }

    try {
        var payload = {
            title:   title,
            body:    body,
            url:     url,
            target:  target,
            sentAt:  firebase.firestore.FieldValue.serverTimestamp(),
            sentBy:  (auth.currentUser||{}).email || 'admin',
            delivered: 0,
            status:  'queued'
        };
        if (schedule)       payload.scheduledFor    = firebase.firestore.Timestamp.fromDate(new Date(schedule));
        if (recipientEmail) payload.recipientEmail  = recipientEmail;
        if (recipientUid)   payload.recipientUid    = recipientUid;

        var ref = await db.collection('push_notifications').add(payload);
        await logAction('push_notification_sent', ref.id, { title:title, target:target, recipient: recipientEmail||null });

        // Felder leeren
        ['push-title','push-body','push-url','push-schedule'].forEach(function(id){
            var el=document.getElementById(id); if(el) el.value='';
        });
        var si = document.getElementById('push-single-user-input'); if(si) si.value='';
        var sinfo = document.getElementById('push-single-user-info'); if(sinfo) sinfo.innerHTML='';
        var sopt = document.getElementById('push-target-single-opt'); if(sopt) sopt.style.display='none';
        var tgt = document.getElementById('push-target'); if(tgt) tgt.value='all';
        pushUpdatePreview();
        pushUpdateAudienceInfo();

        var msg = schedule
            ? '✅ Geplant für ' + new Date(schedule).toLocaleString('de-DE')
            : (recipientEmail ? '✅ Nachricht an ' + recipientEmail + ' gespeichert!' : '✅ Push-Kampagne gespeichert & wird versendet!');
        showToast(msg, 'success');
        pushRefreshStats();
    } catch(e) {
        showToast('❌ Fehler: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-paper-plane"></i> Senden'; }
    }
}

// ── Erweiterte Export-Funktionen ──────────────────────────
function downloadCSV(filename, rows) {
    const bom = '\uFEFF';
    const csv = bom + rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

async function exportAnalyticsCSV() {
    showToast('⏳ Daten werden geladen…');
    try {
        const days = anCurrentPeriod || 30;
        const since = firebase.firestore.Timestamp.fromDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
        const snap = await db.collection('orders').where('date','>=',since).get();
        const rows = [['Datum','Bestellnummer','Kunde','Produkte','Gesamtbetrag €','Status']];
        snap.forEach(doc => {
            const o = doc.data();
            rows.push([
                o.date?.toDate?.()?.toLocaleDateString('de-DE') || '',
                o.orderNumber || doc.id,
                o.userEmail || '',
                (o.items||[]).map(i=>i.name+'×'+i.qty).join(' | '),
                (o.total||0).toFixed(2),
                o.status || ''
            ]);
        });
        downloadCSV(`wavevapes-analytics-${days}tage_${new Date().toISOString().slice(0,10)}.csv`, rows);
        await logAction('export_analytics_csv', null, { days });
        showToast('✅ Analytics CSV heruntergeladen!', 'success');
    } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

async function exportRevenueByCategory() {
    showToast('⏳ Kategorie-Daten werden berechnet…');
    try {
        const snap = await db.collection('orders').get();
        const catMap = {};
        snap.forEach(doc => {
            const o = doc.data();
            if ((o.status||'') === 'Storniert') return;
            (o.items||[]).forEach(item => {
                const cat = item.category || 'Sonstige';
                if (!catMap[cat]) catMap[cat] = { revenue: 0, units: 0, orders: new Set() };
                catMap[cat].revenue += (item.qty||1) * (item.price||0);
                catMap[cat].units  += (item.qty||1);
                catMap[cat].orders.add(doc.id);
            });
        });
        const rows = [['Kategorie','Umsatz €','Verkaufte Einheiten','Bestellungen']];
        Object.entries(catMap).sort((a,b)=>b[1].revenue-a[1].revenue).forEach(([cat,v]) => {
            rows.push([cat, v.revenue.toFixed(2), v.units, v.orders.size]);
        });
        downloadCSV(`wavevapes-umsatz-kategorie_${new Date().toISOString().slice(0,10)}.csv`, rows);
        showToast('✅ Kategorie-CSV heruntergeladen!', 'success');
    } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

async function exportTopCustomers() {
    showToast('⏳ Top-Kunden werden berechnet…');
    try {
        const snap = await db.collection('orders').get();
        const custMap = {};
        snap.forEach(doc => {
            const o = doc.data();
            if ((o.status||'') === 'Storniert') return;
            const email = o.userEmail || 'unbekannt';
            if (!custMap[email]) custMap[email] = { orders: 0, revenue: 0 };
            custMap[email].orders++;
            custMap[email].revenue += parseFloat(o.total||0);
        });
        const rows = [['E-Mail','Bestellungen','Gesamtumsatz €','Ø Bestellwert €']];
        Object.entries(custMap).sort((a,b)=>b[1].revenue-a[1].revenue).slice(0,100).forEach(([email,v]) => {
            rows.push([email, v.orders, v.revenue.toFixed(2), (v.revenue/v.orders).toFixed(2)]);
        });
        downloadCSV(`wavevapes-top-kunden_${new Date().toISOString().slice(0,10)}.csv`, rows);
        showToast('✅ Top-Kunden CSV heruntergeladen!', 'success');
    } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

async function exportLoyaltyReport() {
    showToast('⏳ Loyalty-Daten werden geladen…');
    try {
        const snap = await db.collection('users').get();
        const rows = [['E-Mail','Benutzername','Loyalty-Punkte','Eingelöste Codes','Referrals']];
        snap.forEach(doc => {
            const u = doc.data();
            if ((u.totalBonusPoints||0) === 0 && !u.email) return;
            rows.push([
                u.email || '',
                u.username || '',
                u.totalBonusPoints || 0,
                (u.redeemedLoyaltyCodes||[]).join(' | '),
                u.referralCount || 0
            ]);
        });
        rows.sort((a,b) => Number(b[2]) - Number(a[2]));
        downloadCSV(`wavevapes-loyalty-report_${new Date().toISOString().slice(0,10)}.csv`, rows);
        showToast('✅ Loyalty CSV heruntergeladen!', 'success');
    } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

async function exportOrdersJSON() {
    showToast('⏳ Bestellungen werden exportiert…');
    try {
        const snap = await db.collection('orders').orderBy('date','desc').limit(500).get();
        const data = snap.docs.map(doc => {
            const o = doc.data();
            return { id: doc.id, ...o, date: o.date?.toDate?.()?.toISOString() || null };
        });
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `wavevapes-bestellungen_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        await logAction('export_orders_json');
        showToast('✅ Bestellungen JSON heruntergeladen!', 'success');
    } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

// ====================== ADMIN LOGS v2 ======================
const LG_ACTION_MAP = {
    product_created:'product', product_updated:'product', product_deleted:'product',
    product_duplicated:'product', product_availability_changed:'product',
    bulk_edit:'product', auto_category_assignment:'product',
    order_status_changed:'order', order_updated:'order', order_deleted:'order',
    orders_export_with_tracking:'order',
    user_disabled:'user', user_enabled:'user', user_deleted:'user',
    user_loyalty_reset:'user', all_loyalty_reset:'user',
    free_shipping_enabled:'user', free_shipping_disabled:'user',
    password_reset_requested:'user', extended_user_updated:'user',
    bulk_users_disabled:'user', bulk_users_enabled:'user',
    bulk_users_deleted:'user', bulk_points_added:'user',
    bulk_freeship_enabled:'user', broadcast_sent:'user',
    coupon_created:'coupon', coupon_deleted:'coupon',
    category_created:'settings', category_updated:'settings', category_deleted:'settings',
    settings_updated:'settings', all_statistics_reset:'settings',
    monthly_report_generated:'settings',
    ip_banned:'security', ip_unbanned:'security',
};
const LG_ICON_MAP = {
    product:'fa-box', order:'fa-receipt', user:'fa-user',
    coupon:'fa-ticket', settings:'fa-cog', security:'fa-shield-halved', default:'fa-bolt'
};
const LG_ACTION_LABELS = {
    product_created:'Produkt erstellt', product_updated:'Produkt bearbeitet',
    product_deleted:'Produkt gelöscht', product_duplicated:'Produkt dupliziert',
    product_availability_changed:'Verfügbarkeit geändert',
    bulk_edit:'Bulk-Edit', auto_category_assignment:'Auto-Kategorisierung',
    order_status_changed:'Bestellstatus geändert', order_updated:'Bestellung aktualisiert',
    order_deleted:'Bestellung gelöscht', orders_export_with_tracking:'Export mit Tracking',
    user_disabled:'User gesperrt', user_enabled:'User entsperrt',
    user_deleted:'Account gelöscht', user_loyalty_reset:'Punkte zurückgesetzt',
    all_loyalty_reset:'Alle Punkte zurückgesetzt',
    free_shipping_enabled:'Gratisversand aktiviert', free_shipping_disabled:'Gratisversand deaktiviert',
    password_reset_requested:'Passwort-Reset', extended_user_updated:'User bearbeitet',
    bulk_users_disabled:'Bulk: User gesperrt', bulk_users_enabled:'Bulk: User entsperrt',
    bulk_users_deleted:'Bulk: User gelöscht', bulk_points_added:'Bulk: Punkte vergeben',
    bulk_freeship_enabled:'Bulk: Gratisversand', broadcast_sent:'Broadcast gesendet',
    coupon_created:'Gutschein erstellt', coupon_deleted:'Gutschein gelöscht',
    category_created:'Kategorie erstellt', category_updated:'Kategorie bearbeitet',
    category_deleted:'Kategorie gelöscht', settings_updated:'Einstellungen gespeichert',
    all_statistics_reset:'Statistiken zurückgesetzt', monthly_report_generated:'PDF-Bericht erstellt',
    ip_banned:'IP gebannt', ip_unbanned:'IP entbannt',
};
function lgGetType(action) { return LG_ACTION_MAP[action] || 'default'; }
function lgGetIcon(type)   { return LG_ICON_MAP[type]   || 'fa-bolt';  }
function lgGetLabel(action){ return LG_ACTION_LABELS[action] || action; }
function lgRelTime(date) {
    const diff = Date.now() - date.getTime();
    if (diff < 60000)   return 'gerade eben';
    if (diff < 3600000) return Math.floor(diff/60000) + ' Min. ago';
    if (diff < 86400000)return Math.floor(diff/3600000) + ' Std. ago';
    return date.toLocaleString('de-DE', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
}

function loadAdminLogs() {
    // K-02 FIX: Teardown existing listener cleanly before restarting
    if (logsUnsubscribe) { logsUnsubscribe(); logsUnsubscribe = null; }
    logsUnsubscribe = db.collection("admin_logs").orderBy("timestamp","desc").limit(50).onSnapshot(snap => {
        // Rendert in beiden Containern: Superadmin-Zone (logs-container) UND Tab 17 (admin-logs-container-tab17)
        const containers = [
            document.getElementById("logs-container"),
            document.getElementById("admin-logs-container-tab17")
        ].filter(Boolean);
        const badge = document.getElementById("lg-log-count");
        if (badge) badge.textContent = snap.size + ' Einträge';
        if (snap.empty) {
            containers.forEach(c => { c.innerHTML=`<div class="lg-empty"><i class="fa-solid fa-list-check"></i>Noch keine Admin-Aktionen.</div>`; });
            return;
        }
        let html = '';
        snap.forEach((doc,idx) => {
            const l = doc.data();
            const time = l.timestamp ? lgRelTime(l.timestamp.toDate()) : '—';
            const type = lgGetType(l.action);
            const icon = lgGetIcon(type);
            const label = lgGetLabel(l.action);
            const adminShort = (l.adminEmail||'?').split('@')[0];
            const target = l.target ? l.target.slice(0,24)+(l.target.length>24?'…':'') : '';
            html += `<div class="lg-log-entry" style="animation-delay:${Math.min(idx,10)*0.03}s">
                <div class="lg-log-line lg-ln-${type}"></div>
                <div class="lg-log-icon lg-ic-${type}"><i class="fa-solid ${icon}"></i></div>
                <div class="lg-log-body">
                    <div class="lg-log-action">${label}</div>
                    <div class="lg-log-meta">
                        <span class="lg-log-admin">${adminShort}</span>
                        ${target ? `<span class="lg-log-target">${target}</span>` : ''}
                    </div>
                </div>
                <div class="lg-log-time">${time}</div>
            </div>`;
        });
        containers.forEach(c => { c.innerHTML = html; });
    });
    // loadUnauthorizedLogs/loadBannedIPs nur noch im Superadmin-Kontext aufrufen
}

async function loadUnauthorizedLogs() {
    const container = document.getElementById("unauthorized-logs-container"); if (!container) return;
    try {
        const snap = await db.collection("unauthorized_access").orderBy("timestamp","desc").limit(50).get();
        const badge = document.getElementById('lg-threat-badge');
        if (badge) badge.textContent = snap.size + (snap.size===1?' Versuch':' Versuche');
        if (snap.empty) { container.innerHTML=`<div class="lg-empty"><i class="fa-solid fa-shield-check"></i>Keine Zugriffsversuche 🎉</div>`; return; }
        let html = '';
        snap.forEach(doc => {
            const l = doc.data();
            const time = l.timestamp ? lgRelTime(l.timestamp.toDate()) : '—';
            const isNotLoggedIn = l.reason === "Nicht eingeloggt";
            const reasonColor = isNotLoggedIn ? 'color:var(--lg-amber)' : 'color:var(--lg-red)';
            const ip = l.ip || "unbekannt";
            const canBan = ip !== "unbekannt";
            html += `<div class="lg-threat-entry">
                <div class="lg-threat-icon">${isNotLoggedIn ? '🔓' : '🚫'}</div>
                <div class="lg-threat-body">
                    <div class="lg-threat-reason" style="${reasonColor}">${escA(l.reason)}</div>
                    <div class="lg-threat-row"><i class="fa-solid fa-envelope" style="font-size:9px"></i><span class="lg-threat-val">${escA(l.email||'—')}</span></div>
                    <div class="lg-threat-row">
                        <i class="fa-solid fa-network-wired" style="font-size:9px"></i>
                        <span class="lg-threat-val">${ip}</span>
                        ${canBan ? `<button class="lg-ban-inline" onclick="openBanIPModal('${ip}')"><i class="fa-solid fa-ban"></i> Bannen</button>` : ''}
                    </div>
                    ${l.referrer ? `<div class="lg-threat-row"><i class="fa-solid fa-link" style="font-size:9px"></i><span style="font-size:10px;color:rgba(255,255,255,.25);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px">${l.referrer}</span></div>` : ''}
                </div>
                <div class="lg-threat-time">${time}</div>
            </div>`;
        });
        container.innerHTML = html;
    } catch(e) {
        // BUG FIX: Use textContent for e.message to prevent XSS via Firestore error strings
        const d = document.createElement('div');
        d.className = 'lg-empty';
        d.style.color = 'var(--lg-red)';
        d.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Fehler: ';
        d.appendChild(document.createTextNode(e.message));
        container.innerHTML = '';
        container.appendChild(d);
    }
}

async function clearUnauthorizedLogs() {
    if (!confirm("Alle Zugriffsversuche löschen?")) return;
    const snap = await db.collection("unauthorized_access").get();
    const batch = db.batch();
    snap.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    showToast("✅ Zugriffsversuche gelöscht", "success");
    loadUnauthorizedLogs();
}

function openBanIPModal(ip) {
    const _e = s => String(s == null ? '' : s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

    // Echtes DOM statt innerHTML-String — onclick-Attribute in innerHTML können
    // in manchen Browsern/Kontexten nicht auf lokale Funktionen zugreifen
    const editModal = document.getElementById('edit-modal');
    editModal.innerHTML = '';

    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-[99999]';

    const card = document.createElement('div');
    card.className = 'bg-zinc-900 rounded-3xl p-8 max-w-md w-full mx-4 modal';
    card.style.cssText = 'max-height:90vh;overflow-y:auto';

    card.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-2xl font-bold text-red-400 flex items-center gap-2">
                <i class="fa-solid fa-ban"></i> IP Bannen
            </h3>
            <button id="ban-close-btn" class="text-3xl text-gray-400 hover:text-white">✕</button>
        </div>
        <div class="bg-zinc-950 border border-white/10 rounded-2xl px-6 py-4 mb-6 font-mono text-cyan-300 text-lg text-center">
            ${_e(ip)}
        </div>
        <div class="mb-5">
            <label class="block text-sm text-gray-400 mb-3">Ban-Dauer <span class="text-red-400">*</span></label>
            <div class="grid grid-cols-3 gap-2 mb-3" id="ban-preset-grid">
                <button type="button" data-days="1"   class="ban-preset-btn py-3 rounded-2xl bg-zinc-800 border border-white/10 text-sm font-semibold transition">1 Tag</button>
                <button type="button" data-days="7"   class="ban-preset-btn py-3 rounded-2xl bg-zinc-800 border border-white/10 text-sm font-semibold transition">7 Tage</button>
                <button type="button" data-days="30"  class="ban-preset-btn py-3 rounded-2xl bg-zinc-800 border border-white/10 text-sm font-semibold transition">30 Tage</button>
                <button type="button" data-days="90"  class="ban-preset-btn py-3 rounded-2xl bg-zinc-800 border border-white/10 text-sm font-semibold transition">90 Tage</button>
                <button type="button" data-days="180" class="ban-preset-btn py-3 rounded-2xl bg-zinc-800 border border-white/10 text-sm font-semibold transition">180 Tage</button>
                <button type="button" data-days="0"   class="ban-preset-btn py-3 rounded-2xl bg-zinc-800 border border-red-400/40 text-red-400 text-sm font-semibold transition">Permanent</button>
            </div>
            <button type="button" id="ban-custom-toggle" class="w-full py-2 text-xs text-gray-500 hover:text-gray-300 transition flex items-center justify-center gap-2">
                <i class="fa-solid fa-calendar-days" style="font-size:11px"></i> Eigenes Datum wählen
            </button>
            <div id="ban-custom-date-wrap" style="display:none;margin-top:10px">
                <input type="datetime-local" id="ban-until-date"
                    class="w-full bg-zinc-800 border border-amber-400/40 focus:border-amber-400 rounded-2xl px-5 py-3 text-sm outline-none"
                    style="color-scheme:dark">
            </div>
            <div id="ban-duration-display" class="mt-3 text-center text-sm font-semibold" style="min-height:22px;color:#fbbf24"></div>
            <input type="hidden" id="ban-days-value" value="">
        </div>
        <div class="mb-6">
            <label class="block text-sm text-gray-400 mb-2">Grund (optional)</label>
            <input id="ban-reason-input" type="text" placeholder="z. B. Wiederholter Angriff"
                class="w-full bg-zinc-800 border border-white/10 focus:border-red-400 rounded-2xl px-5 py-3 outline-none text-sm">
        </div>
        <div class="flex gap-3">
            <button id="ban-ip-execute-btn" class="flex-1 bg-red-600 hover:bg-red-500 py-4 rounded-3xl font-bold flex items-center justify-center gap-2 transition">
                <i class="fa-solid fa-ban"></i> IP Bannen
            </button>
            <button id="ban-cancel-btn" class="flex-1 bg-zinc-700 hover:bg-zinc-600 py-4 rounded-3xl transition">
                Abbrechen
            </button>
        </div>`;

    overlay.appendChild(card);
    editModal.appendChild(overlay);
    editModal.classList.remove('hidden');

    // Event-Listener direkt auf Elemente — kein onclick-Attribut nötig
    card.querySelector('#ban-close-btn').addEventListener('click', closeEditModal);
    card.querySelector('#ban-cancel-btn').addEventListener('click', closeEditModal);
    card.querySelector('#ban-ip-execute-btn').addEventListener('click', () => executeBanIP(ip));

    // Preset-Buttons
    card.querySelectorAll('.ban-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const days = parseInt(btn.dataset.days, 10);
            // Alle zurücksetzen
            card.querySelectorAll('.ban-preset-btn').forEach(b => {
                b.style.background = '';
                b.style.borderColor = '';
                b.style.color = '';
            });
            // Aktiven hervorheben
            if (days === 0) {
                btn.style.background = 'rgba(239,68,68,.18)';
                btn.style.borderColor = 'rgba(239,68,68,.7)';
                btn.style.color = '#f87171';
            } else {
                btn.style.background = 'rgba(251,191,36,.15)';
                btn.style.borderColor = 'rgba(251,191,36,.6)';
                btn.style.color = '#fbbf24';
            }
            card.querySelector('#ban-days-value').value = days;
            card.querySelector('#ban-custom-date-wrap').style.display = 'none';
            card.querySelector('#ban-until-date').value = '';
            const display = card.querySelector('#ban-duration-display');
            if (days === 0) {
                display.textContent = '🔴 Permanent gesperrt';
                display.style.color = '#f87171';
            } else {
                const until = new Date(Date.now() + days * 86400000);
                const str = until.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' });
                display.textContent = `⏱ Gesperrt bis ${str}`;
                display.style.color = '#fbbf24';
            }
        });
    });

    // Custom-Datum Toggle
    card.querySelector('#ban-custom-toggle').addEventListener('click', () => {
        const wrap = card.querySelector('#ban-custom-date-wrap');
        const shown = wrap.style.display !== 'none';
        wrap.style.display = shown ? 'none' : 'block';
        if (!shown) {
            // Presets zurücksetzen
            card.querySelectorAll('.ban-preset-btn').forEach(b => {
                b.style.background = ''; b.style.borderColor = ''; b.style.color = '';
            });
            card.querySelector('#ban-days-value').value = 'custom';
            card.querySelector('#ban-duration-display').textContent = '';
            card.querySelector('#ban-until-date').focus();
        }
    });

    // Custom-Datum: bei Änderung Anzeige aktualisieren
    card.querySelector('#ban-until-date').addEventListener('change', (e) => {
        const val = e.target.value;
        const display = card.querySelector('#ban-duration-display');
        if (val) {
            const d = new Date(val);
            display.textContent = `⏱ Gesperrt bis ${d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })} Uhr`;
            display.style.color = '#fbbf24';
        } else {
            display.textContent = '';
        }
    });
}

// setBanPreset/toggleBanCustomDate bleiben als Stubs für eventuelle Aufrufe von außen
function setBanPreset(days) { /* via DOM-Event-Listener im Modal */ }
function toggleBanCustomDate() { /* via DOM-Event-Listener im Modal */ }

async function executeBanIP(ip) {
    const daysVal  = document.getElementById('ban-days-value')?.value;
    const reason   = document.getElementById('ban-reason-input')?.value.trim() || '—';

    // Pflichtfeld: Dauer muss gewählt sein
    if (!daysVal) {
        showToast('⚠️ Bitte erst eine Bann-Dauer auswählen!', 'error');
        return;
    }

    let isPermanent = false;
    let bannedUntil = null;

    if (daysVal === '0') {
        isPermanent = true;
    } else if (daysVal === 'custom') {
        const dateVal = document.getElementById('ban-until-date')?.value;
        if (!dateVal) { showToast('⚠️ Bitte ein Datum eingeben!', 'error'); return; }
        const parsed = new Date(dateVal);
        if (isNaN(parsed.getTime()) || parsed <= new Date()) {
            showToast('⚠️ Datum muss in der Zukunft liegen!', 'error'); return;
        }
        bannedUntil = firebase.firestore.Timestamp.fromDate(parsed);
    } else {
        const days = parseInt(daysVal, 10);
        if (isNaN(days) || days < 1) { showToast('⚠️ Ungültige Dauer!', 'error'); return; }
        bannedUntil = firebase.firestore.Timestamp.fromDate(
            new Date(Date.now() + days * 86400000)
        );
    }

    try {
        const existing = await db.collection('banned_ips').where('ip', '==', ip).limit(1).get();
        if (!existing.empty) {
            if (!confirm(`IP ${ip} ist bereits gebannt. Überschreiben?`)) return;
            await existing.docs[0].ref.delete();
        }
        await db.collection('banned_ips').add({
            ip, permanent: isPermanent, bannedUntil, reason,
            bannedAt: firebase.firestore.FieldValue.serverTimestamp(),
            bannedBy: auth.currentUser?.email || 'Admin'
        });
        await logAction('ip_banned', ip, { permanent: isPermanent, reason });
        closeEditModal();
        const durText = isPermanent ? 'permanent' : `${daysVal === 'custom' ? 'zeitlich' : daysVal + ' Tage'} gesperrt`;
        showToast(`🚫 IP ${ip} wurde ${durText} gebannt!`, 'success');
        loadBannedIPs();
    } catch(e) {
        showToast('❌ Fehler: ' + e.message, 'error');
    }
}
async function unbanIP(docId, ip) { if (!confirm(`IP ${ip} wirklich entbannen?`)) return; await db.collection('banned_ips').doc(docId).delete(); await logAction("ip_unbanned", ip); showToast(`✅ IP ${ip} entbannt`,'success'); loadBannedIPs(); }
async function loadBannedIPs() {
    const container = document.getElementById('banned-ips-container'); if (!container) return;
    try {
        const snap = await db.collection('banned_ips').orderBy('bannedAt','desc').get();
        const badge = document.getElementById('lg-ban-badge');
        if (badge) badge.textContent = snap.size + ' IPs';

        // ── Manuell bannen + Gäste-IPs Sektion ──
        const presenceSnap = await db.collection('presence').get();
        const guestEntries = [];
        presenceSnap.forEach(doc => {
            const p = doc.data();
            if (p.ip) {
                guestEntries.push({
                    ip: p.ip,
                    username: p.username || 'Gast',
                    email: p.email || null,
                    isGuest: p.isGuest !== false,
                    lastSeen: p.lastSeen,
                    docId: doc.id
                });
            }
        });
        // Deduplizieren nach IP
        const seenIps = new Set(snap.docs.map(d => d.data().ip));
        const uniqueGuests = [];
        const ipSeen = new Set();
        guestEntries.forEach(g => {
            if (!ipSeen.has(g.ip)) { ipSeen.add(g.ip); uniqueGuests.push(g); }
        });

        let html = `
        <div style="padding:16px 16px 14px;border-bottom:1px solid rgba(255,255,255,.07)">
            <div style="font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.3);margin-bottom:12px">IP manuell bannen</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;margin-bottom:10px">
                <input id="manual-ban-ip" type="text" placeholder="z.B. 1.2.3.4"
                    style="flex:1;min-width:140px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:8px 12px;color:#fff;font-size:13px;font-family:'JetBrains Mono',monospace;outline:none"
                    onfocus="this.style.borderColor='rgba(239,68,68,.5)'" onblur="this.style.borderColor='rgba(255,255,255,.12)'">
                <input id="manual-ban-reason" type="text" placeholder="Grund (optional)"
                    style="flex:2;min-width:160px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:8px 12px;color:#fff;font-size:13px;outline:none"
                    onfocus="this.style.borderColor='rgba(239,68,68,.5)'" onblur="this.style.borderColor='rgba(255,255,255,.12)'">
            </div>
            <!-- Dauer-Presets -->
            <div style="margin-bottom:8px">
                <div style="font-size:10px;color:rgba(255,255,255,.3);margin-bottom:6px;font-weight:600;letter-spacing:.05em">BAN-DAUER</div>
                <div style="display:flex;gap:6px;flex-wrap:wrap" id="manual-ban-preset-row">
                    <button type="button" onclick="setManualBanPreset(1)"   class="mban-preset" style="${_mbanPresetStyle()}">1 Tag</button>
                    <button type="button" onclick="setManualBanPreset(7)"   class="mban-preset" style="${_mbanPresetStyle()}">7 Tage</button>
                    <button type="button" onclick="setManualBanPreset(30)"  class="mban-preset" style="${_mbanPresetStyle()}">30 Tage</button>
                    <button type="button" onclick="setManualBanPreset(90)"  class="mban-preset" style="${_mbanPresetStyle()}">90 Tage</button>
                    <button type="button" onclick="setManualBanPreset(180)" class="mban-preset" style="${_mbanPresetStyle()}">180 Tage</button>
                    <button type="button" onclick="setManualBanPreset(0)"   class="mban-preset" style="${_mbanPresetStyle('perm')}">Permanent</button>
                </div>
                <input type="hidden" id="manual-ban-days" value="">
                <div id="manual-ban-duration-label" style="font-size:11px;color:#fbbf24;margin-top:5px;min-height:16px"></div>
            </div>
            <button onclick="manualBanIp()"
                style="background:rgba(239,68,68,.2);border:1px solid rgba(239,68,68,.4);color:#f87171;border-radius:10px;padding:8px 16px;cursor:pointer;font-size:12px;font-weight:700;white-space:nowrap"
                onmouseover="this.style.background='rgba(239,68,68,.35)'" onmouseout="this.style.background='rgba(239,68,68,.2)'">
                <i class="fa-solid fa-ban"></i> Bannen
            </button>
        </div>`;

        // ── Aktuelle Besucher IPs (aus Presence) ──
        if (uniqueGuests.length > 0) {
            html += `<div style="padding:12px 16px 6px;border-bottom:1px solid rgba(255,255,255,.07)">
                <div style="font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.3);margin-bottom:8px">Bekannte IPs (aktuelle & frühere Besucher)</div>
                <div style="display:flex;flex-direction:column;gap:6px">`;
            uniqueGuests.forEach(g => {
                const isBanned = seenIps.has(g.ip);
                const lastSeenStr = g.lastSeen ? g.lastSeen.toDate().toLocaleDateString('de-DE') : '—';
                html += `<div style="display:flex;align-items:center;gap:10px;padding:7px 10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px">
                    <i class="fa-solid fa-${g.isGuest ? 'user-secret' : 'user'}" style="color:${g.isGuest ? 'rgba(255,255,255,.3)' : '#67e8f9'};font-size:13px;flex-shrink:0"></i>
                    <div style="flex:1;min-width:0">
                        <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:rgba(255,255,255,.8)">${g.ip}${isBanned ? ' <span style="font-size:9px;background:rgba(239,68,68,.2);color:#f87171;padding:1px 6px;border-radius:4px;font-weight:700">GEBANNT</span>' : ''}</div>
                        <div style="font-size:10px;color:rgba(255,255,255,.3);margin-top:1px">${escA(g.email || g.username)} · ${g.isGuest ? 'Gast' : 'Registriert'} · zuletzt ${lastSeenStr}</div>
                    </div>
                    ${!isBanned ? `<button onclick="quickBanIp(\'${g.ip}\',\'${(g.email || g.username || "").replace(/\'/g,"")}\') " style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.25);color:#f87171;border-radius:7px;padding:4px 10px;cursor:pointer;font-size:11px;font-weight:700;flex-shrink:0" onmouseover="this.style.background='rgba(239,68,68,.25)'" onmouseout="this.style.background='rgba(239,68,68,.12)'"><i class="fa-solid fa-ban"></i> Ban</button>`
                    : `<button onclick="unbanByIp('${g.ip}')" style="background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.25);color:#34d399;border-radius:7px;padding:4px 10px;cursor:pointer;font-size:11px;font-weight:700;flex-shrink:0" onmouseover="this.style.background='rgba(52,211,153,.2)'" onmouseout="this.style.background='rgba(52,211,153,.1)'"><i class="fa-solid fa-unlock"></i> Entban</button>`}
                </div>`;
            });
            html += `</div></div>`;
        }

        // ── Gebannte IPs Liste ──
        if (snap.empty) {
            html += `<div class="lg-empty"><i class="fa-solid fa-shield-check"></i>Keine gebannten IPs.</div>`;
        } else {
            const now = new Date();
            html += `<div style="padding:12px 16px 6px"><div style="font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.3);margin-bottom:8px">Gebannte IPs (${snap.size})</div>`;
            snap.forEach(doc => {
                const b = doc.data();
                const bannedAt = b.bannedAt ? lgRelTime(b.bannedAt.toDate()) : '—';
                const isExpired = !b.permanent && b.bannedUntil && b.bannedUntil.toDate() < now;
                const untilText = b.permanent
                    ? `<span class="lg-ip-badge lg-ip-badge-perm">PERMANENT</span>`
                    : isExpired
                        ? `<span class="lg-ip-badge lg-ip-badge-expired">ABGELAUFEN</span>`
                        : `<span class="lg-ip-badge lg-ip-badge-active">AKTIV · bis ${b.bannedUntil?b.bannedUntil.toDate().toLocaleDateString('de-DE'):'?'}</span>`;
                html += `<div class="lg-ip-entry${isExpired?' expired':''}">
                    <div class="lg-ip-icon"><i class="fa-solid fa-ban"></i></div>
                    <div class="lg-ip-body">
                        <div class="lg-ip-addr"><span>${b.ip}</span>${untilText}</div>
                        <div class="lg-ip-meta">Grund: <span style="color:rgba(255,255,255,.5)">${b.reason}</span> &nbsp;·&nbsp; ${bannedAt} &nbsp;·&nbsp; von <span style="color:var(--lg-cyan)">${b.bannedBy||'Admin'}</span></div>
                    </div>
                    <button class="lg-unban-btn" onclick="unbanIP('${doc.id}','${b.ip}')"><i class="fa-solid fa-unlock"></i> Entbannen</button>
                </div>`;
            });
            html += `</div>`;
        }
        container.innerHTML = html;
    } catch(e) {
        // BUG FIX: Use textContent for e.message to prevent XSS
        const d = document.createElement('div');
        d.className = 'lg-empty';
        d.style.color = 'var(--lg-red)';
        d.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Fehler: ';
        d.appendChild(document.createTextNode(e.message));
        container.innerHTML = '';
        container.appendChild(d);
    }
}

// Preset-Styles für Manual-Ban
function _mbanPresetStyle(type) {
    return type === 'perm'
        ? 'background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#f87171;border-radius:8px;padding:5px 12px;cursor:pointer;font-size:11px;font-weight:700;transition:all .15s'
        : 'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.5);border-radius:8px;padding:5px 12px;cursor:pointer;font-size:11px;font-weight:600;transition:all .15s';
}

function setManualBanPreset(days) {
    // Alle Buttons zurücksetzen
    document.querySelectorAll('.mban-preset').forEach((b, idx) => {
        const isPerm = b.textContent.trim() === 'Permanent';
        b.style.cssText = _mbanPresetStyle(isPerm ? 'perm' : '');
    });

    // Gewählten Button highlighten
    const allBtns = document.querySelectorAll('.mban-preset');
    const idx = [1, 7, 30, 90, 180, 0].indexOf(days);
    if (idx >= 0 && allBtns[idx]) {
        if (days === 0) {
            allBtns[idx].style.background = 'rgba(239,68,68,.3)';
            allBtns[idx].style.borderColor = 'rgba(239,68,68,.8)';
            allBtns[idx].style.color = '#fff';
        } else {
            allBtns[idx].style.background = 'rgba(251,191,36,.2)';
            allBtns[idx].style.borderColor = 'rgba(251,191,36,.6)';
            allBtns[idx].style.color = '#fbbf24';
        }
    }

    document.getElementById('manual-ban-days').value = days;

    const label = document.getElementById('manual-ban-duration-label');
    if (label) {
        if (days === 0) {
            label.textContent = '🔴 Permanent gesperrt';
            label.style.color = '#f87171';
        } else {
            const until = new Date(Date.now() + days * 86400000);
            label.textContent = `⏱ Bis ${until.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' })}`;
            label.style.color = '#fbbf24';
        }
    }
}

async function manualBanIp() {
    const ip     = document.getElementById('manual-ban-ip')?.value.trim();
    const reason = document.getElementById('manual-ban-reason')?.value.trim() || 'Manuell gebannt via Admin';
    const daysVal = document.getElementById('manual-ban-days')?.value;

    if (!ip || !/^[\d\.\:a-fA-F]+$/.test(ip)) {
        showToast('❌ Bitte gültige IP eingeben', 'error'); return;
    }
    if (daysVal === '' || daysVal === null || daysVal === undefined) {
        showToast('⚠️ Bitte erst eine Bann-Dauer auswählen!', 'error'); return;
    }

    const permanent = daysVal === '0';
    const bannedUntil = permanent
        ? null
        : firebase.firestore.Timestamp.fromDate(new Date(Date.now() + parseInt(daysVal, 10) * 86400000));

    const existing = await db.collection('banned_ips').where('ip', '==', ip).limit(1).get();
    if (!existing.empty) { showToast(`⚠️ IP ${ip} ist bereits gebannt`, 'error'); return; }

    await db.collection('banned_ips').add({
        ip, reason, permanent, bannedUntil,
        bannedAt: firebase.firestore.FieldValue.serverTimestamp(),
        bannedBy: auth.currentUser?.email || 'Admin'
    });
    await logAction('ip_banned_manual', ip, { reason, permanent, days: daysVal });

    const durText = permanent ? 'permanent' : `für ${daysVal} Tage`;
    showToast(`🚫 IP ${ip} ${durText} gebannt!`, 'success');

    document.getElementById('manual-ban-ip').value = '';
    document.getElementById('manual-ban-reason').value = '';
    document.getElementById('manual-ban-days').value = '';
    document.getElementById('manual-ban-duration-label').textContent = '';
    document.querySelectorAll('.mban-preset').forEach((b, idx) => {
        const isPerm = b.textContent.trim() === 'Permanent';
        b.style.cssText = _mbanPresetStyle(isPerm ? 'perm' : '');
    });
    loadBannedIPs();
}

async function quickBanIp(ip, label) {
    if (!confirm(`IP ${ip} (${label}) permanent bannen?`)) return;
    const existing = await db.collection('banned_ips').where('ip','==',ip).limit(1).get();
    if (!existing.empty) { showToast(`⚠️ IP ${ip} ist bereits gebannt`, 'error'); return; }
    await db.collection('banned_ips').add({
        ip, reason: `Schnell-Ban: ${label}`, permanent: true,
        bannedAt: firebase.firestore.FieldValue.serverTimestamp(),
        bannedBy: auth.currentUser?.email || 'Admin',
        bannedUntil: null
    });
    await logAction('ip_banned_quick', ip, { label });
    showToast(`🚫 ${ip} gebannt!`, 'success');
    loadBannedIPs();
    usrRenderTable();
}

async function unbanByIp(ip) {
    const snap = await db.collection('banned_ips').where('ip','==',ip).get();
    if (snap.empty) { showToast('IP nicht in der Bannliste', 'error'); return; }
    const batch = db.batch();
    snap.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    await logAction('ip_unbanned', ip);
    showToast(`✅ IP ${ip} entbannt`, 'success');
    loadBannedIPs();
}

// ── Settings helpers ──
function cfgUpdateStatusPill() {
    const pill = document.getElementById('cfg-shop-status-pill');
    if (!pill) return;
    db.collection('settings').doc('main').get().then(doc => {
        const closed = doc.exists && doc.data().shop_closed;
        if (closed) {
            pill.className = 'cfg-status-pill cfg-status-closed';
            pill.innerHTML = '<i class="fa-solid fa-circle" style="font-size:6px"></i> Shop geschlossen';
        } else {
            pill.className = 'cfg-status-pill cfg-status-live';
            pill.innerHTML = '<i class="fa-solid fa-circle" style="font-size:6px"></i> Shop online';
        }
    }).catch(() => {});
}
function cfgUpdatePreviews() {
    const c = document.getElementById('set-stock-critical')?.value || '3';
    const w = document.getElementById('set-stock-warning')?.value  || '10';
    const pc = document.getElementById('cfg-prev-crit');
    const pw = document.getElementById('cfg-prev-warn');
    if (pc) pc.textContent = c;
    if (pw) pw.textContent = w;
}

async function loadSettings() {
    try {
        const doc = await db.collection("settings").doc("main").get();
        let data = doc.exists ? doc.data() : { bank_owner:"", iban:"", bic:"", bank_name:"", shipping_cost:4.99, free_shipping_threshold:100, email_template:"Deine Bestellung wurde bestätigt...", stock_critical:3, stock_warning:10 };
        if (!doc.exists) await db.collection("settings").doc("main").set(data);
        document.getElementById("set-bank-owner").value = data.bank_owner||"";
        document.getElementById("set-iban").value = data.iban||"";
        document.getElementById("set-bic").value = data.bic||"";
        // BUG-11 FIX: bank_name laden und ins neue Feld schreiben
        const bankNameEl = document.getElementById("set-bank-name");
        if (bankNameEl) bankNameEl.value = data.bank_name || "";
        document.getElementById("set-shipping").value = data.shipping_cost||4.99;
        document.getElementById("set-free-threshold").value = data.free_shipping_threshold||100;
        document.getElementById("set-email-template").value = data.email_template||"";
        document.getElementById("set-stock-critical").value = data.stock_critical !== undefined ? data.stock_critical : 3;
        document.getElementById("set-stock-warning").value  = data.stock_warning  !== undefined ? data.stock_warning  : 10;
        document.getElementById("set-notify-email").value   = data.admin_notify_email || "";
        stockCriticalThreshold = parseInt(data.stock_critical, 10) || 3;
        stockWarningThreshold  = parseInt(data.stock_warning, 10)  || 10;
        window._adminNotifyEmail = data.admin_notify_email || "";
        cfgUpdateStatusPill();
        cfgUpdatePreviews();
        // BUG-07 FIX: Event-Listener-Leak — bei jedem loadSettings()-Aufruf wurden neue
        // Listener gestackt. Lösung: Elemente austauschen (cloneNode) entfernt alle alten Listener.
        const critEl = document.getElementById('set-stock-critical');
        const warnEl = document.getElementById('set-stock-warning');
        if (critEl) {
            const freshCrit = critEl.cloneNode(true);
            critEl.parentNode.replaceChild(freshCrit, critEl);
            freshCrit.addEventListener('input', cfgUpdatePreviews);
        }
        if (warnEl) {
            const freshWarn = warnEl.cloneNode(true);
            warnEl.parentNode.replaceChild(freshWarn, warnEl);
            freshWarn.addEventListener('input', cfgUpdatePreviews);
        }
    } catch(e) { showToast('❌ Einstellungen konnten nicht geladen werden: ' + e.message, 'error'); }
}

async function saveSettings() {
    const data = {
        bank_owner:              document.getElementById("set-bank-owner").value,
        // BUG-11 FIX: bank_name jetzt speicherbar — bisher hardcoded in index.html
        bank_name:               document.getElementById("set-bank-name")?.value || "",
        iban:                    document.getElementById("set-iban").value,
        bic:                     document.getElementById("set-bic").value,
        shipping_cost:           parseFloat(document.getElementById("set-shipping").value),
        free_shipping_threshold: parseFloat(document.getElementById("set-free-threshold").value),
        email_template:          document.getElementById("set-email-template").value,
        stock_critical:          parseInt(document.getElementById("set-stock-critical").value, 10) || 3,
        stock_warning:           parseInt(document.getElementById("set-stock-warning").value, 10)  || 10,
        admin_notify_email:      document.getElementById("set-notify-email").value.trim() || null,
    };
    try {
        await db.collection("settings").doc("main").set(data, {merge:true});
        stockCriticalThreshold = data.stock_critical;
        stockWarningThreshold  = data.stock_warning;
        await logAction("settings_updated");
        showToast("✅ Einstellungen gespeichert","success");
        cfgUpdateStatusPill();
        renderProductTable();
        checkStockWarnings();
        window._FREE_THRESHOLD   = data.free_shipping_threshold;
        window._SHIPPING_COST    = data.shipping_cost;
        window._adminNotifyEmail = data.admin_notify_email || "";
    } catch(e) { showToast('❌ Einstellungen konnten nicht gespeichert werden: ' + e.message, 'error'); }
}

function getStatusClass(s) {
    switch(s||"Zahlung erwartet") {
        case "Zahlung erwartet": return "status-Zahlung"; case "Wird bearbeitet": return "status-Wird";
        case "Versendet": return "status-Versendet"; case "Zugestellt": return "status-Zugestellt";
        case "Storniert": return "status-Storniert"; default: return "status-Zahlung";
    }
}
async function awardLoyaltyIfProcessed(orderId) {
    // BUG FIX: Replaced get() + update() with a Firestore transaction.
    // The old code had a race condition: two admins changing the same order
    // simultaneously could both pass the loyaltyCredited===true check and
    // credit points twice. The transaction serialises the read+write atomically.
    let points = 0;
    await db.runTransaction(async tx => {
        const orderRef = db.collection('orders').doc(orderId);
        const snap = await tx.get(orderRef);
        if (!snap.exists) return;
        const order = snap.data();
        if (!order || order.loyaltyCredited === true) return;
        if (!order.userId) return;
        points = order.loyaltyEarned || 0;
        if (points <= 0) return;
        tx.update(db.collection('users').doc(order.userId), {
            totalBonusPoints: firebase.firestore.FieldValue.increment(points)
        });
        tx.update(orderRef, { loyaltyCredited: true });
    });
    if (points > 0) showToast(`🎉 +${points} Loyalty-Punkte gutgeschrieben!`, 'success');
}
async function reverseLoyaltyIfCredited(orderId) {
    // BUG FIX: Same race condition as awardLoyaltyIfProcessed — two admins could
    // both pass the loyaltyCredited===true check and deduct points twice.
    // Fixed with a transaction, mirroring the award function.
    let points = 0;
    await db.runTransaction(async tx => {
        const orderRef = db.collection('orders').doc(orderId);
        const snap = await tx.get(orderRef);
        if (!snap.exists) return;
        const order = snap.data();
        if (!order || order.loyaltyCredited !== true) return;
        if (!order.userId) return;
        points = order.loyaltyEarned || 0;
        if (points <= 0) return;
        tx.update(db.collection('users').doc(order.userId), {
            totalBonusPoints: firebase.firestore.FieldValue.increment(-points)
        });
        tx.update(orderRef, { loyaltyCredited: false });
    });
    if (points > 0) showToast(`↩ ${points} Loyalty-Punkte zurückgebucht (Storno)`, 'success');
}
async function handleStockOnStatusChange(orderId, newStatus) {
    try {
    const doc = await db.collection('orders').doc(orderId).get();
    const order = doc.data();
    const oldStatus = order.status || 'Zahlung erwartet';

    if (oldStatus === newStatus) return;

    const wasAlreadySold = ['Versendet', 'Zugestellt'].includes(oldStatus);
    if (newStatus === 'Wird bearbeitet' && !wasAlreadySold) {
        const batch = db.batch();
        for (const item of (order.items || [])) { // BUG-15 FIX: Null-Guard für fehlende items
            if (item.id === MYSTERY_ID) continue;
            if (item.isBundle || String(item.id).startsWith('bundle_')) continue;
            const update = order.stockReserved
                ? { sold: firebase.firestore.FieldValue.increment(item.qty) }
                : { stock: firebase.firestore.FieldValue.increment(-item.qty),
                    sold:  firebase.firestore.FieldValue.increment(item.qty) };
            batch.update(db.collection('products').doc(String(item.id)), update);
        }
        await batch.commit();
        showToast('✅ Statistiken aktualisiert', 'success');
    }

    const wasProcessed = ['Wird bearbeitet', 'Versendet', 'Zugestellt'].includes(oldStatus);
    const shouldRestoreStock = newStatus === 'Storniert'
        && oldStatus !== 'Storniert'
        && (order.stockReserved || wasProcessed);
    if (shouldRestoreStock) {
        const batch = db.batch();
        for (const item of (order.items || [])) { // BUG-15 FIX: Null-Guard
            if (item.id === MYSTERY_ID) continue;
            if (item.isBundle || String(item.id).startsWith('bundle_')) continue;
            const update = (order.stockReserved && !wasProcessed)
                ? { stock: firebase.firestore.FieldValue.increment(item.qty) }
                : { stock: firebase.firestore.FieldValue.increment(item.qty),
                    sold:  firebase.firestore.FieldValue.increment(-item.qty) };
            batch.update(db.collection('products').doc(String(item.id)), update);
        }
        await batch.commit();
        showToast('↩ Lager wiederhergestellt', 'success');
    }
    } catch(e) { throw e; } // Re-throw so quickStatus/saveOrderChanges can catch it
}
async function resetAllStatistics() {
    if (!confirm("⚠️ WIRKLICH ALLE STATISTIKEN ZURÜCKSETZEN?")) return;
    try {
        const snapshot=await db.collection("products").get();
        const batch=db.batch();
        snapshot.forEach(doc=>batch.update(doc.ref,{sold:0}));
        await batch.commit();
        showToast("✅ Alle Statistiken zurückgesetzt!","success");
        await logAction("all_statistics_reset");
        loadProducts();
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

let bundleOrder = [];

async function loadProductOrder() {
    try {
        const [prodDoc, bndDoc] = await Promise.all([
            db.collection('settings').doc('product_order').get(),
            db.collection('settings').doc('bundle_order').get()
        ]);
        productOrder = prodDoc.exists ? (prodDoc.data().order || []) : [];
        bundleOrder  = bndDoc.exists  ? (bndDoc.data().order  || []) : [];
        renderSrtCatBar();
        renderSortList();
    } catch(e) { console.error('loadProductOrder:', e); }
}

let srtCurrentCat = 'Alle';

function renderSrtCatBar() {
    const bar = document.getElementById('srt-cat-bar');
    if (!bar) return;
    // Collect unique categories from allProducts
    const cats = ['Alle', ...new Set(allProducts.map(p => p.category).filter(Boolean))];
    bar.innerHTML = cats.map(cat => {
        // BUG-20 FIX: Kategorienamen escapen — doppelte Anführungszeichen brechen das onclick-Attribut
        const safeCat = cat.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `
        <button class="srt-cat-pill ${cat === srtCurrentCat ? 'active' : ''}"
                data-cat="${cat.replace(/"/g,'&quot;')}"
                onclick="srtSetCat('${safeCat}', this)">
            ${cat === 'Alle' ? '<i class="fa-solid fa-layer-group"></i>' : `<i class="fa-solid fa-tag"></i>`}
            ${cat}
            ${cat !== 'Alle' ? `<span style="font-size:10px;opacity:.5;font-weight:400">(${allProducts.filter(p=>p.category===cat).length})</span>` : ''}
        </button>`;
    }).join('');

    // Bundles pill – always last
    const bndCount = _bundles.length;
    bar.innerHTML += `<button class="srt-cat-pill ${srtCurrentCat === 'Bundles' ? 'active' : ''}"
            data-cat="Bundles"
            onclick="srtSetCat('Bundles', this)"
            style="${srtCurrentCat === 'Bundles' ? '' : ''}border-color:rgba(167,139,250,.3);color:#a78bfa">
        <i class="fa-solid fa-boxes-stacked"></i> Bundles
        <span style="font-size:10px;opacity:.5;font-weight:400">(${bndCount})</span>
    </button>`;
}

function srtSetCat(cat, btn) {
    srtCurrentCat = cat;
    // Update active pill
    document.querySelectorAll('.srt-cat-pill').forEach(p => p.classList.remove('active'));
    if (btn) btn.classList.add('active');
    else {
        document.querySelectorAll('.srt-cat-pill').forEach(p => {
            if (p.dataset.cat === cat) p.classList.add('active');
        });
    }
    // Show/hide hint
    const hint = document.getElementById('srt-cat-hint');
    if (hint) hint.classList.toggle('hidden', cat === 'Alle');
    renderSortList();
}

function renderSortList() {
    const container = document.getElementById('sort-list');
    container.innerHTML = '';

    // ── BUNDLES BRANCH ──────────────────────────────────────────────
    if (srtCurrentCat === 'Bundles') {
        const cnt = document.getElementById('srt-count');
        if (cnt) cnt.textContent = _bundles.length + ' Bundles';

        if (!_bundles.length) {
            container.innerHTML = `<div class="srt-list-empty"><i class="fa-solid fa-box-open"></i>Keine Bundles vorhanden.</div>`;
            return;
        }

        // Sort by bundleOrder, then alphabetically for new ones
        const sorted = [..._bundles].sort((a, b) => {
            const iA = bundleOrder.indexOf(a.id), iB = bundleOrder.indexOf(b.id);
            if (iA === -1 && iB === -1) return (a.name||'').localeCompare(b.name||'');
            if (iA === -1) return 1; if (iB === -1) return -1;
            return iA - iB;
        });

        sorted.forEach((b, idx) => {
            const div = document.createElement('div');
            div.className = 'srt-item sortable-item';
            div.dataset.id = b.id;
            div.style.animationDelay = Math.min(idx, 20) * 0.018 + 's';

            const chips = [];
            if (!b.active) chips.push(`<span class="srt-chip srt-chip-off">INAKTIV</span>`);
            if (b.discountPct > 0) chips.push(`<span class="srt-chip srt-chip-new">-${Math.round(b.discountPct)}%</span>`);
            if (b.soldCount > 0)   chips.push(`<span class="srt-chip srt-chip-cat">${b.soldCount}× verkauft</span>`);

            const imgHTML = b.image
                ? `<img src="${b.image}" class="srt-img" loading="lazy">`
                : `<div class="srt-img-ph">📦</div>`;

            div.innerHTML = `
                <span class="srt-rank">${idx + 1}</span>
                ${imgHTML}
                <div class="srt-body">
                    <div class="srt-name">${b.name || '—'}</div>
                    <div class="srt-chips">${chips.join('')}</div>
                </div>
                <div class="srt-stock" style="color:var(--srt-purple)">${(b.bundlePrice||0).toFixed(2)} €</div>
                <i class="fa-solid fa-grip-lines srt-handle"></i>`;

            container.appendChild(div);
        });

        if (sortableInstance) sortableInstance.destroy();
        sortableInstance = new Sortable(container, {
            animation: 160,
            ghostClass: 'sortable-ghost',
            forceFallback: true,
            onEnd: () => {
                Array.from(container.children).forEach((el, i) => {
                    const r = el.querySelector('.srt-rank');
                    if (r) r.textContent = i + 1;
                });
            }
        });
        return;
    }

    // ── PRODUCTS + BUNDLES gemeinsam ────────────────────────────────
    const sourceProducts = srtCurrentCat === 'Alle'
        ? allProducts
        : allProducts.filter(p => p.category === srtCurrentCat);

    const sourceBundles = srtCurrentCat === 'Alle' ? _bundles : [];

    // Alle Items nach productOrder sortieren (enthält Produkt- und Bundle-IDs)
    const combined = [
        ...sourceProducts.map(p => ({ item: p, type: 'product' })),
        ...sourceBundles.map(b => ({ item: b, type: 'bundle' }))
    ].sort((a, b) => {
        const orderA = productOrder.indexOf(a.item.id);
        const orderB = productOrder.indexOf(b.item.id);
        if (orderA !== -1 && orderB !== -1) return orderA - orderB;
        if (orderA !== -1) return -1;
        if (orderB !== -1) return 1;
        return (a.item.name||'').localeCompare(b.item.name||'');
    });

    // Update count
    const cnt = document.getElementById('srt-count');
    if (cnt) cnt.textContent = srtCurrentCat === 'Alle'
        ? `${sourceProducts.length} Produkte${sourceBundles.length ? ` + ${sourceBundles.length} Bundles` : ''}`
        : `${sourceProducts.length} in „${srtCurrentCat}"`;

    if (!combined.length) {
        container.innerHTML = `<div class="srt-list-empty"><i class="fa-solid fa-box-open"></i>Keine Einträge.</div>`;
        return;
    }

    combined.forEach(({ item, type }, idx) => {
        const div = document.createElement('div');
        div.className = 'srt-item sortable-item';
        div.dataset.id = item.id;
        div.dataset.type = type;
        div.style.animationDelay = Math.min(idx, 20) * 0.018 + 's';

        const chips = [];
        const imgHTML = item.image
            ? `<img src="${item.image}" class="srt-img" loading="lazy">`
            : `<div class="srt-img-ph">📦</div>`;

        let rightCol = '';

        if (type === 'bundle') {
            if (!item.active)        chips.push(`<span class="srt-chip srt-chip-off">INAKTIV</span>`);
            if (item.discountPct > 0) chips.push(`<span class="srt-chip srt-chip-new">-${Math.round(item.discountPct)}%</span>`);
            if (item.soldCount > 0)   chips.push(`<span class="srt-chip srt-chip-cat">${item.soldCount}× verkauft</span>`);
            chips.push(`<span class="srt-chip" style="background:rgba(167,139,250,.12);color:#a78bfa;border-color:rgba(167,139,250,.3)">Bundle</span>`);
            rightCol = `<div class="srt-stock" style="color:var(--srt-purple)">${(item.bundlePrice||0).toFixed(2)} €</div>`;
        } else {
            const stock = item.stock || 0;
            const isCrit = stock <= stockCriticalThreshold;
            const isWarn = !isCrit && stock <= stockWarningThreshold;
            const stockColor = isCrit ? 'var(--srt-red)' : isWarn ? 'var(--srt-amber)' : 'rgba(255,255,255,.3)';
            if (item.isNew)             chips.push(`<span class="srt-chip srt-chip-new" onclick="toggleIsNew('${item.id}',event)" title="Klick zum Deaktivieren">NEW</span>`);
            if (item.available===false) chips.push(`<span class="srt-chip srt-chip-off" onclick="toggleAvailableInSort('${item.id}',event)" title="Klick zum Aktivieren">NICHT VERFÜGBAR</span>`);
            if (isCrit)                 chips.push(`<span class="srt-chip srt-chip-crit">⚠ KRITISCH</span>`);
            else if (isWarn)            chips.push(`<span class="srt-chip srt-chip-warn">⚠ NIEDRIG</span>`);
            if (item.category)          chips.push(`<span class="srt-chip srt-chip-cat">${item.category.length>22?item.category.slice(0,20)+'…':item.category}</span>`);
            rightCol = `<div class="srt-stock" style="color:${stockColor}">${stock} Stk.</div>`;
        }

        div.innerHTML = `
            <span class="srt-rank">${idx+1}</span>
            ${imgHTML}
            <div class="srt-body">
                <div class="srt-name">${item.name||'—'}</div>
                <div class="srt-chips">${chips.join('')}</div>
            </div>
            ${rightCol}
            <i class="fa-solid fa-grip-lines srt-handle"></i>`;

        container.appendChild(div);
    });

    if (sortableInstance) sortableInstance.destroy();
    sortableInstance = new Sortable(container, {
        animation: 160,
        ghostClass: 'sortable-ghost',
        forceFallback: true,
        onEnd: () => {
            // update rank numbers live
            Array.from(container.children).forEach((el, i) => {
                const r = el.querySelector('.srt-rank');
                if (r) r.textContent = i + 1;
            });
        }
    });
}
async function toggleIsNew(id,e){
    e.stopImmediatePropagation();
    try {
        const doc=await db.collection('products').doc(id).get();
        const newVal=!(doc.data().isNew||false);
        await db.collection('products').doc(id).update({isNew:newVal});
        showToast(`NEW-Status → ${newVal?'aktiv':'deaktiviert'}`);
        renderSortList();
    } catch(e2) { showToast('❌ Fehler: ' + e2.message, 'error'); }
}
async function toggleAvailableInSort(id, e) {
    e.stopImmediatePropagation();
    try {
        const doc = await db.collection('products').doc(id).get();
        const cur = doc.data().available !== false;
        const update = cur ? { available: false, stock: 0 } : { available: true };
        await db.collection('products').doc(id).update(update);
        showToast(cur ? '⏸ Deaktiviert – Lagerbestand auf 0 gesetzt' : '✅ Produkt aktiviert');
        renderSortList();
    } catch(e2) { showToast('❌ Fehler: ' + e2.message, 'error'); }
}
// BUG-011 FIX: Formatiert — war komplett auf einer Zeile, nicht debuggbar
function autoSort(mode) {
    const container = document.getElementById('sort-list');
    let items = Array.from(container.children).filter(i => i.dataset.id);
    items.sort((a, b) => {
        const pA = allProducts.find(p => p.id === a.dataset.id);
        const pB = allProducts.find(p => p.id === b.dataset.id);
        if (!pA || !pB) return 0;
        switch (mode) {
            case 'alpha':     return pA.name.localeCompare(pB.name);
            case 'new':       return (pB.isNew ? 1 : 0) - (pA.isNew ? 1 : 0);
            case 'tornado':   return ((pA.category === "WaveVapes Tornado 30000") ? 0 : 1)
                                   - ((pB.category === "WaveVapes Tornado 30000") ? 0 : 1);
            case 'available': return ((pB.available !== false) ? 0 : 1)
                                   - ((pA.available !== false) ? 0 : 1);
            case 'stock':     return (pB.stock || 0) - (pA.stock || 0);
            default:          return 0;
        }
    });
    items.forEach(item => container.appendChild(item));
    showToast('✅ Liste sortiert!', 'success');
}
function autoSortPriority(){
    const container=document.getElementById('sort-list');
    let items=Array.from(container.children).filter(i=>i.dataset.id);
    items.sort((a,b)=>{
        const isBundle_A = a.dataset.type === 'bundle';
        const isBundle_B = b.dataset.type === 'bundle';
        const pA = isBundle_A ? _bundles.find(bnd=>bnd.id===a.dataset.id) : allProducts.find(p=>p.id===a.dataset.id);
        const pB = isBundle_B ? _bundles.find(bnd=>bnd.id===b.dataset.id) : allProducts.find(p=>p.id===b.dataset.id);
        const getPriority = (item, isBundle) => {
            if (isBundle) return item?.active === false ? 4 : 2;
            if (!item) return 3;
            if (item.available===false||(item.stock||0)<=0) return 5;
            if (item.isNew===true) return 1;
            return 3;
        };
        const prioA=getPriority(pA,isBundle_A), prioB=getPriority(pB,isBundle_B);
        if(prioA!==prioB) return prioA-prioB;
        return (pA?.name||'').localeCompare(pB?.name||'');
    });
    items.forEach(item=>container.appendChild(item));
    Array.from(container.children).filter(i=>i.dataset.id).forEach((el,i)=>{
        const r=el.querySelector('.srt-rank'); if(r) r.textContent=i+1;
    });
    showToast('✅ Auto-Priorität angewendet!','success');
}
async function saveProductOrder() {
    const btn = document.querySelector('.srt-save-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Speichert…'; }
    try {
        // Alle sichtbaren Items in der aktuellen Reihenfolge
        const visibleItems = Array.from(document.querySelectorAll('#sort-list .sortable-item')).map(i => i.dataset.id);

        // ── Bundles-only Tab ────────────────────────────────────────────
        if (srtCurrentCat === 'Bundles') {
            bundleOrder = visibleItems;
            await db.collection('settings').doc('bundle_order').set({ order: visibleItems });
            showToast('✅ Bundle-Sortierung gespeichert!', 'success');
            await logAction('bundle_order_saved', '', { count: visibleItems.length });
            return;
        }

        // ── Alle-Ansicht ────────────────────────────────────────────────
        // visibleItems enthält Produkt- UND Bundle-IDs in der gewünschten Reihenfolge.
        // Bundle-IDs im Array schaden dem Shop nicht – er rendert nur, was in allProducts ist.
        // Bundle-IDs werden beim Sortieren schlicht ignoriert (indexOf gibt -1 zurück für
        // alles, was nicht in allProducts ist → fällt auf getSortPriority-Fallback).
        if (srtCurrentCat === 'Alle') {
            await db.collection('settings').doc('product_order').set({ order: visibleItems });
            productOrder = visibleItems;
            // Auch bundle_order separat aktualisieren
            const bundleIds = visibleItems.filter(id => _bundles.some(b => b.id === id));
            if (bundleIds.length) {
                bundleOrder = bundleIds;
                await db.collection('settings').doc('bundle_order').set({ order: bundleIds });
            }
            showToast('✅ Sortierung gespeichert & live!', 'success');
            await logAction('product_order_saved', '', { category: 'Alle', count: visibleItems.length });
            return;
        }

        // ── Kategorie-Ansicht ───────────────────────────────────────────
        // Reihenfolge dieser Kategorie in die globale Reihenfolge einmergen
        const catSlots = productOrder
            .map((id, idx) => ({ id, idx }))
            .filter(({ id }) => allProducts.find(p => p.id === id && p.category === srtCurrentCat))
            .map(({ idx }) => idx)
            .sort((a, b) => a - b);

        const withoutCat = productOrder.filter(id => {
            const p = allProducts.find(p => p.id === id);
            return !p || p.category !== srtCurrentCat;
        });

        let result = [...withoutCat];
        visibleItems.forEach((id, i) => {
            const pos = catSlots[i] !== undefined ? catSlots[i] : result.length + i;
            result.splice(Math.min(pos, result.length), 0, id);
        });
        allProducts.forEach(p => { if (!result.includes(p.id)) result.push(p.id); });

        await db.collection('settings').doc('product_order').set({ order: result });
        productOrder = result;
        showToast('✅ Sortierung gespeichert & live!', 'success');
        await logAction('product_order_saved', '', { category: srtCurrentCat });

    } catch(e) {
        showToast('❌ Fehler: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> SORTIERUNG SPEICHERN &amp; LIVE ÜBERNEHMEN'; }
    }
}

// escA oben global deklariert (nach Firebase-Init)

function showToast(msg, type='success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    const bg = type === 'error' ? 'bg-red-600' : type === 'warning' ? 'bg-amber-600' : 'bg-emerald-600';
    const icon = type === 'error' ? 'fa-xmark' : type === 'warning' ? 'fa-triangle-exclamation' : 'fa-check';
    toast.className = `toast flex items-center gap-3 px-8 py-4 rounded-3xl shadow-2xl text-sm font-medium ${bg}`;
    // BUG FIX: Use createTextNode for msg to prevent XSS when e.message from Firestore
    // errors is passed directly into showToast (e.g. showToast('Fehler: ' + e.message))
    const iconEl = document.createElement('i');
    iconEl.className = `fa-solid ${icon}`;
    toast.appendChild(iconEl);
    toast.appendChild(document.createTextNode(' ' + msg));
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

// Rich order notification toast — auffälliger als normaler Toast
function showOrderToast(title, detail, onClickFn) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    // BUG FIX: Escape title/detail before innerHTML — values from Firestore are customer-controlled
    const escHtml = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const safeTitle  = escHtml(title);
    const safeDetail = escHtml(detail);

    const toast = document.createElement('div');
    toast.style.cssText = [
        'background:linear-gradient(135deg,#0f1f12,#0d1a0f)',
        'border:1.5px solid rgba(52,211,153,0.5)',
        'border-radius:20px',
        'padding:16px 20px',
        'min-width:320px',
        'max-width:400px',
        'box-shadow:0 8px 40px rgba(52,211,153,0.2),0 2px 12px rgba(0,0,0,0.6)',
        'display:flex',
        'flex-direction:column',
        'gap:10px',
        'cursor:pointer',
        'animation:orderToastIn .35s cubic-bezier(0.34,1.56,0.64,1)',
        'position:relative',
        'overflow:hidden',
    ].join(';');

    toast.innerHTML = `
        <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#34d399,#67e8f9)"></div>
        <div style="display:flex;align-items:center;gap:10px">
            <div style="width:36px;height:36px;border-radius:12px;background:rgba(52,211,153,0.15);border:1px solid rgba(52,211,153,0.3);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <i class="fa-solid fa-receipt" style="color:#34d399;font-size:15px"></i>
            </div>
            <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:700;color:#34d399;margin-bottom:1px">🛒 Neue Bestellung!</div>
                <div style="font-size:12px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${safeTitle}</div>
            </div>
            <button onclick="this.closest('[data-order-toast]').remove();event.stopPropagation()" style="background:none;border:none;color:rgba(255,255,255,0.3);font-size:18px;cursor:pointer;padding:0;line-height:1;flex-shrink:0">✕</button>
        </div>
        ${safeDetail ? `<div style="font-size:11px;color:rgba(255,255,255,0.5);padding-left:46px">${safeDetail}</div>` : ''}
        <div style="padding-left:46px">
            <button style="background:rgba(52,211,153,0.15);border:1px solid rgba(52,211,153,0.35);color:#34d399;border-radius:10px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;transition:background .15s"
                    onmouseenter="this.style.background='rgba(52,211,153,0.28)'"
                    onmouseleave="this.style.background='rgba(52,211,153,0.15)'"
                    onclick="event.stopPropagation()">
                <i class="fa-solid fa-arrow-up-right-from-square" style="margin-right:5px"></i>Bestellung öffnen
            </button>
        </div>
    `;
    toast.setAttribute('data-order-toast', '1');

    // Click anywhere on toast (except ✕) → open order
    toast.addEventListener('click', () => {
        if (onClickFn) onClickFn();
        toast.remove();
    });
    // Click "Bestellung öffnen" button → same
    const openBtn = toast.querySelector('button:last-of-type');
    if (openBtn) openBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onClickFn) onClickFn();
        toast.remove();
    });

    container.appendChild(toast);

    // Auto-dismiss after 8 seconds (longer than normal toasts)
    const timer = setTimeout(() => {
        toast.style.animation = 'orderToastOut .3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 8000);

    // Cancel auto-dismiss on hover
    toast.addEventListener('mouseenter', () => clearTimeout(timer));
}

async function logout(){try{await auth.signOut();showToast("👋 Ausgeloggt","success");setTimeout(()=>{window.location.href="index.html";},800);}catch(e){showToast("Logout fehlgeschlagen: "+e.message,"error");}}

// ═══════════════════════════════════════════════════════════════════
//   ERWEITERTE BENUTZERVERWALTUNG v3 – Vollständige Implementierung
// ═══════════════════════════════════════════════════════════════════
let euAllUsers      = [];
let euFiltered      = [];
let euSelectedIds   = new Set();
let euCurrentUid    = null;
let euPage          = 0;
const EU_PAGE_SIZE  = 15;
let euSortCol       = 'email';
let euSortDir       = 'asc';

// K-NEW-02 FIX: Track both listeners so repeated tab-switches don't stack them
let _euOrdersUnsub = null;
let _euUsersUnsub  = null;

async function loadExtendedUsers() {
    // Tear down previous listeners before creating new ones
    if (_euOrdersUnsub) { _euOrdersUnsub(); _euOrdersUnsub = null; }
    if (_euUsersUnsub)  { _euUsersUnsub();  _euUsersUnsub  = null; }

    let _orderStatsCache = new Map(); // uid → { orderCount, totalSpent }

    async function buildOrderCache() {
        try {
            const snap = await db.collection('orders').get();
            _orderStatsCache = new Map();
            snap.forEach(doc => {
                const o = doc.data();
                if (!o.userId) return;
                const cur = _orderStatsCache.get(o.userId) || { orderCount: 0, totalSpent: 0 };
                cur.orderCount++;
                cur.totalSpent += o.total || 0;
                _orderStatsCache.set(o.userId, cur);
            });
        } catch(e) { console.warn('loadExtendedUsers: order cache failed', e); }
    }

    function applyStats(docs) {
        euAllUsers = docs.map(doc => {
            const stats = _orderStatsCache.get(doc.id) || { orderCount: 0, totalSpent: 0 };
            return { id: doc.id, ...doc.data(), ...stats };
        });
        euUpdateKPIs(); euFilter();
    }

    await buildOrderCache();

    let _latestUserDocs = [];
    _euOrdersUnsub = db.collection('orders').onSnapshot(async () => {
        await buildOrderCache();
        if (_latestUserDocs.length) applyStats(_latestUserDocs);
    }, err => console.warn('loadExtendedUsers orders listener:', err));

    _euUsersUnsub = db.collection('users').onSnapshot(snap => {
        _latestUserDocs = snap.docs;
        applyStats(snap.docs);
    });
}

function euUpdateKPIs() {
    const total    = euAllUsers.length;
    const active   = euAllUsers.filter(u=>!u.disabled).length;
    const disabled = euAllUsers.filter(u=>u.disabled).length;
    const admins   = euAllUsers.filter(u=>u.role==='admin').length;
    const totalPts = euAllUsers.reduce((s,u)=>s+(u.totalBonusPoints||0),0);
    const avgPts   = total ? Math.round(totalPts/total) : 0;
    const totalRef = euAllUsers.reduce((s,u)=>s+(u.referralCount||0),0);
    const avgRef   = total ? (totalRef/total).toFixed(1) : '0';
    document.getElementById('eu-kpi-total').textContent     = total;
    document.getElementById('eu-kpi-total-sub').textContent = `${admins} Admin${admins!==1?'s':''}`;
    document.getElementById('eu-kpi-active').textContent    = active;
    document.getElementById('eu-kpi-active-sub').textContent= `${total?Math.round(active/total*100):0}% aktiv`;
    document.getElementById('eu-kpi-disabled').textContent  = disabled;
    document.getElementById('eu-kpi-avgpts').textContent    = avgPts.toLocaleString('de-DE');
    document.getElementById('eu-kpi-admins').textContent    = admins;
    document.getElementById('eu-kpi-avgrefs').textContent   = avgRef;
}

function euFilter() {
    const q      = (document.getElementById('eu-search')?.value||'').toLowerCase().trim();
    const status = document.getElementById('eu-filter-status')?.value||'';
    const sort   = document.getElementById('eu-filter-sort')?.value||'email';
    euFiltered = euAllUsers.filter(u=>{
        if(q && ![(u.email||''),(u.username||''),(u.referralCode||'')].some(v=>v.toLowerCase().includes(q))) return false;
        if(status==='active'   && u.disabled)                return false;
        if(status==='disabled' && !u.disabled)               return false;
        if(status==='admin'    && u.role!=='admin')           return false;
        if(status==='vip'      && (u.totalBonusPoints||0)<1000) return false;
        if(status==='freeship' && !u.freeShipping)           return false;
        return true;
    });
    euFiltered.sort((a,b)=>{
        switch(sort){
            case 'points_desc': return (b.totalBonusPoints||0)-(a.totalBonusPoints||0);
            case 'refs_desc':   return (b.referralCount||0)-(a.referralCount||0);
            case 'orders_desc': return (b.orderCount||0)-(a.orderCount||0);
            case 'spent_desc':  return (b.totalSpent||0)-(a.totalSpent||0);
            default: { const va=a.email||'',vb=b.email||''; return euSortDir==='asc'?va.localeCompare(vb):vb.localeCompare(va); }
        }
    });
    euPage=0; euRenderTable();
    const bcCount=document.getElementById('eu-bc-count'); if(bcCount) bcCount.textContent=euFiltered.length;
}

function euSortBy(col){ if(euSortCol===col)euSortDir=euSortDir==='asc'?'desc':'asc'; else{euSortCol=col;euSortDir='asc';} euFilter(); }

const EU_AV_COLORS=[
    ['rgba(103,232,249,.18)','#67e8f9'],['rgba(167,139,250,.18)','#a78bfa'],
    ['rgba(52,211,153,.18)','#34d399'],['rgba(251,191,36,.18)','#fbbf24'],
    ['rgba(244,114,182,.18)','#f472b6']
];
function euAvColor(email=''){let h=0;for(let c of email)h=(h*31+c.charCodeAt(0))&0xfff;return EU_AV_COLORS[h%EU_AV_COLORS.length];}

function euRenderTable() {
    const tbody=document.getElementById('eu-tbody');
    if(!euFiltered.length){tbody.innerHTML=`<tr><td colspan="10"><div class="eu-empty"><i class="fa-solid fa-users-slash"></i>Keine Benutzer gefunden</div></td></tr>`;document.getElementById('eu-page-info').textContent='Keine Einträge';document.getElementById('eu-page-btns').innerHTML='';return;}
    const maxPts=Math.max(...euFiltered.map(u=>u.totalBonusPoints||0),1);
    const start=euPage*EU_PAGE_SIZE; const page=euFiltered.slice(start,start+EU_PAGE_SIZE);
    let html='';
    page.forEach(u=>{
        const initials=((u.username||u.email||'?').slice(0,2)).toUpperCase();
        const [avBg,avColor]=euAvColor(u.email||'');
        const disabled=!!u.disabled; const isAdmin=u.role==='admin'; const isVip=u.vip===true||(u.totalBonusPoints||0)>=1000;
        const pts=u.totalBonusPoints||0; const pct=Math.round(pts/maxPts*100); const spent=(u.totalSpent||0).toFixed(2);
        const checked=euSelectedIds.has(u.id)?'checked':'';
        const badges=[
            isAdmin?`<span class="eu-badge eu-badge-admin">Admin</span>`:'',
            isVip?`<span class="eu-badge eu-badge-vip">VIP</span>`:'',
            u.freeShipping?`<span class="eu-badge" style="background:rgba(52,211,153,.1);color:#34d399;font-size:9px">Gratis</span>`:''
        ].join('');
        html+=`<tr class="${disabled?'eu-row-disabled':''}" id="eu-row-${u.id}">
            <td style="text-align:center"><input type="checkbox" ${checked} data-id="${u.id}" onchange="euToggleSel(this)" class="accent-cyan-400 w-4 h-4"></td>
            <td><div style="display:flex;align-items:center;gap:9px"><div class="eu-avatar" style="background:${avBg};color:${avColor}">${initials}</div><div><div style="font-weight:600;font-size:13px">${u.email||'—'}</div><div style="font-size:10px;color:var(--eu-muted);margin-top:1px">${u.username||'kein Username'} ${badges}</div></div></div></td>
            <td><span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--eu-cyan);background:rgba(103,232,249,.08);padding:2px 8px;border-radius:6px">${u.referralCode||'—'}</span></td>
            <td style="text-align:center"><div style="font-weight:700;font-size:12px;color:var(--eu-amber);font-family:'JetBrains Mono',monospace">${pts.toLocaleString('de-DE')}</div><div class="eu-bar-wrap"><div class="eu-bar" style="width:${pct}%"></div></div></td>
            <td style="text-align:center;font-weight:600;color:var(--eu-pink)">${u.referralCount||0}</td>
            <td style="text-align:center;font-weight:600;color:var(--eu-purple)">${u.orderCount}</td>
            <td style="text-align:right;font-weight:700;color:var(--eu-green);font-family:'JetBrains Mono',monospace">${spent} €</td>
            <td style="text-align:center"><span class="eu-badge ${disabled?'eu-badge-blocked':'eu-badge-active'}">${disabled?'GESPERRT':'AKTIV'}</span></td>
            <td style="text-align:center;font-size:15px">${isAdmin?'👑':''}${isVip?'⭐':''}${u.freeShipping?'🚚':''}</td>
            <td style="text-align:center"><button onclick="euOpenDrawer('${u.id}')" style="background:rgba(103,232,249,.09);border:1px solid rgba(103,232,249,.18);border-radius:9px;width:30px;height:30px;color:var(--eu-cyan);cursor:pointer;font-size:12px;display:inline-flex;align-items:center;justify-content:center;transition:all .2s" onmouseover="this.style.background='rgba(103,232,249,.2)'" onmouseout="this.style.background='rgba(103,232,249,.09)'" title="Bearbeiten"><i class="fa-solid fa-pen-to-square"></i></button></td>
        </tr>`;
    });
    tbody.innerHTML=html;
    const totalPages=Math.ceil(euFiltered.length/EU_PAGE_SIZE);
    document.getElementById('eu-page-info').textContent=`${start+1}–${Math.min(start+EU_PAGE_SIZE,euFiltered.length)} von ${euFiltered.length} Benutzern`;
    let pHTML='';
    for(let p=0;p<totalPages;p++){
        if(totalPages>7&&p!==0&&p!==totalPages-1&&Math.abs(p-euPage)>2){if(p===1||p===totalPages-2)pHTML+='<button class="eu-page-btn" disabled style="border:none;background:none;color:var(--eu-muted)">…</button>';continue;}
        pHTML+=`<button class="eu-page-btn${p===euPage?' active':''}" onclick="euGoPage(${p})">${p+1}</button>`;
    }
    document.getElementById('eu-page-btns').innerHTML=pHTML;
}
function euGoPage(p){euPage=p;euRenderTable();}

function euToggleSel(cb){cb.checked?euSelectedIds.add(cb.dataset.id):euSelectedIds.delete(cb.dataset.id);euUpdateBulk();}
function euToggleSelectAll(cb){const start=euPage*EU_PAGE_SIZE;euFiltered.slice(start,start+EU_PAGE_SIZE).forEach(u=>cb.checked?euSelectedIds.add(u.id):euSelectedIds.delete(u.id));euUpdateBulk();euRenderTable();if(cb.checked)document.getElementById('eu-select-all').checked=true;}
function euClearSelection(){euSelectedIds.clear();euUpdateBulk();euRenderTable();const sa=document.getElementById('eu-select-all');if(sa)sa.checked=false;}
function euUpdateBulk(){const bar=document.getElementById('eu-bulk-bar');const n=euSelectedIds.size;if(n>0){bar.classList.add('visible');document.getElementById('eu-bulk-label').textContent=`${n} ausgewählt`;}else bar.classList.remove('visible');}

async function euOpenDrawer(uid){
    euCurrentUid=uid; const u=euAllUsers.find(x=>x.id===uid); if(!u)return;
    const [avBg,avColor]=euAvColor(u.email||''); const initials=((u.username||u.email||'?').slice(0,2)).toUpperCase();
    const av=document.getElementById('eu-d-avatar'); av.textContent=initials; av.style.background=avBg; av.style.color=avColor; av.style.width='44px'; av.style.height='44px'; av.style.fontSize='15px';
    document.getElementById('eu-d-name').textContent      = u.username||u.email||'Unbekannt';
    document.getElementById('eu-d-email-lbl').textContent = u.email||'—';
    document.getElementById('eu-d-pts-kpi').textContent   = (u.totalBonusPoints||0).toLocaleString('de-DE');
    document.getElementById('eu-d-ord-kpi').textContent   = u.orderCount||0;
    document.getElementById('eu-d-spent-kpi').textContent = (u.totalSpent||0).toFixed(2)+' €';
    document.getElementById('eu-d-username').value  = u.username||'';
    document.getElementById('eu-d-refcode').value   = u.referralCode||'';
    document.getElementById('eu-d-pts').value       = u.totalBonusPoints||0;
    document.getElementById('eu-d-created').value   = u.createdAt?u.createdAt.toDate().toLocaleDateString('de-DE'):'—';
    document.getElementById('eu-d-notes').value     = u.internalNotes||'';
    document.getElementById('eu-d-active').checked  = !u.disabled;
    document.getElementById('eu-d-freeship').checked= !!u.freeShipping;
    document.getElementById('eu-d-admin').checked   = u.role==='admin';
    document.getElementById('eu-d-vip').checked     = !!u.vip;
    // update lock row UI
    euDrawerUpdateLockRow(!!u.disabled);
    const ol=document.getElementById('eu-d-orders-list');
    ol.innerHTML='<div style="text-align:center;padding:14px;color:var(--eu-muted)"><span class="eu-spinner"></span></div>';
    db.collection('orders').where('userId','==',uid).orderBy('date','desc').limit(5).get()
      .then(snap=>{
          if(snap.empty){ol.innerHTML=`<div class="eu-empty" style="padding:14px;font-size:12px">Noch keine Bestellungen</div>`;return;}
          let h='';snap.forEach(doc=>{const o=doc.data();const date=o.date?o.date.toDate().toLocaleDateString('de-DE'):'—';const sc=o.status==='Zugestellt'?'var(--eu-green)':o.status==='Storniert'?'var(--eu-red)':'var(--eu-amber)'; /* sc: hardcoded CSS-var — sicher */h+=`<div class="eu-order-item"><span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--eu-cyan)">#${escA(String(o.orderNumber||'—'))}</span><span style="color:var(--eu-muted)">${date}</span><span style="font-weight:700;color:var(--eu-green)">${(o.total||0).toFixed(2)} €</span><span style="color:${sc}">${escA(String(o.status||'—'))}</span></div>`;});ol.innerHTML=h;
      }).catch(()=>{ol.innerHTML='<div style="color:var(--eu-red);font-size:12px;padding:8px">Fehler beim Laden</div>';});
    document.getElementById('eu-drawer').classList.add('open');
    document.getElementById('eu-overlay').classList.add('open');
    document.getElementById('eu-drawer').scrollTop = 0;
}
function euCloseDrawer(){document.getElementById('eu-drawer').classList.remove('open');document.getElementById('eu-overlay').classList.remove('open');euCurrentUid=null;}

function euDrawerUpdateLockRow(isDisabled) {
    const row   = document.getElementById('eu-d-lock-row');
    const label = document.getElementById('eu-d-lock-label');
    const sub   = document.getElementById('eu-d-lock-sub');
    const btn   = document.getElementById('eu-d-lock-btn');
    const cb    = document.getElementById('eu-d-active');
    if (!row) return;
    if (isDisabled) {
        row.style.borderColor  = 'rgba(248,113,113,.22)';
        row.style.background   = 'rgba(248,113,113,.06)';
        label.style.color      = 'var(--eu-red)';
        label.textContent      = 'Account gesperrt';
        sub.textContent        = 'Login blockiert · IPs wurden gebannt';
        btn.style.borderColor  = 'rgba(248,113,113,.35)';
        btn.style.background   = 'rgba(248,113,113,.12)';
        btn.style.color        = 'var(--eu-red)';
        btn.innerHTML          = '<i class="fa-solid fa-unlock"></i> Entsperren';
        if (cb) cb.checked = false; // disabled = not active
    } else {
        row.style.borderColor  = 'rgba(52,211,153,.18)';
        row.style.background   = 'rgba(52,211,153,.04)';
        label.style.color      = 'var(--eu-green)';
        label.textContent      = 'Account aktiv';
        sub.textContent        = 'Login erlaubt';
        btn.style.borderColor  = 'rgba(248,113,113,.3)';
        btn.style.background   = 'rgba(248,113,113,.08)';
        btn.style.color        = 'var(--eu-red)';
        btn.innerHTML          = '<i class="fa-solid fa-lock"></i> Sperren + IP bannen';
        if (cb) cb.checked = true; // active = not disabled
    }
}

async function euDrawerToggleLock() {
    if (!euCurrentUid) return;
    const u         = euAllUsers.find(x => x.id === euCurrentUid);
    const isNowLocked = !u?.disabled;
    const email     = u?.email || euCurrentUid;
    try {
        if (isNowLocked) {
            if (!confirm(`Account von ${email} SPERREN?\n\nBekannte IPs werden automatisch gebannt.`)) return;
            const { ipsBanned } = await banUserWithIPs(euCurrentUid, email, 'Gesperrt via Erw. Benutzerverwaltung');
            const idx = euAllUsers.findIndex(x => x.id === euCurrentUid);
            if (idx !== -1) euAllUsers[idx].disabled = true;
            euDrawerUpdateLockRow(true);
            const msg = ipsBanned > 0
                ? `🔒 Gesperrt + ${ipsBanned} IP${ipsBanned !== 1 ? 's' : ''} gebannt`
                : '🔒 Gesperrt (keine bekannte IP gefunden)';
            showToast(msg);
            if (ipsBanned > 0) pushNotification('warning',
                `User gesperrt + ${ipsBanned} IP${ipsBanned !== 1 ? 's' : ''} gebannt`,
                email, () => switchTab(6));
        } else {
            if (!confirm(`Account von ${email} entsperren?`)) return;
            await db.collection('users').doc(euCurrentUid).update({ disabled: false });
            await logAction('user_enabled', euCurrentUid);
            const idx = euAllUsers.findIndex(x => x.id === euCurrentUid);
            if (idx !== -1) euAllUsers[idx].disabled = false;
            euDrawerUpdateLockRow(false);
            showToast('✅ Account entsperrt');
        }
        euRenderTable();
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

async function euSaveDrawer(){
    if(!euCurrentUid)return;
    const wasActive = euAllUsers.find(x=>x.id===euCurrentUid)?.disabled === false;
    const nowDisabled = !document.getElementById('eu-d-active').checked;
    const data={
        username:         document.getElementById('eu-d-username').value.trim(),
        referralCode:     document.getElementById('eu-d-refcode').value.trim(),
        totalBonusPoints: parseInt(document.getElementById('eu-d-pts').value, 10)||0,
        disabled:        nowDisabled,
        freeShipping:     document.getElementById('eu-d-freeship').checked,
        vip:              document.getElementById('eu-d-vip').checked,
        internalNotes:    document.getElementById('eu-d-notes').value.trim()||firebase.firestore.FieldValue.delete()
    };
    const isAdmin=document.getElementById('eu-d-admin').checked;
    data.role=isAdmin?'admin':firebase.firestore.FieldValue.delete();
    try {
        if (nowDisabled && wasActive) {
            const u = euAllUsers.find(x=>x.id===euCurrentUid);
            const email = u?.email || euCurrentUid;
            await db.collection('users').doc(euCurrentUid).update(data);
            const { ipsBanned } = await banUserWithIPs(euCurrentUid, email, 'Gesperrt via Erw. Benutzerverwaltung', true);
            await logAction('extended_user_updated', euCurrentUid, {username:data.username,isAdmin,ipsBanned});
            const msg = ipsBanned > 0
                ? `✅ Gespeichert + ${ipsBanned} IP${ipsBanned!==1?'s':''} gebannt`
                : '✅ Benutzer gespeichert (gesperrt, keine neue IP)';
            showToast(msg,'success');
        } else {
            await db.collection('users').doc(euCurrentUid).update(data);
            await logAction('extended_user_updated',euCurrentUid,{username:data.username,isAdmin});
            showToast('✅ Benutzer gespeichert!','success');
        }
        euCloseDrawer();
    } catch(e) { showToast('❌ Speichern fehlgeschlagen: ' + e.message, 'error'); }
}

let _bcMode = 'all';         // 'all' | 'select'
let _bcSelected = new Set(); // UIDs der ausgewählten Nutzer
let _bcListFiltered = [];    // aktuell angezeigte Nutzer in der Liste

function euOpenBroadcast() {
    _bcMode = 'all';
    _bcSelected = new Set();
    _bcListFiltered = [];
    document.getElementById('eu-bc-subject').value = '';
    document.getElementById('eu-bc-body').value = '';
    document.getElementById('bc-search').value = '';
    bcSetMode('all');
    document.getElementById('eu-bc-modal').style.cssText = 'display:flex';
}

function euCloseBroadcast() {
    document.getElementById('eu-bc-modal').style.display = 'none';
}

function bcSetMode(mode) {
    _bcMode = mode;
    const allBtn    = document.getElementById('bc-mode-all');
    const selBtn    = document.getElementById('bc-mode-select');
    const allInfo   = document.getElementById('bc-all-info');
    const selPanel  = document.getElementById('bc-select-panel');

    if (mode === 'all') {
        allBtn.style.cssText = 'flex:1;padding:10px;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid rgba(103,232,249,.5);background:rgba(103,232,249,.12);color:#67e8f9;transition:all .15s';
        selBtn.style.cssText = 'flex:1;padding:10px;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:rgba(255,255,255,.5);transition:all .15s';
        allInfo.style.display = 'block';
        selPanel.style.display = 'none';
        const count = euAllUsers.filter(u => u.email && !u.disabled).length;
        document.getElementById('eu-bc-count').textContent = count + ' Nutzern';
        document.getElementById('bc-send-label').textContent = `An ${count} senden`;
    } else {
        selBtn.style.cssText = 'flex:1;padding:10px;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid rgba(250,191,36,.5);background:rgba(250,191,36,.12);color:#fbbf24;transition:all .15s';
        allBtn.style.cssText = 'flex:1;padding:10px;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:rgba(255,255,255,.5);transition:all .15s';
        allInfo.style.display = 'none';
        selPanel.style.display = 'block';
        bcRenderList();
    }
}

function bcRenderList() {
    const query = (document.getElementById('bc-search')?.value || '').toLowerCase();
    _bcListFiltered = euAllUsers.filter(u =>
        u.email && !u.disabled &&
        (!query || u.email.toLowerCase().includes(query) || (u.username||'').toLowerCase().includes(query))
    );
    const container = document.getElementById('bc-user-list');
    if (!_bcListFiltered.length) {
        container.innerHTML = `<div style="text-align:center;padding:16px;font-size:12px;color:rgba(255,255,255,.3)">Keine Nutzer gefunden</div>`;
        return;
    }
    container.innerHTML = _bcListFiltered.map(u => {
        const checked = _bcSelected.has(u.id);
        const initials = ((u.username || u.email || '?').slice(0,2)).toUpperCase();
        return `<label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;cursor:pointer;border:1px solid ${checked ? 'rgba(250,191,36,.3)' : 'rgba(255,255,255,.06)'};background:${checked ? 'rgba(250,191,36,.08)' : 'rgba(255,255,255,.03)'};transition:all .12s" id="bc-row-${u.id}">
            <input type="checkbox" ${checked ? 'checked' : ''} onchange="bcToggleUser('${u.id}', this.checked)" style="accent-color:#fbbf24;width:15px;height:15px;flex-shrink:0">
            <div style="width:30px;height:30px;border-radius:8px;background:rgba(103,232,249,.15);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#67e8f9;flex-shrink:0">${initials}</div>
            <div style="flex:1;min-width:0">
                <div style="font-size:12px;color:rgba(255,255,255,.85);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escA(u.email)}</div>
                <div style="font-size:10px;color:rgba(255,255,255,.35)">${u.username || 'kein Username'}</div>
            </div>
        </label>`;
    }).join('');
    bcUpdateSelectedCount();
}

function bcFilterList() { bcRenderList(); }

function bcToggleUser(uid, checked) {
    if (checked) _bcSelected.add(uid);
    else _bcSelected.delete(uid);
    // Update row style
    const row = document.getElementById(`bc-row-${uid}`);
    if (row) {
        row.style.border = checked ? '1px solid rgba(250,191,36,.3)' : '1px solid rgba(255,255,255,.06)';
        row.style.background = checked ? 'rgba(250,191,36,.08)' : 'rgba(255,255,255,.03)';
    }
    bcUpdateSelectedCount();
}

function bcUpdateSelectedCount() {
    const n = _bcSelected.size;
    document.getElementById('bc-selected-count').textContent = `${n} ausgewählt`;
    document.getElementById('bc-send-label').textContent = n > 0 ? `An ${n} senden` : 'Auswählen...';
}

function bcSelectAll() {
    _bcListFiltered.forEach(u => _bcSelected.add(u.id));
    bcRenderList();
}

function bcDeselectAll() {
    _bcListFiltered.forEach(u => _bcSelected.delete(u.id));
    bcRenderList();
}

async function euExecuteBroadcast() {
    const subject = document.getElementById('eu-bc-subject').value.trim();
    const body    = document.getElementById('eu-bc-body').value.trim();
    if (!subject || !body) { showToast('Betreff & Nachricht erforderlich', 'error'); return; }

    let recipients;
    if (_bcMode === 'all') {
        recipients = euAllUsers.filter(u => u.email && !u.disabled);
    } else {
        if (_bcSelected.size === 0) { showToast('Bitte mindestens einen Nutzer auswählen', 'error'); return; }
        recipients = euAllUsers.filter(u => _bcSelected.has(u.id) && u.email);
    }
    if (!recipients.length) { showToast('Keine aktiven Empfänger', 'error'); return; }

    if (!confirm(`Broadcast an ${recipients.length} Nutzer senden?`)) return;

    const btn = document.getElementById('bc-send-btn');
    if (btn) { btn.disabled = true; }
    document.getElementById('bc-send-label').textContent = `Sende (0/${recipients.length})...`;

    let sent = 0, failed = 0;
    for (const u of recipients) {
        try {
            await emailjs.send(
                ADMIN_EMAILJS_SERVICE,
                ADMIN_BROADCAST_TEMPLATE,
                {
                    to_email:  u.email,
                    to_name:   u.username || u.email.split('@')[0],
                    subject:   subject,
                    message:   body
                }
            );
            sent++;
        } catch(e) {
            failed++;
            console.warn("Broadcast an " + u.email + " fehlgeschlagen:", e);
        }
        document.getElementById('bc-send-label').textContent = `Sende (${sent}/${recipients.length})...`;
        await new Promise(r => setTimeout(r, 120));
    }

    await logAction('broadcast_sent', '', { subject, sent, failed, total: recipients.length, mode: _bcMode });
    showToast(`📢 ${sent} E-Mail${sent !== 1 ? 's' : ''} gesendet${failed > 0 ? ' (' + failed + ' fehlgeschlagen)' : ''}`, sent > 0 ? 'success' : 'error');
    if (btn) { btn.disabled = false; }
    euCloseBroadcast();
}

function euExportCSV(){
    if(!euFiltered.length){showToast('Keine Daten!','error');return;}
    let csv='uid,email,username,referralCode,loyaltyPoints,freeShipping,disabled,role,vip,orderCount,totalSpent,referralCount\n';
    euFiltered.forEach(u=>{csv+=[`"${u.id}"`,`"${u.email||''}"`,`"${u.username||''}"`,`"${u.referralCode||''}"`,u.totalBonusPoints||0,u.freeShipping?'JA':'NEIN',u.disabled?'JA':'NEIN',`"${u.role||''}"`,u.vip?'JA':'NEIN',u.orderCount||0,(u.totalSpent||0).toFixed(2),u.referralCount||0].join(',')+'\n';});
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
    const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`wavevapes_users_erweitert_${new Date().toISOString().slice(0,10)}.csv`;link.click();
    showToast(`✅ ${euFiltered.length} User exportiert!`,'success');
}

function euShowTopCustomers(){
    const top5=[...euAllUsers].sort((a,b)=>(b.totalSpent||0)-(a.totalSpent||0)).slice(0,5);
    showToast('🏆 Top 5: ' + top5.slice(0,3).map((u,i)=>`${i+1}. ${(u.email||'').split('@')[0]||u.username||'Anonym'} (${(u.totalSpent||0).toFixed(0)}€)`).join(' | '), 'success');
}

// ====================== SIDEBAR & TABS ======================
// ═══════════════════════════════════════════════════════
//  SIDEBAR & TABS v2
// ═══════════════════════════════════════════════════════
const TAB_NAMES = {
    0:'Produkte', 1:'Bestellungen', 2:'Benutzer', 3:'Kategorien',
    4:'Gutscheine', 5:'Analytics', 6:'IP-Sicherheit', 7:'Settings',
    8:'Sortierung', 9:'Live Online', 10:'Erw. Benutzer', 11:'Bewertungen', 12:'Superadmin Zone',
    13:'Kunden-Übersicht', 14:'Aktionen', 15:'Klick-Analyse', 16:'Bundles', 17:'Admin Logs', 18:'Review Generator'
};

function switchTab(n) {
    // Block if no permission (non-superadmin) — ABER Nur-Lesen darf alle Tabs sehen
    if (!saCurrentUserIsSuperadmin && !window._isReadOnly && n !== 12) {
        const perm = SA_PERMISSIONS.find(p => p.tab === n);
        if (perm) {
            const userDoc_perms = window._currentAdminPerms;
            if (userDoc_perms && !userDoc_perms.includes(perm.key)) {
                showToast('⛔ Keine Berechtigung für diesen Bereich', 'error');
                return;
            }
        }
    }
    // Tab 12 requires unlock
    if (n === 12) { openSuperadminZone(); return; }

    document.querySelectorAll('.sidebar-item, .sidebar-item-locked').forEach(el => el.classList.remove('tab-active'));
    const si = document.getElementById('sidebar-'+n);
    if (si) si.classList.add('tab-active');
    document.querySelectorAll('[id^="tab-content-"]').forEach(el => el.classList.add('hidden'));
    const tc = document.getElementById('tab-content-'+n);
    if (tc) tc.classList.remove('hidden');
    // breadcrumb
    const bc = document.getElementById('hdr-tab-name');
    if (bc) bc.textContent = TAB_NAMES[n] || '';
    // tab-specific loaders
    if(n===4)loadCoupons();
    if(n===5)loadAnalytics();
    if(n===6){
        // Tab 6 = IP-Sicherheit — nur Superadmin
        if (!saCurrentUserIsSuperadmin) { showToast('⛔ Nur für Superadmins', 'error'); return; }
        loadUnauthorizedLogs(); loadBannedIPs();
    }
    if(n===8){ (async()=>{ if(!_bundles.length) await loadBundles(); await loadProductOrder(); })(); }
    if(n===11){ rvAdminLoad('pending'); rvAdminLoadStats(); }
    if(n===9){
        loadPresence();
        if(presenceRefreshInterval)clearInterval(presenceRefreshInterval);
        presenceRefreshInterval=setInterval(()=>{
            if(!document.getElementById('tab-content-9').classList.contains('hidden'))loadPresence();
        },15000);
    }
    if(n===10)loadExtendedUsers();
    if(n===13)loadCustomerOverview();
    if(n===14)loadPromos();
    if(n===15) {
        loadClickAnalytics();
    } else {
        // Tear down click-analytics live listener when leaving tab 15
        if(_caUnsub) { _caUnsub(); _caUnsub = null; }
    }
    if(n===16) { if(!_promos.length) loadPromos(); loadBundles(); }
    if(n===17) loadAdminLogs();
    if(n===18) frvInit();
    // Re-apply write button locks for dynamically rendered content
    if (window._isReadOnly) setTimeout(markWriteButtons, 400);
}
function toggleSidebar(){
    const s=document.getElementById('sidebar');
    s.style.transform=s.style.transform==='translateX(-100%)'?'':'translateX(-100%)';
}


// ═══════════════════════════════════════════════════════
//  AKTIONEN / PROMOTIONS (Tab 14)
// ═══════════════════════════════════════════════════════
let _promos = [];
let _promoEditId = null;
// M-NEW-01 FIX: Track listener to prevent stacking
let _promosUnsub = null;

function loadPromos() {
    // Timer-Einstellungen laden
    db.collection('settings').doc('main').get().then(doc => {
        if (!doc.exists) return;
        const data = doc.data();
        const el = document.getElementById('set-countdown-active');
        if (el) el.checked = data.countdown_active || false;
        const lbl = document.getElementById('set-countdown-label');
        if (lbl) lbl.value = data.countdown_label || '🔥 Angebot endet in';
        const end = document.getElementById('set-countdown-end');
        if (end) end.value = data.countdown_end || '';
        cdAdminPreview();
    }).catch(() => {});

    if (_promosUnsub) { _promosUnsub(); _promosUnsub = null; }
    _promosUnsub = db.collection('promotions').onSnapshot(snap => {
        _promos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        promoRenderList();
        promoRenderKPIs();
        promoFillCategorySelect();
        const active = _promos.filter(p => p.active).length;
        const badge = document.getElementById('sb-promos-badge');
        if (badge) { badge.textContent = active; badge.style.display = active > 0 ? 'inline-flex' : 'none'; }
    }, () => {});
}

async function saveCountdown() {
    const active = document.getElementById('set-countdown-active')?.checked || false;
    const label  = document.getElementById('set-countdown-label')?.value.trim() || '🔥 Angebot endet in';
    const end    = document.getElementById('set-countdown-end')?.value || null;
    try {
        await db.collection('settings').doc('main').set({
            countdown_active: active,
            countdown_label:  label,
            countdown_end:    end
        }, { merge: true });
        showToast(active && end ? '✅ Timer gespeichert & live!' : '✅ Timer gespeichert', 'success');
        await logAction('countdown_saved', `active=${active}, end=${end}`);
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

function promoRenderKPIs() {
    const total  = _promos.length;
    const active = _promos.filter(p => p.active).length;
    const cats   = [...new Set(_promos.filter(p=>p.active).map(p=>p.category))].join(', ') || '—';
    const set = (id, v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
    set('promo-kpi-total',  total || '—');
    set('promo-kpi-active', active || '—');
    set('promo-kpi-cats',   cats);
}

function promoRenderList() {
    const el = document.getElementById('promo-list');
    if (!el) return;
    if (!_promos.length) {
        el.innerHTML = `<div style="padding:32px;text-align:center;color:rgba(255,255,255,.2);font-size:13px">
            <div style="font-size:32px;margin-bottom:12px">⚡</div>
            Noch keine Aktionen angelegt. Klick auf „Neue Aktion" um loszulegen.
        </div>`;
        return;
    }
    el.innerHTML = _promos.map(p => {
        const typeLabel = p.type === 'percent' ? `${p.value}% Rabatt` : `${parseFloat(p.value).toFixed(2).replace('.',',')} € Rabatt`;
        const statusBg  = p.active ? 'rgba(52,211,153,.12)' : 'rgba(255,255,255,.06)';
        const statusCol = p.active ? '#34d399' : 'rgba(255,255,255,.3)';
        return `<div style="display:flex;align-items:center;gap:14px;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,.05)" onmouseover="this.style.background='rgba(255,255,255,.02)'" onmouseout="this.style.background=''">
            <div style="width:42px;height:42px;border-radius:13px;background:${p.active?'linear-gradient(135deg,rgba(239,68,68,.2),rgba(249,115,22,.1))':'rgba(255,255,255,.05)'};border:1px solid ${p.active?'rgba(239,68,68,.3)':'rgba(255,255,255,.1)'};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${p.type==='percent'?'％':'€'}</div>
            <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:700;color:#e4e4e7">${p.name||'—'}</div>
                <div style="font-size:11px;color:rgba(255,255,255,.35);margin-top:2px">${typeLabel} · Kategorie: <span style="color:#67e8f9">${p.category||'Alle'}</span>${p.label?` · Badge: <span style="color:#fbbf24">${p.label}</span>`:''}</div>
            </div>
            <label class="cfg-switch" title="${p.active?'Deaktivieren':'Aktivieren'}">
                <input type="checkbox" ${p.active?'checked':''} onchange="promoToggleActive('${p.id}',this.checked)">
                <span class="cfg-switch-sl"></span>
            </label>
            <span style="font-size:10px;font-weight:800;padding:3px 10px;border-radius:99px;background:${statusBg};color:${statusCol};min-width:60px;text-align:center">${p.active?'AKTIV':'INAKTIV'}</span>
            <button onclick="promoOpenEdit('${p.id}')" style="width:32px;height:32px;border-radius:9px;background:rgba(103,232,249,.1);border:1px solid rgba(103,232,249,.2);color:#67e8f9;cursor:pointer;font-size:13px"><i class="fa-solid fa-pen"></i></button>
            <button onclick="promoDelete('${p.id}')" style="width:32px;height:32px;border-radius:9px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:#f87171;cursor:pointer;font-size:13px"><i class="fa-solid fa-trash"></i></button>
        </div>`;
    }).join('');
}

async function promoFillCategorySelect() {
    const sel = document.getElementById('promo-f-category');
    if (!sel) return;
    const current = sel.value;
    // BUG-18 FIX: Statt jedesmal einen Firestore-Get zu machen, allCategories (bereits geladen)
    // verwenden. Fallback auf Firestore nur wenn allCategories noch leer ist.
    let catNames = allCategories.map(c => c.name).filter(Boolean);
    if (!catNames.length) {
        try {
            const snap = await db.collection('categories').get();
            catNames = snap.docs.map(d => d.data().name).filter(Boolean);
        } catch(e) { catNames = []; }
    }
    sel.innerHTML = `<option value="Alle">🌐 Alle Produkte</option>` +
        catNames.map(c => `<option value="${c}">${c}</option>`).join('');
    if (current) sel.value = current;
}

function promoTypeChange() {
    const type = document.getElementById('promo-f-type')?.value;
    const label = document.getElementById('promo-f-value-label');
    const unit  = document.getElementById('promo-f-unit');
    const inp   = document.getElementById('promo-f-value');
    if (type === 'percent') {
        if (label) label.textContent = 'Rabatt in %';
        if (unit)  unit.textContent  = '%';
        if (inp)   { inp.max = '99'; inp.placeholder = '10'; }
    } else {
        if (label) label.textContent = 'Rabatt in €';
        if (unit)  unit.textContent  = '€';
        if (inp)   { inp.max = '9999'; inp.placeholder = '2.00'; }
    }
}

function promoOpenCreate() {
    _promoEditId = null;
    document.getElementById('promo-form-title').textContent = 'Neue Aktion erstellen';
    document.getElementById('promo-f-name').value    = '';
    document.getElementById('promo-f-label').value   = '';
    document.getElementById('promo-f-value').value   = '';
    document.getElementById('promo-f-type').value    = 'percent';
    document.getElementById('promo-f-active').checked = true;
    promoTypeChange();
    promoFillCategorySelect();
    document.getElementById('promo-form-card').style.display = 'block';
    document.getElementById('promo-form-card').scrollIntoView({ behavior:'smooth', block:'start' });
}

function promoOpenEdit(id) {
    const p = _promos.find(x => x.id === id);
    if (!p) return;
    _promoEditId = id;
    document.getElementById('promo-form-title').textContent = 'Aktion bearbeiten';
    document.getElementById('promo-f-name').value    = p.name    || '';
    document.getElementById('promo-f-label').value   = p.label   || '';
    document.getElementById('promo-f-value').value   = p.value   || '';
    document.getElementById('promo-f-type').value    = p.type    || 'percent';
    document.getElementById('promo-f-active').checked = p.active !== false;
    promoTypeChange();
    promoFillCategorySelect().then(() => {
        const sel = document.getElementById('promo-f-category');
        if (sel) sel.value = p.category || 'Alle';
    });
    document.getElementById('promo-form-card').style.display = 'block';
    document.getElementById('promo-form-card').scrollIntoView({ behavior:'smooth', block:'start' });
}

function promoCloseForm() {
    document.getElementById('promo-form-card').style.display = 'none';
    _promoEditId = null;
}

async function promoSave() {
    const name     = document.getElementById('promo-f-name').value.trim();
    const label    = document.getElementById('promo-f-label').value.trim();
    const type     = document.getElementById('promo-f-type').value;
    const value    = parseFloat(document.getElementById('promo-f-value').value);
    const category = document.getElementById('promo-f-category').value;
    const active   = document.getElementById('promo-f-active').checked;
    if (!name)                      return showToast('❌ Name eingeben', 'error');
    if (isNaN(value) || value <= 0) return showToast('❌ Gültigen Rabattwert eingeben', 'error');
    if (type === 'percent' && value >= 100) return showToast('❌ Max. 99%', 'error');
    const data = { name, label, type, value, category, active, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    try {
        if (_promoEditId) {
            await db.collection('promotions').doc(_promoEditId).update(data);
            showToast('✅ Aktion aktualisiert!', 'success');
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('promotions').add(data);
            showToast(`✅ Aktion live! ${category === 'Alle' ? 'Alle Produkte' : category} — ${type==='percent'?value+'%':value+'€'} Rabatt`, 'success');
        }
        promoCloseForm();
        await logAction(_promoEditId ? 'promo_updated' : 'promo_created', name);
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

async function promoToggleActive(id, active) {
    try {
        await db.collection('promotions').doc(id).update({ active });
        showToast(active ? '✅ Aktion aktiviert — Rabatt ist jetzt live!' : '⏸ Aktion deaktiviert');
        await logAction('promo_toggled', id + ' → ' + (active ? 'aktiv' : 'inaktiv'));
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

async function promoDelete(id) {
    const p = _promos.find(x => x.id === id);
    if (!confirm(`Aktion "${p?.name||id}" wirklich löschen?`)) return;
    try {
        await db.collection('promotions').doc(id).delete();
        showToast('🗑 Aktion gelöscht');
        await logAction('promo_deleted', id);
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════
//  KUNDEN-ÜBERSICHT (Tab 13)
// ═══════════════════════════════════════════════════════
let _cuUsers = [];       // alle user docs
let _cuOrders = [];      // alle order docs
let _cuMerged = [];      // merged: user + order stats
let _cuLoaded = false;

async function loadCustomerOverview() {
    if (_cuLoaded) { cuRenderAll(); return; }

    // Load users + orders in parallel
    const [uSnap, oSnap] = await Promise.all([
        db.collection('users').get(),
        db.collection('orders').get()
    ]);

    _cuUsers  = uSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    _cuOrders = oSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Build per-email order stats
    const stats = {};
    _cuOrders.forEach(o => {
        const email = (o.userEmail || '').toLowerCase().trim();
        if (!email) return;
        if (!stats[email]) stats[email] = { count: 0, total: 0, lastDate: null };
        stats[email].count++;
        stats[email].total += (o.total || 0);
        const d = o.date?.toDate ? o.date.toDate() : (o.date ? new Date(o.date) : null);
        if (d && (!stats[email].lastDate || d > stats[email].lastDate)) stats[email].lastDate = d;
    });

    // Merge users with order stats
    _cuMerged = _cuUsers.map(u => {
        const email = (u.email || '').toLowerCase().trim();
        const s = stats[email] || { count: 0, total: 0, lastDate: null };
        return { ...u, orderCount: s.count, totalSpent: s.total, lastDate: s.lastDate };
    });

    // Also add "order-only" customers (ordered but not registered)
    Object.entries(stats).forEach(([email, s]) => {
        const known = _cuMerged.find(u => (u.email||'').toLowerCase() === email);
        if (!known) {
            _cuMerged.push({ email, username: '', totalBonusPoints: 0, disabled: false,
                orderCount: s.count, totalSpent: s.total, lastDate: s.lastDate, _guestOnly: true });
        }
    });

    _cuLoaded = true;
    cuRenderAll();
}

function cuRenderAll() {
    cuRenderKPIs();
    cuRenderTopSpenders();
    cuRenderTopLoyalty();
    cuRenderTable();
}

function cuRenderKPIs() {
    const registered = _cuMerged.filter(u => !u._guestOnly).length;
    const withOrders = _cuMerged.filter(u => u.orderCount > 0);
    const revenue    = withOrders.reduce((s, u) => s + u.totalSpent, 0);
    const avgVal     = withOrders.length ? revenue / withOrders.length : 0;
    const topPts     = _cuMerged.slice().sort((a,b) => (b.totalBonusPoints||0) - (a.totalBonusPoints||0))[0];

    const fmt = v => v.toLocaleString('de-DE', { minimumFractionDigits:2, maximumFractionDigits:2 }) + ' €';
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('cu-kpi-total',       registered);
    set('cu-kpi-revenue',     fmt(revenue));
    set('cu-kpi-avg',         fmt(avgVal));
    set('cu-kpi-toppts',      (topPts?.totalBonusPoints || 0).toLocaleString('de-DE'));
    set('cu-kpi-toppts-name', topPts?.email || '—');
}

function cuAvatar(email, username) {
    const str = username || email || '?';
    const initials = str.slice(0,2).toUpperCase();
    const hue = str.split('').reduce((h,c) => h + c.charCodeAt(0), 0) % 360;
    return `<div class="cu-avatar-sm" style="background:hsl(${hue},55%,30%);color:hsl(${hue},80%,75%)">${initials}</div>`;
}

function cuRankClass(i) {
    return i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
}

function cuRenderTopSpenders() {
    const el = document.getElementById('cu-top-spenders');
    if (!el) return;
    const top = _cuMerged.filter(u => u.orderCount > 0)
        .sort((a,b) => b.totalSpent - a.totalSpent).slice(0, 10);
    if (!top.length) { el.innerHTML = '<div class="cu-empty">Keine Bestellungen gefunden</div>'; return; }
    const maxSpent = top[0].totalSpent || 1;
    el.innerHTML = top.map((u, i) => {
        const pct = Math.round(u.totalSpent / maxSpent * 100);
        return `<div class="cu-row cu-row-spend">
            <div class="cu-rank ${cuRankClass(i)}">${i+1}</div>
            ${cuAvatar(u.email, u.username)}
            <div class="cu-name-col">
                <div class="cu-name">${u.username || u.email || '—'}</div>
                <div class="cu-email-sm">${u.email || 'Gastkunde'} · ${u.orderCount} Bestellung${u.orderCount !== 1 ? 'en' : ''}</div>
                <div class="cu-pts-bar-bg"><div class="cu-pts-bar" style="width:${pct}%;background:linear-gradient(90deg,#34d399,#67e8f9)"></div></div>
            </div>
            <div class="cu-val" style="color:#34d399">${u.totalSpent.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})} €</div>
        </div>`;
    }).join('');
}

function cuRenderTopLoyalty() {
    const el = document.getElementById('cu-top-loyalty');
    if (!el) return;
    const top = _cuMerged.filter(u => u.totalBonusPoints > 0)
        .sort((a,b) => (b.totalBonusPoints||0) - (a.totalBonusPoints||0)).slice(0, 10);
    if (!top.length) { el.innerHTML = '<div class="cu-empty">Keine Punkte vergeben</div>'; return; }
    const maxPts = top[0].totalBonusPoints || 1;
    el.innerHTML = top.map((u, i) => {
        const pct = Math.round((u.totalBonusPoints||0) / maxPts * 100);
        return `<div class="cu-row cu-row-pts">
            <div class="cu-rank ${cuRankClass(i)}">${i+1}</div>
            ${cuAvatar(u.email, u.username)}
            <div class="cu-name-col">
                <div class="cu-name">${u.username || u.email || '—'}</div>
                <div class="cu-email-sm">${u.email || '—'}</div>
                <div class="cu-pts-bar-bg"><div class="cu-pts-bar" style="width:${pct}%"></div></div>
            </div>
            <div class="cu-val" style="color:#fbbf24">⭐ ${(u.totalBonusPoints||0).toLocaleString('de-DE')}</div>
        </div>`;
    }).join('');
}

function cuRenderTable() {
    const tbody = document.getElementById('cu-tbody');
    if (!tbody) return;
    const q = (document.getElementById('cu-search')?.value || '').toLowerCase();
    let list = _cuMerged.filter(u =>
        !q || (u.email||'').toLowerCase().includes(q) || (u.username||'').toLowerCase().includes(q)
    ).sort((a,b) => b.totalSpent - a.totalSpent);

    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="8"><div class="cu-empty">Keine Kunden gefunden</div></td></tr>`;
        return;
    }
    const fmtDate = d => d ? d.toLocaleDateString('de-DE', {day:'2-digit',month:'2-digit',year:'2-digit'}) : '—';
    tbody.innerHTML = list.map((u, i) => {
        const avgOrder = u.orderCount ? (u.totalSpent / u.orderCount) : 0;
        const statusPill = u._guestOnly
            ? `<span style="font-size:10px;padding:2px 8px;border-radius:99px;background:rgba(251,191,36,.12);color:#fbbf24;font-weight:700">GAST</span>`
            : u.disabled
                ? `<span style="font-size:10px;padding:2px 8px;border-radius:99px;background:rgba(239,68,68,.12);color:#f87171;font-weight:700">GESPERRT</span>`
                : `<span style="font-size:10px;padding:2px 8px;border-radius:99px;background:rgba(52,211,153,.12);color:#34d399;font-weight:700">AKTIV</span>`;
        return `<tr>
            <td style="color:rgba(255,255,255,.25);font-family:'JetBrains Mono',monospace;font-size:11px">${i+1}</td>
            <td>
                <div style="display:flex;align-items:center;gap:10px">
                    ${cuAvatar(u.email, u.username)}
                    <div>
                        <div style="font-size:12px;font-weight:600;color:#e4e4e7">${u.username || '—'}</div>
                        <div style="font-size:10px;color:rgba(255,255,255,.3)">${u.email || 'Gastkunde'}</div>
                    </div>
                </div>
            </td>
            <td style="text-align:center;font-family:'JetBrains Mono',monospace;font-size:12px;color:${u.orderCount>0?'#67e8f9':'rgba(255,255,255,.2)'}">${u.orderCount}</td>
            <td style="font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;color:${u.totalSpent>0?'#34d399':'rgba(255,255,255,.2)'}">${u.totalSpent>0?u.totalSpent.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' €':'—'}</td>
            <td style="font-family:'JetBrains Mono',monospace;font-size:11px;color:rgba(255,255,255,.5)">${avgOrder>0?avgOrder.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' €':'—'}</td>
            <td style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#fbbf24">${u.totalBonusPoints>0?'⭐ '+(u.totalBonusPoints||0).toLocaleString('de-DE'):'—'}</td>
            <td style="font-size:11px;color:rgba(255,255,255,.35)">${fmtDate(u.lastDate)}</td>
            <td>${statusPill}</td>
        </tr>`;
    }).join('');
}

function cuExportCSV() {
    const q = (document.getElementById('cu-search')?.value || '').toLowerCase();
    const list = _cuMerged.filter(u =>
        !q || (u.email||'').toLowerCase().includes(q) || (u.username||'').toLowerCase().includes(q)
    ).sort((a,b) => b.totalSpent - a.totalSpent);

    const rows = [['#','E-Mail','Username','Bestellungen','Umsatz (€)','Ø Bestellwert (€)','Loyalty-Punkte','Letzter Kauf','Status']];
    list.forEach((u, i) => {
        const avg = u.orderCount ? (u.totalSpent / u.orderCount).toFixed(2) : '0.00';
        const lastDate = u.lastDate ? u.lastDate.toLocaleDateString('de-DE') : '—';
        const status = u._guestOnly ? 'Gast' : u.disabled ? 'Gesperrt' : 'Aktiv';
        rows.push([i+1, u.email||'', u.username||'', u.orderCount, (u.totalSpent||0).toFixed(2), avg, u.totalBonusPoints||0, lastDate, status]);
    });

    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: `kunden-uebersicht-${new Date().toISOString().slice(0,10)}.csv` });
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    showToast(`✅ ${list.length} Kunden exportiert`, 'success');
}

// ═══════════════════════════════════════════════════════
//  COUNTDOWN ADMIN PREVIEW
// ═══════════════════════════════════════════════════════
let _cdPrevInterval = null;
function cdAdminPreview() {
    const endVal   = document.getElementById('set-countdown-end')?.value;
    const labelVal = document.getElementById('set-countdown-label')?.value || '🔥 Angebot endet in';
    const preview  = document.getElementById('cd-admin-preview');
    if (!preview) return;
    if (_cdPrevInterval) { clearInterval(_cdPrevInterval); _cdPrevInterval = null; }
    if (!endVal) { preview.style.display = 'none'; return; }
    const endMs = new Date(endVal).getTime();
    if (isNaN(endMs) || endMs <= Date.now()) { preview.style.display = 'none'; return; }
    preview.style.display = 'block';
    const labelEl = document.getElementById('cd-prev-label');
    if (labelEl) labelEl.textContent = labelVal;
    const pad = n => String(n).padStart(2, '0');
    function tick() {
        const diff = endMs - Date.now();
        if (diff <= 0) { preview.style.display = 'none'; clearInterval(_cdPrevInterval); return; }
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        const hEl = document.getElementById('cd-prev-h');
        const mEl = document.getElementById('cd-prev-m');
        const sEl = document.getElementById('cd-prev-s');
        if (hEl) hEl.textContent = pad(h);
        if (mEl) mEl.textContent = pad(m);
        if (sEl) sEl.textContent = pad(s);
    }
    tick();
    _cdPrevInterval = setInterval(tick, 1000);
}

// ═══════════════════════════════════════════════════════
//  GLOBAL SEARCH
// ═══════════════════════════════════════════════════════
function globalSearchInput() {
    const q = (document.getElementById('global-search').value || '').toLowerCase().trim();
    const dd = document.getElementById('global-search-dd');
    if (!q || q.length < 2) { dd.classList.remove('open'); return; }

    const results = { products:[], orders:[], users:[] };

    allProducts.forEach(p => {
        if (p.name.toLowerCase().includes(q)) results.products.push(p);
    });

    // search cached data
    if (typeof _ordAllDocs !== 'undefined') {
        _ordAllDocs.slice(0,200).forEach(doc => {
            const o = doc.data();
            if ((o.orderNumber||'').toLowerCase().includes(q) || (o.userEmail||'').toLowerCase().includes(q))
                results.orders.push({ id:doc.id, ...o });
        });
    }
    if (typeof _usrAllDocs !== 'undefined') {
        _usrAllDocs.slice(0,200).forEach(doc => {
            const u = doc.data();
            if ((u.email||'').toLowerCase().includes(q) || (u.username||'').toLowerCase().includes(q))
                results.users.push({ id:doc.id, ...u });
        });
    }

    let html = '';
    if (results.products.length) {
        html += `<div class="hdr-search-section">
            <div class="hdr-search-section-lbl"><i class="fa-solid fa-box" style="margin-right:4px;color:#67e8f9"></i>Produkte</div>`;
        results.products.slice(0,4).forEach(p => {
            html += `<div class="hdr-search-item" onclick="switchTab(0);setTimeout(()=>{const s=document.getElementById('product-search');if(s){s.value='${p.name.replace(/'/g,"\\'")}';applyAdminFilters();}},100);document.getElementById('global-search').value='';document.getElementById('global-search-dd').classList.remove('open')">
                <div class="hdr-search-item-icon" style="background:rgba(103,232,249,.1);color:#67e8f9">${p.image?`<img src="${p.image}" style="width:100%;height:100%;object-fit:cover;border-radius:8px">`:'<i class="fa-solid fa-box"></i>'}</div>
                <div><div class="hdr-search-item-main">${escA(p.name)}</div><div class="hdr-search-item-sub">${(p.price||0).toFixed(2)} € · Lager: ${p.stock||0}</div></div>
            </div>`;
        });
        html += `</div>`;
    }
    if (results.orders.length) {
        html += `<div class="hdr-search-sep"></div><div class="hdr-search-section">
            <div class="hdr-search-section-lbl"><i class="fa-solid fa-receipt" style="margin-right:4px;color:#34d399"></i>Bestellungen</div>`;
        results.orders.slice(0,3).forEach(o => {
            html += `<div class="hdr-search-item" onclick="switchTab(1);setTimeout(()=>showOrderModal('${o.id}'),400);document.getElementById('global-search').value='';document.getElementById('global-search-dd').classList.remove('open')">
                <div class="hdr-search-item-icon" style="background:rgba(52,211,153,.1);color:#34d399"><i class="fa-solid fa-receipt"></i></div>
                <div><div class="hdr-search-item-main">#${escA(String(o.orderNumber||'—'))}</div><div class="hdr-search-item-sub">${o.userEmail||'—'} · ${(o.total||0).toFixed(2)} €</div></div>
            </div>`;
        });
        html += `</div>`;
    }
    if (results.users.length) {
        html += `<div class="hdr-search-sep"></div><div class="hdr-search-section">
            <div class="hdr-search-section-lbl"><i class="fa-solid fa-user" style="margin-right:4px;color:#a78bfa"></i>Benutzer</div>`;
        results.users.slice(0,3).forEach(u => {
            html += `<div class="hdr-search-item" onclick="switchTab(2);setTimeout(()=>{const s=document.getElementById('user-search');if(s){s.value='${(u.email||'').replace(/'/g,"\\'")}';usrRenderTable();}},100);document.getElementById('global-search').value='';document.getElementById('global-search-dd').classList.remove('open')">
                <div class="hdr-search-item-icon" style="background:rgba(167,139,250,.1);color:#a78bfa"><i class="fa-solid fa-user"></i></div>
                <div><div class="hdr-search-item-main">${escA(u.email||'—')}</div><div class="hdr-search-item-sub">${escA(u.username||'kein Username')} · ${u.totalBonusPoints||0} Punkte</div></div>
            </div>`;
        });
        html += `</div>`;
    }
    if (!html) html = `<div class="hdr-search-empty"><i class="fa-solid fa-magnifying-glass" style="display:block;font-size:20px;margin-bottom:8px;opacity:.3"></i>Keine Ergebnisse für „${q}"</div>`;

    dd.innerHTML = html;
    dd.classList.add('open');
}
function globalSearchFocus() {
    if (document.getElementById('global-search').value.length >= 2) globalSearchInput();
}
function globalSearchBlur() {
    document.getElementById('global-search-dd').classList.remove('open');
}

// ═══════════════════════════════════════════════════════
//  NOTIFICATION SYSTEM
// ═══════════════════════════════════════════════════════
let _notifications = [];
let _notifUnread = 0;
let _orderNotifPrevCount = null;
// E-06 FIX: Restore last-read timestamp from localStorage so badge is correct after reload
const _NOTIF_LS_KEY = 'wv_notif_lastRead';
let _notifLastReadTs = parseInt(localStorage.getItem(_NOTIF_LS_KEY) || '0', 10);

function pushNotification(type, msg, subMsg, onClickFn) {
    const id = Date.now();
    // E-06 FIX: Mark as already-read if it predates the stored last-read timestamp
    const read = id <= _notifLastReadTs;
    _notifications.unshift({ id, type, msg, subMsg, time: new Date(), read, onClick: onClickFn });
    if (_notifications.length > 30) _notifications.pop();
    if (!read) _notifUnread++;
    renderNotifPanel();
    updateNotifDot();
    // Rich order toast — larger, auffälliger, mit Direktlink
    if (type === 'order') {
        showOrderToast(msg, subMsg, onClickFn);
    } else {
        showToast(msg, type === 'error' ? 'error' : 'success');
    }
    // Browser notification
    if (Notification.permission === 'granted') {
        new Notification('WaveVapes Admin', { body: subMsg || msg, icon: 'logo.png', silent: false });
    }
}

function updateNotifDot() {
    const dot = document.getElementById('hdr-notif-dot');
    if (dot) dot.classList.toggle('show', _notifUnread > 0);
}

function renderNotifPanel() {
    const list = document.getElementById('notif-list');
    if (!list) return;
    if (!_notifications.length) {
        list.innerHTML = `<div class="notif-empty"><i class="fa-solid fa-bell-slash" style="font-size:24px;display:block;margin-bottom:8px;opacity:.3"></i>Keine Benachrichtigungen</div>`;
        return;
    }
    const typeConf = {
        order:    { bg:'rgba(52,211,153,.12)',  color:'#34d399',  icon:'fa-receipt' },
        warning:  { bg:'rgba(251,191,36,.12)',  color:'#fbbf24',  icon:'fa-triangle-exclamation' },
        error:    { bg:'rgba(248,113,113,.12)', color:'#f87171',  icon:'fa-circle-exclamation' },
        info:     { bg:'rgba(103,232,249,.12)', color:'#67e8f9',  icon:'fa-circle-info' },
    };
    list.innerHTML = _notifications.map(n => {
        const c = typeConf[n.type] || typeConf.info;
        const relTime = lgRelTime ? lgRelTime(n.time) : n.time.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
        return `<div class="notif-item${n.read?'':' unread'}" onclick="notifClick(${n.id})">
            <div class="notif-icon" style="background:${c.bg};color:${c.color}"><i class="fa-solid ${c.icon}"></i></div>
            <div class="notif-body">
                <div class="notif-msg">${n.msg}</div>
                ${n.subMsg ? `<div class="notif-time">${n.subMsg}</div>` : ''}
                <div class="notif-time">${relTime}</div>
            </div>
            ${!n.read ? '<div class="notif-unread-dot"></div>' : ''}
        </div>`;
    }).join('');
}

function notifClick(id) {
    const n = _notifications.find(x => x.id === id);
    if (n) { n.read = true; _notifUnread = Math.max(0,_notifUnread-1); updateNotifDot(); renderNotifPanel(); if(n.onClick) n.onClick(); }
    closeNotifPanel();
}

function toggleNotifPanel() {
    const p = document.getElementById('notif-panel');
    const o = document.getElementById('notif-overlay');
    if (p.style.display === 'none' || !p.style.display) {
        p.style.display = 'block'; o.classList.add('open');
        // mark all read + E-06 FIX: persist last-read time to localStorage
        _notifications.forEach(n => n.read = true);
        _notifLastReadTs = Date.now();
        localStorage.setItem(_NOTIF_LS_KEY, String(_notifLastReadTs));
        _notifUnread = 0; updateNotifDot(); renderNotifPanel();
    } else {
        closeNotifPanel();
    }
}
function clearNotifications() {
    _notifications = [];
    _notifUnread = 0;
    // E-06 FIX: Also clear persisted last-read on explicit clear
    localStorage.removeItem(_NOTIF_LS_KEY);
    _notifLastReadTs = 0;
    updateNotifDot(); renderNotifPanel();
}
function closeNotifPanel() {
    const p = document.getElementById('notif-panel');
    const o = document.getElementById('notif-overlay');
    if (p) p.style.display = 'none';
    if (o) o.classList.remove('open');
}

// Auto-request browser notification permission
function requestNotifPermission() {
    if (Notification.permission === 'default') Notification.requestPermission();
}

// Watch for new orders
function watchNewOrders() {
    // K-03 FIX: Single clean teardown before restarting listener
    if (_watchOrdersUnsub) { _watchOrdersUnsub(); _watchOrdersUnsub = null; }
    let firstLoad = true;
    _watchOrdersUnsub = db.collection('orders').orderBy('date','desc').limit(50).onSnapshot(snap => {
        if (firstLoad) { _orderNotifPrevCount = snap.size; firstLoad = false; return; }
        const newOrders = snap.docChanges().filter(c => c.type === 'added');
        newOrders.forEach(change => {
            const o = change.doc.data();
            pushNotification('order',
                `Neue Bestellung #${escA(String(o.orderNumber||'—'))}`,
                `${o.userEmail||'—'} · ${(o.total||0).toFixed(2)} €`,
                () => { switchTab(1); setTimeout(() => showOrderModal(change.doc.id), 400); }
            );
            // update sidebar badge
            const badge = document.getElementById('sb-badge-orders');
            if (badge) { badge.style.display='inline'; badge.textContent=parseInt(badge.textContent||0, 10)+1; }
        });
    });
}

// ═══════════════════════════════════════════════════════
//  LIVE ONLINE v2
// ═══════════════════════════════════════════════════════
const PRS_AV_COLORS=[
    ['rgba(103,232,249,.18)','#67e8f9'],['rgba(167,139,250,.18)','#a78bfa'],
    ['rgba(52,211,153,.18)','#34d399'],['rgba(251,191,36,.18)','#fbbf24'],
    ['rgba(244,114,182,.18)','#f472b6']
];
function prsAvColor(s=''){let h=0;for(let c of s)h=(h*31+c.charCodeAt(0))&0xfff;return PRS_AV_COLORS[h%PRS_AV_COLORS.length];}

// M-NEW-01 FIX: Track listener to prevent stacking on repeated Aktualisieren clicks
let _presenceUnsub = null;

function loadPresence() {
    const container = document.getElementById("presence-list");
    const liveDot   = document.getElementById('prs-live-dot');
    const lastUpd   = document.getElementById('prs-last-update');

    // _presenceData: letzter Snapshot-Stand, damit Sekunden-Ticker unabhaengig re-rendern kann
    let _presenceData = [];
    let _presenceTickerInterval = null;

    function fmtAge(ms) {
        if (ms < 0) ms = 0;
        const h   = Math.floor(ms / 3600000);
        const min = Math.floor((ms % 3600000) / 60000);
        const sec = Math.floor((ms % 60000) / 1000);
        if (h > 0)   return `${h}h ${min}m`;
        if (min > 0) return `${min}m ${sec}s`;
        return `${sec}s`;
    }

    function renderPresenceCards() {
        if (!_presenceData.length) {
            container.innerHTML = `<div class="prs-empty"><i class="fa-solid fa-users-slash"></i>Niemand gerade online.</div>`;
            return;
        }
        const now = Date.now();
        let html = '';
        [..._presenceData].sort((a,b) => (a._firstMs||a._lastMs) - (b._firstMs||b._lastMs)).forEach((d,idx) => {
            const isGuest   = d.isGuest || !d.uid;
            const name      = d.username || (isGuest ? 'Gast' : '—');
            const [avBg,avColor] = prsAvColor(d.email || d.uid || String(idx));
            const initials  = name.slice(0,2).toUpperCase();
            // Aktiv seit: firstSeen wenn vorhanden (echter Sitzungsbeginn), sonst lastSeen
            const sinceMs   = d._firstMs ? (now - d._firstMs) : (now - d._lastMs);
            const ageStr    = fmtAge(sinceMs);
            const cartItems = d.cartCount || d.cart?.length || null;
            const ipEscaped = (d.ip || '').replace(/'/g, '');

            html += `<div class="prs-card" style="animation-delay:${idx*.04}s">
                <div class="prs-card-top">
                    <div class="prs-avatar" style="background:${avBg};color:${avColor}">${initials}</div>
                    <div style="flex:1;min-width:0">
                        <div class="prs-name">${name}</div>
                        ${d.email ? `<div class="prs-email">${escA(d.email)}</div>` : ''}
                    </div>
                    <span class="${isGuest ? 'prs-badge-guest' : 'prs-badge-live'}">${isGuest ? '👤 Gast' : '● Eingeloggt'}</span>
                </div>
                <div class="prs-meta">
                    <div class="prs-meta-item"><i class="fa-solid fa-clock"></i><span>Aktiv seit <span class="prs-meta-val">${ageStr}</span></span></div>
                    ${d.page ? `<div class="prs-meta-item"><i class="fa-solid fa-location-dot"></i><span class="prs-meta-val">${d.page}</span></div>` : ''}
                    ${d.referral ? `<div class="prs-meta-item"><i class="fa-solid fa-link"></i><span class="prs-meta-val">${d.referral}</span></div>` : ''}
                    ${d.ip ? `<div class="prs-meta-item"><i class="fa-solid fa-network-wired"></i><span class="prs-meta-val" style="font-family:'JetBrains Mono',monospace;font-size:11px;cursor:pointer;" onclick="navigator.clipboard.writeText('${ipEscaped}').then(()=>showToast('IP kopiert','success'))" title="Klicken zum Kopieren">${d.ip}</span></div>` : ''}
                </div>
                ${cartItems ? `<div class="prs-cart-strip"><i class="fa-solid fa-cart-shopping"></i>${cartItems} Artikel im Warenkorb</div>` : ''}
            </div>`;
        });
        container.innerHTML = html;
    }

    if (_presenceUnsub) { _presenceUnsub(); _presenceUnsub = null; }
    _presenceUnsub = db.collection("presence").onSnapshot(snap => {
        const now = Date.now();
        const active = [];
        snap.forEach(doc => {
            const d = doc.data();
            if (!d.lastSeen) return;
            const lastMs = d.lastSeen.toDate().getTime();
            // Timeout 90s statt 45s: toleriert Netzwerkverzoegerung + Browser-Tab-Throttling
            if (now - lastMs > 90000) return;
            const firstMs = d.firstSeen ? d.firstSeen.toDate().getTime() : null;
            active.push({ ...d, _lastMs: lastMs, _firstMs: firstMs });
        });

        _presenceData = active;

        // Stats
        const loggedIn = active.filter(d => !d.isGuest && d.uid).length;
        const guests   = active.filter(d => d.isGuest || !d.uid).length;
        const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
        set('prs-total',    active.length);
        set('prs-loggedin', loggedIn);
        set('prs-guests',   guests);

        if (liveDot) liveDot.style.display = active.length ? 'inline-block' : 'none';
        const sbDot = document.getElementById('sb-live-dot');
        if (sbDot) sbDot.style.display = active.length ? 'inline-block' : 'none';
        if (lastUpd) lastUpd.textContent = 'Aktualisiert: ' + new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit',second:'2-digit'});

        renderPresenceCards();

        // Sekunden-Ticker: einmalig starten, laeuft dauerhaft und tickt den Timer jede Sekunde
        if (!_presenceTickerInterval) {
            _presenceTickerInterval = setInterval(() => {
                if (_presenceData.length) renderPresenceCards();
            }, 1000);
        }
    });
}
async function cleanupOldPresence() {
    const snap=await db.collection("presence").get();const batch=db.batch();const now=Date.now();let deleted=0;
    // BUG FIX: Aligned threshold to 90s — matches loadPresence() display window.
    // Previously used 45s which deleted entries that were still shown as active.
    snap.forEach(doc=>{const d=doc.data();if(d.lastSeen){const last=d.lastSeen.toDate().getTime();if(now-last>90000){batch.delete(doc.ref);deleted++;}}});
    await batch.commit();showToast(`✅ ${deleted} alte Einträge gelöscht`,"success");
}

// ═══════════════════════════════════════════════════════
//  ANALYTICS - Custom Date Range
// ═══════════════════════════════════════════════════════
let anCustomFrom = null;
let anCustomTo   = null;

function anSetCustomRange() {
    const from = document.getElementById('an-date-from')?.value;
    const to   = document.getElementById('an-date-to')?.value;
    if (!from || !to) return;
    if (new Date(from) > new Date(to)) {
        showToast('Startdatum muss vor Enddatum liegen', 'error');
        return;
    }
    anCustomFrom = new Date(from);
    anCustomTo   = new Date(to); anCustomTo.setHours(23,59,59,999);
    anCurrentPeriod = null;
    // Deactivate period buttons, highlight date inputs
    document.querySelectorAll('.an-period-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('an-date-from').style.borderColor = 'var(--an-cyan)';
    document.getElementById('an-date-to').style.borderColor   = 'var(--an-cyan)';
    const badge = document.getElementById('an-rev-badge');
    if (badge) badge.textContent = `${from} – ${to}`;
    const lbl = document.getElementById('an-period-lbl');
    if (lbl) lbl.textContent = 'benutzerdefiniert';
    loadAnalytics();
}

// Analytics custom date range now handled directly in loadAnalytics()

// ═══════════════════════════════════════════════════════
//  PRODUCT EDIT DRAWER (replaces old modal)
// ═══════════════════════════════════════════════════════
function closePedDrawer() {
    document.getElementById('ped-overlay').classList.remove('open');
    document.getElementById('ped-drawer').classList.remove('open');
    selectedFile = null; removeCurrentImage = false;
    currentEditId = null;
}

async function openEditModal(id) {
    currentEditId = id; removeCurrentImage = false;
    const doc = await db.collection('products').doc(id).get();
    const p = doc.data();

    document.getElementById('ped-title-text').textContent = p.name;
    document.getElementById('edit-name').value             = p.name || '';
    document.getElementById('edit-price').value            = p.price || '';
    document.getElementById('edit-original-price').value  = p.originalPrice || '';
    document.getElementById('edit-cost-price').value      = p.costPrice || '';
    document.getElementById('edit-stock').value            = p.stock || '';
    document.getElementById('edit-description').value     = p.description || '';
    document.getElementById('edit-admin-notes').value     = p.adminNotes || '';
    document.getElementById('edit-new').checked           = !!p.isNew;
    document.getElementById('edit-unavailable').checked   = p.available === false;
    document.getElementById('edit-has-nicotine').checked  = p.hasNicotine !== false;

    // Live-Marge-Anzeige
    function updatePedMargin() {
        const vk = parseFloat(document.getElementById('edit-price').value) || 0;
        const ek = parseFloat(document.getElementById('edit-cost-price').value) || 0;
        const box = document.getElementById('ped-margin-box');
        if (!box) return;
        if (vk > 0 && ek > 0) {
            box.style.display = 'flex';
            const profit = vk - ek;
            const margin = (profit / vk * 100);
            const col = margin > 30 ? '#34d399' : margin > 15 ? '#fbbf24' : '#f87171';
            document.getElementById('ped-margin-val').innerHTML = `<span style="color:${col}">${margin.toFixed(1)}%</span>`;
            document.getElementById('ped-profit-val').textContent = `+${profit.toFixed(2)} € Profit`;
        } else {
            box.style.display = 'none';
        }
    }
    document.getElementById('edit-price').oninput = updatePedMargin;
    document.getElementById('edit-cost-price').oninput = updatePedMargin;
    updatePedMargin();

    // preview
    const wrap = document.getElementById('ped-preview-wrap');
    wrap.innerHTML = p.image
        ? `<img src="${p.image}" style="width:100%;height:100%;object-fit:contain">`
        : `<div class="ped-preview-ph"><i class="fa-solid fa-image"></i>Kein Bild</div>`;
    const rmBtn = document.getElementById('ped-rm-img-btn');
    if (rmBtn) rmBtn.style.display = p.image ? 'block' : 'none';

    populateCategorySelects();
    setTimeout(() => {
        csSetValue('edit-category-select', p.category || '');
    }, 100);

    // dropzone
    document.getElementById('ped-dropzone').onclick = () => {
        const inp = document.createElement('input'); inp.type='file'; inp.accept='image/*';
        inp.onchange = e => {
            selectedFile = e.target.files[0]; removeCurrentImage = false;
            document.getElementById('ped-preview-wrap').innerHTML = `<img src="${URL.createObjectURL(selectedFile)}" style="width:100%;height:100%;object-fit:contain">`;
            document.getElementById('ped-rm-img-btn').style.display='block';
        };
        inp.click();
    };

    document.getElementById('ped-overlay').classList.add('open');
    document.getElementById('ped-drawer').classList.add('open');
}

function pedRemoveImage() {
    removeCurrentImage = true;
    document.getElementById('ped-preview-wrap').innerHTML = `<div class="ped-preview-ph"><i class="fa-solid fa-trash" style="color:#f87171"></i>Wird entfernt</div>`;
    document.getElementById('ped-rm-img-btn').style.display='none';
}

function removeImageInEdit() { pedRemoveImage(); }
function closeEditModal() {
    // Schließt das Ban-Modal (#edit-modal) wenn offen
    const editModal = document.getElementById('edit-modal');
    if (editModal && !editModal.classList.contains('hidden')) {
        editModal.classList.add('hidden');
        editModal.innerHTML = '';
        return;
    }
    // Fallback: Produkt-Edit-Drawer
    closePedDrawer();
}

async function saveEdit() {
    if (!currentEditId) return;
    const name           = document.getElementById('edit-name').value;
    const price          = parseFloat(document.getElementById('edit-price').value);
    const originalPrice  = parseFloat(document.getElementById('edit-original-price').value) || null;
    const costPrice      = parseFloat(document.getElementById('edit-cost-price').value) || null;
    const stock          = parseInt(document.getElementById('edit-stock').value, 10); // BUG FIX: Radix 10 gehört zu parseInt, nicht getElementById
    const description    = document.getElementById('edit-description').value;
    const adminNotes     = document.getElementById('edit-admin-notes').value.trim();
    const isNew          = document.getElementById('edit-new').checked;
    const unavailable    = document.getElementById('edit-unavailable').checked;
    const hasNicotine    = document.getElementById('edit-has-nicotine').checked;
    const cs             = document.getElementById('edit-category-select');
    const category       = cs && cs.value ? cs.value : (isNew ? "Neue Sorten" : "Normale Sorten");

    // FIX: When saving as unavailable, force stock to 0
    const effectiveStock = unavailable ? 0 : stock;
    let data = { name, price, originalPrice, stock: effectiveStock, category, description:description||"", isNew, available:!unavailable, hasNicotine,
                 adminNotes: adminNotes || firebase.firestore.FieldValue.delete(),
                 costPrice: costPrice !== null ? costPrice : firebase.firestore.FieldValue.delete() };

    if (removeCurrentImage && !selectedFile) data.image = null;
    else if (selectedFile) {
        const fd = new FormData(); fd.append("file", selectedFile); fd.append("upload_preset", "wavevapes");
        const res = await fetch("https://api.cloudinary.com/v1_1/dbbkmjsr5/image/upload",{method:"POST",body:fd});
        const json = await res.json(); if (json.secure_url) data.image = json.secure_url;
    }
    await db.collection('products').doc(currentEditId).update(data);
    await logAction("product_updated", currentEditId, { name, category });
    closePedDrawer();
    showToast('✅ Produkt gespeichert!');
}

// ═══════════════════════════════════════════════════════
//  BULK EDIT BOTTOM SHEET
// ═══════════════════════════════════════════════════════
let _bkePillState = {}; // { available: true/false/null, new: ..., nicotine: ... }

function bkePillToggle(el, key) {
    if (_bkePillState[key] === true) { _bkePillState[key] = null; el.classList.remove('active'); }
    else { _bkePillState[key] = true; el.classList.add('active'); }
}

function _bkeOpen(ids, sourceLabel) {
    if (!ids.length) { showToast('Keine Produkte zum Bearbeiten', 'error'); return; }
    selectedProductIds = ids;
    _bkePillState = {};
    document.querySelectorAll('.bke-toggle-pill').forEach(p => p.classList.remove('active'));
    document.getElementById('bulk-price').value      = '';
    document.getElementById('bulk-price-pct').value  = '';
    document.getElementById('bulk-cost-price').value = '';
    document.getElementById('bulk-stock').value      = '';
    document.getElementById('bke-count').textContent = ids.length + ' Produkte';
    // Source banner
    const banner = document.getElementById('bke-source-text');
    if (banner) banner.textContent = sourceLabel;
    // Re-init category custom select
    const bkeCatOpts = [{ value:'', label:'Kategorie nicht ändern' }, ...allCategories.map(c=>({ value:c.name, label:c.name }))];
    initCustomSelect('bulk-category', bkeCatOpts, '', null);
    document.getElementById('bke-overlay').classList.add('open');
    document.getElementById('bke-sheet').classList.add('open');
}

function openBulkEditModal() {
    const checkedIds = [];
    document.querySelectorAll('.product-checkbox:checked').forEach(cb => checkedIds.push(cb.dataset.id));
    if (!checkedIds.length) { showToast('Bitte zuerst Produkte auswählen (oder nutze „Alle sichtbaren bulk-editieren")', 'error'); return; }
    _bkeOpen(checkedIds, `${checkedIds.length} manuell ausgewählt`);
}

function openBulkEditFiltered() {
    // Liest die aktuell sichtbaren Zeilen aus der Tabelle
    const visibleIds = Array.from(document.querySelectorAll('#products-tbody .product-checkbox')).map(cb => cb.dataset.id);
    const searchTerm = (document.getElementById('product-search').value || '').trim();
    const label = searchTerm
        ? `${visibleIds.length} gefilterte Produkte (Suche: „${searchTerm}")`
        : `${visibleIds.length} sichtbare Produkte`;
    _bkeOpen(visibleIds, label);
}

function closeBulkModal() {
    document.getElementById('bke-overlay').classList.remove('open');
    document.getElementById('bke-sheet').classList.remove('open');
}

async function executeBulkEdit() {
    const priceVal    = document.getElementById('bulk-price').value;
    const pctVal      = document.getElementById('bulk-price-pct').value;
    const costPriceVal= document.getElementById('bulk-cost-price').value;
    const stockVal    = document.getElementById('bulk-stock').value;
    const category    = csGetValue('bulk-category') || null;
    const available   = _bkePillState['available'] ?? null;
    const isNew       = _bkePillState['new']       ?? null;
    const hasNic      = _bkePillState['nicotine']   ?? null;

    // Mindestens ein Feld muss ausgefüllt sein
    if (!priceVal && !pctVal && !costPriceVal && !stockVal && !category && available===null && isNew===null && hasNic===null) {
        showToast('Bitte mindestens ein Feld ausfüllen', 'error'); return;
    }

    const saveBtn = document.querySelector('.bke-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Speichere…'; }

    try {
        let changed = 0;
        for (let i = 0; i < selectedProductIds.length; i += 400) {
            const batch = db.batch();
            selectedProductIds.slice(i, i + 400).forEach(id => {
                const updateData = {};
                if (priceVal)         updateData.price      = parseFloat(priceVal);
                else if (pctVal) {
                    const prd = allProducts.find(p => p.id === id);
                    if (prd) updateData.price = Math.round(prd.price * (1 + parseFloat(pctVal)/100) * 100) / 100;
                }
                if (costPriceVal)     updateData.costPrice  = parseFloat(costPriceVal);
                if (stockVal)         updateData.stock       = parseInt(stockVal, 10);
                if (category)         updateData.category    = category;
                if (available!==null) updateData.available   = available;
                if (isNew!==null)     updateData.isNew       = isNew;
                if (hasNic!==null)    updateData.hasNicotine = hasNic;
                if (Object.keys(updateData).length > 0) { batch.update(db.collection('products').doc(id), updateData); changed++; }
            });
            await batch.commit();
        }
        await logAction('bulk_edit', '', { count: changed, fields: { priceVal, pctVal, costPriceVal, stockVal, category } });
        closeBulkModal();
        showToast(`✅ ${changed} Produkte aktualisiert!`);
        loadProducts();
    } catch(e) {
        showToast('❌ Fehler: ' + e.message, 'error');
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Änderungen anwenden'; }
    }
}

async function logUnauthorizedAccess(reason, email=null) {
    try {
        let ip="unbekannt";
        try{const res=await fetch("https://api.ipify.org?format=json");const data=await res.json();ip=data.ip||"unbekannt";}catch(e){}
        await db.collection("unauthorized_access").add({reason:reason==="not-logged-in"?"Nicht eingeloggt":"Kein Admin-Account",email:email||"nicht eingeloggt",ip,userAgent:navigator.userAgent,referrer:document.referrer||"direkt",url:window.location.href,timestamp:firebase.firestore.FieldValue.serverTimestamp()});
    } catch(e){console.warn("Zugriff-Log fehlgeschlagen:",e);}
}
function showAccessDenied(reason) {
    document.body.innerHTML=`<div class="fixed inset-0 flex items-center justify-center z-[99999]" style="background:linear-gradient(135deg,#0a0a0a,#1e0a0a,#0a0a0a);"><div style="background:#18181b;border:1px solid rgba(239,68,68,0.4);border-radius:2rem;padding:3rem;max-width:480px;width:90%;text-align:center;animation:pop 0.4s cubic-bezier(0.34,1.56,0.64,1);"><style>@keyframes pop{from{transform:scale(0.8);opacity:0}to{transform:scale(1);opacity:1}}</style><div style="width:96px;height:96px;background:rgba(239,68,68,0.1);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;font-size:3rem;">🚫</div><h1 style="font-family:'Orbitron',sans-serif;font-size:2rem;font-weight:700;color:#ef4444;text-shadow:0 0 20px #ef4444;margin-bottom:0.75rem;">ZUGRIFF VERWEIGERT</h1><p style="color:#fca5a5;font-size:1rem;margin-bottom:0.5rem;">${reason==='not-logged-in'?'Du bist nicht angemeldet.':'Kein Administrator-Account.'}</p><div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:1rem;padding:1rem;margin:1.5rem 0;font-size:0.75rem;color:#9ca3af;">Dieser Zugriffsversuch wurde protokolliert.</div><a href="index.html" style="display:inline-block;background:linear-gradient(135deg,#ef4444,#dc2626);color:white;font-weight:700;padding:0.9rem 2.5rem;border-radius:9999px;text-decoration:none;">← Zurück zum Shop</a></div></div>`;
}

// Init static custom selects (status filter — options don't change)
function initStaticSelects() {
    initCustomSelect('admin-status-filter', [
        { value:'',            label:'Alle Produkte' },
        { value:'available',   label:'Nur verfügbar' },
        { value:'unavailable', label:'Nur nicht verfügbar' },
        { value:'new',         label:'Nur neue Sorten' },
        { value:'tornado',     label:'Nur Tornado 30000' },
        { value:'lowstock',    label:'⚠ Niedriger Bestand' },
    ], '', val => { adminStatusFilter = val; renderProductTable(); });
}

// ═══════════════════════════════════════════════════
//  BEWERTUNGS-MODERATION (Tab 11)
// ═══════════════════════════════════════════════════
let _rvAdminMode = 'pending';
let _rvAdminUnsub = null;
let _rvStatsUnsub = null;

function rvAdminSwitch(mode, btn) {
    _rvAdminMode = mode;
    document.querySelectorAll('.rv-admin-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    rvAdminLoad(mode);
}

function rvAdminLoadStats() {
    // Cancel previous stats listener
    if (_rvStatsUnsub) { _rvStatsUnsub(); _rvStatsUnsub = null; }
    // BUG-08 FIX: Doppelter Unsub-Check entfernt (zweiter Block war immer false und dead code)
    _rvStatsUnsub = db.collection('reviews').onSnapshot(snap => {
        const docs = snap.docs.map(d => d.data());
        const approved = docs.filter(d => d.approved === true);
        const pending  = docs.filter(d => d.approved === false && !d.rejected);
        const avg = approved.length
            ? (approved.reduce((s,d) => s+(d.rating||0), 0) / approved.length).toFixed(1)
            : '—';
        const statTotal   = document.getElementById('rv-stat-total');
        const statAvg     = document.getElementById('rv-stat-avg');
        const statPending = document.getElementById('rv-stat-pending');
        if (statTotal)   statTotal.textContent   = docs.length;
        if (statAvg)     statAvg.textContent     = avg;
        if (statPending) statPending.textContent = pending.length;
        // Fake-Review Zähler
        const fakeCount = docs.filter(d => d.fake === true).length;
        const statFake = document.getElementById('rv-stat-fake');
        if (statFake) statFake.textContent = fakeCount || '0';
        // Sidebar badge
        const badge = document.getElementById('sb-reviews-badge');
        if (badge) {
            badge.textContent = pending.length;
            badge.style.display = pending.length > 0 ? '' : 'none';
        }
        const pendingCount = document.getElementById('rv-pending-count');
        if (pendingCount) pendingCount.textContent = pending.length;
    }, err => console.warn('rvAdminLoadStats error:', err));
}

async function rvDeleteAllFake() {
    try {
        const snap = await db.collection('reviews').where('fake','==',true).get();
        if (snap.empty) { showToast('Keine Fake-Reviews vorhanden', 'error'); return; }
        if (!confirm(`${snap.size} Fake-Reviews endgültig löschen?`)) return;
        const batchSize = 400;
        for (let i = 0; i < snap.docs.length; i += batchSize) {
            const batch = db.batch();
            snap.docs.slice(i, i + batchSize).forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
        await logAction('fake_reviews_deleted', null, { count: snap.size });
        showToast(`🗑️ ${snap.size} Fake-Reviews gelöscht`, 'success');
    } catch(e) { showToast('❌ ' + e.message, 'error'); }
}

function rvAdminLoad(mode) {
    const listEl = document.getElementById('rv-admin-list');
    if (!listEl) return;

    // Cancel previous list listener
    if (_rvAdminUnsub) { _rvAdminUnsub(); _rvAdminUnsub = null; }

    listEl.innerHTML = '<div class="rv-admin-empty"><i class="fa-solid fa-spinner fa-spin"></i></div>';

    let query = db.collection('reviews');
    if (mode === 'pending')  query = query.where('approved','==',false);
    if (mode === 'approved') query = query.where('approved','==',true);
    if (mode === 'rejected') query = query.where('rejected','==',true);

    _rvAdminUnsub = query.limit(50).onSnapshot(snap => {
        // Sort client-side by createdAt desc — avoids composite index requirement
        const allDocs = snap.docs.map(d => ({id:d.id,...d.data()}));
        // For pending mode: exclude rejected reviews (approved==false covers both)
        const filteredDocs = mode === 'pending'
            ? allDocs.filter(r => !r.rejected)
            : allDocs;
        // Bug fix 1: b was plain object, not Firestore doc — .data() doesn't exist
        const docs = filteredDocs
            .slice()
            .sort((a, b) => {
                const ta = a.createdAt?.toDate?.() || new Date(0);
                const tb = b.createdAt?.toDate?.() || new Date(0);
                return tb - ta;
            });
        // Bug fix 2: check filteredDocs.length, not snap.empty (snap may not be empty but filter can be)
        if (filteredDocs.length === 0) {
            listEl.innerHTML = `<div class="rv-admin-empty"><i class="fa-solid fa-star"></i>${
                mode==='pending' ? 'Keine ausstehenden Bewertungen' :
                mode==='approved' ? 'Noch keine freigegebenen Bewertungen' :
                'Keine abgelehnten Bewertungen'
            }</div>`;
            return;
        }

        // Get product names from already-loaded allProducts
        const productNames = {};
        docs.forEach(r => {
            const p = allProducts.find(pr => pr.id === r.productId);
            productNames[r.productId] = p ? p.name : r.productId;
        });

        listEl.innerHTML = '';
        // Bug fix 3: iterate over filtered+sorted docs, not raw snap.docs
        docs.forEach(r => {
            const stars = [1,2,3,4,5].map(n =>
                `<span class="rv-admin-star ${n<=(r.rating||0)?'':'empty'}">★</span>`
            ).join('');
            const date = r.createdAt ? r.createdAt.toDate().toLocaleDateString('de-DE') : '—';
            const productName = productNames[r.productId] || r.productId;
            const card = document.createElement('div');
            card.className = 'rv-admin-card';
            card.innerHTML = `
                <div style="display:flex;flex-direction:column;width:100%;gap:0">
                    <div style="display:flex;align-items:flex-start;gap:16px">
                        <div class="rv-admin-stars">${stars}</div>
                        <div class="rv-admin-body">
                            <div class="rv-admin-meta">
                                <span class="rv-admin-user">${r.username || r.userEmail || 'Anonym'}</span>
                                <span class="rv-admin-product">${productName}</span>
                                <span class="rv-admin-date">${date}</span>
                            </div>
                            ${r.text ? `<div class="rv-admin-text">${r.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>` : '<div class="rv-admin-text" style="font-style:italic;opacity:.4">Kein Text</div>'}
                            ${r.adminReply ? `<div style="margin-top:10px;padding:10px 13px;background:rgba(103,232,249,.05);border:1px solid rgba(103,232,249,.15);border-radius:10px">
                                <div style="font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#67e8f9;margin-bottom:5px"><i class="fa-solid fa-shop" style="margin-right:4px"></i>Shop-Antwort veröffentlicht</div>
                                <div style="font-size:12px;color:rgba(255,255,255,.7);line-height:1.6">${r.adminReply.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
                                <button onclick="rvDeleteAdminReply('${r.id}')" style="margin-top:8px;padding:3px 9px;border-radius:6px;background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.25);color:#f87171;font-size:10px;cursor:pointer"><i class="fa-solid fa-trash" style="margin-right:3px"></i>Antwort entfernen</button>
                            </div>` : ''}
                        </div>
                        <div class="rv-admin-actions">
                            ${mode !== 'approved' ? `<button class="rv-admin-btn approve" onclick="rvAdminApprove('${r.id}')" title="Freigeben"><i class="fa-solid fa-check"></i></button>` : ''}
                            ${mode !== 'rejected' ? `<button class="rv-admin-btn reject"  onclick="rvAdminReject('${r.id}')"  title="Ablehnen"><i class="fa-solid fa-xmark"></i></button>` : ''}
                            <button class="rv-admin-btn rv-ki-btn" title="KI-Antwort"
                        data-rv-id="${r.id}"
                        data-rv-rating="${r.rating||0}"
                        data-rv-text="${(r.text||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;').slice(0,200)}"
                        data-rv-user="${(r.username||'Anonym').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}"
                        style="background:rgba(167,139,250,.15);border-color:rgba(167,139,250,.35);color:#a78bfa"
                    ><i class="fa-solid fa-wand-magic-sparkles"></i></button>
                        </div>
                    </div>
                    <div id="rv-ai-${r.id}" style="display:none;margin-top:12px"></div>
                </div>`;
            listEl.appendChild(card);
        });
    }, err => {
        listEl.textContent = '';
        const d = document.createElement('div');
        d.className = 'rv-admin-empty';
        d.textContent = 'Fehler: ' + err.message;
        listEl.appendChild(d);
    });
}

async function rvAdminApprove(reviewId) {
    try {
        await db.collection('reviews').doc(reviewId).update({ approved: true, rejected: false });
        await logAction('review_approved', reviewId);
        showToast('✅ Bewertung freigegeben!');
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

async function rvAdminReject(reviewId) {
    try {
        await db.collection('reviews').doc(reviewId).update({ approved: false, rejected: true });
        await logAction('review_rejected', reviewId);
        showToast('Bewertung abgelehnt', 'warning');
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

auth.onAuthStateChanged(async (user) => {
    if (!user) { await logUnauthorizedAccess('not-logged-in',null); showAccessDenied('not-logged-in'); return; }
    document.getElementById('admin-email').textContent = user.email;
    const userDoc = await db.collection('users').doc(user.uid).get();
    if (!userDoc.exists || userDoc.data().role !== 'admin') { await logUnauthorizedAccess('not-admin',user.email); await auth.signOut(); showAccessDenied('not-admin'); return; }

    // ── Load permissions ──
    const userData = userDoc.data();
    const superSnap = await db.collection('settings').doc('superadmin').get();
    const superUID = superSnap.exists ? superSnap.data().superadminUID : null;
    // F-04 FIX: Removed !superUID fallback — auto-super escalation on missing document eliminated.
    // Superadmin status is ONLY granted when superadminUID explicitly matches current user.
    saCurrentUserIsSuperadmin = !!superUID && (superUID === user.uid);
    window._currentAdminPerms = userData.adminPermissions || SA_PERMISSIONS.map(p => p.key);
    window._isReadOnly = !saCurrentUserIsSuperadmin && !!userData.readOnly;

    if (!saCurrentUserIsSuperadmin) {
        applyAdminPermissions(window._currentAdminPerms);
    }
    if (window._isReadOnly) {
        applyReadOnlyMode();
    }
    // ─────────────────────

    initStaticSelects();
    loadSettings();
    rvAdminLoadStats();
    // Load all data after admin check passes
    loadProducts();
    loadCategories();
    loadCoupons();
    loadUsers();
    loadOrders();
    // E-08 FIX: updateStats() and populateAdminCategoryFilter() are now called inside
    // loadProducts() and loadCategories() on their first snapshot, replacing the
    // fragile setTimeout(500) that could fire before data arrived on slow connections.
    switchTab(0);
    // New features
    requestNotifPermission();
    watchNewOrders();
    // BUG-FIX: Auto-Backup Timer im Hintergrund starten — unabhängig davon,
    // ob der Backup-Tab jemals geöffnet wird. Nur für Superadmins & Co-Superadmins.
    if (saCurrentUserIsSuperadmin || (superSnap.exists && (superSnap.data().coSuperadminUIDs || []).includes(user.uid))) {
        bkpStartBackground();
    }
    // Pre-fetch users for global search — E3-01 FIX: track for cleanup
    window._globalUsersUnsub = db.collection('users').orderBy('email').limit(500).onSnapshot(snap => { window._usrAllDocs = snap.docs; });
    // Note: _ordAllDocs is already kept in sync by loadOrders() above — no duplicate listener needed
});

// ═══════════════════════════════════════════════════════
//  KLICK-ANALYSE — Tab 15
// ═══════════════════════════════════════════════════════
let _caAllEvents   = [];   // all fetched events
let _caFiltered    = [];   // after period/search/type filter
let _caPeriodDays  = 0;    // 0 = all time (default: Alle anzeigen)
let _caTypeFilter  = '';   // '' | 'loggedin' | 'guest'
let _caPage        = 0;
const CA_PAGE_SIZE = 50;

let _caBarChart    = null;
let _caDonutChart  = null;
let _caLineChart   = null;
let _caUnsub       = null; // BUG FIX: track live listener for cleanup

// Helper: parse a Firestore click_event doc into a normalised JS object
function _caParseDoc(d) {
    const data = d.data();
    const tsRaw = data.ts || data.createdAt || null;
    // ts can be a pending FieldValue on the first snapshot tick — fall back to now
    const tsDate = tsRaw ? (tsRaw.toDate ? tsRaw.toDate() : new Date(tsRaw)) : new Date();
    return {
        id:        d.id,
        label:     data.label     || 'Unbekannt',
        // BUG FIX: explicit === true so missing-field docs are not wrongly counted as guests
        isGuest:   data.isGuest   === true,
        userId:    data.userId    || null,
        userEmail: data.userEmail || null,
        page:      data.page      || '/',
        ts:        tsDate,
        productId: data.productId || null,
    };
}

async function caWriteTestEvent() {
    try {
        await db.collection('click_events').add({
            label: 'Admin Test-Event',
            isGuest: false,
            userId: auth.currentUser ? auth.currentUser.uid : null,
            userEmail: auth.currentUser ? auth.currentUser.email : null,
            page: '/admin-test',
            ts: firebase.firestore.FieldValue.serverTimestamp(),
        });
        showToast('✅ Test-Event geschrieben — erscheint automatisch im Live-Stream', 'success');
    } catch(e) {
        showToast('❌ Schreiben fehlgeschlagen: ' + e.message, 'error');
        console.error('caWriteTestEvent error:', e);
    }
}

// BUG FIX: replaced one-shot get() with onSnapshot so new click events appear
// in the dashboard in real-time without the admin needing to click "Aktualisieren".
// The previous listener (if any) is torn down first to avoid duplicate listeners
// when the admin navigates away and back to tab 15.
function loadClickAnalytics() {
    const tbody = document.getElementById('ca-events-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:rgba(255,255,255,.2);font-size:13px"><i class="fa-solid fa-spinner fa-spin" style="margin-right:8px"></i>Verbinde Live-Stream...</td></tr>`;

    // Tear down previous listener to avoid stacking
    if (_caUnsub) { _caUnsub(); _caUnsub = null; }
    _caUnsub = db.collection('click_events')
        .limit(2000)
        .onSnapshot(snap => {
            if (snap.empty) {
                _caAllEvents = [];
                caApplyFilters();
                if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:rgba(255,255,255,.2);font-size:13px"><i class="fa-solid fa-database" style="display:block;font-size:28px;margin-bottom:10px;opacity:.3"></i>Noch keine Click-Events in Firestore.<br><span style="font-size:11px;opacity:.6">Klicke im Shop auf Produkte, Kategorien etc.</span></td></tr>`;
                return;
            }
            _caAllEvents = snap.docs.map(_caParseDoc).sort((a, b) => b.ts - a.ts);
            caApplyFilters();
        }, e => {
            console.error('loadClickAnalytics error:', e);
            const isPermission = e.code === 'permission-denied' || (e.message && e.message.includes('permission'));
            const hint = isPermission
                ? '<br><span style="font-size:11px;opacity:.7">Firestore Rules: click_events braucht allow read: if isAdmin();</span>'
                : '';
            if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:#f87171;font-size:13px"><i class="fa-solid fa-circle-exclamation" style="margin-right:8px"></i>${escA(e.message)}${escA(hint)}</td></tr>`;
        });
}

function caSetPeriod(days, btn) {
    _caPeriodDays = days;
    _caPage = 0;
    document.querySelectorAll('.ca-period-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    caApplyFilters();
}

function caSetTypeFilter(type, optEl) {
    _caTypeFilter = type;
    _caPage = 0;
    // Update trigger label
    const trigger = document.getElementById('ca-type-filter-trigger');
    if (trigger) {
        const labels = { '': 'Alle Typen', 'loggedin': 'Nur Eingeloggt', 'guest': 'Nur Gäste' };
        trigger.innerHTML = (labels[type] || 'Alle Typen') + ' <span class="cs-trigger-arrow">▼</span>';
    }
    // Close dropdown
    const wrap = document.getElementById('ca-type-filter-dd');
    if (wrap) wrap.parentElement.classList.remove('open');
    caApplyFilters();
}

// BUG FIX: was only calling caRenderTable() — KPIs and charts ignored the search term.
// caApplyFilters() rebuilds _caFiltered then calls caUpdateKPIs + caRenderCharts + caRenderTable.
function caFilterTable() { _caPage = 0; caApplyFilters(); }

function caApplyFilters() {
    const now = Date.now();
    const cutoff = _caPeriodDays > 0 ? now - _caPeriodDays * 86400000 : 0;
    const q = (document.getElementById('ca-search')?.value || '').toLowerCase();

    _caFiltered = _caAllEvents.filter(e => {
        if (cutoff && e.ts.getTime() < cutoff) return false;
        if (_caTypeFilter === 'loggedin' && e.isGuest) return false;
        if (_caTypeFilter === 'guest' && !e.isGuest) return false;
        if (q && !(e.label.toLowerCase().includes(q) || (e.userEmail||'').toLowerCase().includes(q))) return false;
        return true;
    });

    caUpdateKPIs();
    caRenderCharts();
    caRenderTopProducts();
    caRenderTable();
}

// ── Top-Produkte Ranking ────────────────────────────────────────────────────
// Aggregates product_detail (views) and add_to_cart_* (adds) events from
// _caFiltered and renders a ranked list with views, adds and conversion rate.
function caRenderTopProducts() {
    const el = document.getElementById('ca-top-products-list');
    if (!el) return;

    // Aggregate per product
    const map = {}; // productId -> { name, category, views, adds }
    _caFiltered.forEach(e => {
        const pid  = e.productId;
        const name = e.productName;
        if (!pid || !name) return; // skip events without product context

        if (!map[pid]) map[pid] = { name, category: e.category || '', views: 0, adds: 0 };

        if (e.label === 'product_detail')                            map[pid].views++;
        if (e.label === 'add_to_cart_detail' ||
            e.label === 'add_to_cart_grid')                         map[pid].adds++;
    });

    const rows = Object.entries(map)
        .map(([id, d]) => ({ id, ...d, score: d.views + d.adds * 3 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

    if (!rows.length) {
        el.innerHTML = '<div class="ca-tp-empty"><i class="fa-solid fa-box-open" style="display:block;font-size:28px;margin-bottom:8px;opacity:.2"></i>Noch keine Produktklicks erfasst</div>';
        return;
    }

    const maxViews = Math.max(...rows.map(r => r.views), 1);
    const rankMedal = ['🥇','🥈','🥉'];
    const rankClass = ['gold','silver','bronze'];

    el.innerHTML = rows.map((r, i) => {
        const pct  = Math.round(r.views / maxViews * 100);
        const conv = r.views > 0 ? Math.round(r.adds / r.views * 100) : 0;
        // Colour the conversion badge: ≥30% green, 10–29% amber, <10% muted
        const convColor = conv >= 30 ? '#34d399' : conv >= 10 ? '#fbbf24' : 'rgba(255,255,255,.25)';
        const barColor  = i === 0 ? 'linear-gradient(90deg,#67e8f9,#a78bfa)'
                        : i === 1 ? 'linear-gradient(90deg,#a78bfa,#818cf8)'
                        : 'linear-gradient(90deg,rgba(103,232,249,.5),rgba(167,139,250,.5))';
        const medal = i < 3 ? `<span style="font-size:15px">${rankMedal[i]}</span>`
                            : `<span class="ca-tp-rank">${i + 1}</span>`;
        const safeName = r.name.replace(/</g,'&lt;');
        const safeCat  = r.category.replace(/</g,'&lt;');
        return `<div class="ca-tp-row">
            <div style="text-align:center">${medal}</div>
            <div>
                <div class="ca-tp-name" title="${safeName}">${safeName}</div>
                ${safeCat ? `<div class="ca-tp-cat">${safeCat}</div>` : ''}
            </div>
            <div class="ca-tp-num" style="color:#67e8f9">${r.views.toLocaleString('de-DE')}</div>
            <div class="ca-tp-num" style="color:#a78bfa">${r.adds.toLocaleString('de-DE')}</div>
            <div>
                <div class="ca-tp-bar-wrap">
                    <div class="ca-tp-bar" style="width:${pct}%;background:${barColor}"></div>
                </div>
            </div>
            <div class="ca-tp-conv" style="color:${convColor}">${conv}%</div>
        </div>`;
    }).join('');
}

function caUpdateKPIs() {
    const total    = _caFiltered.length;
    const loggedin = _caFiltered.filter(e => !e.isGuest).length;
    const guests   = _caFiltered.filter(e => e.isGuest).length;

    // Top element
    const freq = {};
    _caFiltered.forEach(e => { freq[e.label] = (freq[e.label] || 0) + 1; });
    const topLabel = Object.entries(freq).sort((a,b) => b[1]-a[1])[0];

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('ca-kpi-total',    total.toLocaleString('de-DE'));
    set('ca-kpi-loggedin', loggedin.toLocaleString('de-DE'));
    set('ca-kpi-guests',   guests.toLocaleString('de-DE'));
    set('ca-kpi-top',      topLabel ? `${topLabel[0].slice(0,28)}${topLabel[0].length>28?'…':''} (${topLabel[1]}x)` : '—');
}

function caRenderCharts() {
    // ── Top 10 Bar Chart ──
    const freq = {};
    _caFiltered.forEach(e => { freq[e.label] = (freq[e.label] || 0) + 1; });
    const sorted = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0,10);
    const barLabels = sorted.map(([l]) => l.length > 28 ? l.slice(0,28)+'…' : l);
    const barData   = sorted.map(([,v]) => v);

    const barCtx = document.getElementById('ca-bar-chart');
    if (barCtx) {
        if (_caBarChart) _caBarChart.destroy();
        _caBarChart = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: barLabels,
                datasets: [{
                    label: 'Klicks',
                    data: barData,
                    backgroundColor: barData.map((_, i) =>
                        `hsla(${190 - i * 12},90%,65%,${0.85 - i * 0.05})`
                    ),
                    borderRadius: 8,
                    borderSkipped: false,
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: {
                    callbacks: { label: ctx => ` ${ctx.raw} Klicks` }
                }},
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: 'rgba(255,255,255,.4)', font: { size: 11 } } },
                    y: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,.6)', font: { size: 10 } } }
                }
            }
        });
    }

    // ── Donut Chart: Gast vs Eingeloggt ──
    const loggedCount = _caFiltered.filter(e => !e.isGuest).length;
    const guestCount  = _caFiltered.filter(e => e.isGuest).length;
    const donutCtx = document.getElementById('ca-donut-chart');
    if (donutCtx) {
        if (_caDonutChart) _caDonutChart.destroy();
        _caDonutChart = new Chart(donutCtx, {
            type: 'doughnut',
            data: {
                labels: ['Eingeloggt', 'Gast'],
                datasets: [{
                    data: [loggedCount, guestCount],
                    backgroundColor: ['rgba(167,139,250,.85)', 'rgba(251,191,36,.85)'],
                    borderColor: ['#a78bfa', '#fbbf24'],
                    borderWidth: 2,
                    hoverOffset: 8,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: {
                        label: ctx => ` ${ctx.label}: ${ctx.raw} (${_caFiltered.length ? Math.round(ctx.raw/_caFiltered.length*100) : 0}%)`
                    }}
                }
            }
        });
    }

    // ── Line Chart: Verlauf ──
    // BUG FIX 1: "Alle" used to cap at 30 days — now shows up to 90.
    // BUG FIX 2: Key was dd.mm without year — collisions across calendar years.
    //            Key is now dd.mm.yyyy so Jan 5 2025 ≠ Jan 5 2026.
    const dayBuckets = {};
    const daysToShow = _caPeriodDays > 0 ? Math.min(_caPeriodDays, 90) : 90;
    const now = new Date();
    const dayKey = d => d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' });
    for (let i = daysToShow - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        dayBuckets[dayKey(d)] = { all: 0, loggedin: 0, guest: 0 };
    }
    _caFiltered.forEach(e => {
        const key = dayKey(e.ts);
        if (dayBuckets[key]) {
            dayBuckets[key].all++;
            if (e.isGuest) dayBuckets[key].guest++;
            else dayBuckets[key].loggedin++;
        }
    });
    const lineLabels = Object.keys(dayBuckets);
    const lineCtx = document.getElementById('ca-line-chart');
    if (lineCtx) {
        if (_caLineChart) _caLineChart.destroy();
        _caLineChart = new Chart(lineCtx, {
            type: 'line',
            data: {
                labels: lineLabels,
                datasets: [
                    {
                        label: 'Alle', data: lineLabels.map(k => dayBuckets[k].all),
                        borderColor: '#67e8f9', backgroundColor: 'rgba(103,232,249,.07)',
                        borderWidth: 2, tension: 0.4, fill: true, pointRadius: 3,
                        pointBackgroundColor: '#67e8f9',
                    },
                    {
                        label: 'Eingeloggt', data: lineLabels.map(k => dayBuckets[k].loggedin),
                        borderColor: '#a78bfa', backgroundColor: 'transparent',
                        borderWidth: 1.5, tension: 0.4, borderDash: [4,3],
                        pointRadius: 2, pointBackgroundColor: '#a78bfa',
                    },
                    {
                        label: 'Gäste', data: lineLabels.map(k => dayBuckets[k].guest),
                        borderColor: '#fbbf24', backgroundColor: 'transparent',
                        borderWidth: 1.5, tension: 0.4, borderDash: [4,3],
                        pointRadius: 2, pointBackgroundColor: '#fbbf24',
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: 'rgba(255,255,255,.35)', font: { size: 10 } } },
                    y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: 'rgba(255,255,255,.35)', font: { size: 10 } }, beginAtZero: true }
                }
            }
        });
    }
}

function caRenderTable() {
    const tbody = document.getElementById('ca-events-tbody');
    if (!tbody) return;

    const q = (document.getElementById('ca-search')?.value || '').toLowerCase();
    let list = _caFiltered;
    if (q) list = list.filter(e =>
        e.label.toLowerCase().includes(q) || (e.userEmail||'').toLowerCase().includes(q)
    );

    const total = list.length;
    const start = _caPage * CA_PAGE_SIZE;
    const page  = list.slice(start, start + CA_PAGE_SIZE);

    if (!page.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:rgba(255,255,255,.2);font-size:13px"><i class="fa-solid fa-magnifying-glass-minus" style="display:block;font-size:28px;margin-bottom:10px;opacity:.3"></i>Keine Events gefunden</td></tr>`;
    } else {
        tbody.innerHTML = page.map(e => {
            const time = e.ts
                ? e.ts.toLocaleString('de-DE', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'})
                : '—';
            const userType = e.isGuest
                ? `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:99px;font-size:9px;font-weight:700;background:rgba(251,191,36,.12);color:#fbbf24;border:1px solid rgba(251,191,36,.2)"><i class="fa-solid fa-user-secret"></i> Gast</span>`
                : `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:99px;font-size:9px;font-weight:700;background:rgba(167,139,250,.12);color:#a78bfa;border:1px solid rgba(167,139,250,.2)"><i class="fa-solid fa-user-check"></i> Eingeloggt</span>`;
            const emailStr = e.userEmail
                ? `<span style="font-size:11px;color:rgba(255,255,255,.55)">${e.userEmail}</span>`
                : `<span style="font-size:11px;color:rgba(255,255,255,.2)">—</span>`;
            const pageStr = e.page || '/';
            return `<tr style="border-bottom:1px solid rgba(255,255,255,.04);transition:background .13s" onmouseover="this.style.background='rgba(103,232,249,.03)'" onmouseout="this.style.background=''">
                <td style="padding:10px 14px;font-size:11px;color:rgba(255,255,255,.4);font-family:'JetBrains Mono',monospace;white-space:nowrap">${time}</td>
                <td style="padding:10px 14px;font-size:12px;font-weight:600;color:rgba(255,255,255,.85);max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.label}</td>
                <td style="padding:10px 14px">${emailStr}</td>
                <td style="padding:10px 14px">${userType}</td>
                <td style="padding:10px 14px;font-size:11px;color:rgba(255,255,255,.3);font-family:'JetBrains Mono',monospace">${pageStr}</td>
            </tr>`;
        }).join('');
    }

    // Footer
    const showLbl = document.getElementById('ca-showing-label');
    if (showLbl) showLbl.textContent = `${Math.min(start+1,total)}–${Math.min(start+CA_PAGE_SIZE,total)} von ${total.toLocaleString('de-DE')} Events`;
    const prevBtn = document.getElementById('ca-prev-btn');
    const nextBtn = document.getElementById('ca-next-btn');
    if (prevBtn) prevBtn.disabled = _caPage === 0;
    if (nextBtn) nextBtn.disabled = start + CA_PAGE_SIZE >= total;
}

function caPagePrev() { if (_caPage > 0) { _caPage--; caRenderTable(); } }
function caPageNext() { _caPage++; caRenderTable(); }

function caExportCSV() {
    if (!_caFiltered.length) { showToast('Keine Daten zum Exportieren', 'warning'); return; }
    const rows = [['Zeitstempel','Label','Nutzer-Typ','E-Mail','Seite']];
    _caFiltered.forEach(e => {
        rows.push([
            e.ts ? e.ts.toLocaleString('de-DE') : '',
            e.label,
            e.isGuest ? 'Gast' : 'Eingeloggt',
            e.userEmail || '',
            e.page || ''
        ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type:'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
        href: url,
        download: `klick-analyse-${new Date().toISOString().slice(0,10)}.csv`
    });
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    showToast(`✅ ${_caFiltered.length} Events exportiert`);
}

// All data loading is triggered from auth.onAuthStateChanged after admin check
// window.onload only handles UI init that doesn't need auth
window.onload = () => {
    // Delegated listener for KI-Antwort buttons in Bewertungen tab
    // Using data attributes avoids HTML-escaping issues with inline onclick JSON
    document.addEventListener('click', e => {
        const btn = e.target.closest('.rv-ki-btn');
        if (!btn) return;
        const id     = btn.dataset.rvId;
        const rating = parseInt(btn.dataset.rvRating, 10) || 0;
        const text   = btn.dataset.rvText   || '';
        const user   = btn.dataset.rvUser   || 'Anonym';
        aiReviewReply(id, rating, text, user);
    });
};

// OPT 5: Clean up all active Firestore listeners on page unload to prevent
// memory leaks during long admin sessions.
window.addEventListener('beforeunload', () => {
    const listeners = [
        logsUnsubscribe,
        _ordersUnsub,
        _watchOrdersUnsub,
        _rvAdminUnsub,
        _rvStatsUnsub,
        _caUnsub   // BUG FIX: clean up click-analytics live listener on unload
    ];
    listeners.forEach(fn => { try { if (typeof fn === 'function') fn(); } catch(e) {} });
});
