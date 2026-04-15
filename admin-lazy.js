/**
 * admin-lazy.js
 * Lädt Tab-Inhalte per fetch() beim ersten Klick (Lazy Loading).
 * Muss NACH admin-main.js eingebunden werden.
 */

(function () {
    'use strict';

    // Warte bis admin-main.js fertig ist
    function patchSwitchTab() {
        if (typeof switchTab !== 'function') {
            setTimeout(patchSwitchTab, 50);
            return;
        }

        const _originalSwitchTab = switchTab;

        window.switchTab = function (n) {
            const tc = document.getElementById('tab-content-' + n);

            // Kein lazy-Element → direkt originales switchTab
            if (!tc || tc.getAttribute('data-lazy') !== 'true') {
                return _originalSwitchTab(n);
            }

            // Tab noch nicht geladen → fetch
            const url = 'admin-tab-' + n + '.html';

            // Sofort sichtbar machen (Spinner läuft bereits im Placeholder)
            // Erst das originale Switching durchführen (zeigt Spinner)
            _originalSwitchTab(n);

            fetch(url + '?v=' + (window._adminCacheVersion || Date.now()))
                .then(function (resp) {
                    if (!resp.ok) throw new Error('HTTP ' + resp.status + ' beim Laden von ' + url);
                    return resp.text();
                })
                .then(function (html) {
                    tc.innerHTML = html;
                    tc.removeAttribute('data-lazy');

                    // Tab-spezifische Initialisierungen nach Inject
                    _triggerTabInit(n);

                    // Read-only Buttons sperren falls nötig
                    if (window._isReadOnly && typeof markWriteButtons === 'function') {
                        setTimeout(markWriteButtons, 150);
                    }
                })
                .catch(function (err) {
                    console.error('[admin-lazy] Fehler:', err);
                    tc.innerHTML = '<div style="padding:40px;text-align:center;color:#f87171">⚠️ Tab konnte nicht geladen werden.<br><small>' + err.message + '</small></div>';
                });
        };

        console.log('[admin-lazy] switchTab erfolgreich gepatcht');
    }

    // Tab-spezifische Loader nach lazy inject aufrufen
    function _triggerTabInit(n) {
        try {
            if (n === 0 && typeof loadProducts === 'function') loadProducts();
            if (n === 1 && typeof renderOrdersTable === 'function') renderOrdersTable();
            if (n === 2 && typeof usrRenderTable === 'function') usrRenderTable();
            if (n === 4 && typeof loadCoupons === 'function') loadCoupons();
            if (n === 5 && typeof loadAnalytics === 'function') loadAnalytics();
            if (n === 6) {
                if (typeof loadUnauthorizedLogs === 'function') loadUnauthorizedLogs();
                if (typeof loadBannedIPs === 'function') loadBannedIPs();
            }
            if (n === 7 && typeof loadSettings === 'function') loadSettings();
            if (n === 8) {
                (async () => {
                    if (typeof loadBundles === 'function' && !window._bundles?.length) await loadBundles();
                    if (typeof loadProductOrder === 'function') await loadProductOrder();
                })();
            }
            if (n === 9 && typeof loadPresence === 'function') {
                loadPresence();
                if (window.presenceRefreshInterval) clearInterval(window.presenceRefreshInterval);
                window.presenceRefreshInterval = setInterval(function () {
                    const el = document.getElementById('tab-content-9');
                    if (el && !el.classList.contains('hidden')) loadPresence();
                }, 15000);
            }
            if (n === 10 && typeof loadExtendedUsers === 'function') loadExtendedUsers();
            if (n === 11) {
                if (typeof rvAdminLoad === 'function') rvAdminLoad('pending');
                if (typeof rvAdminLoadStats === 'function') rvAdminLoadStats();
            }
            if (n === 13 && typeof loadCustomerOverview === 'function') loadCustomerOverview();
            if (n === 14 && typeof loadPromos === 'function') loadPromos();
            if (n === 15 && typeof loadClickAnalytics === 'function') loadClickAnalytics();
            if (n === 16) {
                if (typeof loadPromos === 'function' && !window._promos?.length) loadPromos();
                if (typeof loadBundles === 'function') loadBundles();
            }
            if (n === 17 && typeof loadAdminLogs === 'function') loadAdminLogs();
            if (n === 18 && typeof frvInit === 'function') frvInit();
        } catch (e) {
            console.warn('[admin-lazy] _triggerTabInit Fehler bei Tab', n, e);
        }
    }

    // Spinner-Animation CSS einmalig hinzufügen
    const style = document.createElement('style');
    style.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(style);

    patchSwitchTab();
})();
