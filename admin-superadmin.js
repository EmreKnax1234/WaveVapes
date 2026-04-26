// ═══════════════════════════════════════════════════════
//  SUPERADMIN ZONE — vollständiges System
// ═══════════════════════════════════════════════════════

// Permission definitions — which tabs each permission controls
const SA_PERMISSIONS = [
    { key:'products',    label:'Produkte',       icon:'fa-box',             tab:0  },
    { key:'orders',      label:'Bestellungen',   icon:'fa-receipt',         tab:1  },
    { key:'users',       label:'Benutzer',        icon:'fa-users',           tab:2  },
    { key:'categories',  label:'Kategorien',      icon:'fa-tags',            tab:3  },
    { key:'coupons',     label:'Gutscheine',      icon:'fa-ticket',          tab:4  },
    { key:'analytics',   label:'Analytics',       icon:'fa-chart-line',      tab:5  },
    { key:'superadmin',   label:'Superadmin Zone', icon:'fa-shield-halved',   tab:12 },
    { key:'settings',    label:'Settings',        icon:'fa-sliders',         tab:7  },
    { key:'sorting',     label:'Sortierung',      icon:'fa-arrows-up-down',  tab:8  },
    { key:'liveonline',  label:'Live Online',     icon:'fa-users-viewfinder',tab:9  },
    { key:'extusers',    label:'Erw. Benutzer',   icon:'fa-users-cog',       tab:10 },
    { key:'reviews',     label:'Bewertungen',     icon:'fa-star',            tab:11 },
    { key:'clicks',      label:'Klick-Analyse',   icon:'fa-computer-mouse',  tab:15 },
    { key:'bundles',     label:'Bundles',          icon:'fa-layer-group',     tab:16 },
    { key:'adminlogs',   label:'Admin Logs',       icon:'fa-list-check',      tab:17 },
    { key:'reviewgen',   label:'Review Generator', icon:'fa-wand-magic-sparkles', tab:18 },
];

let saUnlocked = false;
let currentIP = '';
let saAllAdmins = [];
let saIPWhitelist = [];
let saCurrentUserIsSuperadmin = false;
let saIsPrimaryAdmin = false;        // true = original Superadmin (kann andere promoten/demoten)
let saCoSuperadminUIDs = [];         // UIDs der Co-Superadmins

// ── Fetch current IP ──────────────────────────────────
async function saFetchIP() {
    // Try multiple services in case one is blocked or returns wrong format
    // Try multiple IPv4-only services as fallbacks
    const isValidIPv4 = s => /^\d{1,3}(\.\d{1,3}){3}$/.test(String(s).trim());
    const services = [
        // ipify api4 — IPv4-forced subdomain
        () => fetch('https://api4.ipify.org?format=json', {cache:'no-store'}).then(r => r.json()).then(d => d.ip),
        // AWS checkip — extremely reliable, plain-text IPv4
        () => fetch('https://checkip.amazonaws.com', {cache:'no-store'}).then(r => r.text()).then(s => s.trim()),
        // icanhazip IPv4-only
        () => fetch('https://ipv4.icanhazip.com', {cache:'no-store'}).then(r => r.text()).then(s => s.trim()),
        // ident.me IPv4-only
        () => fetch('https://v4.ident.me', {cache:'no-store'}).then(r => r.text()).then(s => s.trim()),
        // Cloudflare trace — validate result is IPv4 before accepting
        async () => {
            const t = await fetch('https://www.cloudflare.com/cdn-cgi/trace', {cache:'no-store'}).then(r => r.text());
            const m = t.match(/^ip=(.+)$/m);
            const ip = m ? m[1].trim() : '';
            return isValidIPv4(ip) ? ip : '';
        },
        // ipecho plain text
        () => fetch('https://ipecho.net/plain', {cache:'no-store'}).then(r => r.text()).then(s => s.trim()),
        // my-ip.io JSON
        () => fetch('https://api.my-ip.io/v2/ip.json', {cache:'no-store'}).then(r => r.json()).then(d => d.ip),
    ];
    const isValidIP = isValidIPv4;
    for (const svc of services) {
        try {
            const ip = String(await svc()).trim();
            if (ip && isValidIP(ip)) {
                currentIP = ip;
                document.querySelectorAll('#sa-ip-display, #sa-current-ip-display').forEach(el => {
                    if (el) el.textContent = currentIP;
                });
                return currentIP;
            }
        } catch(e) { /* try next */ }
    }
    document.querySelectorAll('#sa-ip-display, #sa-current-ip-display').forEach(el => {
        if (el) el.textContent = 'Unbekannt';
    });
    return '';
}

// ── Open Re-Auth Modal ────────────────────────────────
async function openSuperadminZone() {
    // Always show modal first
    document.getElementById('sa-reauth-modal').style.display = 'flex';
    document.getElementById('sa-reauth-error').textContent = '';
    document.getElementById('sa-reauth-password').value = '';
    document.getElementById('sa-reauth-btn').disabled = false;

    // Fetch IP & check whitelist
    const ip = await saFetchIP();
    await saCheckIPStatus(ip);

    setTimeout(() => document.getElementById('sa-reauth-password').focus(), 100);
}

async function saCheckIPStatus(ip) {
    const statusEl = document.getElementById('sa-ip-status');
    if (!statusEl) return;
    try {
        const snap = await db.collection('settings').doc('superadmin').get();
        const data = snap.exists ? snap.data() : {};
        saIPWhitelist = (data.allowedIPs || []).map(i => String(i).trim());
        const forceIP = (data.security || {}).forceIP === true;
        const cleanIP = (ip || '').trim();
        // If IP cannot be determined: only block if forceIP is explicitly enabled
        const ipUnknown = !cleanIP;
        const allowed = ipUnknown
            ? !forceIP
            : (!(forceIP || saIPWhitelist.length > 0) || saIPWhitelist.includes(cleanIP));
        if (ipUnknown && !forceIP) {
            statusEl.textContent = '⚠️ IP nicht ermittelbar (DS-Lite/IPv6) – nur Passwort wird geprüft';
            statusEl.style.color = '#fbbf24';
        } else if (allowed) {
            statusEl.textContent = '✅ IP-Adresse ist in der Whitelist';
            statusEl.style.color = '#34d399';
        } else {
            statusEl.textContent = `⛔ IP ${cleanIP} ist NICHT in der Whitelist`;
            statusEl.style.color = '#f87171';
        }
        return allowed;
    } catch(e) {
        statusEl.textContent = 'Whitelist konnte nicht geladen werden';
        return true; // fail open for initial setup
    }
}

function saCloseReauthModal() {
    document.getElementById('sa-reauth-modal').style.display = 'none';
}

// ── Submit Re-Auth ────────────────────────────────────
async function saSubmitReauth() {
    const pw = document.getElementById('sa-reauth-password').value;
    const errEl = document.getElementById('sa-reauth-error');
    const btn = document.getElementById('sa-reauth-btn');
    errEl.textContent = '';

    if (!pw) { errEl.textContent = 'Bitte Passwort eingeben.'; return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> &nbsp;Prüfe...';

    try {
        // Check IP whitelist (if entries exist)
        const snap = await db.collection('settings').doc('superadmin').get();
        const data = snap.exists ? snap.data() : {};
        saIPWhitelist = (data.allowedIPs || []).map(i => String(i).trim());
        const forceIP = (data.security || {}).forceIP === true;
        const ip = ((currentIP || await saFetchIP()) || '').trim();

        // If IP is unknown (DS-Lite/IPv6-only): skip whitelist check unless forceIP is explicitly enabled
        const ipUnknown = !ip;
        if (!ipUnknown && (forceIP || saIPWhitelist.length > 0) && !saIPWhitelist.includes(ip)) {
            errEl.textContent = '⛔ Deine IP-Adresse ist nicht in der Whitelist.';
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-unlock"></i> &nbsp;Zugang bestätigen';
            return;
        }
        if (ipUnknown && forceIP) {
            // DS-Lite: forceIP cannot apply, proceed with password-only auth
        }

        // Re-authenticate with Firebase
        const user = auth.currentUser;
        const credential = firebase.auth.EmailAuthProvider.credential(user.email, pw);
        await user.reauthenticateWithCredential(credential);

        // Check superadmin flag in Firestore
        const userDoc = await db.collection('users').doc(user.uid).get();
        const userData = userDoc.data() || {};

        // Superadmin must be set manually in Firestore — no auto-promote
        const anySuper = (data.superadminUID || null);
        if (!anySuper) {
            errEl.textContent = '⛔ Kein Superadmin konfiguriert. Bitte superadminUID manuell in Firestore setzen.';
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-unlock"></i> &nbsp;Zugang bestätigen';
            return;
        } else {
            saCoSuperadminUIDs = data.coSuperadminUIDs || [];
            const isPrimary = data.superadminUID === user.uid;
            const isCoSuper = saCoSuperadminUIDs.includes(user.uid);
            saCurrentUserIsSuperadmin = isPrimary || isCoSuper;
            saIsPrimaryAdmin = isPrimary;
        }

        if (!saCurrentUserIsSuperadmin) {
            errEl.textContent = '⛔ Du bist kein Superadmin.';
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-unlock"></i> &nbsp;Zugang bestätigen';
            return;
        }

        // Unlock!
        saUnlocked = true;
        saCloseReauthModal();
        await logAction('superadmin_zone_access', user.uid, { ip });
        if (window.saOpenTab) window.saOpenTab(); else saOpenTab();

    } catch(e) {
        if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
            errEl.textContent = '❌ Falsches Passwort.';
        } else if (e.code === 'auth/too-many-requests') {
            errEl.textContent = '⏳ Zu viele Versuche. Bitte warte kurz.';
        } else {
            errEl.textContent = 'Fehler: ' + (e.message || e.code);
        }
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-unlock"></i> &nbsp;Zugang bestätigen';
    }
}

// ── Open Tab 12 ───────────────────────────────────────
function saOpenTab() {
    // Update TAB_NAMES
    TAB_NAMES[12] = 'Superadmin Zone';

    document.querySelectorAll('.sidebar-item, .sidebar-item-locked').forEach(el => el.classList.remove('tab-active'));
    document.getElementById('sidebar-12').classList.add('tab-active');
    document.querySelectorAll('[id^="tab-content-"]').forEach(el => el.classList.add('hidden'));
    document.getElementById('tab-content-12').classList.remove('hidden');
    const bc = document.getElementById('hdr-tab-name');
    if (bc) bc.textContent = '🛡️ Superadmin Zone';

    // Update session info
    document.getElementById('sa-session-info').textContent =
        `Sitzung aktiv • ${new Date().toLocaleTimeString('de-DE')} • ${auth.currentUser?.email}`;
    document.getElementById('sa-current-ip-display').textContent = currentIP || '...';

    saLoadAdmins();
    saLoadIPWhitelist();
}

// ── Lock Zone ─────────────────────────────────────────
function saLockZone() {
    saUnlocked = false;
    document.getElementById('sidebar-12').classList.remove('tab-active');
    switchTab(0);
    showToast('🔒 Superadmin Zone gesperrt');
}

// ── Load Admins ───────────────────────────────────────
async function saLoadAdmins() {
    const grid = document.getElementById('sa-admin-grid');
    grid.innerHTML = '<div style="color:rgba(255,255,255,.2);font-size:13px;padding:20px"><i class="fa-solid fa-spinner fa-spin" style="margin-right:8px"></i>Lade Admins...</div>';

    const snap = await db.collection('users').where('role','==','admin').get();
    const superSnap = await db.collection('settings').doc('superadmin').get();
    const superUID = superSnap.exists ? superSnap.data().superadminUID : null;
    saCoSuperadminUIDs = superSnap.exists ? (superSnap.data().coSuperadminUIDs || []) : [];

    saAllAdmins = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (saAllAdmins.length === 0) {
        grid.innerHTML = '<div style="color:rgba(255,255,255,.2);font-size:13px;padding:20px">Keine Admins gefunden.</div>';
        return;
    }

    grid.innerHTML = '';
    saAllAdmins.forEach(admin => {
        const isPrimary = admin.id === superUID;
        const isCoSuper = saCoSuperadminUIDs.includes(admin.id);
        const isSuper   = isPrimary || isCoSuper;
        const perms = admin.adminPermissions || SA_PERMISSIONS.map(p => p.key); // default: all
        const card = document.createElement('div');
        card.className = `sa-admin-card${isPrimary ? ' is-super' : isCoSuper ? ' is-cosuper' : ''}`;
        card.id = `sa-card-${admin.id}`;

        const initials = (admin.email || '?').substring(0,2).toUpperCase();
        const permsHTML = SA_PERMISSIONS.map(p => `
            <div class="sa-perm-toggle ${perms.includes(p.key) ? 'active' : ''}"
                 id="sap-${admin.id}-${p.key}"
                 onclick="saTogglePerm('${admin.id}','${p.key}',this)"
                 title="${p.label}">
                <div class="sa-perm-dot"></div>
                <i class="fa-solid ${p.icon}"></i>
                <span>${p.label}</span>
            </div>`).join('');

        // Badge-Text & Avatar-Klasse
        const badgeClass = isPrimary ? 'super' : isCoSuper ? 'cosuper' : 'regular';
        const badgeLabel = isPrimary
            ? '<i class="fa-solid fa-crown"></i> Superadmin'
            : isCoSuper
                ? '<i class="fa-solid fa-shield-halved"></i> Co-Superadmin'
                : '<i class="fa-solid fa-user-shield"></i> Admin';
        const avatarClass = isPrimary ? '' : isCoSuper ? 'cosuper' : 'regular';

        // Info-Banner
        const infoBanner = isPrimary
            ? `<div style="font-size:11px;color:rgba(251,191,36,.5);padding:8px 12px;border-radius:10px;background:rgba(251,191,36,.05);border:1px solid rgba(251,191,36,.1);margin-bottom:12px"><i class="fa-solid fa-crown" style="margin-right:6px"></i>Primärer Superadmin — kann nicht entfernt oder degradiert werden.</div>`
            : isCoSuper
                ? `<div style="font-size:11px;color:rgba(251,146,60,.5);padding:8px 12px;border-radius:10px;background:rgba(251,146,60,.05);border:1px solid rgba(251,146,60,.1);margin-bottom:12px"><i class="fa-solid fa-shield-halved" style="margin-right:6px"></i>Co-Superadmin — hat alle Rechte, kann aber den primären Superadmin nicht entfernen.</div>`
                : '';

        // Aktions-Buttons (nur sichtbar für primären Superadmin)
        let actionsHTML = '';
        if (saIsPrimaryAdmin) {
            if (isPrimary) {
                // Eigene Karte — keine Aktionen
                actionsHTML = '';
            } else if (isCoSuper) {
                // Co-Superadmin degradieren
                actionsHTML = `
                <button class="sa-btn-demote" onclick="saDemoteSuperadmin('${admin.id}','${admin.email}')" title="Superadmin-Status entziehen">
                    <i class="fa-solid fa-chevron-down"></i> Degradieren
                </button>
                <button class="sa-btn-remove" onclick="saRemoveAdmin('${admin.id}','${admin.email}')" title="Admin-Rechte entziehen">
                    <i class="fa-solid fa-user-minus"></i>
                </button>`;
            } else {
                // Regulären Admin promoten oder entfernen
                actionsHTML = `
                <button class="sa-btn-save" onclick="saSavePerms('${admin.id}')">
                    <i class="fa-solid fa-floppy-disk"></i> Rechte speichern
                </button>
                <button class="sa-btn-promote" onclick="saPromoteToSuperadmin('${admin.id}','${admin.email}')" title="Zum Superadmin machen">
                    <i class="fa-solid fa-crown"></i>
                </button>
                <button class="sa-btn-remove" onclick="saRemoveAdmin('${admin.id}','${admin.email}')" title="Admin-Rechte entziehen">
                    <i class="fa-solid fa-user-minus"></i>
                </button>`;
            }
        } else {
            // Co-Superadmin sieht Buttons für reguläre Admins, aber NICHT für den primären
            if (!isPrimary && !isCoSuper) {
                actionsHTML = `
                <button class="sa-btn-save" onclick="saSavePerms('${admin.id}')">
                    <i class="fa-solid fa-floppy-disk"></i> Rechte speichern
                </button>
                <button class="sa-btn-remove" onclick="saRemoveAdmin('${admin.id}','${admin.email}')" title="Admin-Rechte entziehen">
                    <i class="fa-solid fa-user-minus"></i>
                </button>`;
            }
        }

        card.innerHTML = `
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px">
                <div style="display:flex;align-items:center;gap:12px">
                    <div class="sa-admin-avatar ${avatarClass}">${initials}</div>
                    <div>
                        <div class="sa-admin-email">${escA(admin.email || admin.id)}</div>
                        <div class="sa-admin-uid">${admin.id.substring(0,16)}...</div>
                        ${admin.username ? `<div style="font-size:11px;color:rgba(255,255,255,.35);margin-top:2px">@${escA(admin.username)}</div>` : ''}
                        ${admin.lastAdminLogin ? `<div style="font-size:10px;color:rgba(255,255,255,.2);margin-top:2px;font-family:'JetBrains Mono',monospace"><i class="fa-solid fa-clock" style="margin-right:4px;opacity:.5"></i>${new Date(admin.lastAdminLogin?.toDate?.() || admin.lastAdminLogin).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>` : '<div style="font-size:10px;color:rgba(255,255,255,.15);margin-top:2px"><i class="fa-solid fa-clock" style="margin-right:4px;opacity:.4"></i>Noch kein Login aufgezeichnet</div>'}
                    </div>
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
                    <div class="sa-role-badge ${badgeClass}">${badgeLabel}</div>
                    ${admin.readOnly ? `<div class="sa-role-badge" style="background:rgba(255,255,255,.07);color:rgba(255,255,255,.35);border:1px solid rgba(255,255,255,.1);font-size:10px"><i class="fa-solid fa-eye"></i> Nur-Lesen</div>` : ''}
                    ${admin.twoFactorEnabled ? `<div class="sa-role-badge" style="background:rgba(52,211,153,.1);color:#34d399;border:1px solid rgba(52,211,153,.2);font-size:10px"><i class="fa-solid fa-shield-check"></i> 2FA aktiv</div>` : `<div class="sa-role-badge" style="background:rgba(248,113,113,.07);color:rgba(248,113,113,.5);border:1px solid rgba(248,113,113,.15);font-size:10px"><i class="fa-solid fa-shield-exclamation"></i> Kein 2FA</div>`}
                </div>
            </div>
            ${infoBanner}
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                <div style="font-size:11px;color:rgba(255,255,255,.25);font-weight:600;letter-spacing:.05em">BERECHTIGUNGEN</div>
                ${!isSuper && saIsPrimaryAdmin ? `<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:rgba(255,255,255,.35);cursor:pointer;user-select:none">
                    <input type="checkbox" id="sa-readonly-${admin.id}" ${admin.readOnly?'checked':''} onchange="saToggleReadOnly('${admin.id}',this.checked)" style="accent-color:#67e8f9">
                    Nur-Lesen-Modus
                </label>` : ''}
            </div>
            <div class="sa-perms-grid${isSuper ? '" style="opacity:.35;pointer-events:none' : (admin.readOnly ? '" style="opacity:.5;pointer-events:none' : '')}">
                ${permsHTML}
            </div>
            <!-- Login-History Mini -->
            <div id="sa-loginhistory-${admin.id}" style="display:none;margin-top:12px;padding:10px 12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:12px;font-size:11px;color:rgba(255,255,255,.4)">
                <div style="font-size:10px;color:rgba(255,255,255,.25);font-weight:700;letter-spacing:.06em;margin-bottom:8px">LETZTE LOGINS</div>
                <div id="sa-loginhistory-inner-${admin.id}"><i class="fa-solid fa-spinner fa-spin"></i> Lade...</div>
            </div>
            <div class="sa-card-actions" style="margin-top:16px">
                ${actionsHTML}
                <button onclick="saToggleLoginHistory('${admin.id}')" title="Login-Verlauf" style="padding:9px 12px;border-radius:12px;border:none;cursor:pointer;background:rgba(255,255,255,.06);color:rgba(255,255,255,.4);font-size:12px;font-weight:600;transition:all .15s" onmouseover="this.style.background='rgba(255,255,255,.12)'" onmouseout="this.style.background='rgba(255,255,255,.06)'">
                    <i class="fa-solid fa-clock-rotate-left"></i>
                </button>
            </div>`;
        grid.appendChild(card);
    });
}

// ── Toggle Permission ─────────────────────────────────
function saTogglePerm(uid, key, el) {
    el.classList.toggle('active');
}

// ── Save Permissions ──────────────────────────────────
async function saSavePerms(uid) {
    const perms = SA_PERMISSIONS
        .filter(p => document.getElementById(`sap-${uid}-${p.key}`)?.classList.contains('active'))
        .map(p => p.key);

    await db.collection('users').doc(uid).update({ adminPermissions: perms });
    await logAction('admin_permissions_updated', uid, { permissions: perms });
    showToast('✅ Berechtigungen gespeichert');

    // Refresh sidebar if it's the current user
    if (auth.currentUser?.uid === uid) applyAdminPermissions(perms);
}

// ── Add Admin ────────────────────────────────────────
async function saAddAdmin() {
    const email = document.getElementById('sa-new-admin-email').value.trim();
    if (!email) { showToast('Bitte E-Mail eingeben', 'error'); return; }

    // Find user by email
    const snap = await db.collection('users').where('email','==',email).limit(1).get();
    if (snap.empty) { showToast('❌ Benutzer nicht gefunden', 'error'); return; }

    const doc = snap.docs[0];
    if (doc.data().role === 'admin') { showToast('Benutzer ist bereits Admin', 'warning'); return; }

    await doc.ref.update({
        role: 'admin',
        adminPermissions: SA_PERMISSIONS.map(p => p.key) // all permissions by default
    });
    await logAction('admin_added', doc.id, { email });
    showToast(`✅ ${email} ist jetzt Admin`);
    document.getElementById('sa-new-admin-email').value = '';
    saLoadAdmins();
}

// ── Remove Admin ─────────────────────────────────────
async function saRemoveAdmin(uid, email) {
    if (!confirm(`Admin-Rechte von ${email} wirklich entziehen?`)) return;
    await db.collection('users').doc(uid).update({
        role: firebase.firestore.FieldValue.delete(),
        adminPermissions: firebase.firestore.FieldValue.delete()
    });
    await logAction('admin_removed', uid, { email });
    showToast(`🚫 ${email} ist kein Admin mehr`);
    saLoadAdmins();
}

// ── Promote Admin → Co-Superadmin ────────────────────
async function saPromoteToSuperadmin(uid, email) {
    if (!saIsPrimaryAdmin) { showToast('⛔ Nur der primäre Superadmin kann andere promoten', 'error'); return; }
    if (!confirm(`${email} zum Co-Superadmin machen?\n\nDiese Person erhält vollen Zugang zur Superadmin Zone, kann dich aber nicht entfernen oder degradieren.`)) return;

    const superSnap = await db.collection('settings').doc('superadmin').get();
    const coUIDs = superSnap.exists ? (superSnap.data().coSuperadminUIDs || []) : [];
    if (!coUIDs.includes(uid)) coUIDs.push(uid);

    await db.collection('settings').doc('superadmin').set({ coSuperadminUIDs: coUIDs }, { merge: true });
    await logAction('superadmin_promoted', uid, { email, promotedBy: auth.currentUser?.uid });
    showToast(`👑 ${email} ist jetzt Co-Superadmin`);
    saCoSuperadminUIDs = coUIDs;
    saLoadAdmins();
}

// ── Demote Co-Superadmin → Admin ─────────────────────
async function saDemoteSuperadmin(uid, email) {
    if (!saIsPrimaryAdmin) { showToast('⛔ Nur der primäre Superadmin kann andere degradieren', 'error'); return; }
    if (!confirm(`${email} vom Co-Superadmin zum normalen Admin degradieren?`)) return;

    const superSnap = await db.collection('settings').doc('superadmin').get();
    let coUIDs = superSnap.exists ? (superSnap.data().coSuperadminUIDs || []) : [];
    coUIDs = coUIDs.filter(id => id !== uid);

    await db.collection('settings').doc('superadmin').set({ coSuperadminUIDs: coUIDs }, { merge: true });
    await logAction('superadmin_demoted', uid, { email, demotedBy: auth.currentUser?.uid });
    showToast(`↩ ${email} ist wieder normaler Admin`);
    saCoSuperadminUIDs = coUIDs;
    saLoadAdmins();
}

// ── IP Whitelist ──────────────────────────────────────
async function saLoadIPWhitelist() {
    const snap = await db.collection('settings').doc('superadmin').get();
    saIPWhitelist = (snap.exists ? (snap.data().allowedIPs || []) : []).map(i => String(i).trim());
    renderIPList();
}

function renderIPList() {
    const el = document.getElementById('sa-ip-list');
    if (!el) return;
    if (saIPWhitelist.length === 0) {
        el.innerHTML = '<div style="font-size:12px;color:rgba(255,255,255,.2)"><i class="fa-solid fa-info-circle" style="margin-right:6px"></i>Keine IPs eingetragen — alle IPs haben Zugang (nur Passwort nötig)</div>';
        return;
    }
    el.innerHTML = saIPWhitelist.map(ip => `
        <div class="sa-ip-chip${ip === currentIP ? ' current' : ''}">
            ${ip === currentIP ? '<i class="fa-solid fa-circle" style="font-size:7px;color:#34d399"></i>' : ''}
            ${ip}
            <i class="fa-solid fa-xmark sa-ip-chip-rm" onclick="saRemoveIP('${ip}')" title="Entfernen"></i>
        </div>`).join('');
}

async function saAddIP() {
    const ip = document.getElementById('sa-ip-input').value.trim();
    const isIPv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
    const isIPv6 = /^[0-9a-f:]{2,}$/i.test(ip) && ip.includes(':');
    if (!ip || (!isIPv4 && !isIPv6)) { showToast('Ungültige IP-Adresse (IPv4 oder IPv6)', 'error'); return; }
    if (saIPWhitelist.includes(ip)) { showToast('IP bereits in der Liste', 'warning'); return; }
    saIPWhitelist.push(ip);
    await saUpdateIPWhitelist();
    document.getElementById('sa-ip-input').value = '';
    renderIPList();
    showToast(`✅ IP ${ip} hinzugefügt`);
}

async function saAddCurrentIP() {
    const ip = currentIP || await saFetchIP();
    if (!ip) { showToast('IP konnte nicht ermittelt werden', 'error'); return; }
    if (saIPWhitelist.includes(ip)) { showToast('Deine IP ist bereits in der Liste', 'warning'); return; }
    saIPWhitelist.push(ip);
    await saUpdateIPWhitelist();
    renderIPList();
    showToast(`✅ Deine IP ${ip} hinzugefügt`);
}

async function saRemoveIP(ip) {
    if (!confirm(`IP ${ip} aus der Whitelist entfernen?`)) return;
    saIPWhitelist = saIPWhitelist.filter(i => i !== ip);
    await saUpdateIPWhitelist();
    renderIPList();
    showToast(`IP ${ip} entfernt`);
}

async function saUpdateIPWhitelist() {
    await db.collection('settings').doc('superadmin').set(
        { allowedIPs: saIPWhitelist },
        { merge: true }
    );
    await logAction('ip_whitelist_updated', 'superadmin', { ips: saIPWhitelist });
}

// ── Apply permissions to sidebar ─────────────────────
function applyAdminPermissions(perms) {
    if (!perms || saCurrentUserIsSuperadmin) return; // Superadmin sieht alles
    SA_PERMISSIONS.forEach(p => {
        const sidebarEl = document.getElementById('sidebar-' + p.tab);
        if (!sidebarEl) return;
        if (perms.includes(p.key)) {
            sidebarEl.classList.remove('sidebar-item-disabled');
            sidebarEl.style.pointerEvents = '';
            sidebarEl.style.opacity = '';
        } else {
            sidebarEl.classList.add('sidebar-item-disabled');
            sidebarEl.title = '⛔ Keine Berechtigung';
        }
    });
}

// ── Nur-Lesen Modus ──────────────────────────────────
function applyReadOnlyMode() {
    document.body.classList.add('admin-readonly');

    // 1. Alle Sidebar-Items bleiben anklickbar (Nur-Lesen darf alle Tabs sehen)
    SA_PERMISSIONS.forEach(p => {
        const sidebarEl = document.getElementById('sidebar-' + p.tab);
        if (sidebarEl) {
            sidebarEl.classList.remove('sidebar-item-disabled');
            sidebarEl.style.pointerEvents = '';
            sidebarEl.style.opacity = '';
        }
    });

    // 2. Schreib-Buttons mit ro-write-btn markieren (nach kurzer Verzögerung, damit DOM bereit ist)
    setTimeout(markWriteButtons, 1200);

    // 3. Firestore-Patch: alle .set/.update/.delete/.add blockieren
    const _col = db.collection.bind(db);
    db.collection = function(...args) {
        const ref = _col(...args);
        const _doc = ref.doc.bind(ref);
        ref.doc = function(...dargs) {
            const docRef = _doc(...dargs);
            docRef.set    = () => { showToast('⛔ Nur-Lesen: Keine Schreibrechte', 'error'); return Promise.reject(new Error('readonly')); };
            docRef.update = () => { showToast('⛔ Nur-Lesen: Keine Schreibrechte', 'error'); return Promise.reject(new Error('readonly')); };
            docRef.delete = () => { showToast('⛔ Nur-Lesen: Keine Schreibrechte', 'error'); return Promise.reject(new Error('readonly')); };
            return docRef;
        };
        ref.add = () => { showToast('⛔ Nur-Lesen: Keine Schreibrechte', 'error'); return Promise.reject(new Error('readonly')); };
        return ref;
    };
}

function markWriteButtons() {
    // Selektoren für alle Schreib-Aktionen
    const writeSelectors = [
        'button[onclick*="save"]',   'button[onclick*="Save"]',
        'button[onclick*="delete"]', 'button[onclick*="Delete"]',
        'button[onclick*="add"]',    'button[onclick*="Add"]',
        'button[onclick*="create"]', 'button[onclick*="Create"]',
        'button[onclick*="update"]', 'button[onclick*="Update"]',
        'button[onclick*="remove"]', 'button[onclick*="Remove"]',
        'button[onclick*="edit"]',   'button[onclick*="Edit"]',
        'button[onclick*="submit"]', 'button[onclick*="Submit"]',
        'button[onclick*="upload"]', 'button[onclick*="Upload"]',
        'button[onclick*="toggle"]', 'button[onclick*="Toggle"]',
        'button[onclick*="ban"]',    'button[onclick*="Ban"]',
        'button[onclick*="unban"]',
        'button[onclick*="approve"]','button[onclick*="reject"]',
        'button[onclick*="promote"]','button[onclick*="demote"]',
        'button[onclick*="export"]', // exports are fine to keep
        '[onclick*="saveProduct"]',  '[onclick*="deleteProduct"]',
        '[onclick*="saveOrder"]',    '[onclick*="deleteOrder"]',
        '[onclick*="saveUser"]',     '[onclick*="deleteUser"]',
        '[onclick*="saveCoupon"]',   '[onclick*="deleteCoupon"]',
        '[onclick*="saveCategory"]', '[onclick*="deleteCategory"]',
        '[onclick*="saveSettings"]', '[onclick*="saveSort"]',
        '[onclick*="saveBundle"]',   '[onclick*="deleteBundle"]',
        '[onclick*="saveReview"]',   '[onclick*="deleteReview"]',
        '[onclick*="savePromo"]',    '[onclick*="deletePromo"]',
        '[onclick*="saveAction"]',   '[onclick*="deleteAction"]',
        '[onclick*="euSaveDrawer"]', '[onclick*="euDrawerDanger"]',
        '[onclick*="applyDiscount"]','[onclick*="setBanned"]',
        '[onclick*="ipBanDo"]',      '[onclick*="quickBan"]',
        '[onclick*="saToggle"]',     '[onclick*="saSave"]',
        '[onclick*="saRemove"]',     '[onclick*="saAdd"]',
        '[onclick*="saPromote"]',    '[onclick*="saDemote"]',
        '[onclick*="bkp"]',          '[onclick*="runDanger"]',
        '[onclick*="generateFake"]', '[onclick*="deleteAllFake"]',
        // FAB & add buttons
        '#mob-fab', '.prd-page-hdr button', '.ord-page-hdr button',
        '.usr-page-hdr button',
        // Form submits
        'form button[type="submit"]',
        // Input fields that trigger saves (disable them)
        '.ped-drawer input', '.ped-drawer select', '.ped-drawer textarea',
        '.ord-drawer input', '.ord-drawer select', '.ord-drawer textarea',
        '.eu-drawer input',  '.eu-drawer select',  '.eu-drawer textarea',
    ];
    writeSelectors.forEach(sel => {
        try {
            document.querySelectorAll(sel).forEach(el => {
                if (!el.classList.contains('ro-write-btn')) {
                    el.classList.add('ro-write-btn');
                }
            });
        } catch(e) {}
    });

    // Also intercept clicks globally as fallback
    document.addEventListener('click', roClickInterceptor, true);
}

const RO_WRITE_PATTERNS = [
    /save/i, /delete/i, /remove/i, /create/i, /edit/i, /update/i,
    /upload/i, /submit/i, /ban/i, /approve/i, /reject/i,
    /promote/i, /demote/i, /toggle.*read/i, /addAdmin/i,
    /euSave/i, /euDanger/i, /bkp/i, /runDanger/i,
    /saveProd/i, /saveOrd/i, /saveCat/i, /saveCoup/i,
    /saveSet/i, /saveSort/i, /saveBund/i, /saveRev/i,
    /savePromo/i, /ipBan/i, /quickBan/i,
    /generateFake/i, /deleteAllFake/i,
];

function roClickInterceptor(e) {
    if (!window._isReadOnly) return;
    const el = e.target.closest('[onclick]') || e.target.closest('button') || e.target.closest('[role="button"]');
    if (!el) return;
    const onclick = el.getAttribute('onclick') || '';
    if (RO_WRITE_PATTERNS.some(p => p.test(onclick))) {
        e.stopImmediatePropagation();
        e.preventDefault();
        showToast('⛔ Nur-Lesen: Keine Schreibrechte', 'error');
    }
}

// ── Init: fetch IP on load ────────────────────────────
saFetchIP();

// ═══════════════════════════════════════════════════════
//  SUPERADMIN ZONE — NEUE FEATURES
// ═══════════════════════════════════════════════════════

// ── Inner Tab Navigation ─────────────────────────────
function saSwitchInner(panel, el) {
    document.querySelectorAll('.sa-inner-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sa-inner-tab').forEach(t => t.classList.remove('active'));
    const panelEl = document.getElementById('sa-panel-' + panel);
    if (!panelEl) return;
    panelEl.classList.add('active');
    el.classList.add('active');
    // Load data on demand
    if (panel === 'dashboard')  saLoadDashboard();
    if (panel === 'analytics')  saLoadAnalytics();
    if (panel === 'admins')     saLoadAdmins();
    if (panel === 'security')   { saLoadIPWhitelist(); saLoadSecuritySettings(); }
    if (panel === 'sessions')   saLoadSessions();
    if (panel === 'actlog')     saLoadActivityLog();
    if (panel === 'ipsec')      { loadUnauthorizedLogs(); loadBannedIPs(); }
    if (panel === 'backup')     bkpInit();
    if (panel === 'danger')     {} // static
}

function saRefreshZone() {
    const active = document.querySelector('.sa-inner-panel.active');
    const btn = document.querySelector('.sa-inner-tab.active');
    if (active && btn) {
        const panel = active.id.replace('sa-panel-','');
        saSwitchInner(panel, btn);
    }
}

// ── Dashboard ─────────────────────────────────────────
async function saLoadDashboard() {
    try {
        const [ordersSnap, usersSnap, productsSnap, adminsSnap, presenceSnap, reviewsSnap, bannedSnap, settingsSnap] = await Promise.all([
            db.collection('orders').get(),
            db.collection('users').get(),
            db.collection('products').get(),
            db.collection('users').where('role','==','admin').get(),
            db.collection('presence').get(),
            db.collection('reviews').where('approved','==',false).where('rejected','==',false).get().catch(()=>({size:0,docs:[]})),
            db.collection('banned_ips').get().catch(()=>({size:0})),
            db.collection('settings').doc('main').get().catch(()=>null)
        ]);

        const now = Date.now();
        const today = new Date(); today.setHours(0,0,0,0);
        const day7  = new Date(now - 7  * 86400000);
        const day30 = new Date(now - 30 * 86400000);
        const week7Reg  = new Date(now - 7 * 86400000);

        let totalRevenue = 0, today_rev = 0, rev7d = 0, rev30d = 0;
        let today_cnt = 0, cnt7d = 0, cnt30d = 0, openOrders = 0;
        const productSales = {};

        ordersSnap.forEach(d => {
            const o = d.data();
            const ts = o.date?.toDate?.() || null;
            const amt = parseFloat(o.total || 0);
            totalRevenue += amt;
            if (o.status === 'Wird bearbeitet') openOrders++;
            if (ts) {
                if (ts >= today) { today_rev += amt; today_cnt++; }
                if (ts >= day7)  { rev7d  += amt; cnt7d++;  }
                if (ts >= day30) { rev30d += amt; cnt30d++; }
            }
            (o.items || []).forEach(item => {
                if (item.id && item.id !== 999) {
                    productSales[item.id] = (productSales[item.id] || { name: item.name, qty: 0 });
                    productSales[item.id].qty += (item.qty || 1);
                }
            });
        });

        // Top product
        const topEntry = Object.values(productSales).sort((a,b) => b.qty - a.qty)[0];
        const topName = topEntry ? (topEntry.name.length > 16 ? topEntry.name.slice(0,14)+'…' : topEntry.name) : '—';
        const topQty  = topEntry ? topEntry.qty + '× verkauft' : '';

        // New users last 7d
        let newUsers7d = 0;
        usersSnap.forEach(d => {
            const ts = d.data().createdAt?.toDate?.() || null;
            if (ts && ts >= week7Reg) newUsers7d++;
        });

        const onlineCount = presenceSnap.docs.filter(d => {
            const t = d.data().lastSeen?.toDate?.()?.getTime?.() || 0;
            return (now - t) < 90000;
        }).length;

        const availProds = productsSnap.docs.filter(d => d.data().available !== false).length;

        // Update KPIs
        const fmt = v => v.toFixed(2).replace('.',',') + ' €';
        document.getElementById('sa-kpi-revenue').textContent     = fmt(totalRevenue);
        document.getElementById('sa-kpi-today').textContent       = fmt(today_rev);
        document.getElementById('sa-kpi-today-orders').textContent= today_cnt + ' Bestellung' + (today_cnt !== 1 ? 'en' : '');
        document.getElementById('sa-kpi-7d').textContent          = fmt(rev7d);
        document.getElementById('sa-kpi-7d-orders').textContent   = cnt7d + ' Bestellungen';
        document.getElementById('sa-kpi-30d').textContent         = fmt(rev30d);
        document.getElementById('sa-kpi-30d-orders').textContent  = cnt30d + ' Bestellungen';
        document.getElementById('sa-kpi-open').textContent        = openOrders;
        document.getElementById('sa-kpi-users').textContent       = usersSnap.size;
        document.getElementById('sa-kpi-users-new').textContent   = '+' + newUsers7d + ' neu (7 Tage)';
        document.getElementById('sa-kpi-online').textContent      = onlineCount;
        document.getElementById('sa-kpi-admins').textContent      = adminsSnap.size;
        document.getElementById('sa-kpi-reviews').textContent     = reviewsSnap.size || 0;
        document.getElementById('sa-kpi-banned').textContent      = bannedSnap.size || 0;
        document.getElementById('sa-kpi-products').textContent    = productsSnap.size;
        document.getElementById('sa-kpi-products-sub').textContent= availProds + ' verfügbar';
        document.getElementById('sa-kpi-top-product').textContent = topName;
        document.getElementById('sa-kpi-top-product-sub').textContent = topQty;

        // ── NEU: Trend-Indikatoren (7d vs. vorherige 7d) ──────────────────
        try {
            const prev7start = firebase.firestore.Timestamp.fromDate(new Date(now - 14*86400000));
            const prev7end   = firebase.firestore.Timestamp.fromDate(new Date(now - 7*86400000));
            const prev7Snap  = await db.collection('orders').where('date','>=',prev7start).where('date','<=',prev7end).get();
            let prev7Rev = 0, prev7Cnt = 0;
            prev7Snap.forEach(d => { const o=d.data(); if((o.status||'')!=='Storniert'){prev7Rev+=parseFloat(o.total||0);prev7Cnt++;} });
            const revDelta = prev7Rev > 0 ? ((rev7d - prev7Rev)/prev7Rev*100) : null;
            const cntDelta = prev7Cnt > 0 ? ((cnt7d - prev7Cnt)/prev7Cnt*100) : null;
            const trend = (v, isRev) => {
                if (v === null) return '';
                const up = v >= 0;
                const color = up ? '#34d399' : '#f87171';
                return `<span style="font-size:10px;color:${color};font-weight:700">${up?'↑':'↓'}${Math.abs(v).toFixed(1)}% vs. Vorwoche</span>`;
            };
            const kpi7d = document.getElementById('sa-kpi-7d');
            if (kpi7d && kpi7d.parentElement) {
                const trendEl = kpi7d.parentElement.querySelector('.sa-kpi-trend') || (() => { const e=document.createElement('div'); e.className='sa-kpi-trend'; kpi7d.parentElement.appendChild(e); return e; })();
                trendEl.innerHTML = trend(revDelta, true);
            }
            const kpi7do = document.getElementById('sa-kpi-7d-orders');
            if (kpi7do && kpi7do.parentElement) {
                const trendEl = kpi7do.parentElement.querySelector('.sa-kpi-trend') || (() => { const e=document.createElement('div'); e.className='sa-kpi-trend'; kpi7do.parentElement.appendChild(e); return e; })();
                trendEl.innerHTML = trend(cntDelta, false);
            }
        } catch(e) { /* non-blocking */ }

        // Shop-Status Banner
        const shopClosed = settingsSnap?.exists && settingsSnap.data().shop_closed === true;
        const dot  = document.getElementById('sa-shop-status-dot');
        const text = document.getElementById('sa-shop-status-text');
        if (dot && text) {
            if (shopClosed) {
                dot.style.background  = '#f87171';
                dot.style.boxShadow   = '0 0 10px #f87171';
                text.textContent = '🔴 Shop ist geschlossen — Kunden sehen die Wartungsseite';
                text.style.color = '#f87171';
            } else {
                dot.style.background  = '#34d399';
                dot.style.boxShadow   = '0 0 10px #34d399';
                text.textContent = '🟢 Shop ist geöffnet — Kunden können bestellen';
                text.style.color = '#34d399';
            }
        }
    } catch(e) { console.warn('SA Dashboard error:', e); }

    saLoadRecentSALog();
    adminActivityLoad();
}

async function saLoadRecentSALog() {
    const el = document.getElementById('sa-dash-log');
    if (!el) return;
    try {
        const SA_ACTIONS = ['superadmin_zone_access','admin_added','admin_removed','admin_permissions_updated','ip_whitelist_updated','sa_danger_action','sa_export','sa_security_settings','sa_fullexport','danger_shop_close','danger_shop_open','danger_clear_banned_ips','danger_reject_reviews','danger_purge_logs','danger_reset_loyalty','danger_delete_orders'];
        // BUG-24 FIX: orderBy direkt in Firestore, client-seitiger Sort entfernt
        const snap = await db.collection('admin_logs')
            .orderBy('timestamp', 'desc')
            .limit(200)
            .get();
        const filtered = snap.docs
            .filter(d => SA_ACTIONS.includes(d.data().action))
            .slice(0, 8);
        renderLogEntries(el, filtered, true);
    } catch(e) { el.innerHTML = '<div style="color:rgba(255,255,255,.2);font-size:12px;padding:12px">Log konnte nicht geladen werden.</div>'; }
}

// ── Shop-Analyse ──────────────────────────────────────
async function saLoadAnalytics() {
    const kpisEl   = document.getElementById('sa-analytics-kpis');
    const topEl    = document.getElementById('sa-top-products');
    const statusEl = document.getElementById('sa-order-status-chart');
    const growthEl = document.getElementById('sa-user-growth');

    try {
        const [ordersSnap, usersSnap] = await Promise.all([
            db.collection('orders').get(),
            db.collection('users').orderBy('createdAt', 'desc').limit(500).get().catch(() => db.collection('users').get())
        ]);

        const now = Date.now();
        const day30 = new Date(now - 30 * 86400000);

        // Revenue + product counts
        let totalRev = 0, rev30d = 0;
        const productSales = {}, statusCounts = {};
        const catRevenue = {};

        ordersSnap.forEach(d => {
            const o = d.data();
            const ts = o.date?.toDate?.() || null;
            const amt = parseFloat(o.total || 0);
            totalRev += amt;
            if (ts && ts >= day30) rev30d += amt;

            const s = o.status || 'Unbekannt';
            statusCounts[s] = (statusCounts[s] || 0) + 1;

            (o.items || []).forEach(item => {
                if (!item.id || item.id === 999) return;
                const key = String(item.id);
                if (!productSales[key]) productSales[key] = { name: item.name || key, qty: 0, rev: 0 };
                productSales[key].qty += (item.qty || 1);
                productSales[key].rev += (item.qty || 1) * (item.price || 0);
                const cat = item.category || 'Sonstige';
                catRevenue[cat] = (catRevenue[cat] || 0) + (item.qty || 1) * (item.price || 0);
            });
        });

        const avgOrder = ordersSnap.size ? totalRev / ordersSnap.size : 0;

        // KPI cards
        if (kpisEl) kpisEl.innerHTML = [
            { icon:'💶', label:'Gesamtumsatz',    val: totalRev.toFixed(2).replace('.',',')+' €', sub: ordersSnap.size+' Bestellungen' },
            { icon:'📅', label:'Letzte 30 Tage',  val: rev30d.toFixed(2).replace('.',',')+' €',   sub: 'Umsatz' },
            { icon:'🧾', label:'Ø Bestellwert',   val: avgOrder.toFixed(2).replace('.',',')+' €', sub: 'pro Bestellung' },
            { icon:'🏷️', label:'Produkte verkauft',val: Object.values(productSales).reduce((s,p)=>s+p.qty,0)+'×', sub: Object.keys(productSales).length+' verschiedene' },
        ].map(k => `<div class="sa-kpi">
            <div class="sa-kpi-icon">${k.icon}</div>
            <div class="sa-kpi-label">${k.label}</div>
            <div class="sa-kpi-value" style="font-size:20px">${k.val}</div>
            <div class="sa-kpi-sub">${k.sub}</div>
        </div>`).join('');

        // Top 10 products
        const topProds = Object.values(productSales).sort((a,b) => b.qty - a.qty).slice(0,10);
        const maxQty = topProds[0]?.qty || 1;
        if (topEl) topEl.innerHTML = topProds.length ? topProds.map((p, i) => `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(255,255,255,.03);border-radius:12px;border:1px solid rgba(255,255,255,.05)">
                <div style="font-size:13px;font-weight:700;color:#fbbf24;min-width:20px;text-align:center">#${i+1}</div>
                <div style="flex:1;min-width:0">
                    <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escA(p.name)}</div>
                    <div style="height:4px;background:rgba(255,255,255,.07);border-radius:2px;margin-top:5px;overflow:hidden">
                        <div style="height:100%;width:${Math.round(p.qty/maxQty*100)}%;background:linear-gradient(90deg,#67e8f9,#a78bfa);border-radius:2px"></div>
                    </div>
                </div>
                <div style="text-align:right;flex-shrink:0">
                    <div style="font-size:13px;font-weight:700;color:#67e8f9">${p.qty}×</div>
                    <div style="font-size:10px;color:rgba(255,255,255,.3)">${p.rev.toFixed(2).replace('.',',')} €</div>
                </div>
            </div>`).join('') : '<div style="color:rgba(255,255,255,.2);font-size:12px;padding:12px">Keine Verkäufe gefunden</div>';

        // Order status chart
        const statusColors = { 'Zugestellt':'#34d399','Versendet':'#67e8f9','Wird bearbeitet':'#fbbf24','Storniert':'#f87171' };
        const totalOrders = ordersSnap.size || 1;
        if (statusEl) statusEl.innerHTML = Object.entries(statusCounts)
            .sort((a,b) => b[1]-a[1])
            .map(([s, c]) => `
            <div style="display:flex;align-items:center;gap:10px">
                <div style="font-size:12px;min-width:130px;color:rgba(255,255,255,.6)">${escA(s)}</div>
                <div style="flex:1;height:20px;background:rgba(255,255,255,.05);border-radius:6px;overflow:hidden">
                    <div style="height:100%;width:${Math.round(c/totalOrders*100)}%;background:${statusColors[s]||'rgba(255,255,255,.2)'};border-radius:6px;transition:width .5s"></div>
                </div>
                <div style="font-size:12px;font-weight:700;min-width:28px;text-align:right;color:${statusColors[s]||'rgba(255,255,255,.4)'}">${c}</div>
                <div style="font-size:10px;color:rgba(255,255,255,.25);min-width:36px">${Math.round(c/totalOrders*100)}%</div>
            </div>`).join('') || '<div style="color:rgba(255,255,255,.2);font-size:12px;padding:12px">Keine Bestellungen</div>';

        // User growth last 30 days — count registrations per day
        if (growthEl) {
            const dayMap = {};
            usersSnap.forEach(d => {
                const ts = d.data().createdAt?.toDate?.() || null;
                if (!ts || ts < day30) return;
                const key = ts.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' });
                dayMap[key] = (dayMap[key] || 0) + 1;
            });
            const entries = Object.entries(dayMap).slice(-14);
            const maxU = Math.max(...entries.map(e=>e[1]), 1);
            growthEl.innerHTML = entries.length ? `<div style="display:flex;align-items:flex-end;gap:4px;height:80px;padding:0 4px">
                ${entries.map(([day, cnt]) => `
                <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px" title="${day}: ${cnt} neue User">
                    <div style="font-size:9px;color:rgba(255,255,255,.3)">${cnt}</div>
                    <div style="width:100%;background:linear-gradient(180deg,#34d399,#059669);border-radius:3px 3px 0 0;height:${Math.max(4,Math.round(cnt/maxU*60))}px"></div>
                    <div style="font-size:8px;color:rgba(255,255,255,.25);white-space:nowrap">${day}</div>
                </div>`).join('')}
            </div>` : '<div style="color:rgba(255,255,255,.2);font-size:12px;padding:12px">Keine Registrierungen in den letzten 30 Tagen</div>';
        }
    } catch(e) {
        console.warn('SA Analytics error:', e);
        [kpisEl, topEl, statusEl, growthEl].forEach(el => { if (el) el.innerHTML = '<div style="color:rgba(248,113,113,.5);font-size:12px;padding:12px">Fehler beim Laden: '+escA(e.message)+'</div>'; });
    }
}

// ── Activity Log ──────────────────────────────────────
let _saLogAllDocs = [];
let _saLogFilter = 'all';

async function saLoadActivityLog() {
    const el = document.getElementById('sa-act-log');
    if (!el) return;
    el.innerHTML = '<div style="color:rgba(255,255,255,.2);font-size:12px;padding:12px"><i class="fa-solid fa-spinner fa-spin" style="margin-right:8px"></i>Lade...</div>';
    try {
        // BUG-24 FIX: orderBy('timestamp','desc') direkt in Firestore — verhindert,
        // dass bei >200 Logs die ältesten fehlen weil nur nach limit() client-seitig sortiert wurde.
        const snap = await db.collection('admin_logs')
            .orderBy('timestamp', 'desc')
            .limit(200)
            .get();
        _saLogAllDocs = snap.docs;
        saRenderFilteredLog();
    } catch(e) { el.textContent = ''; const d=document.createElement('div');d.style.cssText='color:rgba(248,113,113,.5);font-size:12px;padding:12px';d.textContent='Fehler: '+e.message;el.appendChild(d); }
}

function saFilterLog(filter, el) {
    document.querySelectorAll('#sa-panel-actlog .sa-inner-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    _saLogFilter = filter;
    saRenderFilteredLog();
}

function saRenderFilteredLog() {
    const el = document.getElementById('sa-act-log');
    if (!el) return;
    const ACCESS_ACTIONS = ['superadmin_zone_access'];
    const ADMIN_ACTIONS  = ['admin_added','admin_removed','admin_permissions_updated','ip_whitelist_updated','sa_security_settings'];
    const EXPORT_ACTIONS = ['sa_export','sa_fullexport'];
    // Danger: gleiche Keywords wie actlogUpdateStats() - Zaehler und Filter zeigen immer dasselbe
    const DANGER_KEYWORDS = ['danger','delete_all','purge','lockdown','revoke'];

    const filtered = _saLogAllDocs.filter(d => {
        const action = d.data().action || '';
        if (_saLogFilter === 'all')    return true;
        if (_saLogFilter === 'access') return ACCESS_ACTIONS.includes(action);
        if (_saLogFilter === 'admin')  return ADMIN_ACTIONS.includes(action);
        if (_saLogFilter === 'export') return EXPORT_ACTIONS.includes(action);
        if (_saLogFilter === 'danger') return DANGER_KEYWORDS.some(k => action.includes(k));
        return true;
    });
    renderLogEntries(el, filtered, false);
}

function renderLogEntries(el, docs, compact) {
    if (!docs || docs.length === 0) {
        el.innerHTML = '<div style="color:rgba(255,255,255,.2);font-size:12px;padding:20px;text-align:center"><i class="fa-solid fa-inbox" style="font-size:24px;display:block;margin-bottom:10px;opacity:.3"></i>Keine Einträge</div>';
        return;
    }
    const DANGER_KEYWORDS = ['danger','delete','purge','reset','close'];
    const ACCESS_KEYWORDS = ['access','login'];
    const EXPORT_KEYWORDS = ['export','backup'];

    el.innerHTML = docs.map(doc => {
        const d = doc.data ? doc.data() : doc;
        const action = d.action || 'unbekannt';
        const ts = d.timestamp?.toDate?.() || new Date();
        const dateStr = ts.toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
        const ip = d.details?.ip || d.ip || '';
        const target = d.target || '';

        let dotClass = 'action';
        if (DANGER_KEYWORDS.some(k => action.includes(k))) dotClass = 'danger';
        else if (ACCESS_KEYWORDS.some(k => action.includes(k)))  dotClass = 'access';
        else if (EXPORT_KEYWORDS.some(k => action.includes(k))) dotClass = 'settings';

        const actionLabel = {
            'superadmin_zone_access':      '🔓 SA-Zone aufgerufen',
            'admin_added':                 '➕ Admin hinzugefügt',
            'admin_removed':               '➖ Admin entfernt',
            'admin_permissions_updated':   '⚙️ Berechtigungen geändert',
            'ip_whitelist_updated':        '🌐 IP-Whitelist aktualisiert',
            'sa_security_settings':        '🔒 Sicherheitseinstellungen gespeichert',
            'sa_export':                   '💾 Daten exportiert',
            'sa_fullexport':               '💾 Vollbackup erstellt',
            'danger_shop_close':           '🔴 Shop geschlossen',
            'danger_shop_open':            '🟢 Shop geöffnet',
            'danger_clear_banned_ips':     '🧹 IP-Sperren aufgehoben',
            'danger_reject_reviews':       '🗑️ Reviews massenabgelehnt',
            'danger_purge_logs':           '🗑️ Alte Logs gelöscht',
            'danger_reset_loyalty':        '🔄 Loyalty-Punkte zurückgesetzt',
            'danger_delete_orders':        '☢️ ALLE Bestellungen gelöscht',
        }[action] || `⚡ ${action}`;

        return `<div class="sa-log-entry">
            <div class="sa-log-dot ${dotClass}"></div>
            <div>
                <div class="sa-log-action">${actionLabel}</div>
                <div class="sa-log-meta">${dateStr}${target ? ' • ' + target.substring(0,20) : ''}${ip ? ' • ' + ip : ''}</div>
            </div>
        </div>`;
    }).join('');
}

// ── Admin-Aktivität (letzte 30 Tage) ──────────────────
async function adminActivityLoad() {
    const el = document.getElementById('admin-activity-table');
    if (!el) return;

    el.innerHTML = '<div style="color:rgba(255,255,255,.2);font-size:12px;padding:12px;text-align:center"><i class="fa-solid fa-spinner fa-spin" style="margin-right:6px"></i>Lade...</div>';

    try {
        const cutoff = firebase.firestore.Timestamp.fromDate(new Date(Date.now() - 30 * 86400000));
        const snap = await db.collection('admin_logs')
            .where('timestamp', '>=', cutoff)
            .orderBy('timestamp', 'desc')
            .get();

        if (snap.empty) {
            el.innerHTML = '<div style="color:rgba(255,255,255,.2);font-size:12px;padding:20px;text-align:center"><i class="fa-solid fa-inbox" style="font-size:22px;display:block;margin-bottom:8px;opacity:.3"></i>Keine Aktivitäten in den letzten 30 Tagen</div>';
            return;
        }

        // Gruppieren nach Admin-E-Mail
        const byAdmin = {};
        snap.forEach(doc => {
            const d = doc.data();
            const email = d.adminEmail || 'Unbekannt';
            if (!byAdmin[email]) {
                byAdmin[email] = {
                    total: 0,
                    lastTs: null,
                    byAction: {}
                };
            }
            byAdmin[email].total++;
            const ts = d.timestamp?.toDate?.() || null;
            if (ts && (!byAdmin[email].lastTs || ts > byAdmin[email].lastTs)) {
                byAdmin[email].lastTs = ts;
            }
            const action = d.action || 'unknown';
            byAdmin[email].byAction[action] = (byAdmin[email].byAction[action] || 0) + 1;
        });

        // Nach Gesamtanzahl sortieren
        const sorted = Object.entries(byAdmin).sort((a, b) => b[1].total - a[1].total);
        const maxActions = sorted[0]?.[1].total || 1;

        const ROLE_COLORS = { superadmin: '#fbbf24', cosuper: '#fb923c', admin: '#67e8f9' };

        const ACTION_LABEL = {
            product_created: '📦 Produkt erstellt',
            product_deleted: '🗑️ Produkt gelöscht',
            product_availability_changed: '👁️ Verfügbarkeit',
            product_duplicated: '📋 Produkt dupliziert',
            order_status_changed: '📬 Status geändert',
            order_updated: '✏️ Bestellung bearbeitet',
            order_deleted: '🗑️ Bestellung gelöscht',
            coupon_created: '🎟️ Coupon erstellt',
            coupon_deleted: '🗑️ Coupon gelöscht',
            category_created: '🗂️ Kategorie erstellt',
            category_updated: '✏️ Kategorie bearbeitet',
            category_deleted: '🗑️ Kategorie gelöscht',
            user_disabled_with_ip_ban: '🚫 User gesperrt',
            user_enabled: '✅ User entsperrt',
            user_deleted: '🗑️ User gelöscht',
            user_loyalty_reset: '🔄 Punkte zurückgesetzt',
            password_reset_requested: '🔑 Passwort-Reset',
            push_notification_sent: '🔔 Push gesendet',
            free_shipping_enabled: '🚚 Gratisversand an',
            free_shipping_disabled: '🚚 Gratisversand aus',
            superadmin_zone_access: '🔓 SA-Zone aufgerufen',
            admin_added: '➕ Admin hinzugefügt',
            admin_removed: '➖ Admin entfernt',
            export_analytics_csv: '💾 Export',
            sa_export: '💾 Daten exportiert',
            danger_shop_close: '🔴 Shop geschlossen',
            danger_shop_open: '🟢 Shop geöffnet',
            danger_purge_logs: '🗑️ Logs gelöscht',
            danger_reset_loyalty: '🔄 Loyalty-Reset',
            danger_delete_orders: '☢️ Bestellungen gelöscht',
        };

        el.innerHTML = sorted.map(([email, data]) => {
            const pct = Math.round((data.total / maxActions) * 100);
            const lastStr = data.lastTs
                ? data.lastTs.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                : '—';

            // Top-3-Aktionen dieses Admins
            const topActions = Object.entries(data.byAction)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([action, cnt]) => {
                    const label = ACTION_LABEL[action] || ('⚡ ' + action.replace(/_/g, ' '));
                    return `<span style="font-size:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:2px 7px;white-space:nowrap">${label} <strong style="color:#fff">${cnt}×</strong></span>`;
                }).join('');

            const initials = email.slice(0, 2).toUpperCase();
            const hue = [...email].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;

            return `
            <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:13px;padding:12px 14px">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                    <div style="width:34px;height:34px;border-radius:10px;background:hsl(${hue},55%,28%);border:1px solid hsl(${hue},55%,40%);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0">${initials}</div>
                    <div style="flex:1;min-width:0">
                        <div style="font-size:12px;font-weight:600;color:rgba(255,255,255,.85);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${email}</div>
                        <div style="font-size:10px;color:rgba(255,255,255,.3);margin-top:1px">Letzte Aktion: ${lastStr}</div>
                    </div>
                    <div style="text-align:right;flex-shrink:0">
                        <div style="font-size:18px;font-weight:800;color:#67e8f9;font-family:'JetBrains Mono',monospace;line-height:1">${data.total}</div>
                        <div style="font-size:9px;color:rgba(255,255,255,.25);text-transform:uppercase;letter-spacing:.06em">Aktionen</div>
                    </div>
                </div>
                <!-- Balken -->
                <div style="height:4px;background:rgba(255,255,255,.06);border-radius:3px;margin-bottom:8px;overflow:hidden">
                    <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#22d3ee,#818cf8);border-radius:3px;transition:width .5s ease"></div>
                </div>
                <!-- Top-Aktionen -->
                <div style="display:flex;flex-wrap:wrap;gap:4px">${topActions || '<span style="font-size:10px;color:rgba(255,255,255,.2)">—</span>'}</div>
            </div>`;
        }).join('');

    } catch(e) {
        console.warn('adminActivityLoad error:', e);
        el.innerHTML = '<div style="color:rgba(248,113,113,.6);font-size:12px;padding:12px;text-align:center"><i class="fa-solid fa-circle-exclamation" style="margin-right:6px"></i>Fehler beim Laden: ' + e.message + '</div>';
    }
}

// ── Security Settings ─────────────────────────────────
async function saLoadSecuritySettings() {
    try {
        const [saSnap, mainSnap] = await Promise.all([
            db.collection('settings').doc('superadmin').get(),
            db.collection('settings').doc('main').get()
        ]);
        const d = saSnap.exists ? (saSnap.data().security || {}) : {};
        if (d.timeout)     document.getElementById('sa-sec-timeout').value = d.timeout;
        if (d.maxAttempts) document.getElementById('sa-sec-maxattempts').value = d.maxAttempts;
        if (d.notify      !== undefined) document.getElementById('sa-sec-notify').checked     = d.notify;
        if (d.forceIP     !== undefined) document.getElementById('sa-sec-force-ip').checked   = d.forceIP;
        if (d.verboseLog  !== undefined) document.getElementById('sa-sec-verbose').checked    = d.verboseLog;
        if (d.autoLock    !== undefined) document.getElementById('sa-sec-auto-lock').checked  = d.autoLock;

        // Load email verification setting from settings/main (shared with index.html)
        const mainData = mainSnap.exists ? mainSnap.data() : {};
        // Default: true (verification required) unless explicitly set to false
        const emailVerify = mainData.require_email_verify !== false;
        const cb = document.getElementById('sa-sec-email-verify');
        if (cb) {
            cb.checked = emailVerify;
            saPreviewEmailVerifyChange(emailVerify);
        }
    } catch(e) {}
}

async function saSaveSecuritySettings() {
    const emailVerify = document.getElementById('sa-sec-email-verify').checked;
    const settings = {
        timeout:     parseInt(document.getElementById('sa-sec-timeout').value, 10) || 30,
        maxAttempts: parseInt(document.getElementById('sa-sec-maxattempts').value, 10) || 5,
        notify:      document.getElementById('sa-sec-notify').checked,
        forceIP:     document.getElementById('sa-sec-force-ip').checked,
        verboseLog:  document.getElementById('sa-sec-verbose').checked,
        autoLock:    document.getElementById('sa-sec-auto-lock').checked,
    };

    const btn = document.querySelector('[onclick="saSaveSecuritySettings()"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> &nbsp;Wird gespeichert…'; }

    try {
        // Save general SA security settings
        await db.collection('settings').doc('superadmin').set({ security: settings }, { merge: true });
        // Save email verification flag to settings/main so index.html can read it
        await db.collection('settings').doc('main').set({ require_email_verify: emailVerify }, { merge: true });
        await logAction('sa_security_settings', 'superadmin', { ...settings, require_email_verify: emailVerify });
        showToast('✅ Sicherheitseinstellungen gespeichert');
        saPreviewEmailVerifyChange(emailVerify);
    } catch(e) {
        showToast('❌ Fehler: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> &nbsp;Sicherheitseinstellungen speichern'; }
    }
}

// Live-Preview-Feedback wenn Toggle geändert wird
function saPreviewEmailVerifyChange(active) {
    const badge   = document.getElementById('sa-ev-status-badge');
    const preview = document.getElementById('sa-ev-preview');
    const text    = document.getElementById('sa-ev-preview-text');
    const card    = document.getElementById('sa-ev-card');
    if (!badge || !preview || !text) return;

    if (active) {
        badge.style.background = 'rgba(52,211,153,.15)';
        badge.style.color = '#34d399';
        badge.style.border = '1px solid rgba(52,211,153,.3)';
        badge.innerHTML = '<i class="fa-solid fa-circle" style="font-size:7px;margin-right:4px"></i>AKTIV';
        preview.style.background = 'rgba(52,211,153,.06)';
        preview.style.borderColor = 'rgba(52,211,153,.2)';
        preview.querySelector('i').style.color = '#34d399';
        text.textContent = 'Neue Nutzer erhalten nach der Registrierung eine Bestätigungs-E-Mail und müssen diese bestätigen bevor sie sich einloggen können.';
        if (card) card.style.borderColor = 'rgba(52,211,153,.2)';
    } else {
        badge.style.background = 'rgba(248,113,113,.15)';
        badge.style.color = '#f87171';
        badge.style.border = '1px solid rgba(248,113,113,.3)';
        badge.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="font-size:9px;margin-right:4px"></i>DEAKTIVIERT';
        preview.style.background = 'rgba(248,113,113,.06)';
        preview.style.borderColor = 'rgba(248,113,113,.2)';
        preview.querySelector('i').style.color = '#f87171';
        text.textContent = '⚠️ Neue Nutzer können sich direkt nach der Registrierung einloggen – ohne E-Mail zu bestätigen. Nur deaktivieren wenn du das explizit erlauben möchtest.';
        if (card) card.style.borderColor = 'rgba(248,113,113,.2)';
    }
}

// ── Session Monitor ───────────────────────────────────
let _saAllSessions = [];

function saSessionFilter(mode, el) {
    document.querySelectorAll('#sa-panel-sessions .sa-inner-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    const list = document.getElementById('sa-sess-list');
    if (!list || !_saAllSessions.length) return;
    const now = Date.now();
    let filtered = _saAllSessions;
    if (mode === 'admins')  filtered = _saAllSessions.filter(s => s._isAdmin);
    if (mode === 'guests')  filtered = _saAllSessions.filter(s => s.isGuest);
    if (mode === 'users')   filtered = _saAllSessions.filter(s => !s.isGuest && !s._isAdmin);
    if (mode === 'cart')    filtered = _saAllSessions.filter(s => (s.cartCount || 0) > 0);
    renderSessionList(list, filtered, now);
}

function renderSessionList(el, sessions, now) {
    if (!sessions.length) {
        el.innerHTML = '<div style="color:rgba(255,255,255,.2);font-size:13px;padding:24px;text-align:center"><i class="fa-solid fa-moon" style="font-size:28px;display:block;margin-bottom:10px;opacity:.3"></i>Keine Sessions in diesem Filter</div>';
        return;
    }
    el.innerHTML = sessions.map(s => {
        const lastSeen = s.lastSeen?.toDate?.() || null;
        const msAgo    = lastSeen ? now - lastSeen.getTime() : Infinity;
        const isLive   = msAgo < 90000;
        const timeStr  = lastSeen ? lastSeen.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}) : '—';
        const initials = s._isAdmin ? '👑' : s.isGuest ? '👤' : (s.email||'?').substring(0,2).toUpperCase();
        const avatarBg = s._isAdmin ? 'background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#000'
                       : s.isGuest  ? 'background:rgba(255,255,255,.08);color:rgba(255,255,255,.4)'
                       : 'background:linear-gradient(135deg,#67e8f9,#a78bfa);color:#000';
        const label    = s._isAdmin ? (s.email||s.uid) : s.isGuest ? 'Gast' : (s.email || s.username || s.uid);
        const metaParts = [];
        if (s.username) metaParts.push('@'+s.username);
        if (s.cartCount) metaParts.push('🛒 '+s.cartCount+' Item'+(s.cartCount>1?'s':''));
        if (s.page) metaParts.push(s.page);
        if (s.ip) metaParts.push(s.ip);
        return `<div class="sa-sess-card">
            <div class="sa-sess-avatar" style="${avatarBg};font-size:${s._isAdmin?'14px':'11px'}">${initials}</div>
            <div style="flex:1;min-width:0">
                <div class="sa-sess-email">${escA(label)} ${s._isAdmin?'<span style="font-size:10px;color:#fbbf24;margin-left:4px">Superadmin</span>':''}</div>
                <div class="sa-sess-meta">${metaParts.map(escA).join(' · ')} · ${timeStr}</div>
            </div>
            ${isLive
                ? `<div class="sa-sess-live"><div class="sa-sess-live-dot"></div>Live</div>`
                : `<div style="font-size:11px;color:rgba(255,255,255,.2);margin-left:auto;white-space:nowrap">${msAgo<3600000?Math.round(msAgo/60000)+' Min':Math.round(msAgo/3600000)+' Std'}</div>`}
        </div>`;
    }).join('');
}

// ── anlzSetPeriod: Zeitraum-Tabs im Analytics-Chart ───────────────────────────
// Wird aufgerufen von den 7/14/30/90-Tage-Buttons in #sa-panel-analytics.
// Rendert einen Bar-Chart der täglichen Umsätze im gewählten Zeitraum
// und aktualisiert #anlz-period-total sowie #anlz-trend-badge.
async function anlzSetPeriod(days, btn) {
    // Tab-Highlighting
    document.querySelectorAll('#sa-panel-analytics .sa-inner-tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');

    const timelineEl  = document.getElementById('sa-revenue-timeline');
    const totalEl     = document.getElementById('anlz-period-total');
    const trendEl     = document.getElementById('anlz-trend-badge');
    if (!timelineEl) return;

    timelineEl.innerHTML = '<div style="color:rgba(255,255,255,.2);font-size:12px;width:100%;text-align:center;padding-top:50px"><i class="fa-solid fa-spinner fa-spin" style="margin-right:6px"></i>Lade…</div>';

    try {
        const cutoff = new Date(Date.now() - days * 86400000);
        const snap = await db.collection('orders')
            .where('date', '>=', firebase.firestore.Timestamp.fromDate(cutoff))
            .get();

        // Tägliche Umsätze aggregieren
        const dayMap = {};
        snap.forEach(doc => {
            const o   = doc.data();
            const ts  = o.date?.toDate?.() || null;
            if (!ts) return;
            const key = ts.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
            dayMap[key] = (dayMap[key] || 0) + parseFloat(o.total || 0);
        });

        // Lückenlose Tages-Sequenz aufbauen (ältestes → neuestes)
        const entries = [];
        for (let i = days - 1; i >= 0; i--) {
            const d   = new Date(Date.now() - i * 86400000);
            const key = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
            entries.push([key, dayMap[key] || 0]);
        }

        const total  = entries.reduce((s, [, v]) => s + v, 0);
        const maxVal = Math.max(...entries.map(([, v]) => v), 0.01);

        // Trend: 1. Hälfte vs. 2. Hälfte
        const half      = Math.floor(entries.length / 2);
        const firstHalf = entries.slice(0, half).reduce((s, [, v]) => s + v, 0);
        const secHalf   = entries.slice(half).reduce((s, [, v]) => s + v, 0);
        const trendUp   = secHalf >= firstHalf;

        if (totalEl) totalEl.textContent = total.toFixed(2).replace('.', ',') + ' €';
        if (trendEl) {
            trendEl.textContent  = trendUp ? '▲ Steigend' : '▼ Fallend';
            trendEl.style.color  = trendUp ? '#34d399'    : '#f87171';
        }

        // Bar-Chart rendern
        timelineEl.innerHTML = entries.length ? entries.map(([day, val]) => {
            const pct     = Math.max(4, Math.round((val / maxVal) * 100));
            const barCol  = val > 0 ? 'linear-gradient(180deg,#a78bfa,#6d28d9)' : 'rgba(255,255,255,.06)';
            const valFmt  = val.toFixed(2).replace('.', ',') + ' €';
            return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;cursor:default"
                         title="${escA(day)}: ${valFmt}">
                <div style="font-size:8px;color:rgba(255,255,255,.3);line-height:1">${val > 0 ? valFmt : ''}</div>
                <div style="width:100%;background:${barCol};border-radius:3px 3px 0 0;height:${pct}px;transition:height .4s;min-height:4px"></div>
                <div style="font-size:7px;color:rgba(255,255,255,.2);white-space:nowrap">${day}</div>
            </div>`;
        }).join('') : '<div style="color:rgba(255,255,255,.2);font-size:12px;width:100%;text-align:center;padding-top:50px">Keine Bestellungen im Zeitraum</div>';

    } catch(e) {
        console.warn('anlzSetPeriod error:', e);
        if (timelineEl) timelineEl.innerHTML = `<div style="color:rgba(248,113,113,.5);font-size:12px;width:100%;text-align:center;padding-top:50px">Fehler: ${escA(e.message)}</div>`;
    }
}

// ── secLoadLoginHistory: SA-Login-Historie laden ──────────────────────────────
// Wird aufgerufen vom Refresh-Button neben "SA-Login-Historie" in #sa-panel-security.
// Liest die letzten 50 Einträge aus admin_logs (action = superadmin_zone_access)
// und rendert sie in #sec-login-history.
async function secLoadLoginHistory() {
    const el = document.getElementById('sec-login-history');
    if (!el) return;
    el.innerHTML = '<div style="color:rgba(255,255,255,.2);font-size:12px;padding:12px;text-align:center"><i class="fa-solid fa-spinner fa-spin" style="margin-right:6px"></i>Lade Login-Historie...</div>';
    try {
        const snap = await db.collection('admin_logs')
            .where('action', '==', 'superadmin_zone_access')
            .orderBy('timestamp', 'desc')
            .limit(50)
            .get();

        if (snap.empty) {
            el.innerHTML = '<div style="color:rgba(255,255,255,.2);font-size:12px;padding:20px;text-align:center"><i class="fa-solid fa-inbox" style="font-size:22px;display:block;margin-bottom:8px;opacity:.3"></i>Keine Login-Einträge gefunden</div>';
            return;
        }

        el.innerHTML = snap.docs.map(doc => {
            const d      = doc.data();
            const ts     = d.timestamp?.toDate?.() || null;
            const dtStr  = ts ? ts.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
            const ip     = d.details?.ip || d.ip || '—';
            const email  = d.adminEmail || d.details?.email || '—';
            return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:rgba(255,255,255,.03);border-radius:10px;border:1px solid rgba(255,255,255,.05)">
                <div style="width:7px;height:7px;border-radius:50%;background:#34d399;flex-shrink:0"></div>
                <div style="flex:1;min-width:0">
                    <div style="font-size:12px;font-weight:600;color:rgba(255,255,255,.75);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escA(email)}</div>
                    <div style="font-size:10px;color:rgba(255,255,255,.3);margin-top:1px">IP: ${escA(ip)}</div>
                </div>
                <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:rgba(255,255,255,.3);white-space:nowrap;flex-shrink:0">${dtStr}</div>
            </div>`;
        }).join('');
    } catch(e) {
        console.warn('secLoadLoginHistory error:', e);
        el.innerHTML = `<div style="color:rgba(248,113,113,.5);font-size:12px;padding:12px;text-align:center"><i class="fa-solid fa-circle-exclamation" style="margin-right:6px"></i>Fehler: ${escA(e.message)}</div>`;
    }
}

// ── sessKillAllGuests: Alle Gast-Sessions aus Firestore löschen ───────────────
// Wird aufgerufen vom "Alle Gäste entfernen"-Button in #sa-panel-sessions.
// Löscht alle presence-Dokumente, bei denen isGuest === true,
// und aktualisiert danach die Session-Liste.
async function sessKillAllGuests() {
    const guests = _saAllSessions.filter(s => s.isGuest);
    if (!guests.length) { showToast('ℹ️ Keine aktiven Gast-Sessions', 'success'); return; }
    if (!confirm(`${guests.length} Gast-Session(s) wirklich beenden?`)) return;

    showToast(`⏳ Entferne ${guests.length} Gast-Session(s)…`);
    try {
        const batch = db.batch();
        guests.forEach(s => batch.delete(db.collection('presence').doc(s.uid)));
        await batch.commit();
        await logAction('sess_kill_all_guests', 'presence', { count: guests.length });
        showToast(`✅ ${guests.length} Gast-Session(s) beendet`);
        await saLoadSessions();
    } catch(e) {
        console.warn('sessKillAllGuests error:', e);
        showToast('❌ Fehler: ' + e.message, 'error');
    }
}

// ── sessToggleAutorefresh: Auto-Refresh-Checkbox im Session Monitor ───────────
// Wird aufgerufen von der "Auto-Refresh (30s)"-Checkbox in #sa-panel-sessions.
// Startet bzw. stoppt den bereits vorhandenen _saSessionRefreshTimer.
function sessToggleAutorefresh(el) {
    if (el.checked) {
        saStartSessionAutoRefresh();           // definiert bei Zeile 14327 ff.
        showToast('🔄 Auto-Refresh aktiv (alle 30 s)');
    } else {
        if (_saSessionRefreshTimer) {
            clearInterval(_saSessionRefreshTimer);
            _saSessionRefreshTimer = null;
        }
        showToast('⏹ Auto-Refresh deaktiviert');
    }
}

async function saLoadSessions() {
    const el = document.getElementById('sa-sess-list');
    if (!el) return;
    el.innerHTML = '<div style="color:rgba(255,255,255,.2);font-size:13px;padding:16px"><i class="fa-solid fa-spinner fa-spin" style="margin-right:8px"></i>Lade Sessions...</div>';
    try {
        const [presenceSnap, adminsSnap] = await Promise.all([
            db.collection('presence').get(),
            db.collection('users').where('role','==','admin').get()
        ]);
        const adminUIDs = new Set(adminsSnap.docs.map(d => d.id));
        const now = Date.now();

        _saAllSessions = presenceSnap.docs
            .map(d => ({ uid: d.id, ...d.data(), _isAdmin: adminUIDs.has(d.id) }))
            .filter(s => { const t = s.lastSeen?.toDate?.()?.getTime?.() || 0; return (now - t) < 7200000; })
            .sort((a,b) => (b.lastSeen?.toDate?.()?.getTime?.() || 0) - (a.lastSeen?.toDate?.()?.getTime?.() || 0));

        const liveCount = _saAllSessions.filter(s => { const t=s.lastSeen?.toDate?.()?.getTime?.()||0; return now-t<90000; }).length;
        const countsEl  = document.getElementById('sa-sess-counts');
        if (countsEl) countsEl.textContent = `${liveCount} live · ${_saAllSessions.length} gesamt (2h)`;

        renderSessionList(el, _saAllSessions, now);
    } catch(e) {
        el.innerHTML = '<div style="color:rgba(248,113,113,.5);font-size:12px;padding:16px">Fehler: '+escA(e.message)+'</div>';
    }
}

// ── Backup & Export ───────────────────────────────────
async function saExport(collection, format) {
    showToast(`⏳ Exportiere ${collection}...`);
    try {
        const snap = await db.collection(collection).limit(1000).get();
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const safeData = JSON.parse(JSON.stringify(data, (key, val) => {
            if (val && typeof val === 'object' && val.toDate) return val.toDate().toISOString();
            return val;
        }));

        let content, mime, ext;
        if (format === 'json') {
            content = JSON.stringify(safeData, null, 2);
            mime = 'application/json'; ext = 'json';
        } else {
            if (safeData.length === 0) { showToast('Keine Daten zum Exportieren', 'warning'); return; }
            const keys = [...new Set(safeData.flatMap(r => Object.keys(r)))];
            const csv = [
                keys.join(';'),
                ...safeData.map(row => keys.map(k => {
                    const v = row[k] === undefined ? '' : typeof row[k] === 'object' ? JSON.stringify(row[k]) : String(row[k]);
                    return `"${v.replace(/"/g,'""')}"`;
                }).join(';'))
            ].join('\n');
            content = '\uFEFF' + csv; // BOM for Excel
            // E-10 FIX: Include charset=utf-8 in MIME type to guarantee encoding
            mime = 'text/csv;charset=utf-8'; ext = 'csv';
        }
        saDownload(`wavevapes_${collection}_${new Date().toISOString().slice(0,10)}.${ext}`, content, mime);
        await logAction('sa_export', collection, { format, count: safeData.length });
        showToast(`✅ ${safeData.length} Einträge exportiert`);
    } catch(e) { showToast('❌ Export fehlgeschlagen: ' + e.message, 'error'); }
}

async function saExportFull() {
    showToast('⏳ Erstelle Vollbackup...');
    const collections = ['products','orders','users','categories','coupons','reviews','admin_logs','settings'];
    const backup = { exportedAt: new Date().toISOString(), wavevapesVersion: '2.0', collections: {} };
    for (const col of collections) {
        try {
            const snap = await db.collection(col).limit(2000).get();
            backup.collections[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch(e) { backup.collections[col] = []; }
    }
    const content = JSON.stringify(backup, (key, val) => {
        if (val && typeof val === 'object' && val.toDate) return val.toDate().toISOString();
        return val;
    }, 2);
    saDownload(`wavevapes_fullbackup_${new Date().toISOString().slice(0,10)}.json`, content, 'application/json');
    await logAction('sa_fullexport', 'all', { collections });
    showToast('✅ Vollbackup erstellt');
}

function saDownload(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Danger Zone Actions ───────────────────────────────
async function saDangerShopClose() {
    if (!confirm('Shop wirklich SOFORT für alle Kunden schließen?')) return;
    try {
        await db.collection('settings').doc('main').set({ shop_closed: true }, { merge: true });
        cfgUpdateStatusPill();
        await logAction('danger_shop_close', 'main');
        showToast('🔴 Shop ist jetzt geschlossen — Kunden sehen die Wartungsseite');
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

async function saDangerShopOpen() {
    if (!confirm('Shop für alle Kunden wieder öffnen?')) return;
    try {
        await db.collection('settings').doc('main').set({ shop_closed: false }, { merge: true });
        cfgUpdateStatusPill();
        await logAction('danger_shop_open', 'main');
        showToast('🟢 Shop ist jetzt wieder geöffnet');
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

async function saDangerClearBannedIPs() {
    if (!confirm('Alle gesperrten IPs wirklich entsperren?')) return;
    try {
        const snap = await db.collection('banned_ips').get();
        const batch = db.batch();
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        await logAction('danger_clear_banned_ips', 'banned_ips', { count: snap.size });
        showToast(`✅ ${snap.size} IP-Sperren aufgehoben`);
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

async function saDangerRejectAllReviews() {
    if (!confirm('Wirklich alle ausstehenden Bewertungen ablehnen?')) return;
    try {
        const snap = await db.collection('reviews').where('approved','==',false).get();
        const pending = snap.docs.filter(d => !d.data().rejected);
        const batch = db.batch();
        pending.forEach(d => batch.update(d.ref, { rejected: true }));
        await batch.commit();
        await logAction('danger_reject_reviews', 'reviews', { count: pending.length });
        showToast(`✅ ${pending.length} Bewertungen abgelehnt`);
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

async function saDangerPurgeLogs() {
    if (!confirm('Alle Admin-Logs älter als 90 Tage löschen?')) return;
    try {
        const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
        const snap = await db.collection('admin_logs').get();
        const old = snap.docs.filter(d => {
            const t = d.data().timestamp?.toDate?.()?.getTime?.() || 0;
            return t > 0 && t < cutoff;
        });
        for (let i = 0; i < old.length; i += 400) {
            const batch = db.batch();
            old.slice(i, i + 400).forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
        await logAction('danger_purge_logs', 'admin_logs', { count: old.length });
        showToast(`✅ ${old.length} alte Logs gelöscht`);
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

async function saDangerResetLoyalty() {
    const typed = prompt('Tippe "PUNKTE ZURÜCKSETZEN" um fortzufahren:');
    if (typed !== 'PUNKTE ZURÜCKSETZEN') { showToast('Abgebrochen', 'warning'); return; }
    try {
        const snap = await db.collection('users').get();
        const batch = db.batch();
        snap.docs.forEach(d => batch.update(d.ref, { totalBonusPoints: 0, redeemedLoyaltyCodes: [] })); // BUG-010 FIX: loyaltyPoints existiert nicht im Schema
        await batch.commit();
        await logAction('danger_reset_loyalty', 'users', { count: snap.size });
        showToast(`✅ ${snap.size} Benutzer-Punkte zurückgesetzt`);
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

async function saDangerDeleteAllOrders() {
    const typed = prompt('ACHTUNG: Diese Aktion ist IRREVERSIBEL!\nTyp "ALLE BESTELLUNGEN LÖSCHEN" um fortzufahren:');
    if (typed !== 'ALLE BESTELLUNGEN LÖSCHEN') { showToast('Abgebrochen', 'warning'); return; }
    const confirm2 = prompt('Bist du ABSOLUT SICHER? Tippe nochmal "JA" zur Bestätigung:');
    if (confirm2 !== 'JA') { showToast('Abgebrochen', 'warning'); return; }
    try {
        const snap = await db.collection('orders').get();
        for (let i = 0; i < snap.docs.length; i += 400) {
            const batch = db.batch();
            snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
        await logAction('danger_delete_orders', 'orders', { count: snap.size });
        showToast(`☢️ ${snap.size} Bestellungen gelöscht`);
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

async function saDangerDeleteAllUsers() {
    const typed = prompt('ACHTUNG: IRREVERSIBEL!\nLöscht alle User-Dokumente aus Firestore (nicht Firebase Auth).\nTyp "ALLE USER LÖSCHEN" um fortzufahren:');
    if (typed !== 'ALLE USER LÖSCHEN') { showToast('Abgebrochen', 'warning'); return; }
    const confirm2 = prompt('Wirklich ALLE User löschen? Tippe "JA":');
    if (confirm2 !== 'JA') { showToast('Abgebrochen', 'warning'); return; }
    try {
        const snap = await db.collection('users').get();
        let deleted = 0;
        for (let i = 0; i < snap.docs.length; i += 400) {
            const batch = db.batch();
            snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
            await batch.commit();
            deleted += Math.min(400, snap.docs.length - i);
        }
        await logAction('danger_delete_all_users', 'users', { count: deleted });
        showToast(`☢️ ${deleted} User-Dokumente gelöscht`);
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

async function saDangerDisableAllCoupons() {
    if (!confirm('Alle aktiven Gutscheine deaktivieren?')) return;
    try {
        const snap = await db.collection('coupons').where('active', '==', true).get();
        if (snap.empty) { showToast('ℹ️ Keine aktiven Gutscheine vorhanden'); return; }
        for (let i = 0; i < snap.docs.length; i += 400) {
            const batch = db.batch();
            snap.docs.slice(i, i + 400).forEach(d => batch.update(d.ref, { active: false }));
            await batch.commit();
        }
        await logAction('danger_disable_coupons', 'coupons', { count: snap.size });
        showToast(`🎟️ ${snap.size} Gutscheine deaktiviert`, 'success');
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

async function saDangerDeactivateAllProducts() {
    if (!confirm('Alle Produkte auf "nicht verfügbar" setzen?\n\nDies kann rückgängig gemacht werden.')) return;
    try {
        const snap = await db.collection('products').where('available', '==', true).get();
        if (snap.empty) { showToast('ℹ️ Keine verfügbaren Produkte gefunden'); return; }
        for (let i = 0; i < snap.docs.length; i += 400) {
            const batch = db.batch();
            snap.docs.slice(i, i + 400).forEach(d => batch.update(d.ref, { available: false }));
            await batch.commit();
        }
        await logAction('danger_deactivate_products', 'products', { count: snap.size });
        showToast(`📦 ${snap.size} Produkte deaktiviert`, 'success');
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

async function saDangerClearPresence() {
    if (!confirm('Alle Presence-Einträge löschen?\n\nDies behebt "Geist-User" die als online erscheinen.')) return;
    try {
        const snap = await db.collection('presence').get();
        for (let i = 0; i < snap.docs.length; i += 400) {
            const batch = db.batch();
            snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
        await logAction('danger_clear_presence', 'presence', { count: snap.size });
        showToast(`🟢 ${snap.size} Presence-Einträge gelöscht`, 'success');
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

async function saDangerClearUnauthorized() {
    if (!confirm('Alle Zugriffsversuche aus unauthorized_access löschen?')) return;
    try {
        const snap = await db.collection('unauthorized_access').get();
        if (snap.empty) { showToast('ℹ️ Keine Einträge vorhanden'); return; }
        for (let i = 0; i < snap.docs.length; i += 400) {
            const batch = db.batch();
            snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
        await logAction('danger_clear_unauthorized', 'unauthorized_access', { count: snap.size });
        showToast(`🚩 ${snap.size} Zugriffsversuche gelöscht`, 'success');
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

async function saDangerClearUnauthorized() {
    if (!confirm('Alle Zugriffsversuche aus unauthorized_access löschen?')) return;
    try {
        const snap = await db.collection('unauthorized_access').get();
        if (snap.empty) { showToast('ℹ️ Keine Einträge vorhanden'); return; }
        for (let i = 0; i < snap.docs.length; i += 400) {
            const batch = db.batch();
            snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
        await logAction('danger_clear_unauthorized', 'unauthorized_access', { count: snap.size });
        showToast(`🚩 ${snap.size} Zugriffsversuche gelöscht`, 'success');
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

// ─────────────────────────────────────────────────────────────────────────────
//  NEW DANGER ZONE ACTIONS
// ─────────────────────────────────────────────────────────────────────────────

async function saDangerSecurityLockdown() {
    const typed = prompt('SECURITY LOCKDOWN: Alle Nicht-SA-Logins werden gesperrt, Shop wird geschlossen.\nBestätige mit "LOCKDOWN":');
    if (typed !== 'LOCKDOWN') { showToast('Abgebrochen', 'warning'); return; }
    try {
        const batch = db.batch();
        // Shop schließen
        batch.set(db.collection('settings').doc('main'), { shop_closed: true, lockdown: true, lockdownAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        // Lockdown-Flag in superadmin settings
        batch.set(db.collection('settings').doc('superadmin'), { lockdown: true, lockdownAt: firebase.firestore.FieldValue.serverTimestamp(), lockdownBy: auth.currentUser?.email || '?' }, { merge: true });
        await batch.commit();
        cfgUpdateStatusPill?.();
        await logAction('danger_security_lockdown', 'system', { initiatedBy: auth.currentUser?.email });
        showToast('🔒 Security Lockdown aktiviert — Shop geschlossen, alle Sessions invalidiert', 'error');
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

async function saDangerRevokeAdminTokens() {
    if (!confirm('Alle Admin-Token-Versionen hochsetzen?\n\nAlle Admins außer dir werden ausgeloggt.')) return;
    try {
        const snap = await db.collection('users').where('role', '==', 'admin').get();
        const myUID = auth.currentUser?.uid;
        let revoked = 0;
        for (let i = 0; i < snap.docs.length; i += 400) {
            const batch = db.batch();
            snap.docs.slice(i, i + 400).forEach(d => {
                if (d.id !== myUID) {
                    const cur = d.data().adminTokenVersion || 0;
                    batch.update(d.ref, { adminTokenVersion: cur + 1 });
                    revoked++;
                }
            });
            await batch.commit();
        }
        await logAction('danger_revoke_admin_tokens', 'users', { count: revoked });
        showToast(`🚫 ${revoked} Admin-Tokens revoked — alle Admins außer dir wurden ausgeloggt`, 'success');
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

async function saDangerClearClickEvents() {
    const typed = prompt('Alle Click-Events löschen? Analyse-Daten gehen verloren.\nTyp "EVENTS LÖSCHEN":');
    if (typed !== 'EVENTS LÖSCHEN') { showToast('Abgebrochen', 'warning'); return; }
    try {
        const snap = await db.collection('click_events').get();
        for (let i = 0; i < snap.docs.length; i += 400) {
            const batch = db.batch();
            snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
        await logAction('danger_clear_click_events', 'click_events', { count: snap.size });
        showToast(`✅ ${snap.size} Click-Events gelöscht`, 'success');
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

async function saDangerDeleteAllBackups() {
    if (!confirm('Wirklich ALLE Backups aus Firestore löschen?\n\nDie Konfiguration bleibt erhalten.')) return;
    const typed = prompt('Tippe "BACKUPS LÖSCHEN" zur Bestätigung:');
    if (typed !== 'BACKUPS LÖSCHEN') { showToast('Abgebrochen', 'warning'); return; }
    try {
        const snap = await db.collection('backups').get();
        if (snap.empty) { showToast('ℹ️ Keine Backups vorhanden'); return; }
        for (let i = 0; i < snap.docs.length; i += 400) {
            const batch = db.batch();
            snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
        await logAction('danger_delete_all_backups', 'backups', { count: snap.size });
        showToast(`🗑️ ${snap.size} Backups gelöscht`, 'success');
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SHOP-KONFIGURATION (SA Panel)
// ─────────────────────────────────────────────────────────────────────────────

async function cfgLoad() {
    try {
        const snap = await db.collection('settings').doc('main').get();
        if (!snap.exists) return;
        const d = snap.data();
        const s = (id, val) => { const el = document.getElementById(id); if (el) { if (el.type === 'checkbox') el.checked = !!val; else el.value = val ?? el.value; } };
        s('cfg-4for3',                d.feature_4for3 ?? true);
        s('cfg-mystery',              d.feature_mystery ?? true);
        s('cfg-mystery-threshold',    d.mystery_threshold ?? 100);
        s('cfg-freeship',             d.feature_freeship ?? true);
        s('cfg-freeship-threshold',   d.freeship_threshold ?? 100);
        s('cfg-loyalty',              d.feature_loyalty ?? true);
        s('cfg-loyalty-rate',         d.loyalty_rate ?? 10);
        s('cfg-registration',         d.registration_open ?? true);
        s('cfg-review-mod',           d.review_moderation ?? true);
        s('cfg-banner-active',        d.banner_active ?? false);
        s('cfg-banner-text',          d.banner_text ?? '');
        s('cfg-maintenance-msg',      d.maintenance_message ?? '');
        s('cfg-global-discount-active', d.global_discount_active ?? false);
        s('cfg-global-discount-pct',  d.global_discount_pct ?? 0);
        s('cfg-global-discount-expiry', d.global_discount_expiry ?? '');
        s('cfg-min-order',            d.min_order_value ?? 0);
        s('cfg-shipping-cost',        d.shipping_cost ?? 4.99);
        s('cfg-return-days',          d.return_days ?? 14);
        s('cfg-contact-email',        d.contact_email ?? '');
        s('cfg-instagram',            d.instagram_url ?? '');
        s('cfg-shop-name',            d.shop_display_name ?? 'WaveVapes');
        s('cfg-age-gate',             d.age_gate ?? 18);
        // Banner color radio
        const col = d.banner_color || 'amber';
        const radio = document.querySelector(`input[name="cfg-banner-color"][value="${col}"]`);
        if (radio) radio.checked = true;
    } catch(e) { console.warn('cfgLoad error:', e); }
}

async function cfgSaveAll() {
    const g = id => { const el = document.getElementById(id); if (!el) return null; return el.type === 'checkbox' ? el.checked : el.value; };
    const bannerColor = document.querySelector('input[name="cfg-banner-color"]:checked')?.value || 'amber';
    const data = {
        feature_4for3:           !!g('cfg-4for3'),
        feature_mystery:         !!g('cfg-mystery'),
        mystery_threshold:       parseFloat(g('cfg-mystery-threshold')) || 100,
        feature_freeship:        !!g('cfg-freeship'),
        freeship_threshold:      parseFloat(g('cfg-freeship-threshold')) || 100,
        feature_loyalty:         !!g('cfg-loyalty'),
        loyalty_rate:            parseInt(g('cfg-loyalty-rate')) || 10,
        registration_open:       !!g('cfg-registration'),
        review_moderation:       !!g('cfg-review-mod'),
        banner_active:           !!g('cfg-banner-active'),
        banner_text:             g('cfg-banner-text') || '',
        banner_color:            bannerColor,
        maintenance_message:     g('cfg-maintenance-msg') || '',
        global_discount_active:  !!g('cfg-global-discount-active'),
        global_discount_pct:     parseFloat(g('cfg-global-discount-pct')) || 0,
        global_discount_expiry:  g('cfg-global-discount-expiry') || '',
        min_order_value:         parseFloat(g('cfg-min-order')) || 0,
        shipping_cost:           parseFloat(g('cfg-shipping-cost')) || 4.99,
        return_days:             parseInt(g('cfg-return-days')) || 14,
        contact_email:           g('cfg-contact-email') || '',
        instagram_url:           g('cfg-instagram') || '',
        shop_display_name:       g('cfg-shop-name') || 'WaveVapes',
        age_gate:                parseInt(g('cfg-age-gate')) || 18,
        updatedAt:               firebase.firestore.FieldValue.serverTimestamp(),
    };
    try {
        await db.collection('settings').doc('main').set(data, { merge: true });
        await logAction('sa_shop_config_saved', 'settings/main', { keys: Object.keys(data).length });
        showToast('✅ Shop-Konfiguration gespeichert', 'success');
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SYSTEM-HEALTH MONITOR
// ─────────────────────────────────────────────────────────────────────────────

let _healthLatencyHistory = [];

async function healthRunCheck() {
    const btn = document.getElementById('health-check-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Prüfe...'; }

    const setKpi = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const checklist = document.getElementById('health-checklist');
    const checks = [];

    try {
        const t0 = Date.now();

        // 1. Firestore Ping / Latenz
        await db.collection('settings').doc('main').get();
        const latencyMs = Date.now() - t0;
        _healthLatencyHistory.push({ t: new Date(), ms: latencyMs });
        if (_healthLatencyHistory.length > 20) _healthLatencyHistory.shift();
        setKpi('h-latency', latencyMs + ' ms');
        checks.push({ label: 'Firestore Verbindung', sub: latencyMs + ' ms Latenz', status: latencyMs < 500 ? 'ok' : latencyMs < 1500 ? 'warn' : 'err', badge: latencyMs < 500 ? 'OK' : latencyMs < 1500 ? 'Langsam' : 'Kritisch' });

        // 2. Collection sizes
        const colNames = ['products','orders','users','coupons','reviews','admin_logs','banned_ips','unauthorized_access','presence','click_events','backups'];
        const colGrid = document.getElementById('health-collections-grid');
        let totalDocs = 0;
        const colData = [];
        await Promise.all(colNames.map(async col => {
            try {
                const snap = await db.collection(col).get();
                colData.push({ col, count: snap.size });
                totalDocs += snap.size;
            } catch(e) { colData.push({ col, count: '?' }); }
        }));
        colData.sort((a,b) => (b.count||0) - (a.count||0));
        const maxCount = Math.max(...colData.map(c => c.count || 0), 1);
        if (colGrid) colGrid.innerHTML = colData.map(c => `
            <div class="health-col-bar">
                <div class="health-col-name"><span>${c.col}</span><span class="health-col-val">${c.count}</span></div>
                <div style="height:6px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden">
                    <div style="height:100%;width:${Math.max(4,Math.round((c.count||0)/maxCount*100))}%;background:linear-gradient(90deg,#67e8f9,#a78bfa);border-radius:3px;transition:width .6s"></div>
                </div>
            </div>`).join('');
        setKpi('h-docs', totalDocs.toLocaleString('de-DE'));
        checks.push({ label: 'Collections erreichbar', sub: colNames.length + ' Collections, ' + totalDocs + ' Dokumente', status: 'ok', badge: 'OK' });

        // 3. Banned IPs
        const bannedSnap = await db.collection('banned_ips').get();
        setKpi('h-banned-ips', bannedSnap.size);
        checks.push({ label: 'IP-Sperren', sub: bannedSnap.size + ' gesperrte IPs', status: bannedSnap.size > 50 ? 'warn' : 'ok', badge: bannedSnap.size > 50 ? 'Viele' : 'OK' });

        // 4. Unauthorized access (24h)
        const unauthSnap = await db.collection('unauthorized_access').get();
        const cutoff24h = Date.now() - 86400000;
        const recent = unauthSnap.docs.filter(d => (d.data().timestamp?.toDate?.()?.getTime?.() || 0) > cutoff24h).length;
        setKpi('h-errors', recent);
        checks.push({ label: 'Unauthorized-Zugriffe (24h)', sub: recent + ' Versuche', status: recent > 20 ? 'err' : recent > 5 ? 'warn' : 'ok', badge: recent > 20 ? 'Kritisch' : recent > 5 ? 'Auffällig' : 'OK' });

        // 5. Online users
        const presSnap = await db.collection('presence').get();
        const now = Date.now();
        const online = presSnap.docs.filter(d => (now - (d.data().lastSeen?.toDate?.()?.getTime?.() || 0)) < 90000).length;
        setKpi('h-online', online);

        // 6. Simulated read/write counters (from admin_logs today)
        const todayStart = new Date(); todayStart.setHours(0,0,0,0);
        const logsSnap = await db.collection('admin_logs').orderBy('timestamp','desc').limit(500).get();
        const todayLogs = logsSnap.docs.filter(d => (d.data().timestamp?.toDate?.() || new Date(0)) >= todayStart);
        setKpi('h-reads', '~' + (todayLogs.length * 15 + totalDocs).toLocaleString('de-DE'));
        setKpi('h-writes', '~' + todayLogs.length.toLocaleString('de-DE'));
        setKpi('h-listeners', document.querySelectorAll('[id*="unsub"]').length || '—');

        // 7. Shop status check
        const mainSnap = await db.collection('settings').doc('main').get();
        const shopClosed = mainSnap.exists && mainSnap.data().shop_closed === true;
        checks.push({ label: 'Shop-Status', sub: shopClosed ? 'Shop ist geschlossen' : 'Shop ist geöffnet', status: shopClosed ? 'warn' : 'ok', badge: shopClosed ? 'Geschlossen' : 'Online' });

        // 8. Pending reviews
        const pendingRevSnap = await db.collection('reviews').where('approved','==',false).get();
        const pending = pendingRevSnap.docs.filter(d => !d.data().rejected).length;
        checks.push({ label: 'Ausstehende Bewertungen', sub: pending + ' warten auf Freigabe', status: pending > 10 ? 'warn' : 'ok', badge: pending > 0 ? pending + ' ausstehend' : 'Leer' });

        // Render checklist
        if (checklist) checklist.innerHTML = checks.map(c => `
            <div class="health-check-item ${c.status === 'ok' ? 'health-ok' : c.status === 'warn' ? 'health-warn' : 'health-err'}">
                <div class="health-check-icon"><i class="fa-solid fa-${c.status === 'ok' ? 'check' : c.status === 'warn' ? 'triangle-exclamation' : 'circle-xmark'}"></i></div>
                <div style="flex:1"><div class="health-check-label">${c.label}</div><div class="health-check-sub">${c.sub}</div></div>
                <div class="${c.status === 'ok' ? 'health-badge-ok' : c.status === 'warn' ? 'health-badge-warn' : 'health-badge-err'}">${c.badge}</div>
            </div>`).join('');

        // Overall status
        const hasErr  = checks.some(c => c.status === 'err');
        const hasWarn = checks.some(c => c.status === 'warn');
        const dot  = document.getElementById('health-overall-dot');
        const text = document.getElementById('health-overall-text');
        const bar  = document.getElementById('health-status-bar');
        if (dot && text) {
            if (hasErr)        { dot.style.background='#f87171'; dot.style.boxShadow='0 0 12px #f87171'; text.textContent='⚠️ Kritische Probleme erkannt'; text.style.color='#f87171'; if(bar){bar.style.background='linear-gradient(135deg,rgba(248,113,113,.06),rgba(248,113,113,.02))';bar.style.borderColor='rgba(248,113,113,.2)';} }
            else if (hasWarn)  { dot.style.background='#fbbf24'; dot.style.boxShadow='0 0 12px #fbbf24'; text.textContent='⚠️ Warnungen vorhanden'; text.style.color='#fbbf24'; if(bar){bar.style.background='linear-gradient(135deg,rgba(251,191,36,.06),rgba(251,191,36,.02))';bar.style.borderColor='rgba(251,191,36,.2)';} }
            else               { dot.style.background='#34d399'; dot.style.boxShadow='0 0 12px #34d399'; text.textContent='✅ Alle Systeme betriebsbereit'; text.style.color='#34d399'; }
        }
        const lastCheck = document.getElementById('health-last-check');
        if (lastCheck) lastCheck.textContent = 'Letzter Check: ' + new Date().toLocaleTimeString('de-DE');

        // Latency chart
        healthRenderLatencyChart();

    } catch(e) {
        showToast('❌ Health-Check fehlgeschlagen: ' + e.message, 'error');
        if (checklist) checklist.innerHTML = `<div style="color:#f87171;font-size:12px;padding:16px">Fehler: ${escA(e.message)}</div>`;
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Health-Check starten'; }
    }
}

function healthRenderLatencyChart() {
    const el = document.getElementById('health-latency-chart');
    if (!el || !_healthLatencyHistory.length) return;
    const max = Math.max(..._healthLatencyHistory.map(h => h.ms), 1);
    el.innerHTML = `
        <div style="display:flex;align-items:flex-end;gap:6px;height:80px;margin-bottom:8px">
            ${_healthLatencyHistory.map(h => `
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px" title="${h.ms}ms @ ${h.t.toLocaleTimeString('de-DE')}">
                <div style="font-size:8px;color:rgba(255,255,255,.3)">${h.ms}</div>
                <div style="width:100%;border-radius:3px 3px 0 0;background:${h.ms<500?'linear-gradient(180deg,#34d399,#059669)':h.ms<1500?'linear-gradient(180deg,#fbbf24,#d97706)':'linear-gradient(180deg,#f87171,#dc2626)'};height:${Math.max(4,Math.round(h.ms/max*60))}px"></div>
            </div>`).join('')}
        </div>
        <div style="font-size:10px;color:rgba(255,255,255,.2);text-align:right">Firestore Latenz (ms) — letzte ${_healthLatencyHistory.length} Messungen</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  AUDIT-TRAIL
// ─────────────────────────────────────────────────────────────────────────────

let _auditAllDocs = [];
let _auditFiltered = [];
let _auditPage = 0;
const AUDIT_PAGE_SIZE = 50;

async function auditLoad() {
    const tbody = document.getElementById('audit-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="padding:40px;text-align:center;color:rgba(255,255,255,.2);font-size:13px"><i class="fa-solid fa-spinner fa-spin" style="margin-right:8px"></i>Lade Audit-Trail...</td></tr>';
    try {
        const snap = await db.collection('admin_logs').orderBy('timestamp','desc').limit(1000).get();
        _auditAllDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Populate admin filter
        const adminSel = document.getElementById('audit-filter-admin');
        if (adminSel) {
            const admins = [...new Set(_auditAllDocs.map(d => d.adminEmail).filter(Boolean))];
            adminSel.innerHTML = '<option value="">Alle Admins</option>' + admins.map(a => `<option value="${escA(a)}">${escA(a)}</option>`).join('');
        }

        const totalBadge = document.getElementById('audit-total-badge');
        if (totalBadge) totalBadge.textContent = snap.size + ' Einträge';

        _auditPage = 0;
        auditApplyFilter();
    } catch(e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="padding:40px;text-align:center;color:#f87171;font-size:13px">${escA(e.message)}</td></tr>`;
    }
}

function auditGetType(action) {
    if (!action) return 'other';
    if (action.includes('danger') || action.includes('delete_all') || action.includes('lockdown') || action.includes('revoke')) return 'danger';
    if (action.includes('access') || action.includes('login')) return 'access';
    if (action.includes('admin_add') || action.includes('admin_rem') || action.includes('permissions')) return 'admin';
    if (action.includes('export') || action.includes('backup')) return 'export';
    if (action.includes('order')) return 'order';
    if (action.includes('product') || action.includes('bulk')) return 'product';
    if (action.includes('security') || action.includes('ip') || action.includes('ban')) return 'security';
    if (action.includes('config') || action.includes('settings')) return 'config';
    return 'other';
}

function auditApplyFilter() {
    const q      = (document.getElementById('audit-search')?.value || '').toLowerCase();
    const type   = document.getElementById('audit-filter-type')?.value || '';
    const admin  = document.getElementById('audit-filter-admin')?.value || '';
    const period = parseInt(document.getElementById('audit-filter-period')?.value || '0');
    const cutoff = period > 0 ? Date.now() - period * 86400000 : 0;
    const now    = Date.now();
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);

    _auditFiltered = _auditAllDocs.filter(d => {
        const ts = d.timestamp?.toDate?.()?.getTime?.() || 0;
        if (cutoff && ts < cutoff) return false;
        if (admin && d.adminEmail !== admin) return false;
        const t = auditGetType(d.action);
        if (type && t !== type) return false;
        if (q && !((d.action||'').toLowerCase().includes(q) || (d.adminEmail||'').toLowerCase().includes(q) || (d.target||'').toLowerCase().includes(q))) return false;
        return true;
    });

    // Stats
    const dangerCount = _auditFiltered.filter(d => auditGetType(d.action) === 'danger').length;
    const admins = new Set(_auditFiltered.map(d => d.adminEmail).filter(Boolean));
    const todayCount = _auditFiltered.filter(d => (d.timestamp?.toDate?.() || new Date(0)) >= todayStart).length;
    const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    s('audit-filtered-count', _auditFiltered.length);
    s('audit-danger-count', dangerCount);
    s('audit-admin-count', admins.size);
    s('audit-today-count', todayCount);

    _auditPage = 0;
    auditRenderTable();
}

const AUDIT_ACTION_LABELS = {
    'superadmin_zone_access':    '🔓 SA-Zone aufgerufen',
    'admin_added':               '➕ Admin hinzugefügt',
    'admin_removed':             '➖ Admin entfernt',
    'admin_permissions_updated': '⚙️ Berechtigungen geändert',
    'ip_whitelist_updated':      '🌐 IP-Whitelist geändert',
    'sa_security_settings':      '🔒 Sicherheitseinstellungen',
    'sa_export':                 '💾 Daten exportiert',
    'sa_fullexport':             '💾 Vollbackup erstellt',
    'auto_backup_created':       '🔄 Auto-Backup erstellt',
    'danger_shop_close':         '🔴 Shop geschlossen',
    'danger_shop_open':          '🟢 Shop geöffnet',
    'danger_clear_banned_ips':   '🧹 IP-Sperren aufgehoben',
    'danger_reject_reviews':     '🗑️ Reviews massenabgelehnt',
    'danger_purge_logs':         '🗑️ Alte Logs gelöscht',
    'danger_reset_loyalty':      '🔄 Loyalty zurückgesetzt',
    'danger_delete_orders':      '☢️ ALLE Bestellungen gelöscht',
    'danger_delete_all_users':   '☢️ ALLE User gelöscht',
    'danger_security_lockdown':  '🔒 Security Lockdown aktiviert',
    'danger_revoke_admin_tokens':'🚫 Admin-Tokens revoked',
    'danger_clear_click_events': '🗑️ Click-Events gelöscht',
    'danger_delete_all_backups': '🗑️ Alle Backups gelöscht',
    'sa_shop_config_saved':      '⚙️ Shop-Konfiguration gespeichert',
    'bulk_edit':                 '📝 Bulk-Produkt-Edit',
    'quickStatus':               '📦 Bestellstatus geändert',
};
const AUDIT_TYPE_LABELS = { danger:'⚡ Danger', access:'🔓 Zugriff', admin:'👑 Admin', export:'💾 Export', order:'📦 Bestellung', product:'🛍️ Produkt', security:'🔒 Security', config:'⚙️ Config', other:'• Sonstige' };

function auditRenderTable() {
    const tbody = document.getElementById('audit-tbody');
    if (!tbody) return;
    const start = _auditPage * AUDIT_PAGE_SIZE;
    const page  = _auditFiltered.slice(start, start + AUDIT_PAGE_SIZE);

    if (!_auditFiltered.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="padding:40px;text-align:center;color:rgba(255,255,255,.2);font-size:13px"><i class="fa-solid fa-inbox" style="font-size:28px;display:block;margin-bottom:10px;opacity:.3"></i>Keine Einträge in diesem Filter</td></tr>';
        auditUpdateFooter();
        return;
    }

    tbody.innerHTML = page.map(d => {
        const ts  = d.timestamp?.toDate?.() || null;
        const dt  = ts ? ts.toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';
        const type = auditGetType(d.action);
        const label = AUDIT_ACTION_LABELS[d.action] || ('⚡ ' + d.action);
        const details = d.target ? escA(d.target.substring(0,30)) + (d.target.length>30?'…':'') : (d.details ? JSON.stringify(d.details).substring(0,40)+'…' : '—');
        return `<tr class="audit-row">
            <td style="color:rgba(255,255,255,.35);font-family:'JetBrains Mono',monospace;font-size:11px;white-space:nowrap">${dt}</td>
            <td style="color:#a78bfa;font-size:11px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escA(d.adminEmail || '—')}</td>
            <td style="color:rgba(255,255,255,.85)">${label}</td>
            <td style="color:rgba(255,255,255,.35);font-size:11px;font-family:'JetBrains Mono',monospace">${details}</td>
            <td style="text-align:center"><span class="audit-type-badge audit-type-${type}">${AUDIT_TYPE_LABELS[type]||type}</span></td>
        </tr>`;
    }).join('');

    auditUpdateFooter();
}

function auditUpdateFooter() {
    const total = _auditFiltered.length;
    const start = _auditPage * AUDIT_PAGE_SIZE + 1;
    const end   = Math.min(start + AUDIT_PAGE_SIZE - 1, total);
    const label = document.getElementById('audit-footer-label');
    if (label) label.textContent = total > 0 ? `${start}–${end} von ${total} Einträgen` : '0 Einträge';
    const prev = document.getElementById('audit-prev');
    const next = document.getElementById('audit-next');
    if (prev) prev.disabled = _auditPage === 0;
    if (next) next.disabled = end >= total;
}

function auditPagePrev() { if (_auditPage > 0) { _auditPage--; auditRenderTable(); } }
function auditPageNext() { if ((_auditPage+1)*AUDIT_PAGE_SIZE < _auditFiltered.length) { _auditPage++; auditRenderTable(); } }

function auditExportCSV() {
    if (!_auditFiltered.length) { showToast('ℹ️ Keine Daten zum Exportieren'); return; }
    const keys = ['timestamp','adminEmail','action','target','type'];
    const rows = _auditFiltered.map(d => [
        d.timestamp?.toDate?.()?.toISOString?.() || '',
        d.adminEmail || '',
        d.action || '',
        d.target || '',
        auditGetType(d.action),
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(';'));
    const csv = '\uFEFF' + [keys.join(';'), ...rows].join('\n');
    saDownload(`wavevapes_audit_${new Date().toISOString().slice(0,10)}.csv`, csv, 'text/csv;charset=utf-8');
    showToast(`✅ ${_auditFiltered.length} Einträge exportiert`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  HOOK: saSwitchInner — extend for new panels
// ─────────────────────────────────────────────────────────────────────────────
const _origSaSwitchInner = saSwitchInner;
window.saSwitchInner = function(panel, el) {
    _origSaSwitchInner(panel, el);
    if (panel === 'shopconfig')  { cfgLoad(); }
    if (panel === 'health')      { healthRunCheck(); }
    if (panel === 'audittrail')  { auditLoad(); }
    if (panel === 'admins')      { setTimeout(saUpdateAdminStats, 200); }
    if (panel === 'security')    { saLoadBruteForce(); }
    if (panel === 'sessions')    { saStartSessionAutoRefresh(); }
};

// ─────────────────────────────────────────────────────────────────────────────
//  ADMIN-VERWALTUNG EXTENSIONS
// ─────────────────────────────────────────────────────────────────────────────

function saUpdateAdminStats() {
    if (!window.saAllAdmins) return;
    const superSnap_coUIDs = window.saCoSuperadminUIDs || [];
    const total   = saAllAdmins.length;
    const cosuper = saAllAdmins.filter(a => superSnap_coUIDs.includes(a.id)).length;
    const with2fa = saAllAdmins.filter(a => a.twoFactorEnabled).length;
    const rdonly  = saAllAdmins.filter(a => a.readOnly).length;
    const today   = new Date(); today.setHours(0,0,0,0);
    const todayActive = saAllAdmins.filter(a => {
        const t = a.lastAdminLogin?.toDate?.()?.getTime?.() || 0;
        return t >= today.getTime();
    }).length;
    const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    s('sa-admins-total',      total);
    s('sa-admins-cosupercount', cosuper);
    s('sa-admins-2facount',   with2fa);
    s('sa-admins-rocount',    rdonly);
    s('sa-admins-todaycount', todayActive);
}

function saFilterAdmins() {
    if (!window.saAllAdmins) return;
    const q      = (document.getElementById('sa-admins-search')?.value || '').toLowerCase();
    const role   = document.getElementById('sa-admins-filter-role')?.value || '';
    const fa2    = document.getElementById('sa-admins-filter-2fa')?.value || '';
    const coUIDs = window.saCoSuperadminUIDs || [];
    const superUID = window._superUID;

    const grid = document.getElementById('sa-admin-grid');
    if (!grid) return;

    Array.from(grid.querySelectorAll('.sa-admin-card')).forEach(card => {
        const uid = card.id.replace('sa-card-','');
        const admin = saAllAdmins.find(a => a.id === uid);
        if (!admin) return;
        let show = true;
        if (q && !((admin.email||'').toLowerCase().includes(q) || (admin.username||'').toLowerCase().includes(q))) show = false;
        if (role) {
            const isPrimary = admin.id === superUID;
            const isCoS = coUIDs.includes(admin.id);
            if (role === 'super'   && !isPrimary) show = false;
            if (role === 'cosuper' && !isCoS)     show = false;
            if (role === 'regular' && (isPrimary || isCoS)) show = false;
        }
        if (fa2 === 'yes' && !admin.twoFactorEnabled) show = false;
        if (fa2 === 'no'  &&  admin.twoFactorEnabled) show = false;
        card.style.display = show ? '' : 'none';
    });
}

async function saToggleReadOnly(uid, isReadOnly) {
    try {
        await db.collection('users').doc(uid).update({ readOnly: isReadOnly });
        await logAction('admin_readonly_toggled', uid, { readOnly: isReadOnly });
        showToast(isReadOnly ? '👁️ Admin auf Nur-Lesen gesetzt' : '✏️ Schreibrechte wiederhergestellt', 'success');
        saLoadAdmins();
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

async function saToggleLoginHistory(uid) {
    const wrapper = document.getElementById(`sa-loginhistory-${uid}`);
    if (!wrapper) return;
    const isOpen = wrapper.style.display !== 'none';
    wrapper.style.display = isOpen ? 'none' : 'block';
    if (isOpen) return;

    const inner = document.getElementById(`sa-loginhistory-inner-${uid}`);
    if (!inner) return;
    try {
        const snap = await db.collection('admin_logs')
            .where('adminEmail', '==', saAllAdmins.find(a => a.id === uid)?.email)
            .orderBy('timestamp', 'desc')
            .limit(10)
            .get();
        if (snap.empty) { inner.innerHTML = '<div style="color:rgba(255,255,255,.2);font-size:11px">Keine Login-Einträge gefunden</div>'; return; }
        inner.innerHTML = snap.docs.map(d => {
            const data = d.data();
            const ts = data.timestamp?.toDate?.() || null;
            const dt = ts ? ts.toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';
            return `<div style="display:flex;gap:10px;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04)">
                <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:rgba(255,255,255,.3);white-space:nowrap">${dt}</div>
                <div style="font-size:11px;color:rgba(255,255,255,.6);flex:1">${data.action||'—'}</div>
                ${data.details?.ip ? `<div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:rgba(255,255,255,.2)">${data.details.ip}</div>` : ''}
            </div>`;
        }).join('');
    } catch(e) {
        inner.innerHTML = `<div style="color:#f87171;font-size:11px">${escA(e.message)}</div>`;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SESSION MONITOR EXTENSIONS — Kick + Auto-Refresh
// ─────────────────────────────────────────────────────────────────────────────

let _saSessionRefreshTimer = null;

function saStartSessionAutoRefresh() {
    if (_saSessionRefreshTimer) clearInterval(_saSessionRefreshTimer);
    saLoadSessions();
    _saSessionRefreshTimer = setInterval(() => {
        if (document.getElementById('sa-panel-sessions')?.classList.contains('active')) {
            saLoadSessions();
        } else {
            clearInterval(_saSessionRefreshTimer);
            _saSessionRefreshTimer = null;
        }
    }, 30000); // refresh every 30s
}

async function saKickSession(uid, email) {
    if (!confirm(`Session von "${email || uid}" beenden?\n\nDer Nutzer wird beim nächsten Seitenaufruf abgemeldet.`)) return;
    try {
        // Set a kick flag in presence doc — the shop frontend checks this
        await db.collection('presence').doc(uid).set({ kicked: true, kickedAt: firebase.firestore.FieldValue.serverTimestamp(), kickedBy: auth.currentUser?.email }, { merge: true });
        await logAction('session_kicked', uid, { targetEmail: email, by: auth.currentUser?.email });
        showToast(`🚫 Session von ${email || uid} beendet`, 'success');
        saLoadSessions();
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}

// Patch renderSessionList to include Kick button
const _origRenderSessionList = renderSessionList;
window.renderSessionList = function(el, sessions, now) {
    if (!sessions.length) {
        el.innerHTML = '<div style="color:rgba(255,255,255,.2);font-size:13px;padding:24px;text-align:center"><i class="fa-solid fa-moon" style="font-size:28px;display:block;margin-bottom:10px;opacity:.3"></i>Keine Sessions in diesem Filter</div>';
        return;
    }
    el.innerHTML = sessions.map(s => {
        const lastSeen = s.lastSeen?.toDate?.() || null;
        const msAgo    = lastSeen ? now - lastSeen.getTime() : Infinity;
        const isLive   = msAgo < 90000;
        const timeStr  = lastSeen ? lastSeen.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}) : '—';
        const initials = s._isAdmin ? '👑' : s.isGuest ? '👤' : (s.email||'?').substring(0,2).toUpperCase();
        const avatarBg = s._isAdmin ? 'background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#000'
                       : s.isGuest  ? 'background:rgba(255,255,255,.08);color:rgba(255,255,255,.4)'
                       : 'background:linear-gradient(135deg,#67e8f9,#a78bfa);color:#000';
        const label    = s._isAdmin ? (s.email||s.uid) : s.isGuest ? 'Gast' : (s.email || s.username || s.uid);
        const metaParts = [];
        if (s.username) metaParts.push('@'+s.username);
        if (s.cartCount) metaParts.push('🛒 '+s.cartCount+' Item'+(s.cartCount>1?'s':''));
        if (s.page) metaParts.push(s.page);
        if (s.ip) metaParts.push(s.ip);
        const isKicked = s.kicked === true;
        const myUID = window.auth?.currentUser?.uid;
        const canKick = s.uid !== myUID && !s.isGuest;
        return `<div class="sa-sess-card" style="${isKicked?'opacity:.4;':''}">
            <div class="sa-sess-avatar" style="${avatarBg};font-size:${s._isAdmin?'14px':'11px'}">${initials}</div>
            <div style="flex:1;min-width:0">
                <div class="sa-sess-email">${escA(label)} ${s._isAdmin?'<span style="font-size:10px;color:#fbbf24;margin-left:4px">Admin</span>':''}${isKicked?'<span style="font-size:10px;color:#f87171;margin-left:4px">KICKED</span>':''}</div>
                <div class="sa-sess-meta">${metaParts.map(escA).join(' · ')} · ${timeStr}</div>
            </div>
            ${isLive
                ? `<div class="sa-sess-live"><div class="sa-sess-live-dot"></div>Live</div>`
                : `<div style="font-size:11px;color:rgba(255,255,255,.2);margin-left:auto;white-space:nowrap">${msAgo<3600000?Math.round(msAgo/60000)+' Min':Math.round(msAgo/3600000)+' Std'}</div>`}
            ${canKick && !isKicked ? `<button onclick="saKickSession('${s.uid}','${escA(label)}')" title="Session beenden" style="margin-left:8px;padding:6px 10px;border-radius:9px;border:1px solid rgba(248,113,113,.25);background:rgba(248,113,113,.08);color:#f87171;font-size:10px;font-weight:700;cursor:pointer;flex-shrink:0;transition:all .15s" onmouseover="this.style.background='rgba(248,113,113,.18)'" onmouseout="this.style.background='rgba(248,113,113,.08)'"><i class="fa-solid fa-ban"></i></button>` : ''}
        </div>`;
    }).join('');
};

// ─────────────────────────────────────────────────────────────────────────────
//  SECURITY PANEL EXTENSION — Brute-Force Monitor
// ─────────────────────────────────────────────────────────────────────────────

async function saLoadBruteForce() {
    const el = document.getElementById('sa-bf-log');
    if (!el) return;
    el.innerHTML = '<div style="color:rgba(255,255,255,.2);font-size:12px;padding:12px;text-align:center"><i class="fa-solid fa-spinner fa-spin" style="margin-right:6px"></i>Lade...</div>';
    try {
        const [unauthSnap, bannedSnap] = await Promise.all([
            db.collection('unauthorized_access').orderBy('timestamp','desc').limit(200).get().catch(() => ({docs:[],size:0})),
            db.collection('banned_ips').get().catch(() => ({size:0})),
        ]);

        const now = Date.now();
        const cutoff24h = now - 86400000;
        const docs = unauthSnap.docs.map(d => ({id:d.id,...d.data()}));
        const recent = docs.filter(d => (d.timestamp?.toDate?.()?.getTime?.() || 0) > cutoff24h);

        // Unique IPs + top attacker
        const ipCounts = {};
        recent.forEach(d => { if (d.ip && d.ip !== 'unbekannt') ipCounts[d.ip] = (ipCounts[d.ip]||0)+1; });
        const sortedIPs = Object.entries(ipCounts).sort((a,b)=>b[1]-a[1]);
        const topIP = sortedIPs[0]?.[0] || '—';

        const s = (id,v) => { const el = document.getElementById(id); if(el) el.textContent=v; };
        s('sa-bf-24h', recent.length);
        s('sa-bf-banned', bannedSnap.size);
        s('sa-bf-uniqueips', Object.keys(ipCounts).length);
        s('sa-bf-topip', topIP);

        if (!docs.length) {
            el.innerHTML = '<div style="color:rgba(255,255,255,.2);font-size:12px;padding:24px;text-align:center"><i class="fa-solid fa-shield-check" style="font-size:28px;display:block;margin-bottom:10px;opacity:.3"></i>Keine Zugriffsversuche protokolliert</div>';
            return;
        }

        el.innerHTML = docs.slice(0, 50).map(d => {
            const ts = d.timestamp?.toDate?.() || null;
            const dt = ts ? ts.toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';
            const isRecent = ts && (now - ts.getTime()) < cutoff24h ? false : true;
            const ipBanned = bannedSnap.size > 0; // simplified check
            return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:rgba(248,113,113,.04);border:1px solid rgba(248,113,113,.1);border-radius:11px">
                <i class="fa-solid fa-triangle-exclamation" style="color:#f87171;font-size:12px;flex-shrink:0"></i>
                <div style="flex:1;min-width:0">
                    <div style="font-size:12px;color:rgba(255,255,255,.7);font-weight:600">${escA(d.reason || 'Unbefugter Zugriff')}</div>
                    <div style="font-size:10px;color:rgba(255,255,255,.3);margin-top:2px;font-family:'JetBrains Mono',monospace">${escA(d.ip||'?')} · ${escA(d.email||'nicht eingeloggt')}</div>
                </div>
                <div style="font-size:10px;color:rgba(255,255,255,.2);white-space:nowrap;font-family:'JetBrains Mono',monospace">${dt}</div>
                ${d.ip && d.ip !== 'unbekannt' ? `<button onclick="saBanIPFromLog('${escA(d.ip)}')" title="IP sperren" style="padding:5px 9px;border-radius:8px;border:1px solid rgba(248,113,113,.3);background:rgba(248,113,113,.1);color:#f87171;font-size:10px;cursor:pointer;white-space:nowrap;transition:all .15s" onmouseover="this.style.background='rgba(248,113,113,.2)'" onmouseout="this.style.background='rgba(248,113,113,.1)'"><i class="fa-solid fa-ban"></i></button>` : ''}
            </div>`;
        }).join('');
    } catch(e) {
        el.innerHTML = `<div style="color:#f87171;font-size:12px;padding:12px">${escA(e.message)}</div>`;
    }
}

async function saBanIPFromLog(ip) {
    if (!confirm(`IP ${ip} dauerhaft sperren?`)) return;
    try {
        await db.collection('banned_ips').doc(ip).set({ ip, bannedAt: firebase.firestore.FieldValue.serverTimestamp(), reason: 'Manuell aus SA-Zone gesperrt', bannedBy: auth.currentUser?.email });
        await logAction('ip_banned_manual', ip, { ip, by: auth.currentUser?.email });
        showToast(`🚫 IP ${ip} gesperrt`, 'success');
        saLoadBruteForce();
    } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
}
const _origSaOpenTab = saOpenTab;
// BUG FIX: _origSaOpenTab() is synchronous (CSS toggle), but saLoadDashboard()
// was called immediately after, before the tab panel was fully visible.
// A short rAF-based delay ensures the DOM has painted before data loads.
const _patchedSaOpenTab = function() {
    _origSaOpenTab();
    // Store superUID for session monitor
    db.collection('settings').doc('superadmin').get()
        .then(snap => { window._superUID = snap.exists ? snap.data().superadminUID : null; })
        .catch(() => {});
    // Wait one animation frame so the tab panel is visible before loading data
    requestAnimationFrame(() => {
        saLoadDashboard();
        saLoadActivityLog();
    });
};
// Replace in window scope
window.saOpenTab = _patchedSaOpenTab;

// ─────────────────────────────────────────────────────────────────────────────
//  SECURITY SCORE + ALERT FEED  (SA Dashboard)
// ─────────────────────────────────────────────────────────────────────────────

async function saDashLoadAlertFeed() {
    const feed = document.getElementById('sa-alert-feed');
    if (!feed) return;
    try {
        const [bannedSnap, unauthSnap, reviewSnap, settingsSnap, ordersSnap] = await Promise.all([
            db.collection('banned_ips').get(),
            db.collection('unauthorized_access').orderBy('timestamp','desc').limit(50).get().catch(()=>({docs:[]})),
            db.collection('reviews').where('approved','==',false).get().catch(()=>({docs:[]})),
            db.collection('settings').doc('main').get(),
            db.collection('orders').where('status','==','Zahlung ausstehend').get().catch(()=>({docs:[],size:0})),
        ]);
        const alerts = [];
        const now = Date.now();
        const cutoff1h  = now - 3600000;

        // Unauth access in last hour
        const recentUnauth = unauthSnap.docs.filter(d=>(d.data().timestamp?.toDate?.()?.getTime?.()||0) > cutoff1h);
        if (recentUnauth.length > 0) alerts.push({ level:'err', msg: `${recentUnauth.length} unbefugte${recentUnauth.length>1?' Zugriffsversuche':' Zugriffsversuch'} in der letzten Stunde` });

        // High ban count
        if (bannedSnap.size > 20) alerts.push({ level:'warn', msg: `${bannedSnap.size} gesperrte IPs — ungewöhnlich viele Bans` });

        // Shop closed
        if (settingsSnap.exists && settingsSnap.data().shop_closed) alerts.push({ level:'warn', msg: 'Shop ist derzeit geschlossen' });

        // Pending reviews > 5
        const pending = reviewSnap.docs.filter(d=>!d.data().rejected).length;
        if (pending > 5) alerts.push({ level:'info', msg: `${pending} Bewertungen warten auf Freigabe` });

        // Pending payments
        if (ordersSnap.size > 3) alerts.push({ level:'warn', msg: `${ordersSnap.size} Bestellungen mit ausstehender Zahlung` });

        if (!alerts.length) {
            feed.innerHTML = '<div style="display:flex;align-items:center;gap:10px;padding:14px;background:rgba(52,211,153,.04);border:1px solid rgba(52,211,153,.15);border-radius:14px"><i class="fa-solid fa-circle-check" style="color:#34d399;font-size:18px"></i><span style="font-size:13px;color:#34d399;font-weight:600">Keine aktiven Alerts — alles im grünen Bereich</span></div>';
        } else {
            const badge = document.getElementById('sa-alert-badge');
            if (badge) { badge.textContent = alerts.length + ' Alert' + (alerts.length>1?'s':''); badge.style.display=''; }
            const colorMap = { err:'248,113,113', warn:'251,191,36', info:'103,232,249' };
            const iconMap  = { err:'fa-circle-xmark', warn:'fa-triangle-exclamation', info:'fa-circle-info' };
            feed.innerHTML = alerts.map(a => `
                <div style="display:flex;align-items:flex-start;gap:10px;padding:12px 16px;background:rgba(${colorMap[a.level]},.05);border:1px solid rgba(${colorMap[a.level]},.18);border-radius:14px">
                    <i class="fa-solid ${iconMap[a.level]}" style="color:rgba(${colorMap[a.level]},1);font-size:15px;margin-top:1px;flex-shrink:0"></i>
                    <span style="font-size:13px;font-weight:600;color:rgba(255,255,255,.85)">${escA(a.msg)}</span>
                </div>`).join('');
        }

        // Security Score
        let score = 100;
        const cutoff24h = now - 86400000;
        const unauthRecent = unauthSnap.docs.filter(d=>(d.data().timestamp?.toDate?.()?.getTime?.()||0)>cutoff24h).length;
        const secChecks = [
            { label:'Unauth. Zugriffe (24h)', val: unauthRecent, threshold:5,  penalty:15, color:'#f87171' },
            { label:'Gesperrte IPs',          val: bannedSnap.size, threshold:30, penalty:10, color:'#fbbf24' },
            { label:'Ausstehende Reviews',    val: pending,    threshold:10, penalty:5,  color:'#a78bfa' },
        ];
        const breakdown = [];
        secChecks.forEach(p => { const hit = p.val >= p.threshold; if (hit) score -= p.penalty; breakdown.push({ label:p.label, val:p.val, ok:!hit, color:p.color }); });
        score = Math.max(0, Math.min(100, score));
        const arc   = document.getElementById('sa-sec-score-arc');
        const valEl = document.getElementById('sa-sec-score-val');
        const lblEl = document.getElementById('sa-sec-score-label');
        const subEl = document.getElementById('sa-sec-score-sub');
        const brkEl = document.getElementById('sa-sec-score-breakdown');
        if (arc)   { arc.style.strokeDashoffset = 176 - (176*score/100); arc.style.stroke = score>=80?'#34d399':score>=50?'#fbbf24':'#f87171'; }
        if (valEl) valEl.textContent = score;
        if (lblEl) { lblEl.textContent = score>=80?'Sehr sicher':score>=50?'Verbesserung nötig':'Kritisch'; lblEl.style.color=score>=80?'#34d399':score>=50?'#fbbf24':'#f87171'; }
        if (subEl) subEl.textContent = (100-score)>0?`${100-score} Punkte Abzug durch aktive Risiken`:'Keine offenen Risiken erkannt';
        if (brkEl) brkEl.innerHTML = breakdown.map(b=>`<div style="display:flex;align-items:center;justify-content:space-between;font-size:11px"><span style="color:rgba(255,255,255,.4)">${escA(b.label)}</span><div style="display:flex;align-items:center;gap:6px"><span style="font-family:'JetBrains Mono',monospace;color:${b.ok?'rgba(255,255,255,.5)':b.color}">${b.val}</span><i class="fa-solid fa-${b.ok?'check':'xmark'}" style="color:${b.ok?'#34d399':b.color};font-size:10px"></i></div></div>`).join('');
    } catch(e) { if(feed) feed.innerHTML='<div style="color:rgba(255,255,255,.2);font-size:12px;padding:12px">Alert-Feed konnte nicht geladen werden.</div>'; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ROLLEN-MATRIX
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_MATRIX_DATA = [
    { perm:'Bestellungen einsehen',     sup:1, co:1, adm:1, ro:1 },
    { perm:'Bestellstatus ändern',      sup:1, co:1, adm:1, ro:0 },
    { perm:'Produkte verwalten',        sup:1, co:1, adm:1, ro:0 },
    { perm:'Preise ändern',             sup:1, co:1, adm:1, ro:0 },
    { perm:'Gutscheine verwalten',      sup:1, co:1, adm:1, ro:0 },
    { perm:'Benutzer verwalten',        sup:1, co:1, adm:1, ro:0 },
    { perm:'Bewertungen moderieren',    sup:1, co:1, adm:1, ro:0 },
    { perm:'Admin-Logs einsehen',       sup:1, co:1, adm:1, ro:1 },
    { perm:'Admins ernennen/entfernen', sup:1, co:1, adm:0, ro:0 },
    { perm:'IP-Bans verwalten',         sup:1, co:1, adm:0, ro:0 },
    { perm:'Shop öffnen / schließen',   sup:1, co:1, adm:0, ro:0 },
    { perm:'Exporte / Backups',         sup:1, co:1, adm:0, ro:0 },
    { perm:'Shop-Konfiguration',        sup:1, co:0, adm:0, ro:0 },
    { perm:'Superadmin Zone',           sup:1, co:0, adm:0, ro:0 },
    { perm:'Danger Zone',               sup:1, co:0, adm:0, ro:0 },
    { perm:'Security Lockdown',         sup:1, co:0, adm:0, ro:0 },
];

function saRenderRoleMatrix() {
    const tbody = document.getElementById('sa-role-matrix-tbody');
    if (!tbody) return;
    const c = (v, hi) => `<td style="text-align:center;padding:9px 16px;border-bottom:1px solid rgba(255,255,255,.04)"><i class="fa-solid fa-${v?'check':'minus'}" style="color:${v?(hi?'#fbbf24':'#34d399'):'rgba(255,255,255,.12)'};font-size:${v?13:12}px"></i></td>`;
    tbody.innerHTML = ROLE_MATRIX_DATA.map(r=>`<tr class="table-row-hover"><td style="padding:9px 16px;font-size:12px;color:rgba(255,255,255,.6);border-bottom:1px solid rgba(255,255,255,.04)">${escA(r.perm)}</td>${c(r.sup,true)}${c(r.co,false)}${c(r.adm,false)}${c(r.ro,false)}</tr>`).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
//  ADMIN DETAIL MODAL
// ─────────────────────────────────────────────────────────────────────────────

let _admModalData = null;

async function admOpenModal(adminData) {
    _admModalData = adminData;
    const modal = document.getElementById('sa-admin-detail-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    const initials = (adminData.email||'?').substring(0,2).toUpperCase();
    const av = document.getElementById('adm-modal-avatar');
    const em = document.getElementById('adm-modal-email');
    const rb = document.getElementById('adm-modal-role-badge');
    if (av) { av.textContent=initials; av.style.background=adminData.role==='superadmin'?'linear-gradient(135deg,#fbbf24,#f59e0b)':adminData.role==='cosuper'?'linear-gradient(135deg,#fb923c,#f97316)':'linear-gradient(135deg,#67e8f9,#a78bfa)'; av.style.color='#000'; }
    if (em) em.textContent = adminData.email || '—';
    const roleLabels = { superadmin:'👑 Superadmin', cosuper:'🛡️ Co-Superadmin', admin:'👤 Admin', readonly:'👁️ Nur-Lesen' };
    if (rb) rb.innerHTML = `<span class="sa-role-badge ${adminData.role==='superadmin'?'super':adminData.role==='cosuper'?'cosuper':'regular'}">${roleLabels[adminData.role]||adminData.role}</span>`;
    const statusEl = document.getElementById('adm-modal-status');
    if (statusEl) { statusEl.textContent=adminData.locked?'🔴 Gesperrt':'🟢 Aktiv'; statusEl.style.color=adminData.locked?'#f87171':'#34d399'; }
    const timeline = document.getElementById('adm-modal-timeline');
    const actEl    = document.getElementById('adm-modal-actions');
    const lastEl   = document.getElementById('adm-modal-lastlogin');
    try {
        const snap = await db.collection('admin_logs').where('adminEmail','==',adminData.email).orderBy('timestamp','desc').limit(20).get();
        if (actEl) actEl.textContent = snap.size;
        if (snap.size>0 && lastEl) { const ts=snap.docs[0].data().timestamp?.toDate?.(); if(ts) lastEl.textContent=ts.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'}); }
        if (timeline) timeline.innerHTML = snap.size ? snap.docs.map(d=>{
            const dd=d.data(); const ts=dd.timestamp?.toDate?.(); const dt=ts?ts.toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
            const isDanger=(dd.action||'').includes('danger');
            return `<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 12px;background:rgba(255,255,255,.03);border-radius:10px;border:1px solid rgba(255,255,255,.05)"><div style="width:8px;height:8px;border-radius:50%;background:${isDanger?'#f87171':'#67e8f9'};box-shadow:0 0 6px ${isDanger?'#f87171':'#67e8f9'};flex-shrink:0;margin-top:4px"></div><div><div style="font-size:12px;color:rgba(255,255,255,.75)">${typeof AUDIT_ACTION_LABELS!=='undefined'&&AUDIT_ACTION_LABELS[dd.action]?AUDIT_ACTION_LABELS[dd.action]:('⚡ '+(dd.action||''))}</div><div style="font-size:10px;color:rgba(255,255,255,.25);margin-top:2px;font-family:'JetBrains Mono',monospace">${dt}${dd.target?' · '+escA(dd.target.substring(0,20)):''}</div></div></div>`;
        }).join('') : '<div style="color:rgba(255,255,255,.2);font-size:12px;padding:10px;text-align:center">Noch keine Aktionen protokolliert</div>';
    } catch(e) { if(timeline) timeline.innerHTML=`<div style="color:rgba(248,113,113,.5);font-size:12px;padding:10px">Fehler: ${escA(e.message)}</div>`; }
}

async function admModalResetToken() {
    if (!_admModalData||!confirm(`Admin-Token für ${_admModalData.email} zurücksetzen?`)) return;
    try { const cur=_admModalData.adminTokenVersion||0; await db.collection('users').doc(_admModalData.uid).update({adminTokenVersion:cur+1}); await logAction('admin_token_reset',_admModalData.uid,{email:_admModalData.email}); showToast(`🔄 Token für ${_admModalData.email} zurückgesetzt`,'success'); } catch(e) { showToast('❌ '+e.message,'error'); }
}
async function admModalRemove() {
    if (!_admModalData||!confirm(`Admin ${_admModalData.email} wirklich entfernen?`)) return;
    try { await db.collection('users').doc(_admModalData.uid).update({role:'user',permissions:{}}); await logAction('admin_removed',_admModalData.uid,{email:_admModalData.email}); document.getElementById('sa-admin-detail-modal').style.display='none'; showToast(`✅ ${_admModalData.email} als Admin entfernt`,'success'); if(typeof saLoadAdmins==='function') saLoadAdmins(); } catch(e) { showToast('❌ '+e.message,'error'); }
}
function admModalPromote() { if(!_admModalData) return; showToast('ℹ️ Berechtigungen in der Admin-Karte anpassen'); }
function admModalDemote()  { if(!_admModalData) return; showToast('ℹ️ Berechtigungen in der Admin-Karte anpassen'); }

// ─────────────────────────────────────────────────────────────────────────────
//  SESSION BREAKDOWN
// ─────────────────────────────────────────────────────────────────────────────

function sessRenderBreakdown(sessions, now) {
    const live   = sessions.filter(s=>(now-(s.lastSeen?.toDate?.()?.getTime?.()||0))<90000).length;
    const guests = sessions.filter(s=>s.isGuest).length;
    const users  = sessions.filter(s=>!s.isGuest&&!s._isAdmin).length;
    const admins = sessions.filter(s=>s._isAdmin).length;
    const cart   = sessions.filter(s=>(s.cartCount||0)>0).length;
    const total  = sessions.length||1;
    const typeBreakdown = document.getElementById('sess-type-breakdown');
    if (typeBreakdown) {
        const rows = [{label:'🟢 Live aktiv',val:live,color:'#34d399'},{label:'👑 Admins',val:admins,color:'#fbbf24'},{label:'👤 Eingeloggt',val:users,color:'#67e8f9'},{label:'👻 Gäste',val:guests,color:'rgba(255,255,255,.3)'},{label:'🛒 Mit Warenkorb',val:cart,color:'#a78bfa'}];
        typeBreakdown.innerHTML = rows.map(r=>`<div><div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="font-size:11px;color:rgba(255,255,255,.5)">${r.label}</span><span style="font-size:11px;font-weight:700;color:${r.color};font-family:'JetBrains Mono',monospace">${r.val}</span></div><div style="height:5px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden"><div style="height:100%;width:${Math.max(r.val>0?4:0,Math.round(r.val/total*100))}%;background:${r.color};border-radius:3px;transition:width .5s"></div></div></div>`).join('');
    }
    const pagesEl = document.getElementById('sess-top-pages');
    if (pagesEl) {
        const pagesMap = {}; sessions.forEach(s=>{if(s.page)pagesMap[s.page]=(pagesMap[s.page]||0)+1;});
        const pages = Object.entries(pagesMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
        const maxP = pages[0]?.[1]||1;
        pagesEl.innerHTML = pages.length ? pages.map(([pg,cnt])=>`<div><div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="font-size:11px;color:rgba(255,255,255,.5);font-family:'JetBrains Mono',monospace;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escA(pg)}</span><span style="font-size:11px;font-weight:700;color:#67e8f9">${cnt}</span></div><div style="height:4px;background:rgba(255,255,255,.06);border-radius:2px;overflow:hidden"><div style="height:100%;width:${Math.round(cnt/maxP*100)}%;background:linear-gradient(90deg,#67e8f9,#a78bfa);border-radius:2px;transition:width .5s"></div></div></div>`).join('') : '<div style="color:rgba(255,255,255,.2);font-size:11px;text-align:center;padding:8px">Keine Seiten-Daten</div>';
    }
    const s=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    s('sess-kpi-live',live); s('sess-kpi-total',sessions.length); s('sess-kpi-users',users); s('sess-kpi-guests',guests); s('sess-kpi-cart',cart); s('sess-kpi-admins',admins);
}

// ─────────────────────────────────────────────────────────────────────────────
//  SA-AKTIVITÄTSLOG EXTENSIONS
// ─────────────────────────────────────────────────────────────────────────────

let _actlogPeriod = 7;
let _actlogView   = 'list';

function saFilterLogPeriod(val) { _actlogPeriod=parseInt(val)||0; saRenderFilteredLog(); actlogUpdateStats(); }

function actlogSetView(mode) {
    _actlogView = mode;
    ['list','timeline'].forEach(m=>{
        const btn=document.getElementById('actlog-view-'+m);
        if(btn){btn.style.background=mode===m?'rgba(255,255,255,.08)':'transparent';btn.style.color=mode===m?'#fff':'rgba(255,255,255,.4)';}
        const panel=document.getElementById('actlog-view-'+m+'-panel');
        if(panel) panel.style.display=mode===m?'':'none';
    });
    if(mode==='timeline') actlogRenderTimeline();
}

function actlogUpdateStats() {
    if(!_saLogAllDocs.length) return;
    const now=Date.now(); const todayStart=new Date(); todayStart.setHours(0,0,0,0);
    const cutoff=_actlogPeriod>0?now-_actlogPeriod*86400000:0;
    const filtered=cutoff?_saLogAllDocs.filter(d=>(d.data().timestamp?.toDate?.()?.getTime?.()||0)>cutoff):_saLogAllDocs;
    // Gleiche Keywords wie saRenderFilteredLog() - damit Zaehler und Filter uebereinstimmen
    const dangerC=filtered.filter(d=>['danger','delete_all','purge','lockdown','revoke'].some(k=>(d.data().action||'').includes(k))).length;
    const exportC=filtered.filter(d=>['export','backup'].some(k=>(d.data().action||'').includes(k))).length;
    const todayC=_saLogAllDocs.filter(d=>(d.data().timestamp?.toDate?.())||new Date(0)>=todayStart).length;
    const lastAccess=_saLogAllDocs.find(d=>(d.data().action||'').includes('access'));
    const lastTs=lastAccess?.data().timestamp?.toDate?.();
    const s=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    s('actlog-total',filtered.length); s('actlog-today',todayC); s('actlog-danger',dangerC); s('actlog-exports',exportC);
    s('actlog-lastaccess',lastTs?lastTs.toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—');
}

const _ACT_LABELS = typeof AUDIT_ACTION_LABELS !== 'undefined' ? AUDIT_ACTION_LABELS : {};

function actlogRenderTimeline() {
    const el = document.getElementById('actlog-timeline-view');
    if (!el||!_saLogAllDocs.length) return;
    const now=Date.now(); const cutoff=_actlogPeriod>0?now-_actlogPeriod*86400000:0;
    const docs=_saLogAllDocs.filter(d=>!cutoff||(d.data().timestamp?.toDate?.()?.getTime?.()||0)>cutoff).slice(0,60);
    const grouped={};
    docs.forEach(d=>{const dd=d.data();const ts=dd.timestamp?.toDate?.()||new Date();const key=ts.toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'});if(!grouped[key])grouped[key]=[];grouped[key].push({...dd,_ts:ts});});
    el.innerHTML = Object.entries(grouped).map(([day,entries])=>`
        <div style="margin-bottom:18px">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.25);margin-bottom:10px">${escA(day)}</div>
            <div style="display:flex;flex-direction:column;gap:0">
                ${entries.map((e,i)=>{
                    const isDanger=['danger','delete','purge','reset','lockdown'].some(k=>(e.action||'').includes(k));
                    const isExport=['export','backup'].some(k=>(e.action||'').includes(k));
                    const dotColor=isDanger?'#f87171':isExport?'#a78bfa':'#67e8f9';
                    const label=_ACT_LABELS[e.action]||('⚡ '+(e.action||''));
                    const timeStr=e._ts.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
                    return `<div style="display:flex;gap:14px;align-items:flex-start;padding-bottom:${i<entries.length-1?12:0}px">
                        <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0">
                            <div style="width:10px;height:10px;border-radius:50%;background:${dotColor};box-shadow:0 0 8px ${dotColor};flex-shrink:0;margin-top:4px;z-index:1"></div>
                            ${i<entries.length-1?`<div style="width:2px;flex:1;background:rgba(255,255,255,.06);min-height:20px;margin-top:4px"></div>`:''}
                        </div>
                        <div style="padding-bottom:6px"><div style="font-size:12px;color:rgba(255,255,255,.8)">${escA(label)}</div>
                        <div style="font-size:10px;color:rgba(255,255,255,.25);margin-top:2px;font-family:'JetBrains Mono',monospace">${timeStr} · ${escA(e.adminEmail||'—')}${e.target?' · '+escA(e.target.substring(0,20)):''}</div></div>
                    </div>`;
                }).join('')}
            </div>
        </div>`).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
//  HOOKS
// ─────────────────────────────────────────────────────────────────────────────

// Extend saLoadDashboard to also load alert feed
const _origSaLoadDashboard = window.saLoadDashboard;
if (typeof _origSaLoadDashboard === 'function') {
    window.saLoadDashboard = async function() { await _origSaLoadDashboard(); saDashLoadAlertFeed(); };
}

// Extend saLoadActivityLog to also update stats
const _origSaLoadActivityLog = window.saLoadActivityLog;
if (typeof _origSaLoadActivityLog === 'function') {
    window.saLoadActivityLog = async function() { await _origSaLoadActivityLog(); actlogUpdateStats(); };
}

// Extend saSwitchInner for new panel init
const _prevSaSwitchInner = window.saSwitchInner;
window.saSwitchInner = function(panel, el) {
    _prevSaSwitchInner(panel, el);
    if (panel==='actlog')   { setTimeout(()=>{ actlogUpdateStats(); if(_actlogView==='timeline') actlogRenderTimeline(); },200); }
    if (panel==='admins')   { setTimeout(saRenderRoleMatrix, 200); }
    if (panel==='sessions') { setTimeout(()=>{ if(window._saAllSessions) sessRenderBreakdown(window._saAllSessions,Date.now()); },300); }
};

// Wire detail button on admin cards after they render
const _origSaLoadAdmins = window.saLoadAdmins;
if (typeof _origSaLoadAdmins === 'function') {
    window.saLoadAdmins = async function() {
        await _origSaLoadAdmins();
        saRenderRoleMatrix();
        setTimeout(() => {
            document.querySelectorAll('#sa-admin-grid .sa-admin-card').forEach(card => {
                if (card.querySelector('.adm-detail-btn')) return;
                const btn = document.createElement('button');
                btn.className = 'adm-detail-btn';
                btn.style.cssText='width:100%;margin-top:8px;padding:7px;border-radius:10px;border:1px solid rgba(103,232,249,.15);background:rgba(103,232,249,.05);color:#67e8f9;font-size:11px;font-weight:600;cursor:pointer;transition:all .15s';
                btn.innerHTML='<i class="fa-solid fa-eye" style="margin-right:6px"></i>Details & Timeline';
                btn.addEventListener('mouseover',()=>btn.style.background='rgba(103,232,249,.12)');
                btn.addEventListener('mouseout', ()=>btn.style.background='rgba(103,232,249,.05)');
                const uid  =card.dataset.uid||''; const email=card.dataset.email||card.querySelector('.sa-admin-email')?.textContent||''; const role=card.dataset.role||'admin';
                btn.addEventListener('click',()=>admOpenModal({uid,email,role}));
                card.appendChild(btn);
            });
        }, 500);
    };
}

// ═══════════════════════════════════════════════════════════════════════════
//  WAVEVAPES AUTO-BACKUP SYSTEM v1.0
//  • Konfiguration & Zeitplan in Firestore settings/backup_config
//  • Backups als JSON-Dokumente in Firestore backups/{id}
//  • Trigger: beim Öffnen des Panels + automatisch nach Intervall-Check
//  • Restore: einzelne Collections aus gespeichertem Backup wiederherstellen
// ═══════════════════════════════════════════════════════════════════════════

const BKP_CONFIG_DOC  = 'settings/backup_config';
const BKP_COLLECTION  = 'backups';
const BKP_ALL_COLS    = ['products','orders','users','categories','coupons','reviews','admin_logs','settings'];

let _bkpConfig        = null;   // geladene Konfig
let _bkpRestoreId     = null;   // aktuell zu restorende Backup-ID
let _bkpRestoreCols   = null;   // welche Collections restore
let _bkpAutoTimer     = null;   // setInterval-Handle

// ── Hilfsfunktionen ───────────────────────────────────────────────────────

function bkpFmtSize(bytes) {
    if (bytes < 1024)       return bytes + ' B';
    if (bytes < 1048576)    return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
}

function bkpFmtDate(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function bkpTimeAgo(ts) {
    if (!ts) return '—';
    const d   = ts.toDate ? ts.toDate() : new Date(ts);
    const min = Math.floor((Date.now() - d.getTime()) / 60000);
    if (min < 2)    return 'gerade eben';
    if (min < 60)   return `vor ${min} Min`;
    const h = Math.floor(min / 60);
    if (h < 24)     return `vor ${h} Std`;
    return `vor ${Math.floor(h / 24)} Tagen`;
}

// Serialisiert Firestore-Timestamps in ISO-Strings
function bkpSerialize(data) {
    return JSON.parse(JSON.stringify(data, (k, v) => {
        if (v && typeof v === 'object' && typeof v.toDate === 'function') return v.toDate().toISOString();
        return v;
    }));
}

// ── Init ──────────────────────────────────────────────────────────────────

async function bkpInit() {
    await bkpLoadConfig();
    bkpRenderCollections();
    bkpRenderStatus();
    await bkpLoadHistory();
    // bkpScheduleAutoCheck() wird bereits von bkpStartBackground() beim Login
    // gestartet. Hier nur neu planen, falls sich die Config geaendert hat.
    bkpScheduleAutoCheck();
}

// ── Konfig laden / speichern ─────────────────────────────────────────────

async function bkpLoadConfig() {
    try {
        const snap = await db.collection('settings').doc('backup_config').get();
        _bkpConfig = snap.exists ? snap.data() : {};
    } catch(e) {
        _bkpConfig = {};
    }
    // Defaults setzen
    _bkpConfig = Object.assign({
        enabled:      false,
        intervalHours: 24,
        retentionDays: 30,
        maxCount:      10,
        collections:   [...BKP_ALL_COLS],
        lastBackupAt:  null,
    }, _bkpConfig);

    // UI befüllen
    const s = (id, v) => { const el = document.getElementById(id); if (el) el[typeof v === 'boolean' ? 'checked' : 'value'] = v; };
    s('bkp-cfg-enabled',   _bkpConfig.enabled);
    s('bkp-cfg-interval',  _bkpConfig.intervalHours);
    s('bkp-cfg-retention', _bkpConfig.retentionDays);
    s('bkp-cfg-maxcount',  _bkpConfig.maxCount);
}

async function bkpSaveConfig() {
    _bkpConfig.enabled       = document.getElementById('bkp-cfg-enabled')?.checked   ?? false;
    _bkpConfig.intervalHours = parseInt(document.getElementById('bkp-cfg-interval')?.value, 10) || 24;
    _bkpConfig.retentionDays = parseInt(document.getElementById('bkp-cfg-retention')?.value, 10) || 30;
    _bkpConfig.maxCount      = parseInt(document.getElementById('bkp-cfg-maxcount')?.value, 10) || 10;
    // Collections aus Toggles lesen
    _bkpConfig.collections = BKP_ALL_COLS.filter(c => document.getElementById('bkp-col-' + c)?.classList.contains('active'));
    if (!_bkpConfig.collections.length) _bkpConfig.collections = [...BKP_ALL_COLS];

    try {
        await db.collection('settings').doc('backup_config').set(_bkpConfig, { merge: true });
        bkpRenderStatus();
        bkpScheduleAutoCheck();
        showToast('✅ Backup-Konfiguration gespeichert');
        await logAction('backup_config_saved', 'settings', {
            enabled: _bkpConfig.enabled,
            intervalHours: _bkpConfig.intervalHours,
            retentionDays: _bkpConfig.retentionDays,
        });
    } catch(e) {
        showToast('❌ Konfiguration konnte nicht gespeichert werden: ' + e.message, 'error');
    }
}

// ── Collections-Auswahl ──────────────────────────────────────────────────

function bkpRenderCollections() {
    const container = document.getElementById('bkp-collections-grid');
    if (!container) return;
    const icons = { products:'🛍️', orders:'📦', users:'👤', categories:'🏷️', coupons:'🎟️', reviews:'⭐', admin_logs:'📋', settings:'⚙️' };
    const activeCols = _bkpConfig?.collections || BKP_ALL_COLS;
    container.innerHTML = BKP_ALL_COLS.map(col => `
        <div id="bkp-col-${col}"
             class="sa-perm-toggle ${activeCols.includes(col) ? 'active' : ''}"
             onclick="bkpToggleCol('${col}')"
             style="padding:8px 14px;border-radius:12px;font-size:12px;min-width:120px">
            <div class="sa-perm-dot"></div>
            <span style="font-size:14px">${icons[col] || '📁'}</span>
            <span style="font-weight:600">${col}</span>
        </div>`).join('');
}

function bkpToggleCol(col) {
    const el = document.getElementById('bkp-col-' + col);
    if (!el) return;
    el.classList.toggle('active');
    bkpSaveConfig();
}

// ── Status-Anzeige ────────────────────────────────────────────────────────

function bkpRenderStatus() {
    if (!_bkpConfig) return;
    const enabled = _bkpConfig.enabled;

    // Badge
    const badge = document.getElementById('bkp-auto-badge');
    if (badge) {
        badge.textContent   = enabled ? 'AKTIV' : 'DEAKTIVIERT';
        badge.style.background    = enabled ? 'rgba(52,211,153,.15)' : 'rgba(239,68,68,.15)';
        badge.style.color         = enabled ? '#34d399' : '#f87171';
        badge.style.borderColor   = enabled ? 'rgba(52,211,153,.3)' : 'rgba(239,68,68,.3)';
    }

    // Nächster Backup
    const nextLabel = document.getElementById('bkp-next-label');
    if (nextLabel) {
        if (!enabled) {
            nextLabel.textContent = 'Auto-Backup ist deaktiviert';
        } else if (_bkpConfig.lastBackupAt) {
            const last = _bkpConfig.lastBackupAt.toDate ? _bkpConfig.lastBackupAt.toDate() : new Date(_bkpConfig.lastBackupAt);
            const nextMs = last.getTime() + _bkpConfig.intervalHours * 3600000;
            const diffMin = Math.max(0, Math.round((nextMs - Date.now()) / 60000));
            if (diffMin <= 0) {
                nextLabel.textContent = 'Nächster Backup: fällig — wird beim nächsten Aufruf ausgeführt';
            } else if (diffMin < 60) {
                nextLabel.textContent = `Nächster Backup: in ${diffMin} Minuten`;
            } else {
                nextLabel.textContent = `Nächster Backup: in ${Math.round(diffMin / 60)} Stunden`;
            }
        } else {
            nextLabel.textContent = 'Nächster Backup: beim nächsten Panel-Aufruf';
        }
    }

    // Letzter Backup
    const lastLabel = document.getElementById('bkp-last-label');
    if (lastLabel) {
        lastLabel.textContent = _bkpConfig.lastBackupAt ? bkpTimeAgo(_bkpConfig.lastBackupAt) : 'noch nie';
    }

    // KPI Interval / Retention
    const ki = document.getElementById('bkp-kpi-interval');
    if (ki) ki.textContent = (_bkpConfig.intervalHours || 24) + 'h';
    const kr = document.getElementById('bkp-kpi-retention-lbl');
    if (kr) kr.textContent = `Aufbewahrung: ${_bkpConfig.retentionDays || 30} Tage`;
}

// ── Backup ausführen ──────────────────────────────────────────────────────

async function bkpRunNow() {
    const btn = document.getElementById('bkp-run-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sichern...'; }
    showToast('⏳ Backup wird erstellt...');

    try {
        const cols = (_bkpConfig?.collections?.length > 0) ? _bkpConfig.collections : BKP_ALL_COLS;
        const payload = { createdAt: firebase.firestore.FieldValue.serverTimestamp(), version: '1.0', collections: {}, meta: { triggeredBy: auth.currentUser?.email || 'Superadmin', manual: true, docCounts: {} } };
        let totalDocs = 0;
        let totalSize = 0;

        for (const col of cols) {
            try {
                const snap = await db.collection(col).limit(3000).get();
                const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                const serialized = bkpSerialize(docs);
                payload.collections[col] = serialized;
                payload.meta.docCounts[col] = docs.length;
                totalDocs += docs.length;
            } catch(e) {
                payload.collections[col] = [];
                payload.meta.docCounts[col] = 0;
            }
        }

        // Größe abschätzen (JSON-String-Länge in Bytes)
        const jsonStr    = JSON.stringify(payload);
        totalSize        = new Blob([jsonStr]).size;
        payload.meta.sizeBytes = totalSize;
        payload.meta.totalDocs = totalDocs;

        // Backup in Firestore speichern (als JSON-String in einem Feld,
        // damit wir die 1MB-Feldgrenze nicht sprengen → wir chunken bei Bedarf)
        // Für normale Shops (< 3.000 Docs) passt alles in ein Dokument.
        const backupRef = await db.collection(BKP_COLLECTION).add({
            createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
            version:     payload.version,
            collections: Object.keys(payload.collections),
            meta:        payload.meta,
            data:        JSON.stringify(payload.collections),   // kompletter Inhalt
            status:      'ok',
        });

        // Konfig aktualisieren: lastBackupAt
        await db.collection('settings').doc('backup_config').set({ lastBackupAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        _bkpConfig.lastBackupAt = { toDate: () => new Date() };

        // Alte Backups bereinigen
        await bkpCleanup();

        // Log
        await logAction('auto_backup_created', backupRef.id, { totalDocs, sizeBytes: totalSize, manual: true });

        bkpRenderStatus();
        await bkpLoadHistory();
        showToast(`✅ Backup erstellt — ${totalDocs} Dokumente (${bkpFmtSize(totalSize)})`, 'success');
    } catch(e) {
        showToast('❌ Backup fehlgeschlagen: ' + e.message, 'error');
        console.error('Backup error:', e);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-play"></i> Jetzt sichern'; }
    }
}

// ── Auto-Check (Client-seitig, beim Panel-Aufruf) ─────────────────────────

function bkpScheduleAutoCheck() {
    if (_bkpAutoTimer) clearInterval(_bkpAutoTimer);
    if (!_bkpConfig?.enabled) return;

    // Sofort prüfen
    bkpCheckAndRunAuto();

    // Dann stündlich prüfen (solange Panel offen ist)
    _bkpAutoTimer = setInterval(bkpCheckAndRunAuto, 60 * 60 * 1000);
}

// ── Hintergrund-Init (startet Auto-Timer unabhängig vom aktiven Tab) ──────
// BUG-FIX: bkpInit() wurde bisher nur aufgerufen, wenn der Backup-Tab
// manuell geöffnet wurde — dadurch lief der Auto-Timer nie im Hintergrund.
// Diese Funktion wird direkt nach dem Login gerufen und startet den Timer
// still, ohne UI-Elemente anzufassen (die noch nicht gerendert sein müssen).
async function bkpStartBackground() {
    try {
        await bkpLoadConfig();
        bkpScheduleAutoCheck();
        console.info('[WaveVapes Backup] Auto-Backup Hintergrund-Timer gestartet (Intervall:', _bkpConfig?.intervalHours, 'h, aktiviert:', _bkpConfig?.enabled, ')');
    } catch(e) {
        console.warn('[WaveVapes Backup] Hintergrund-Init fehlgeschlagen:', e);
    }
}

async function bkpCheckAndRunAuto() {
    if (!_bkpConfig?.enabled) return;
    const lastAt = _bkpConfig.lastBackupAt;
    if (lastAt) {
        const last  = lastAt.toDate ? lastAt.toDate() : new Date(lastAt);
        const diffH = (Date.now() - last.getTime()) / 3600000;
        if (diffH < _bkpConfig.intervalHours) return; // noch nicht fällig
    }
    // Fällig → automatisch ausführen
    console.info('[WaveVapes Backup] Auto-Backup wird ausgeführt...');
    // BUG-013 FIX: try/finally statt sequentiellem Aufruf — showToast wird
    // auch bei einem Fehler in bkpRunNow() korrekt wiederhergestellt.
    const origToast = window.showToast;
    window.showToast = () => {};
    try {
        await bkpRunNow();
        window.showToast = origToast;
        showToast('🔄 Automatischer Backup erfolgreich ausgeführt', 'success');
    } finally {
        window.showToast = origToast;
    }
}

// ── Backup-Historie ───────────────────────────────────────────────────────

async function bkpLoadHistory() {
    const list = document.getElementById('bkp-history-list');
    if (!list) return;
    list.innerHTML = '<div style="color:rgba(255,255,255,.2);font-size:12px;padding:20px;text-align:center"><i class="fa-solid fa-spinner fa-spin" style="margin-right:8px"></i>Lade...</div>';

    try {
        const snap = await db.collection(BKP_COLLECTION).orderBy('createdAt', 'desc').limit(50).get();

        // KPIs
        const kpiCount = document.getElementById('bkp-kpi-count');
        if (kpiCount) kpiCount.textContent = snap.size;

        let totalSize = 0;
        let okLast30  = 0;
        const cutoff30 = Date.now() - 30 * 86400000;

        const docs = snap.docs.map(d => {
            const data = d.data();
            const sz   = data.meta?.sizeBytes || 0;
            totalSize += sz;
            const ts = data.createdAt?.toDate?.()?.getTime?.() || 0;
            if (ts > cutoff30 && data.status === 'ok') okLast30++;
            return { id: d.id, ...data };
        });

        const kpiSize = document.getElementById('bkp-kpi-size');
        if (kpiSize) kpiSize.textContent = bkpFmtSize(totalSize);
        const kpiOk = document.getElementById('bkp-kpi-ok');
        if (kpiOk) kpiOk.textContent = okLast30;

        if (!docs.length) {
            list.innerHTML = '<div style="color:rgba(255,255,255,.2);font-size:12px;padding:28px;text-align:center"><i class="fa-solid fa-database" style="font-size:28px;display:block;margin-bottom:10px;opacity:.2"></i>Noch kein Backup vorhanden. Klicke auf „Jetzt sichern".</div>';
            return;
        }

        list.innerHTML = docs.map((b, i) => {
            const colsStr  = (b.collections || []).join(', ');
            const docCount = b.meta?.totalDocs || '—';
            const sizeStr  = b.meta?.sizeBytes ? bkpFmtSize(b.meta.sizeBytes) : '—';
            const isOk     = b.status === 'ok';
            const byStr    = b.meta?.triggeredBy || 'System';
            const isManual = b.meta?.manual === true;
            return `
            <div style="display:flex;align-items:center;gap:14px;padding:14px 18px;background:${i===0?'rgba(103,232,249,.04)':'rgba(255,255,255,.02)'};border:1px solid ${i===0?'rgba(103,232,249,.15)':'rgba(255,255,255,.06)'};border-radius:16px;transition:background .15s" onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background='${i===0?'rgba(103,232,249,.04)':'rgba(255,255,255,.02)'}'">

                <!-- Icon -->
                <div style="width:40px;height:40px;border-radius:12px;background:${isOk?'rgba(52,211,153,.1)':'rgba(248,113,113,.1)'};border:1px solid ${isOk?'rgba(52,211,153,.2)':'rgba(248,113,113,.2)'};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">
                    ${isOk ? '✅' : '❌'}
                </div>

                <!-- Info -->
                <div style="flex:1;min-width:0">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                        <span style="font-size:13px;font-weight:700;color:#fff">Backup ${bkpFmtDate(b.createdAt)}</span>
                        ${i===0?'<span style="font-size:10px;padding:2px 8px;border-radius:99px;background:rgba(103,232,249,.12);color:#67e8f9;border:1px solid rgba(103,232,249,.2);font-weight:700">AKTUELL</span>':''}
                        ${isManual?'<span style="font-size:10px;padding:2px 8px;border-radius:99px;background:rgba(251,191,36,.1);color:#fbbf24;border:1px solid rgba(251,191,36,.2);font-weight:700">MANUELL</span>':'<span style="font-size:10px;padding:2px 8px;border-radius:99px;background:rgba(167,139,250,.1);color:#a78bfa;border:1px solid rgba(167,139,250,.2);font-weight:700">AUTO</span>'}
                    </div>
                    <div style="font-size:11px;color:rgba(255,255,255,.35);margin-top:3px;display:flex;gap:12px;flex-wrap:wrap">
                        <span><i class="fa-solid fa-file-lines" style="margin-right:4px;opacity:.5"></i>${docCount} Docs</span>
                        <span><i class="fa-solid fa-weight-hanging" style="margin-right:4px;opacity:.5"></i>${sizeStr}</span>
                        <span style="font-family:'JetBrains Mono',monospace;font-size:10px"><i class="fa-solid fa-user" style="margin-right:4px;opacity:.5"></i>${byStr}</span>
                        <span style="opacity:.5">${bkpTimeAgo(b.createdAt)}</span>
                    </div>
                    <div style="font-size:10px;color:rgba(255,255,255,.2);margin-top:2px;font-family:'JetBrains Mono',monospace">${b.id}</div>
                </div>

                <!-- Actions -->
                <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap">
                    <button onclick="bkpDownload('${b.id}')" title="Herunterladen" style="padding:7px 12px;border-radius:10px;border:1px solid rgba(103,232,249,.2);background:rgba(103,232,249,.07);color:#67e8f9;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s" onmouseover="this.style.background='rgba(103,232,249,.18)'" onmouseout="this.style.background='rgba(103,232,249,.07)'">
                        <i class="fa-solid fa-download"></i>
                    </button>
                    <button onclick="bkpOpenRestore('${b.id}')" title="Wiederherstellen" style="padding:7px 12px;border-radius:10px;border:1px solid rgba(251,191,36,.2);background:rgba(251,191,36,.06);color:#fbbf24;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s" onmouseover="this.style.background='rgba(251,191,36,.18)'" onmouseout="this.style.background='rgba(251,191,36,.06)'">
                        <i class="fa-solid fa-rotate-left"></i>
                    </button>
                    <button onclick="bkpDelete('${b.id}', this)" title="Löschen" style="padding:7px 12px;border-radius:10px;border:1px solid rgba(239,68,68,.15);background:rgba(239,68,68,.05);color:#f87171;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s" onmouseover="this.style.background='rgba(239,68,68,.18)'" onmouseout="this.style.background='rgba(239,68,68,.05)'">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>

            </div>`;
        }).join('');

    } catch(e) {
        list.innerHTML = `<div style="color:#f87171;font-size:12px;padding:20px;text-align:center">❌ Fehler: ${escA(e.message)}</div>`;
    }
}

// ── Backup herunterladen ──────────────────────────────────────────────────

async function bkpDownload(id) {
    showToast('⏳ Backup wird vorbereitet...');
    try {
        const snap = await db.collection(BKP_COLLECTION).doc(id).get();
        if (!snap.exists) { showToast('Backup nicht gefunden', 'error'); return; }
        const b = snap.data();
        const payload = {
            exportedAt:  b.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
            version:     b.version || '1.0',
            meta:        b.meta    || {},
            collections: JSON.parse(b.data || '{}'),
        };
        const json = JSON.stringify(payload, null, 2);
        const date = b.createdAt?.toDate?.()?.toISOString().slice(0,10) || 'unknown';
        saDownload(`wavevapes_backup_${date}_${id.slice(0,6)}.json`, json, 'application/json');
        showToast('✅ Backup-Datei heruntergeladen');
        await logAction('backup_downloaded', id, { date });
    } catch(e) {
        showToast('❌ Download fehlgeschlagen: ' + e.message, 'error');
    }
}

// ── Backup löschen ────────────────────────────────────────────────────────

async function bkpDelete(id, btn) {
    if (!confirm('Dieses Backup wirklich löschen?')) return;
    if (btn) btn.disabled = true;
    try {
        await db.collection(BKP_COLLECTION).doc(id).delete();
        await logAction('backup_deleted', id);
        showToast('🗑️ Backup gelöscht');
        await bkpLoadHistory();
    } catch(e) {
        showToast('❌ ' + e.message, 'error');
        if (btn) btn.disabled = false;
    }
}

// ── Backup-Cleanup (nach max. Anzahl & Retention) ─────────────────────────

async function bkpCleanup() {
    const maxCount  = _bkpConfig?.maxCount      || 10;
    const retDays   = _bkpConfig?.retentionDays || 30;
    const cutoff    = Date.now() - retDays * 86400000;

    try {
        const snap = await db.collection(BKP_COLLECTION).orderBy('createdAt', 'asc').get();
        const docs  = snap.docs;
        const toDelete = new Set();

        // 1. Zu alt
        docs.forEach(d => {
            const t = d.data().createdAt?.toDate?.()?.getTime?.() || 0;
            if (t > 0 && t < cutoff) toDelete.add(d.id);
        });

        // 2. Zu viele (älteste zuerst löschen)
        const remaining = docs.filter(d => !toDelete.has(d.id));
        if (remaining.length > maxCount) {
            remaining.slice(0, remaining.length - maxCount).forEach(d => toDelete.add(d.id));
        }

        for (const id of toDelete) {
            await db.collection(BKP_COLLECTION).doc(id).delete();
        }
        if (toDelete.size > 0) console.info(`[WaveVapes Backup] ${toDelete.size} alte Backups gelöscht.`);
    } catch(e) {
        console.warn('[WaveVapes Backup] Cleanup-Fehler:', e);
    }
}

// ── Manuelles Purge alter Backups ─────────────────────────────────────────

async function bkpPurgeOld() {
    if (!confirm(`Alle Backups älter als ${_bkpConfig?.retentionDays || 30} Tage löschen?`)) return;
    showToast('⏳ Bereinige alte Backups...');
    await bkpCleanup();
    await bkpLoadHistory();
    showToast('✅ Alte Backups bereinigt');
}

// ── Restore: Modal öffnen ─────────────────────────────────────────────────

async function bkpOpenRestore(id) {
    _bkpRestoreId   = id;
    _bkpRestoreCols = null;

    try {
        const snap = await db.collection(BKP_COLLECTION).doc(id).get();
        if (!snap.exists) { showToast('Backup nicht gefunden', 'error'); return; }
        const b = snap.data();
        const date = bkpFmtDate(b.createdAt);
        const cols = b.collections || [];
        const docCounts = b.meta?.docCounts || {};
        _bkpRestoreCols = cols;

        document.getElementById('bkp-restore-desc').innerHTML =
            `<strong style="color:#fff">${date}</strong><br>` +
            `Collections: ${cols.map(c => `<span style="color:#67e8f9">${c}</span> (${docCounts[c] || '?'} Docs)`).join(', ')}<br>` +
            `Größe: ${bkpFmtSize(b.meta?.sizeBytes || 0)}`;

        document.getElementById('bkp-restore-modal').style.display = 'flex';
    } catch(e) {
        showToast('❌ ' + e.message, 'error');
    }
}

// ── Restore: Ausführen ───────────────────────────────────────────────────

async function bkpConfirmRestore() {
    if (!_bkpRestoreId) return;

    // BUG-03 FIX: Zweistufige Bestätigung mit explizitem Datenverlust-Hinweis.
    // Der alte Code löschte alle Daten und schrieb dann neu — ohne Rollback-Möglichkeit.
    // Schritt 1: Klarer Warn-Dialog
    if (!confirm('⚠️ ACHTUNG: Diese Aktion löscht ALLE aktuellen Daten in den gewählten Collections und ersetzt sie durch das Backup.\n\nDieser Vorgang kann NICHT rückgängig gemacht werden!\n\nFortfahren?')) return;
    // Schritt 2: Manuelles Eintippen zur Bestätigung
    const confirmText = prompt('Tippe "RESTORE" ein um fortzufahren:');
    if (confirmText !== 'RESTORE') { showToast('Abgebrochen — Eingabe nicht korrekt', 'warning'); return; }

    const btn = document.getElementById('bkp-restore-confirm-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Erstelle Sicherheitskopie...'; }

    try {
        // Vor dem Überschreiben: automatisches Backup der aktuellen Daten erstellen
        showToast('🔄 Erstelle Sicherheitskopie der aktuellen Daten...', 'success');
        try {
            await bkpRunNow(); // Aktuellen Stand sichern bevor alles gelöscht wird
        } catch(backupErr) {
            console.warn('Sicherheitskopie vor Restore fehlgeschlagen:', backupErr.message);
            if (!confirm('⚠️ Sicherheitskopie konnte nicht erstellt werden!\n\nTrotzdem fortfahren? (NICHT EMPFOHLEN)')) {
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Wiederherstellen'; }
                return;
            }
        }

        if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Wird wiederhergestellt...';

        const snap = await db.collection(BKP_COLLECTION).doc(_bkpRestoreId).get();
        if (!snap.exists) throw new Error('Backup-Dokument nicht gefunden.');

        const b = snap.data();
        const allData = JSON.parse(b.data || '{}');
        const cols    = _bkpRestoreCols || Object.keys(allData);
        let restoredTotal = 0;

        for (const col of cols) {
            const docs = allData[col];
            if (!Array.isArray(docs)) continue;

            // Erst löschen (in Batches à 400)
            const existingSnap = await db.collection(col).get();
            for (let i = 0; i < existingSnap.docs.length; i += 400) {
                const batch = db.batch();
                existingSnap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
                await batch.commit();
            }

            // Dann schreiben (in Batches à 400)
            for (let i = 0; i < docs.length; i += 400) {
                const batch = db.batch();
                docs.slice(i, i + 400).forEach(doc => {
                    const { id, ...data } = doc;
                    batch.set(db.collection(col).doc(String(id)), data);
                });
                await batch.commit();
            }
            restoredTotal += docs.length;
        }

        await logAction('backup_restored', _bkpRestoreId, {
            collections: cols,
            restoredDocs: restoredTotal,
            restoredBy: auth.currentUser?.email
        });

        document.getElementById('bkp-restore-modal').style.display = 'none';
        showToast(`✅ ${restoredTotal} Dokumente aus ${cols.length} Collections wiederhergestellt!`, 'success');
        _bkpRestoreId = null;

    } catch(e) {
        showToast('❌ Restore fehlgeschlagen: ' + e.message, 'error');
        console.error('Restore error:', e);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Wiederherstellen'; }
    }
}

// ── Log-Labels erweitern ──────────────────────────────────────────────────
// BUG-09 FIX: Erster Monkey-Patch-Block (Zeilen 11200-11205 original) entfernt —
// er rief nur origRender auf ohne etwas hinzuzufügen (dead code).
// Nur der zweite Patch (unten) ist aktiv und korrekt.

// Füge Backup-Aktionen zum SA-Log-Labels hinzu (Monkey-patch auf actionLabel map)
const _bkpLabelMap = {
    'auto_backup_created':  '💾 Auto-Backup erstellt',
    'backup_config_saved':  '⚙️ Backup-Konfiguration gespeichert',
    'backup_downloaded':    '📥 Backup heruntergeladen',
    'backup_deleted':       '🗑️ Backup gelöscht',
    'backup_restored':      '🔄 Backup wiederhergestellt',
};
// Extend existing map by patching renderLogEntries
const _origRenderLogEntries = window.renderLogEntries;
window.renderLogEntries = function(el, docs, compact) {
    if (!el) return;
    if (!docs || docs.length === 0) {
        el.innerHTML = '<div style="color:rgba(255,255,255,.2);font-size:12px;padding:20px;text-align:center"><i class="fa-solid fa-inbox" style="font-size:24px;display:block;margin-bottom:10px;opacity:.3"></i>Keine Einträge</div>';
        return;
    }
    const DANGER_KEYWORDS = ['danger','delete','purge','reset','close'];
    const ACCESS_KEYWORDS = ['access','login'];
    const EXPORT_KEYWORDS = ['export','backup'];
    el.innerHTML = docs.map(doc => {
        const d = doc.data ? doc.data() : doc;
        const action = d.action || 'unbekannt';
        const ts = d.timestamp?.toDate?.() || new Date();
        const dateStr = ts.toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
        const ip = d.details?.ip || d.ip || '';
        const target = d.target || '';
        let dotClass = 'action';
        if (DANGER_KEYWORDS.some(k => action.includes(k))) dotClass = 'danger';
        else if (ACCESS_KEYWORDS.some(k => action.includes(k))) dotClass = 'access';
        else if (EXPORT_KEYWORDS.some(k => action.includes(k))) dotClass = 'settings';
        const builtIn = {
            'superadmin_zone_access':'🔓 SA-Zone aufgerufen','admin_added':'➕ Admin hinzugefügt','admin_removed':'➖ Admin entfernt','admin_permissions_updated':'⚙️ Berechtigungen geändert','ip_whitelist_updated':'🌐 IP-Whitelist aktualisiert','sa_security_settings':'🔒 Sicherheitseinstellungen gespeichert','sa_export':'💾 Daten exportiert','sa_fullexport':'💾 Vollbackup erstellt','danger_shop_close':'🔴 Shop geschlossen','danger_shop_open':'🟢 Shop geöffnet','danger_clear_banned_ips':'🧹 IP-Sperren aufgehoben','danger_reject_reviews':'🗑️ Reviews massenabgelehnt','danger_purge_logs':'🗑️ Alte Logs gelöscht','danger_reset_loyalty':'🔄 Loyalty-Punkte zurückgesetzt','danger_delete_orders':'☢️ ALLE Bestellungen gelöscht',
            ..._bkpLabelMap
        };
        const actionLabel = builtIn[action] || `⚡ ${action}`;
        return `<div class="sa-log-entry"><div class="sa-log-dot ${dotClass}"></div><div><div class="sa-log-action">${actionLabel}</div><div class="sa-log-meta">${dateStr}${target?' • '+target.substring(0,20):''}${ip?' • '+ip:''}</div></div></div>`;
    }).join('');
};

// ═══════════════════════════════════════════════════════════════════════════
//  WAVEVAPES BUNDLE MANAGER v1.0  (Tab 16)
// ═══════════════════════════════════════════════════════════════════════════

let _bundles      = [];
let _allProducts  = [];
let _bundleEditId = null;
let _bundleItems  = [];

const BND_COL = 'bundles';

// ── CSS ───────────────────────────────────────────────────────────────────
(function injectBundleCSS() {
    const s = document.createElement('style');
    s.textContent = `
    :root{--bnd-gold:#fbbf24;--bnd-cyan:#67e8f9;--bnd-green:#34d399;--bnd-red:#f87171;--bnd-purple:#a78bfa;--bnd-card:#0f0f1a;--bnd-border:rgba(255,255,255,.07)}
    .bnd-shell{display:flex;flex-direction:column;gap:20px;padding:4px 0}
    .bnd-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}
    .bnd-title{font-family:'Orbitron',sans-serif;font-size:20px;font-weight:700;color:var(--bnd-gold);display:flex;align-items:center;gap:10px;text-shadow:0 0 20px rgba(251,191,36,.3)}
    .bnd-kpi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
    .bnd-kpi{background:var(--bnd-card);border:1px solid var(--bnd-border);border-radius:18px;padding:16px 20px;transition:all .2s}
    .bnd-kpi:hover{border-color:rgba(251,191,36,.2);transform:translateY(-2px)}
    .bnd-kpi-icon{font-size:20px;margin-bottom:8px}
    .bnd-kpi-label{font-size:10px;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
    .bnd-kpi-value{font-family:'JetBrains Mono',monospace;font-size:24px;font-weight:700;color:var(--bnd-gold);line-height:1}
    .bnd-kpi-sub{font-size:10px;color:rgba(255,255,255,.25);margin-top:4px}
    .bnd-card{background:var(--bnd-card);border:1px solid var(--bnd-border);border-radius:20px;padding:20px 22px;transition:all .2s;position:relative}
    .bnd-card:hover{border-color:rgba(251,191,36,.18)}
    .bnd-card-active{border-color:rgba(52,211,153,.2)!important}
    .bnd-card-inactive{opacity:.6}
    .bnd-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:99px;font-size:10px;font-weight:700}
    .bnd-badge-active{background:rgba(52,211,153,.12);color:var(--bnd-green);border:1px solid rgba(52,211,153,.25)}
    .bnd-badge-inactive{background:rgba(239,68,68,.1);color:var(--bnd-red);border:1px solid rgba(239,68,68,.2)}
    .bnd-profit-bar{height:6px;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden;margin:6px 0}
    .bnd-profit-fill{height:100%;border-radius:99px;transition:width .4s ease}
    .bnd-tag{display:inline-flex;padding:2px 8px;border-radius:6px;font-size:10px;background:rgba(103,232,249,.08);color:var(--bnd-cyan);border:1px solid rgba(103,232,249,.15)}
    .bnd-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.88);backdrop-filter:blur(14px);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:24px;overflow-y:auto}
    .bnd-modal{background:linear-gradient(160deg,#0f0f1a,#15152a);border:1px solid rgba(251,191,36,.2);border-radius:28px;padding:32px;width:100%;max-width:800px;animation:modalPop .3s cubic-bezier(0.34,1.56,0.64,1)}
    .bnd-modal-title{font-family:'Orbitron',sans-serif;font-size:18px;font-weight:700;color:var(--bnd-gold);display:flex;align-items:center;gap:10px;margin-bottom:24px;text-shadow:0 0 16px rgba(251,191,36,.3)}
    .bnd-field-label{font-size:11px;font-weight:700;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px}
    .bnd-input{width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:11px 14px;color:#fff;font-size:13px;outline:none;box-sizing:border-box;transition:border-color .2s}
    .bnd-input:focus{border-color:rgba(251,191,36,.4);box-shadow:0 0 0 3px rgba(251,191,36,.06)}
    .bnd-input::placeholder{color:rgba(255,255,255,.2)}
    .bnd-btn{padding:10px 20px;border-radius:12px;border:none;cursor:pointer;font-size:13px;font-weight:700;transition:all .15s;display:inline-flex;align-items:center;gap:8px}
    .bnd-btn-gold{background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#000}
    .bnd-btn-gold:hover{opacity:.9;transform:translateY(-1px)}
    .bnd-btn-ghost{background:rgba(255,255,255,.06);color:rgba(255,255,255,.6);border:1px solid rgba(255,255,255,.1)}
    .bnd-btn-ghost:hover{background:rgba(255,255,255,.1)}
    .bnd-btn-cyan{background:rgba(103,232,249,.1);color:var(--bnd-cyan);border:1px solid rgba(103,232,249,.2)}
    .bnd-btn-cyan:hover{background:rgba(103,232,249,.2)}
    .bnd-btn-green{background:rgba(52,211,153,.1);color:var(--bnd-green);border:1px solid rgba(52,211,153,.2)}
    .bnd-btn-green:hover{background:rgba(52,211,153,.2)}
    .bnd-btn-red{background:rgba(239,68,68,.1);color:var(--bnd-red);border:1px solid rgba(239,68,68,.2)}
    .bnd-btn-red:hover{background:rgba(239,68,68,.2)}
    .bnd-btn-purple{background:rgba(167,139,250,.1);color:var(--bnd-purple);border:1px solid rgba(167,139,250,.2)}
    .bnd-btn-purple:hover{background:rgba(167,139,250,.2)}
    .bnd-btn:disabled{opacity:.4;cursor:not-allowed;transform:none!important}
    .bnd-prod-search{width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:9px 12px;color:#fff;font-size:12px;outline:none;box-sizing:border-box;transition:border-color .2s}
    .bnd-prod-search:focus{border-color:rgba(103,232,249,.35)}
    .bnd-prod-list{max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-top:8px}
    .bnd-prod-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;cursor:pointer;transition:all .12s;font-size:12px}
    .bnd-prod-item:hover{background:rgba(103,232,249,.07);border-color:rgba(103,232,249,.15)}
    .bnd-prod-item.bnd-prod-selected{background:rgba(251,191,36,.05);border-color:rgba(251,191,36,.15);cursor:default}
    .bnd-item-row{display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:12px}
    .bnd-item-name{flex:1;font-size:12px;font-weight:600;color:rgba(255,255,255,.85)}
    .bnd-item-price{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--bnd-gold);white-space:nowrap}
    .bnd-qty-btn{width:26px;height:26px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);color:#fff;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .1s;flex-shrink:0;line-height:1}
    .bnd-qty-btn:hover{background:rgba(255,255,255,.14)}
    .bnd-qty-val{font-size:13px;font-weight:700;color:#fff;min-width:20px;text-align:center}
    .bnd-ai-box{background:linear-gradient(135deg,rgba(167,139,250,.06),rgba(251,191,36,.04));border:1px solid rgba(167,139,250,.2);border-radius:18px;padding:18px 20px}
    .bnd-ai-title{font-size:13px;font-weight:700;color:var(--bnd-purple);display:flex;align-items:center;gap:8px;margin-bottom:12px}
    .bnd-ai-result{font-size:12px;color:rgba(255,255,255,.7);line-height:1.7;white-space:pre-wrap}
    .bnd-profit-box{background:rgba(52,211,153,.04);border:1px solid rgba(52,211,153,.15);border-radius:16px;padding:16px 20px}
    .bnd-profit-row{display:flex;justify-content:space-between;align-items:center;font-size:12px;margin-bottom:6px}
    .bnd-profit-lbl{color:rgba(255,255,255,.4)}
    .bnd-profit-val{font-weight:700;font-family:'JetBrains Mono',monospace}
    .bnd-divider{height:1px;background:rgba(255,255,255,.06);margin:12px 0}
    `;
    document.head.appendChild(s);
})();

// ── Helfer ────────────────────────────────────────────────────────────────

function bndFmt(v) { return Number(v||0).toFixed(2).replace('.',',') + ' €'; }
function bndPct(v) { return Number(v||0).toFixed(1) + '%'; }

// ── Produkte laden ────────────────────────────────────────────────────────

async function bndLoadProducts() {
    if (_allProducts.length) return;
    const snap = await db.collection('products').get();
    _allProducts = snap.docs.map(d => {
        const x = d.data();
        return { id:d.id, name:x.name||'–', price:parseFloat(x.price)||0, cost:parseFloat(x.cost)||0, stock:parseInt(x.stock, 10)||0, category:x.category||'' };
    });
}

// ── Haupt-Loader ──────────────────────────────────────────────────────────

async function loadBundles() {
    const shell = document.getElementById('bundle-shell');
    if (!shell) return;
    shell.innerHTML = '<div style="color:rgba(255,255,255,.2);font-size:13px;padding:60px;text-align:center"><i class="fa-solid fa-spinner fa-spin" style="font-size:28px;display:block;margin-bottom:14px"></i>Lade Bundles…</div>';
    try {
        await bndLoadProducts();
        const snap = await db.collection(BND_COL).orderBy('createdAt','desc').get();
        _bundles = snap.docs.map(d => ({id:d.id,...d.data()}));

        // Refresh Sortierung cat bar if that tab is currently open
        if (document.getElementById('tab-content-8') && !document.getElementById('tab-content-8').classList.contains('hidden')) {
            renderSrtCatBar();
            renderSortList();
        }

        // Badge in Sidebar
        const badge = document.getElementById('sb-bundles-badge');
        if (badge) {
            const activeCount = _bundles.filter(b=>b.active).length;
            badge.textContent = activeCount;
            badge.style.display = activeCount ? 'inline-flex' : 'none';
        }

        bndRender();
    } catch(e) {
        shell.innerHTML = `<div style="color:#f87171;padding:40px;text-align:center">❌ ${escA(e.message)}</div>`;
    }
}

// ── Render ────────────────────────────────────────────────────────────────

function bndRender() {
    const shell = document.getElementById('bundle-shell');
    if (!shell) return;

    const active   = _bundles.filter(b=>b.active);
    const totalRev = _bundles.reduce((s,b)=>s+(b.soldCount||0)*(b.bundlePrice||0),0);
    const avgDisc  = _bundles.length ? (_bundles.reduce((s,b)=>s+(b.discountPct||0),0)/_bundles.length) : 0;
    const avgMargin= _bundles.length ? (_bundles.reduce((s,b)=>s+bndMarginPct(b),0)/_bundles.length) : 0;

    shell.innerHTML = `
    <div class="bnd-shell">
        <div class="bnd-header">
            <div class="bnd-title"><i class="fa-solid fa-layer-group"></i> Bundle Manager</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="bnd-btn bnd-btn-ghost" style="font-size:12px;padding:8px 14px" onclick="loadBundles()"><i class="fa-solid fa-rotate"></i> Aktualisieren</button>
                <button class="bnd-btn bnd-btn-gold" onclick="bndOpenCreate()"><i class="fa-solid fa-plus"></i> Neues Bundle</button>
            </div>
        </div>

        <div class="bnd-kpi-grid">
            <div class="bnd-kpi"><div class="bnd-kpi-icon">📦</div><div class="bnd-kpi-label">Bundles gesamt</div><div class="bnd-kpi-value">${_bundles.length}</div><div class="bnd-kpi-sub">${active.length} aktiv</div></div>
            <div class="bnd-kpi"><div class="bnd-kpi-icon">✅</div><div class="bnd-kpi-label">Aktive Bundles</div><div class="bnd-kpi-value" style="color:var(--bnd-green)">${active.length}</div><div class="bnd-kpi-sub">im Shop sichtbar</div></div>
            <div class="bnd-kpi"><div class="bnd-kpi-icon">🏷️</div><div class="bnd-kpi-label">Ø Rabatt</div><div class="bnd-kpi-value" style="color:var(--bnd-purple)">${bndPct(avgDisc)}</div><div class="bnd-kpi-sub">über alle Bundles</div></div>
            <div class="bnd-kpi"><div class="bnd-kpi-icon">📈</div><div class="bnd-kpi-label">Ø Profit-Marge</div><div class="bnd-kpi-value" style="color:${avgMargin>25?'var(--bnd-green)':avgMargin>12?'var(--bnd-gold)':'var(--bnd-red)'}">${bndPct(avgMargin)}</div><div class="bnd-kpi-sub">über alle Bundles</div></div>
            <div class="bnd-kpi"><div class="bnd-kpi-icon">💰</div><div class="bnd-kpi-label">Hochger. Umsatz</div><div class="bnd-kpi-value" style="color:var(--bnd-cyan);font-size:18px">${bndFmt(totalRev)}</div><div class="bnd-kpi-sub">aus Bundle-Käufen</div></div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px">
            ${_bundles.length ? _bundles.map(b=>bndCardHTML(b)).join('') : '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:rgba(255,255,255,.2)"><i class="fa-solid fa-layer-group" style="font-size:40px;display:block;margin-bottom:14px;opacity:.15"></i>Noch keine Bundles. Erstelle dein erstes!</div>'}
        </div>
    </div>`;
}

// ── Hilfsfunktion: Effektiver Verkaufspreis inkl. aktiver Aktionen ────────
// Gibt den tatsächlich im Shop geltenden Preis zurück (nach Promo-Rabatt)
function bndEffectivePrice(p) {
    const promo = _promos.find(pr => pr.active && pr.category === p.category);
    if (!promo) return p.price;
    if (promo.type === 'percent') {
        return Math.round(p.price * (1 - promo.value / 100) * 100) / 100;
    }
    if (promo.type === 'fixed') {
        return Math.max(0, Math.round((p.price - promo.value) * 100) / 100);
    }
    return p.price;
}

// ── Hilfsfunktion: Echter Einkaufspreis pro Item ──────────────────────────
// Priorität: 1) costPrice aus allProducts (live, immer aktuell)
//            2) gespeichertes it.cost im Bundle-Item
//            3) null wenn kein EK hinterlegt (kein 40%-Schätzer!)
function bndRealCost(it) {
    const prod = allProducts.find(p => p.id === (it.productId || it.id));
    if (prod && prod.costPrice > 0) return prod.costPrice;
    if (it.cost > 0) return it.cost;
    return null; // kein EK bekannt
}

// Gibt true zurück wenn alle Items einen bekannten EK haben
function bndAllCostsKnown(items) {
    return items.every(it => bndRealCost(it) !== null);
}

function bndMarginPct(b) {
    const items = b.items||[];
    if (!bndAllCostsKnown(items)) return null; // EK fehlt — kein Schätzen
    const cost  = items.reduce((s,it)=>s+bndRealCost(it)*it.qty, 0);
    const profit= (b.bundlePrice||0)-cost;
    return b.bundlePrice>0?(profit/b.bundlePrice*100):0;
}

function bndCardHTML(b) {
    const orig        = (b.items||[]).reduce((s,it)=>s+it.price*it.qty, 0);
    const disc        = orig>0?((orig-b.bundlePrice)/orig*100):0;
    const margin      = bndMarginPct(b); // null wenn EK fehlt
    const allKnown    = bndAllCostsKnown(b.items||[]);
    const cost        = allKnown ? (b.items||[]).reduce((s,it)=>s+bndRealCost(it)*it.qty, 0) : null;
    const profit      = cost !== null ? (b.bundlePrice||0)-cost : null;
    const pc          = margin===null?'rgba(255,255,255,.4)':margin>30?'var(--bnd-green)':margin>15?'var(--bnd-gold)':'var(--bnd-red)';
    const pb          = margin===null?'rgba(255,255,255,.12)':margin>30?'linear-gradient(90deg,#34d399,#10b981)':margin>15?'linear-gradient(90deg,#fbbf24,#f59e0b)':'linear-gradient(90deg,#f87171,#ef4444)';
    const pr          = margin===null?'⚠️ Einkaufspreis fehlt':margin<0?'🔴 Verlust! EK prüfen':margin>30?'🟢 Gute Marge':margin>15?'🟡 Akzeptabel':'🔴 Niedrige Marge!';
    const profitLabel = profit!==null?(bndPct(margin)+' · '+bndFmt(profit)+' Profit'):'EK eintragen';

    return `
    <div class="bnd-card ${b.active?'bnd-card-active':'bnd-card-inactive'}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px">
            <div style="min-width:0">
                <div style="font-size:15px;font-weight:700;color:#fff;margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.name||'–'}</div>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:2px">
                    ${b.description?`<span style="font-size:11px;color:rgba(255,255,255,.3)">${b.description}</span>`:''}
                    ${b.category?`<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;background:rgba(103,232,249,.1);color:#67e8f9;border:1px solid rgba(103,232,249,.2)"><i class="fa-solid fa-tag" style="margin-right:3px;font-size:9px"></i>${b.category}</span>`:'<span style="font-size:10px;color:rgba(255,255,255,.2);font-style:italic">Keine Kategorie</span>'}
                </div>
            </div>
            <span class="bnd-badge ${b.active?'bnd-badge-active':'bnd-badge-inactive'}" style="flex-shrink:0">${b.active?'✅ Aktiv':'⏸ Inaktiv'}</span>
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:14px">
            ${(b.items||[]).map(it=>`<span class="bnd-tag">${it.name} ×${it.qty}</span>`).join('')}
        </div>

        <div style="display:flex;gap:16px;margin-bottom:12px;flex-wrap:wrap">
            <div>
                <div style="font-size:10px;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">Originalpreis</div>
                <div style="font-family:'JetBrains Mono',monospace;font-size:13px;color:rgba(255,255,255,.35);text-decoration:line-through">${bndFmt(orig)}</div>
            </div>
            <div>
                <div style="font-size:10px;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">Bundle-Preis</div>
                <div style="font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:700;color:var(--bnd-gold)">${bndFmt(b.bundlePrice)}</div>
            </div>
            <div>
                <div style="font-size:10px;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">Ersparnis</div>
                <div style="font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:700;color:var(--bnd-purple)">−${bndPct(disc)}</div>
            </div>
            ${cost!==null?`<div>
                <div style="font-size:10px;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">Einkaufspreis</div>
                <div style="font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:var(--bnd-red)">${bndFmt(cost)}</div>
            </div>`:'<div style="font-size:10px;color:#fbbf24;align-self:flex-end;padding-bottom:2px"><i class="fa-solid fa-triangle-exclamation" style="margin-right:3px"></i>EK fehlt</div>'}
        </div>

        <div style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;font-size:10px;color:rgba(255,255,255,.3);margin-bottom:3px">
                <span style="color:${pc}">${pr}</span>
                <span style="color:${pc};font-weight:700">${profitLabel}</span>
            </div>
            <div class="bnd-profit-bar"><div class="bnd-profit-fill" style="width:${Math.min(100,Math.max(0,margin??0))}%;background:${pb}"></div></div>
        </div>

        <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="bnd-btn bnd-btn-cyan" style="font-size:11px;padding:7px 12px" onclick="bndToggleActive('${b.id}',${!b.active})">
                <i class="fa-solid fa-${b.active?'pause':'play'}"></i> ${b.active?'Deaktivieren':'Aktivieren'}
            </button>
            <button class="bnd-btn bnd-btn-ghost" style="font-size:11px;padding:7px 12px" onclick="bndOpenEdit('${b.id}')">
                <i class="fa-solid fa-pen"></i> Bearbeiten
            </button>
            <button class="bnd-btn bnd-btn-red" style="font-size:11px;padding:7px 12px" onclick="bndDelete('${b.id}')">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    </div>`;
}

// ── Modal öffnen ──────────────────────────────────────────────────────────

function bndOpenCreate() { _bundleEditId=null; _bundleItems=[]; bndShowModal(); }

function bndOpenEdit(id) {
    const b=_bundles.find(x=>x.id===id);
    if(!b)return;
    _bundleEditId=id;
    _bundleItems=(b.items||[]).map(it=>({...it}));
    bndShowModal(b);
}

function bndShowModal(b=null) {
    document.getElementById('bnd-modal-overlay')?.remove();
    const ov=document.createElement('div');
    ov.id='bnd-modal-overlay';
    ov.className='bnd-modal-overlay';
    ov.innerHTML=`
    <div class="bnd-modal">
        <div class="bnd-modal-title"><i class="fa-solid fa-layer-group"></i>${b?'Bundle bearbeiten':'Neues Bundle erstellen'}</div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
            <div><div class="bnd-field-label">Bundle-Name *</div><input class="bnd-input" id="bnd-f-name" placeholder="z.B. Starter-Set Tropical" value="${b?.name||''}"></div>
            <div><div class="bnd-field-label">Bundle-Preis (€) *</div><input class="bnd-input" id="bnd-f-price" type="number" step="0.01" min="0" placeholder="z.B. 34.99" value="${b?.bundlePrice||''}"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
            <div>
                <div class="bnd-field-label">Beschreibung</div>
                <input class="bnd-input" id="bnd-f-desc" placeholder="Kurze Info für den Kunden" value="${b?.description||''}">
            </div>
            <div>
                <div class="bnd-field-label">Kategorie <span style="font-weight:400;opacity:.5;font-size:10px">(im Shop anzeigen unter)</span></div>
                <select class="bnd-input" id="bnd-f-category" style="color-scheme:dark;cursor:pointer">
                    <option value="">— Keine Kategorie —</option>
                    ${allCategories.map(c=>`<option value="${c.name}" ${(b?.category===c.name)?'selected':''}>${c.name}</option>`).join('')}
                </select>
            </div>
        </div>

        <!-- Bundle-Bild -->
        <div style="margin-bottom:16px">
            <div class="bnd-field-label">Bundle-Bild <span style="font-weight:400;opacity:.5;font-size:10px">optional — wird im Shop angezeigt</span></div>
            <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">
                <div id="bnd-img-preview" style="width:90px;height:90px;border-radius:14px;background:rgba(255,255,255,.04);border:1px dashed rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden">
                    ${b?.image
                        ? `<img src="${b.image}" style="width:100%;height:100%;object-fit:cover;border-radius:14px">`
                        : `<i class="fa-solid fa-image" style="font-size:24px;color:rgba(255,255,255,.2)"></i>`}
                </div>
                <div style="flex:1;min-width:160px">
                    <div id="bnd-img-dropzone" onclick="document.getElementById('bnd-img-input').click()"
                        style="border:1px dashed rgba(167,139,250,.3);border-radius:12px;padding:14px;text-align:center;cursor:pointer;transition:all .2s;background:rgba(167,139,250,.04)"
                        onmouseover="this.style.background='rgba(167,139,250,.1)';this.style.borderColor='rgba(167,139,250,.6)'"
                        onmouseout="this.style.background='rgba(167,139,250,.04)';this.style.borderColor='rgba(167,139,250,.3)'">
                        <i class="fa-solid fa-cloud-arrow-up" style="color:#a78bfa;display:block;font-size:18px;margin-bottom:4px"></i>
                        <span style="font-size:11px;color:rgba(167,139,250,.7)">Bild hochladen</span>
                    </div>
                    <input type="file" id="bnd-img-input" accept="image/*" style="display:none" onchange="bndPreviewImage(this)">
                    ${b?.image ? `<button onclick="bndRemoveImage()" style="margin-top:6px;width:100%;padding:5px;border-radius:8px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.18);color:#f87171;font-size:10px;cursor:pointer;transition:all .2s" onmouseover="this.style.background='rgba(239,68,68,.18)'" onmouseout="this.style.background='rgba(239,68,68,.08)'"><i class="fa-solid fa-trash"></i> Bild entfernen</button>` : ''}
                </div>
            </div>
        </div>

        <!-- Produkt-Picker -->
        <div style="margin-bottom:14px">
            <div class="bnd-field-label">Produkte hinzufügen</div>
            <input class="bnd-prod-search" id="bnd-prod-search" placeholder="🔍 Produkt suchen…" oninput="bndFilterProducts(this.value)">
            <div class="bnd-prod-list" id="bnd-prod-list"></div>
        </div>

        <!-- Gewählte Produkte -->
        <div style="margin-bottom:16px">
            <div class="bnd-field-label">Im Bundle enthalten</div>
            <div id="bnd-items-list" style="display:flex;flex-direction:column;gap:6px;min-height:44px"></div>
        </div>

        <!-- Live-Profit -->
        <div id="bnd-summary" style="display:none;margin-bottom:16px">
            <div class="bnd-profit-box" id="bnd-profit-box"></div>
        </div>

        <!-- KI -->
        <div class="bnd-ai-box" style="margin-bottom:20px">
            <div class="bnd-ai-title"><i class="fa-solid fa-wand-magic-sparkles"></i> KI-Rabatt-Empfehlung</div>
            <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
                <button class="bnd-btn bnd-btn-purple" style="font-size:12px;padding:8px 14px" id="bnd-ai-btn-c" onclick="bndAICalc('conservative')"><i class="fa-solid fa-shield"></i> Konservativ</button>
                <button class="bnd-btn bnd-btn-purple" style="font-size:12px;padding:8px 14px" id="bnd-ai-btn-b" onclick="bndAICalc('balanced')"><i class="fa-solid fa-scale-balanced"></i> Ausgewogen</button>
                <button class="bnd-btn bnd-btn-purple" style="font-size:12px;padding:8px 14px" id="bnd-ai-btn-a" onclick="bndAICalc('aggressive')"><i class="fa-solid fa-fire"></i> Aggressiv</button>
            </div>
            <div id="bnd-ai-result" class="bnd-ai-result" style="color:rgba(255,255,255,.3);font-size:12px">← Klicke eine Strategie für KI-Preisanalyse</div>
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
            <button class="bnd-btn bnd-btn-ghost" onclick="document.getElementById('bnd-modal-overlay').remove()">Abbrechen</button>
            <button class="bnd-btn bnd-btn-gold" onclick="bndSave()"><i class="fa-solid fa-floppy-disk"></i> Bundle speichern</button>
        </div>
    </div>`;
    document.body.appendChild(ov);
    bndFilterProducts('');
    bndRenderItems();
    bndUpdateSummary();
}

// ── Produkt-Picker ────────────────────────────────────────────────────────

function bndFilterProducts(q) {
    const list=document.getElementById('bnd-prod-list');
    if(!list)return;
    const term=q.toLowerCase();
    const visible=_allProducts.filter(p=>p.name.toLowerCase().includes(term)).slice(0,30);
    list.innerHTML=visible.map(p=>{
        const already=_bundleItems.find(it=>it.productId===p.id);
        const effPrice = bndEffectivePrice(p);
        const hasPromo = effPrice < p.price;
        const priceHtml = hasPromo
            ? `<span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--bnd-gold)">${bndFmt(effPrice)}</span>
               <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:rgba(255,255,255,.25);text-decoration:line-through;margin-left:4px">${bndFmt(p.price)}</span>
               <span style="font-size:9px;background:rgba(239,68,68,.2);color:#f87171;border-radius:5px;padding:1px 5px;margin-left:3px">SALE</span>`
            : `<span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--bnd-gold)">${bndFmt(effPrice)}</span>`;
        return `<div class="bnd-prod-item${already?' bnd-prod-selected':''}" ${already?'':'onclick="bndAddProduct(\''+p.id+'\')"'}>
            <span style="font-weight:600;color:${already?'rgba(255,255,255,.3)':'#fff'}">${already?'✓ ':''} ${p.name}</span>
            <span style="display:flex;align-items:center;gap:2px">${priceHtml}</span>
        </div>`;
    }).join('')||'<div style="color:rgba(255,255,255,.2);font-size:12px;padding:10px">Keine Produkte gefunden</div>';
}

function bndAddProduct(id) {
    const p=_allProducts.find(x=>x.id===id);
    if(!p||_bundleItems.find(it=>it.productId===id))return;
    const effectivePrice = bndEffectivePrice(p);
    _bundleItems.push({productId:id, name:p.name, price:effectivePrice, originalPrice:p.price, cost:p.costPrice||p.cost||0, qty:1});
    bndFilterProducts(document.getElementById('bnd-prod-search')?.value||'');
    bndRenderItems();
    bndUpdateSummary();
}

function bndChangeQty(id,delta) {
    const it=_bundleItems.find(x=>x.productId===id);
    if(!it)return;
    it.qty=Math.max(1,it.qty+delta);
    bndRenderItems();
    bndUpdateSummary();
}

function bndRemoveItem(id) {
    _bundleItems=_bundleItems.filter(it=>it.productId!==id);
    bndFilterProducts(document.getElementById('bnd-prod-search')?.value||'');
    bndRenderItems();
    bndUpdateSummary();
}

function bndRenderItems() {
    const list=document.getElementById('bnd-items-list');
    if(!list)return;
    if(!_bundleItems.length){
        list.innerHTML='<div style="color:rgba(255,255,255,.2);font-size:12px;padding:12px;text-align:center;border:1px dashed rgba(255,255,255,.08);border-radius:10px">Noch keine Produkte hinzugefügt</div>';
        return;
    }
    // Preise live aus allProducts + Promos aktualisieren
    _bundleItems.forEach(it => {
        const prod = _allProducts.find(p => p.id === it.productId);
        if (prod) {
            const effPrice = bndEffectivePrice(prod);
            it.price = effPrice;
            it.originalPrice = prod.price;
        }
    });
    list.innerHTML=_bundleItems.map(it=>{
        const hasPromo = it.originalPrice && it.originalPrice > it.price;
        const priceDisplay = hasPromo
            ? `<div class="bnd-item-price" style="display:flex;flex-direction:column;align-items:flex-end;gap:1px">
                   <span>${bndFmt(it.price*it.qty)}</span>
                   <span style="font-size:10px;color:rgba(255,255,255,.25);text-decoration:line-through">${bndFmt(it.originalPrice*it.qty)}</span>
               </div>`
            : `<div class="bnd-item-price">${bndFmt(it.price*it.qty)}</div>`;
        return `
    <div class="bnd-item-row">
        <div class="bnd-item-name">${it.name}${hasPromo?` <span style="font-size:9px;background:rgba(239,68,68,.2);color:#f87171;border-radius:4px;padding:1px 5px;margin-left:4px;vertical-align:middle">SALE</span>`:''}
        </div>
        <div style="display:flex;align-items:center;gap:6px">
            <button class="bnd-qty-btn" onclick="bndChangeQty('${it.productId}',-1)">−</button>
            <span class="bnd-qty-val">${it.qty}</span>
            <button class="bnd-qty-btn" onclick="bndChangeQty('${it.productId}',1)">+</button>
        </div>
        ${priceDisplay}
        <button onclick="bndRemoveItem('${it.productId}')" style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.15);border-radius:8px;color:#f87171;width:26px;height:26px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0">✕</button>
    </div>`;
    }).join('');
}

// ── Live-Profit-Analyse ───────────────────────────────────────────────────

function bndUpdateSummary() {
    const wrap=document.getElementById('bnd-summary');
    const box =document.getElementById('bnd-profit-box');
    if(!wrap||!box)return;
    if(!_bundleItems.length){wrap.style.display='none';return;}
    wrap.style.display='block';

    const priceEl=document.getElementById('bnd-f-price');
    if(priceEl&&!priceEl._bndBound){priceEl._bndBound=true;priceEl.addEventListener('input',bndUpdateSummary);}

    const inputPrice=parseFloat(priceEl?.value)||0;
    const orig=_bundleItems.reduce((s,it)=>s+it.price*it.qty,0);
    // Echter Einkaufspreis: immer live aus allProducts holen, kein 40%-Schätzer
    const cost=_bundleItems.reduce((s,it)=>{
        const ek=bndRealCost(it);
        return s+(ek!==null?ek:it.price*0.4)*it.qty;
    },0);
    const allCostsKnown=bndAllCostsKnown(_bundleItems);
    const bp=inputPrice>0?inputPrice:orig;
    const disc=orig>0?((orig-bp)/orig*100):0;
    const profit=bp-cost;
    const margin=bp>0?(profit/bp*100):0;
    const pc=margin>30?'#34d399':margin>15?'#fbbf24':'#f87171';
    const pb=margin>30?'linear-gradient(90deg,#34d399,#10b981)':margin>15?'linear-gradient(90deg,#fbbf24,#f59e0b)':'linear-gradient(90deg,#f87171,#ef4444)';
    const pr=margin>30?'🟢 Gute Marge':margin>15?'🟡 Akzeptable Marge':'🔴 Niedrige Marge — Preis prüfen';
    const tip=margin<0?'⚠️ Du machst Verlust mit diesem Bundle!':margin<10?'💡 Tipp: KI-Analyse nutzen für besseren Preis':margin>40?'🚀 Sehr gute Marge!':'';
    const ekHint=!allCostsKnown?'<div style="font-size:10px;color:#fbbf24;margin-top:8px;padding:6px 10px;background:rgba(251,191,36,.07);border-radius:8px;border:1px solid rgba(251,191,36,.18)"><i class="fa-solid fa-triangle-exclamation" style="margin-right:4px"></i>Einige Produkte haben keinen Einkaufspreis — Marge ist Schätzung. <button onclick="openCatCostModal()" style="background:none;border:none;color:#fbbf24;text-decoration:underline;cursor:pointer;font-size:10px;padding:0">Jetzt hinterlegen</button></div>':'';

    box.innerHTML=`
    <div style="font-size:12px;font-weight:700;color:var(--bnd-green);margin-bottom:12px;display:flex;align-items:center;gap:6px"><i class="fa-solid fa-chart-pie"></i> Live-Profit-Analyse</div>
    <div class="bnd-profit-row"><span class="bnd-profit-lbl">Originalpreis (Summe)</span><span class="bnd-profit-val" style="color:rgba(255,255,255,.45)">${bndFmt(orig)}</span></div>
    <div class="bnd-profit-row"><span class="bnd-profit-lbl">Bundle-Preis</span><span class="bnd-profit-val" style="color:var(--bnd-gold)">${bndFmt(bp)}</span></div>
    <div class="bnd-profit-row"><span class="bnd-profit-lbl">Kundenersparnis</span><span class="bnd-profit-val" style="color:var(--bnd-purple)">−${bndFmt(orig-bp)} (${bndPct(disc)})</span></div>
    <div class="bnd-profit-row"><span class="bnd-profit-lbl">${allCostsKnown?'Einkaufspreis gesamt':'Einkaufspreis (Schätzung)'}</span><span class="bnd-profit-val" style="color:var(--bnd-red)">${bndFmt(cost)}</span></div>
    <div class="bnd-divider"></div>
    <div class="bnd-profit-row"><span class="bnd-profit-lbl" style="font-weight:700;color:#fff;font-size:13px">Dein Profit</span><span class="bnd-profit-val" style="color:${pc};font-size:17px">${bndFmt(profit)}</span></div>
    <div style="margin:8px 0 4px"><div class="bnd-profit-bar"><div class="bnd-profit-fill" style="width:${Math.min(100,Math.max(0,margin))}%;background:${pb}"></div></div></div>
    <div style="font-size:11px;color:${pc};font-weight:700">${pr} · Marge: ${bndPct(margin)}</div>
    ${tip?`<div style="font-size:11px;color:rgba(255,255,255,.4);margin-top:8px">${tip}</div>`:''}
    ${ekHint}
    ${!inputPrice?'<div style="font-size:10px;color:rgba(255,255,255,.22);margin-top:8px">💡 Gib einen Bundle-Preis ein — oder lass die KI einen vorschlagen</div>':''}`;
}

// ── KI-Rabatt-Empfehlung ──────────────────────────────────────────────────


// ═══════════════════════════════════════════════════════════════════
//  WAVEVAPES KI-FEATURES – gemeinsame Hilfsfunktion + alle 7 Features
// ═══════════════════════════════════════════════════════════════════

const AI_ENDPOINT = 'https://wavevapes.clever-selling-station.workers.dev';

async function aiCall(prompt, maxTokens = 600) {
    const res = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, max_tokens: maxTokens })
    });
    if (!res.ok) throw new Error(`KI-Anfrage fehlgeschlagen (HTTP ${res.status})`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || data.error);
    return (data.content || []).map(c => c.text || '').join('');
}

function aiSetLoading(el, text = 'KI analysiert…') {
    el.style.display = 'block';
    el.innerHTML = `<span class="ai-typing" style="color:#a78bfa;font-size:12px"><i class="fa-solid fa-wand-magic-sparkles" style="margin-right:6px"></i>${text}</span>`;
}

// ── FEATURE 1a: Beschreibung in Edit-Drawer generieren ────────────────────
// BUG-016 FIX: Gemeinsame Funktion statt zwei fast-identischer Kopien
async function _aiGenerateDescriptionFor(mode) {
    const isEdit   = mode === 'edit';
    const name     = document.getElementById(isEdit ? 'edit-name' : 'prod-name')?.value?.trim() || '';
    const cat      = document.getElementById(isEdit ? 'edit-category-select' : 'prod-category')?.value || '';
    const hasNic   = document.getElementById(isEdit ? 'edit-has-nicotine' : 'prod-has-nicotine')?.checked;
    const btn      = document.getElementById(isEdit ? 'ai-desc-btn' : 'ai-desc-add-btn');
    const result   = document.getElementById(isEdit ? 'ai-desc-result' : 'ai-desc-add-result');
    if (!name) { showToast('⚠️ Bitte zuerst den Produktnamen eingeben', 'warning'); return; }
    const loadingLabel = isEdit ? 'KI schreibt…' : 'KI schreibt…';
    const btnRestoreHTML = isEdit
        ? '<i class="fa-solid fa-wand-magic-sparkles" style="font-size:11px"></i> KI schreiben'
        : '<i class="fa-solid fa-wand-magic-sparkles" style="font-size:10px"></i> KI';
    if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>${isEdit ? ' KI schreibt…' : ''}`; }
    aiSetLoading(result, loadingLabel);
    try {
        const text = await aiCall(
            `Du schreibst kurze, verkaufsstarke Produktbeschreibungen für WaveVapes, einen deutschen Disposable-Vape Shop.
Produktname: "${name}"
Kategorie: "${cat || 'Disposable Vape'}"
${hasNic ? 'Nikotinhaltig: ja (10 mg / 20 mg)' : 'Nikotinfrei'}
Ton: jugendlich, modern, auf Deutsch. Maximal 2 Sätze. Keine Klammern, kein Markdown.
Schreibe NUR die Beschreibung, ohne Einleitung.`, 200
        );
        const p = isEdit ? 5 : 4, r = isEdit ? 7 : 6;
        result.style.display = 'block';
        result.innerHTML = `<div style="color:rgba(255,255,255,.8)">${escA(text.trim())}</div>
            <div style="margin-top:${p*2}px;display:flex;gap:${r+1}px">
                <button onclick="aiDescApply('${mode}')" style="padding:${p}px ${p*2+2}px;border-radius:${r}px;background:rgba(52,211,153,.15);border:1px solid rgba(52,211,153,.3);color:#34d399;font-size:${isEdit?11:10}px;font-weight:700;cursor:pointer"><i class="fa-solid fa-check" style="margin-right:${p-1}px"></i>Übernehmen</button>
                <button onclick="_aiGenerateDescriptionFor('${mode}')" style="padding:${p}px ${p*2+2}px;border-radius:${r}px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.5);font-size:${isEdit?11:10}px;cursor:pointer">↺ Neu</button>
            </div>`;
        result._text = text.trim();
    } catch(e) {
        result.innerHTML = `<span style="color:#f87171">❌ ${escA(e.message)}</span>`;
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = btnRestoreHTML; }
    }
}
// Rückwärtskompatible Wrapper (werden von bestehenden HTML-onclick-Attributen aufgerufen)
async function aiGenerateDescription()    { return _aiGenerateDescriptionFor('edit'); }
async function aiGenerateDescriptionAdd() { return _aiGenerateDescriptionFor('add');  }

function aiDescApply(mode) {
    const result = document.getElementById(mode === 'edit' ? 'ai-desc-result' : 'ai-desc-add-result');
    const target = document.getElementById(mode === 'edit' ? 'edit-description' : 'prod-description');
    if (target && result?._text) {
        target.value = result._text;
        result.style.display = 'none';
        showToast('✅ Beschreibung übernommen!');
    }
}

// ── FEATURE 1b: Beschreibung im Anlegen-Formular generieren ──────────────
// (entfernt – jetzt über _aiGenerateDescriptionFor('add') abgedeckt)

// ── FEATURE 2: KI-Antwort auf Bewertungen ─────────────────────────────────
async function aiReviewReply(reviewId, rating, text, username) {
    const box = document.getElementById('rv-ai-' + reviewId);
    if (!box) return;
    box.style.display = 'block';
    aiSetLoading(box, 'KI formuliert Antwort…');
    try {
        const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
        const sentiment = rating >= 4 ? 'positiv' : rating === 3 ? 'gemischt' : 'negativ/kritisch';
        const reply = await aiCall(
            `Du bist der freundliche Shopbetreiber von WaveVapes (Disposable Vapes & Liquids, Deutschland).
Schreibe eine persönliche, kurze Antwort auf diese Kundenbewertung auf Deutsch.
Bewertung: ${stars} (${rating}/5, ${sentiment})
Kundenname: ${username}
Bewertungstext: "${text || '(kein Text)'}"

Regeln:
- Max. 3 Sätze
- Persönlich und warm, nicht generisch
- Bei negativer Bewertung: deeskalierend, Lösung anbieten
- Bei positiver: herzlich danken, kurz auf ein Detail eingehen
- Kein Markdown, keine Anführungszeichen
Schreibe NUR die Antwort, ohne "Antwort:" o.ä.`, 250
        );
        const replyText = reply.trim();
        box.innerHTML = `<div style="background:rgba(103,232,249,.06);border:1px solid rgba(103,232,249,.15);border-radius:10px;padding:10px 13px">
            <div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:rgba(103,232,249,.5);margin-bottom:6px">KI-Antwortvorschlag</div>
            <div id="rv-ai-text-${reviewId}" style="font-size:12px;color:rgba(255,255,255,.8);line-height:1.65">${replyText.replace(/</g,'&lt;')}</div>
            <div style="margin-top:8px;display:flex;gap:7px;flex-wrap:wrap">
                <button onclick="rvSaveAdminReply('${reviewId}', document.getElementById('rv-ai-text-${reviewId}').textContent)" style="padding:4px 11px;border-radius:6px;background:rgba(52,211,153,.15);border:1px solid rgba(52,211,153,.3);color:#34d399;font-size:10px;font-weight:700;cursor:pointer"><i class="fa-solid fa-shop" style="margin-right:3px"></i>Im Shop veröffentlichen</button>
                <button onclick="navigator.clipboard.writeText(document.getElementById('rv-ai-text-${reviewId}').textContent.trim()).then(()=>showToast('✅ Kopiert!'))" style="padding:4px 10px;border-radius:6px;background:rgba(103,232,249,.1);border:1px solid rgba(103,232,249,.25);color:#67e8f9;font-size:10px;font-weight:700;cursor:pointer"><i class="fa-solid fa-copy" style="margin-right:3px"></i>Kopieren</button>
                <button onclick="this.closest('[id^=rv-ai-]').style.display='none'" style="padding:4px 10px;border-radius:6px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.4);font-size:10px;cursor:pointer">✕</button>
            </div>
        </div>`;
    } catch(e) {
        box.innerHTML = `<span style="color:#f87171;font-size:12px">❌ ${escA(e.message)}</span>`;
    }
}

async function rvSaveAdminReply(reviewId, replyText) {
    if (!reviewId || !replyText?.trim()) return;
    try {
        await db.collection('reviews').doc(reviewId).update({
            adminReply: replyText.trim(),
            adminReplyAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await logAction('review_reply_saved', reviewId, { preview: replyText.slice(0,60) });
        showToast('✅ Antwort im Shop veröffentlicht!');
        // Update button to show it's been saved
        const box = document.getElementById('rv-ai-' + reviewId);
        if (box) {
            const publishBtn = box.querySelector('button');
            if (publishBtn) { publishBtn.innerHTML = '<i class="fa-solid fa-check" style="margin-right:3px"></i>Veröffentlicht'; publishBtn.disabled = true; publishBtn.style.opacity = '.6'; }
        }
    } catch(e) {
        showToast('❌ Fehler: ' + e.message, 'error');
    }
}

async function rvDeleteAdminReply(reviewId) {
    if (!confirm('Shop-Antwort wirklich entfernen?')) return;
    try {
        await db.collection('reviews').doc(reviewId).update({
            adminReply: firebase.firestore.FieldValue.delete(),
            adminReplyAt: firebase.firestore.FieldValue.delete()
        });
        await logAction('review_reply_deleted', reviewId);
        showToast('🗑️ Shop-Antwort entfernt');
    } catch(e) {
        showToast('❌ Fehler: ' + e.message, 'error');
    }
}

// ── FEATURE 3: Analytics-KI-Zusammenfassung ───────────────────────────────
async function aiAnalyticsSummary() {
    const result = document.getElementById('an-ai-result');
    const btn    = document.getElementById('an-ai-btn');
    if (!result) return;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analysiert…'; }
    aiSetLoading(result, 'KI liest die Zahlen…');
    try {
        // Gather current KPI values from DOM
        const revenue  = document.getElementById('metric-revenue')?.textContent || '—';
        const orders   = document.getElementById('metric-orders')?.textContent  || '—';
        const users    = document.getElementById('metric-users')?.textContent   || '—';
        const avg      = document.getElementById('metric-avg')?.textContent     || '—';
        const period   = document.getElementById('an-period-lbl')?.textContent  || '30 Tage';
        // Top products list
        const prodRows = Array.from(document.querySelectorAll('.an-prod-name')).slice(0,5).map(el => el.textContent.trim());
        const topProds = prodRows.length ? prodRows.join(', ') : '—';

        const summary = await aiCall(
            `Du bist Unternehmensberater für WaveVapes, einen deutschen Disposable-Vape Online-Shop.
Analysiere diese KPIs und gib auf Deutsch eine klare Zusammenfassung in 4–5 Sätzen.

Zeitraum: ${period}
Gesamtumsatz: ${revenue}
Bestellungen: ${orders}
Unique Kunden: ${users}
Ø Warenkorb: ${avg}
Top-Produkte: ${topProds}

Struktur:
1. Was lief gut (1 Satz)
2. Was fällt auf / Risiko (1 Satz)
3. Konkrete Handlungsempfehlung (1–2 Sätze)
Ton: direkt, professionell, kein Bullshit. Kein Markdown.`, 400
        );
        result.style.cssText = 'font-size:13px;color:rgba(255,255,255,.8);line-height:1.75';
        result.textContent = summary.trim();
    } catch(e) {
        result.style.color = '#f87171';
        result.textContent = '❌ ' + e.message;
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles" style="font-size:12px"></i> Jetzt analysieren'; }
    }
}

// ── FEATURE 4: KI-E-Mail-Entwurf im Order-Drawer ─────────────────────────
let _aiEmailText = '';
async function aiOrderEmail(type) {
    const result  = document.getElementById('ord-ai-email-result');
    const actions = document.getElementById('ord-ai-email-actions');
    if (!result) return;
    const email   = document.getElementById('ord-d-email')?.textContent || '—';
    const ordNum  = document.getElementById('ord-d-num')?.textContent   || '—';
    const total   = document.getElementById('ord-d-total')?.textContent || '—';
    const status  = document.getElementById('modal-status')?.value      || '—';
    const itemsEls = document.querySelectorAll('#ord-d-items .ord-d-item-name');
    const items   = Array.from(itemsEls).map(el => el.textContent.trim()).join(', ') || '—';

    const typeLabels = { delay:'Versandverzögerung', thanks:'persönliches Dankeschön', question:'Rückfrage zur Bestellung' };
    aiSetLoading(result, `Schreibe E-Mail (${typeLabels[type]})…`);
    result.style.display = 'block';
    if (actions) actions.style.display = 'none';

    const prompts = {
        delay: `Schreibe eine kurze, persönliche E-Mail (auf Deutsch) an einen WaveVapes-Kunden wegen einer Versandverzögerung.
Bestellnummer: ${ordNum} | Artikel: ${items} | Betrag: ${total}
Max. 5 Sätze. Entschuldige dich aufrichtig, erkläre kurz (keine Details), verspreche baldige Lieferung.
Beginne mit "Hallo,". Kein Betreff, nur E-Mail-Text.`,
        thanks: `Schreibe eine herzliche, kurze Dankes-E-Mail (auf Deutsch) an einen WaveVapes-Kunden.
Bestellnummer: ${ordNum} | Artikel: ${items} | Betrag: ${total} | Status: ${status}
Max. 4 Sätze. Persönlich, warm, nicht generisch. Erwähne ein konkretes Produkt wenn möglich.
Beginne mit "Hallo,". Kein Betreff, nur E-Mail-Text.`,
        question: `Schreibe eine freundliche Rückfrage-E-Mail (auf Deutsch) an einen WaveVapes-Kunden wegen unklarer Bestelldetails.
Bestellnummer: ${ordNum} | Artikel: ${items} | Betrag: ${total}
Max. 4 Sätze. Freundlich, klar welche Info gebraucht wird (Lass einen Platzhalter [FRAGE]).
Beginne mit "Hallo,". Kein Betreff, nur E-Mail-Text.`
    };

    try {
        const text = await aiCall(prompts[type] || prompts.thanks, 300);
        _aiEmailText = text.trim();
        result.textContent = _aiEmailText;
        result.style.color = 'rgba(255,255,255,.82)';
        if (actions) { actions.style.display = 'flex'; }
    } catch(e) {
        result.textContent = '❌ ' + e.message;
        result.style.color = '#f87171';
    }
}

function aiEmailCopy() {
    if (!_aiEmailText) return;
    navigator.clipboard.writeText(_aiEmailText).then(() => showToast('✅ E-Mail kopiert!')).catch(() => showToast('❌ Kopieren fehlgeschlagen', 'error'));
}

function aiEmailIntoNotes() {
    if (!_aiEmailText) return;
    const notes = document.getElementById('modal-internal-notes');
    if (notes) { notes.value = _aiEmailText; showToast('✅ E-Mail in Notizen eingefügt!'); }
}

// ── FEATURE 5: Aktions-Strategie-Assistent ───────────────────────────────
async function aiPromoStrategy(goal) {
    const result = document.getElementById('promo-ai-result');
    if (!result) return;
    aiSetLoading(result, 'KI entwickelt Strategie…');

    // Gather shop context
    const totalProducts = allProducts?.length || 0;
    const lowStock = allProducts?.filter(p => (p.stock || 0) <= 5 && p.available).length || 0;
    const cats = [...new Set((allProducts||[]).map(p=>p.category).filter(Boolean))].join(', ') || '—';
    const goalLabels = { clearance:'Lagerräumung (hoher Bestand loswerden)', newcustomer:'Neukundengewinnung', retention:'Stammkundenbindung / Reaktivierung' };

    try {
        const advice = await aiCall(
            `Du bist Pricing-Stratege für WaveVapes, einen deutschen Disposable-Vape Online-Shop.
Empfehle eine konkrete Aktions-Strategie auf Deutsch.

Shop-Daten:
- Produkte gesamt: ${totalProducts}
- Produkte mit Niedrigbestand (≤5 Stk): ${lowStock}
- Kategorien: ${cats}

Ziel dieser Aktion: ${goalLabels[goal]}

Antworte NUR in diesem Format:
🎯 Strategie: [1 Satz was die Aktion soll]
🏷️ Empfohlener Rabatt: [z.B. "10–15% Prozent-Rabatt" oder "2 € Festbetrag"]
📂 Empfohlene Kategorie: [konkrete Kategorie oder "Alle Produkte"]
⏱️ Empfohlene Laufzeit: [z.B. "5–7 Tage" oder "Wochenende"]
💡 Badge-Text für den Shop: [kurzer Text für Produktkarte, max. 12 Zeichen]
📊 Begründung: [1–2 Sätze warum]`, 350
        );
        result.style.color = 'rgba(255,255,255,.82)';
        result.style.fontSize = '12px';
        result.style.lineHeight = '1.75';
        result.textContent = advice.trim();
    } catch(e) {
        result.style.color = '#f87171';
        result.textContent = '❌ ' + e.message;
    }
}

// ── FEATURE 6: Gutschein-Strategie-Beratung ───────────────────────────────
async function aiCouponAdvice(goal) {
    const result = document.getElementById('cpn-ai-result');
    if (!result) return;
    aiSetLoading(result, 'KI berechnet optimale Parameter…');

    // Grab average order value from analytics KPI if visible
    const avgOrderEl = document.getElementById('metric-avg');
    const avgOrder   = avgOrderEl ? avgOrderEl.textContent.replace(/[^0-9,.]/g,'').replace(',','.') : '—';
    const goalLabels = { winback:'Inaktive Kunden zurückgewinnen', firstorder:'Erstbestellung-Anreiz', vip:'VIP-Stammkunden belohnen' };

    try {
        const advice = await aiCall(
            `Du berätst WaveVapes (Disposable Vapes, Deutschland) bei Gutschein-Strategie.
Ø Warenkorb: ${avgOrder} €
Ziel: ${goalLabels[goal]}

Antworte NUR in diesem Format auf Deutsch:
💸 Empfohlener Rabatt: [z.B. "10 € Festbetrag" oder "15% auf den Gesamtbetrag"]
🔁 Nutzungstyp: ["Einmalnutzung" oder "Mehrfachnutzung (max. X×)"]
📅 Gültigkeitsdauer: [z.B. "14 Tage" oder "30 Tage"]
🎯 Zielgruppe: [wen genau ansprechen]
💡 Code-Vorschlag: [einprägsamer Code wie COMEBACK15]
📊 Begründung: [1–2 Sätze warum diese Parameter]`, 300
        );
        result.style.color = 'rgba(255,255,255,.82)';
        result.style.fontSize = '12px';
        result.style.lineHeight = '1.75';
        result.textContent = advice.trim();
    } catch(e) {
        result.style.color = '#f87171';
        result.textContent = '❌ ' + e.message;
    }
}

// ═══════════════════════════════════════════════════════════════════
//  WAVEVAPES KI-FEATURES – NEUE FEATURES 8–11
// ═══════════════════════════════════════════════════════════════════

// ── FEATURE 8: KI-Churn-Analyse im Benutzer-Tab ───────────────────
async function aiChurnAnalysis() {
    const result = document.getElementById('usr-ai-churn-result');
    const btn    = document.getElementById('usr-ai-churn-btn');
    if (!result) return;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analysiert…'; }
    result.style.display = 'block';
    aiSetLoading(result, 'KI analysiert Churn-Risiko…');

    try {
        const users = allUsers || [];
        if (users.length === 0) throw new Error('Keine Benutzerdaten geladen.');

        const total        = users.length;
        const blocked      = users.filter(u => u.disabled || u.blocked).length;
        const withPoints   = users.filter(u => (u.totalBonusPoints || 0) > 0).length;
        const avgPoints    = total ? Math.round(users.reduce((s, u) => s + (u.totalBonusPoints || 0), 0) / total) : 0;
        const zeroPoints   = users.filter(u => (u.totalBonusPoints || 0) === 0).length;
        const highPoints   = users.filter(u => (u.totalBonusPoints || 0) >= 100).length;
        const referralUsers = users.filter(u => u.referralCode || u.referredBy).length;

        const analysis = await aiCall(
            `Du analysierst die Nutzerbasis von WaveVapes (Disposable Vapes, Deutschland) und erkennst Churn-Risiken.

Nutzerdaten:
- Nutzer gesamt: ${total}
- Gesperrt/Blockiert: ${blocked}
- Nutzer mit Bonuspunkten: ${withPoints}
- Nutzer mit 0 Punkten (nie aktiv): ${zeroPoints}
- VIP-Nutzer (≥100 Punkte): ${highPoints}
- Ø Loyalitätspunkte: ${avgPoints}
- Nutzer mit Referral-Aktivität: ${referralUsers}

Antworte NUR in diesem Format auf Deutsch:
🚨 Churn-Risiko: [Einschätzung: niedrig/mittel/hoch + 1 Satz Begründung]
👥 Risiko-Gruppe: [welche Nutzergruppe ist am gefährdetsten, z.B. "Nutzer mit 0 Punkten"]
📊 Geschätzte Churn-Quote: [z.B. "~${Math.round(zeroPoints/total*100)}% der Basis inaktiv"]
📧 Reaktivierungs-Empfehlung: [konkrete E-Mail-Strategie, 1–2 Sätze]
🎁 Anreiz-Vorschlag: [konkreter Gutschein oder Bonus-Vorschlag]
💡 Sofort-Maßnahme: [was du heute noch tun solltest]`, 400
        );

        result.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
                <div style="width:32px;height:32px;border-radius:10px;background:rgba(167,139,250,.15);border:1px solid rgba(167,139,250,.3);display:flex;align-items:center;justify-content:center;color:#a78bfa;font-size:14px"><i class="fa-solid fa-robot"></i></div>
                <div style="font-size:13px;font-weight:700;color:#a78bfa">KI-Churn-Analyse</div>
            </div>
            <div style="font-size:12px;line-height:1.85;color:rgba(255,255,255,.82);white-space:pre-line">${analysis.trim().replace(/</g,'&lt;')}</div>
            <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
                <button onclick="aiChurnMail()" style="padding:6px 14px;border-radius:8px;background:rgba(167,139,250,.15);border:1px solid rgba(167,139,250,.3);color:#a78bfa;font-size:11px;font-weight:700;cursor:pointer"><i class="fa-solid fa-envelope" style="margin-right:4px"></i>Reaktivierungsmail schreiben</button>
                <button onclick="document.getElementById('usr-ai-churn-result').style.display='none'" style="padding:6px 12px;border-radius:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.4);font-size:11px;cursor:pointer">✕ Schließen</button>
            </div>`;
    } catch(e) {
        result.innerHTML = `<span style="color:#f87171;font-size:12px">❌ ${escA(e.message)}</span>`;
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> KI-Churn-Analyse'; }
    }
}

async function aiChurnMail() {
    const users = allUsers || [];
    const zeroPoints = users.filter(u => (u.totalBonusPoints || 0) === 0).length;
    const result = document.getElementById('usr-ai-churn-result');
    const existing = result.innerHTML;
    const mailBox = document.createElement('div');
    mailBox.style.cssText = 'margin-top:12px;padding:14px 16px;background:rgba(103,232,249,.06);border:1px solid rgba(103,232,249,.15);border-radius:12px';
    mailBox.innerHTML = `<span class="ai-typing" style="color:#a78bfa;font-size:12px"><i class="fa-solid fa-wand-magic-sparkles" style="margin-right:6px"></i>Schreibe Reaktivierungsmail…</span>`;
    result.appendChild(mailBox);
    try {
        const mail = await aiCall(
            `Schreibe eine kurze Reaktivierungs-E-Mail (auf Deutsch) für WaveVapes (Disposable Vapes).
Zielgruppe: Kunden, die bisher keine Bonuspunkte gesammelt haben (noch nie bestellt oder sehr inaktiv).
Max. 5 Sätze. Persönlich, mit konkretem Anreiz (z.B. Erstbestellungs-Gutschein).
Beginne mit "Hey,". Kein Betreff, nur E-Mail-Text.`, 250
        );
        mailBox.innerHTML = `
            <div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:rgba(103,232,249,.5);margin-bottom:8px">Reaktivierungsmail-Entwurf</div>
            <div id="churn-mail-text" style="font-size:12px;color:rgba(255,255,255,.82);line-height:1.7;white-space:pre-line">${mail.trim().replace(/</g,'&lt;')}</div>
            <button onclick="navigator.clipboard.writeText(document.getElementById('churn-mail-text').textContent).then(()=>showToast('✅ Mail kopiert!'))" style="margin-top:10px;padding:5px 12px;border-radius:7px;background:rgba(103,232,249,.1);border:1px solid rgba(103,232,249,.25);color:#67e8f9;font-size:10px;font-weight:700;cursor:pointer"><i class="fa-solid fa-copy" style="margin-right:3px"></i>Kopieren</button>`;
    } catch(e) {
        mailBox.innerHTML = `<span style="color:#f87171;font-size:12px">❌ ${escA(e.message)}</span>`;
    }
}

// ── FEATURE 9: KI-Sortierungsempfehlung ──────────────────────────
async function aiSortRecommendation() {
    const result = document.getElementById('srt-ai-result');
    const btn    = document.getElementById('srt-ai-btn');
    if (!result) return;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analysiert…'; }
    result.style.display = 'block';
    aiSetLoading(result, 'KI berechnet optimale Reihenfolge…');

    try {
        const products = allProducts || [];
        if (products.length === 0) throw new Error('Keine Produktdaten geladen.');

        const available   = products.filter(p => p.available !== false);
        const topSellers  = [...products].sort((a,b) => (b.soldCount||0)-(a.soldCount||0)).slice(0,5).map(p=>`"${p.name}" (${p.soldCount||0}×)`).join(', ');
        const newOnes     = products.filter(p => p.isNew).map(p => `"${p.name}"`).join(', ') || '—';
        const lowStock    = products.filter(p => (p.stock||0) <= 5 && p.available !== false).map(p => `"${p.name}" (${p.stock||0} Stk)`).join(', ') || '—';
        const categories  = [...new Set(products.map(p=>p.category).filter(Boolean))].join(', ') || '—';
        const unavailable = products.filter(p => p.available === false).length;

        const advice = await aiCall(
            `Du optimierst die Produktreihenfolge für WaveVapes (Disposable Vapes Shop, Deutschland).
Ziel: Konversionsrate maximieren durch optimale Sichtbarkeit der richtigen Produkte.

Produktdaten:
- Produkte gesamt: ${products.length} (${available.length} verfügbar, ${unavailable} vergriffen)
- Kategorien: ${categories}
- Top-Seller (nach Verkäufen): ${topSellers}
- Neu-Sorten: ${newOnes}
- Niedrigbestand (bald vergriffen): ${lowStock}

Antworte NUR in diesem Format auf Deutsch:
🥇 Erste Priorität: [welche Produkt-Gruppe ganz oben stehen sollte + warum]
🥈 Zweite Priorität: [zweite Gruppe + warum]
🥉 Dritte Priorität: [dritte Gruppe + warum]
⬇️ Ans Ende: [was nach hinten sollte + warum]
💡 Strategie-Tipp: [1–2 Sätze übergeordnete Empfehlung]
⚡ Schnell-Aktion: [was du mit einem Klick jetzt tun solltest: z.B. "AUTO-PRIORITÄT Button nutzen"]`, 380
        );

        result.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
                <div style="width:32px;height:32px;border-radius:10px;background:rgba(167,139,250,.15);border:1px solid rgba(167,139,250,.3);display:flex;align-items:center;justify-content:center;color:#a78bfa;font-size:14px"><i class="fa-solid fa-robot"></i></div>
                <div style="font-size:13px;font-weight:700;color:#a78bfa">KI-Sortierungsempfehlung</div>
            </div>
            <div style="font-size:12px;line-height:1.85;color:rgba(255,255,255,.82);white-space:pre-line">${advice.trim().replace(/</g,'&lt;')}</div>
            <div style="margin-top:14px;display:flex;gap:8px">
                <button onclick="autoSortPriority();showToast('✅ AUTO-PRIORITÄT angewendet!')" style="padding:6px 14px;border-radius:8px;background:rgba(103,232,249,.1);border:1px solid rgba(103,232,249,.25);color:#67e8f9;font-size:11px;font-weight:700;cursor:pointer"><i class="fa-solid fa-wand-magic-sparkles" style="margin-right:4px"></i>AUTO-PRIORITÄT anwenden</button>
                <button onclick="document.getElementById('srt-ai-result').style.display='none'" style="padding:6px 12px;border-radius:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.4);font-size:11px;cursor:pointer">✕ Schließen</button>
            </div>`;
    } catch(e) {
        result.innerHTML = `<span style="color:#f87171;font-size:12px">❌ ${escA(e.message)}</span>`;
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-robot"></i> KI-Empfehlung'; }
    }
}

// ── FEATURE 10: KI-Nachbestellungsplan ───────────────────────────
async function aiStockReorder() {
    const result = document.getElementById('prd-ai-stock-result');
    const btn    = document.getElementById('prd-ai-stock-btn');
    if (!result) return;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analysiert…'; }
    aiSetLoading(result, 'KI berechnet Nachbestellungsplan…');
    result.style.display = 'block';

    try {
        const products = allProducts || [];
        const critThreshold = parseInt(document.getElementById('set-stock-critical')?.value || '3', 10);
        const warnThreshold = parseInt(document.getElementById('set-stock-warning')?.value || '10', 10);

        const critical = products.filter(p => (p.stock||0) <= critThreshold && p.available !== false);
        const warning  = products.filter(p => (p.stock||0) > critThreshold && (p.stock||0) <= warnThreshold && p.available !== false);

        if (critical.length === 0 && warning.length === 0) {
            result.innerHTML = '<span style="color:#34d399">✅ Kein Nachbestellungsbedarf — alle Bestände im grünen Bereich!</span>';
            return;
        }

        const critList = critical.map(p => `"${p.name}" (${p.stock||0} Stk, ${p.soldCount||0}× verkauft)`).join('\n') || '—';
        const warnList = warning.map(p => `"${p.name}" (${p.stock||0} Stk, ${p.soldCount||0}× verkauft)`).join('\n') || '—';

        const plan = await aiCall(
            `Du erstellst einen Nachbestellungsplan für WaveVapes (Disposable Vapes, Deutschland).

KRITISCHE Produkte (≤${critThreshold} Stk, sofort bestellen):
${critList}

WARNUNG-Produkte (≤${warnThreshold} Stk, bald bestellen):
${warnList}

Antworte NUR in diesem Format auf Deutsch:
⚠️ Sofort bestellen (${critical.length} Produkte): [Priorisierung der kritischen Produkte nach Verkaufszahlen]
📦 Demnächst bestellen (${warning.length} Produkte): [kurze Empfehlung]
🔢 Empfohlene Bestellmenge: [Faustregel für Mindestbestand, z.B. "mind. 20 Einheiten pro SKU"]
⏱️ Zeitfenster: [wie dringend ist die Bestellung]
💡 Tipp: [ein konkreter Ratschlag zur Lagerhaltung]`, 400
        );

        result.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
                <div style="width:28px;height:28px;border-radius:8px;background:rgba(167,139,250,.15);border:1px solid rgba(167,139,250,.3);display:flex;align-items:center;justify-content:center;color:#a78bfa;font-size:12px"><i class="fa-solid fa-robot"></i></div>
                <div style="font-size:12px;font-weight:700;color:#a78bfa">KI-Nachbestellungsplan</div>
            </div>
            <div style="white-space:pre-line;line-height:1.85">${plan.trim().replace(/</g,'&lt;')}</div>
            <div style="margin-top:12px;display:flex;gap:8px">
                <button onclick="navigator.clipboard.writeText(document.querySelector('#prd-ai-stock-result div:nth-child(2)').textContent.trim()).then(()=>showToast('✅ Plan kopiert!'))" style="padding:5px 12px;border-radius:7px;background:rgba(167,139,250,.1);border:1px solid rgba(167,139,250,.25);color:#a78bfa;font-size:10px;font-weight:700;cursor:pointer"><i class="fa-solid fa-copy" style="margin-right:3px"></i>Kopieren</button>
                <button onclick="document.getElementById('prd-ai-stock-result').style.display='none'" style="padding:5px 10px;border-radius:7px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.4);font-size:10px;cursor:pointer">✕</button>
            </div>`;
    } catch(e) {
        result.innerHTML = `<span style="color:#f87171;font-size:12px">❌ ${escA(e.message)}</span>`;
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> KI-Nachbestellungsplan'; }
    }
}

// ── FEATURE 11: KI-Anomalie-Erkennung in Admin Logs ───────────────
async function aiLogAnomalies() {
    const result = document.getElementById('lg-ai-result');
    const btn    = document.getElementById('lg-ai-btn');
    if (!result) return;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analysiert…'; }
    result.style.display = 'block';
    aiSetLoading(result, 'KI prüft Logs auf Anomalien…');

    try {
        // Collect log entries from DOM
        const logEntries = [];
        document.querySelectorAll('#logs-container .sa-log-entry, #logs-container [class*="lg-entry"], #logs-container > div').forEach(el => {
            const text = el.textContent?.trim();
            if (text && text.length > 5 && !text.includes('Lade')) logEntries.push(text.slice(0, 120));
        });

        const unauthorized = [];
        document.querySelectorAll('#unauthorized-logs-container > div').forEach(el => {
            const text = el.textContent?.trim();
            if (text && text.length > 5 && !text.includes('Lade')) unauthorized.push(text.slice(0, 100));
        });

        const bannedCount = document.getElementById('lg-ban-badge')?.textContent?.replace(/[^0-9]/g,'') || '0';
        const threatCount = document.getElementById('lg-threat-badge')?.textContent?.replace(/[^0-9]/g,'') || '0';
        const logCount    = document.getElementById('lg-log-count')?.textContent?.replace(/[^0-9]/g,'') || '0';

        const logSample   = logEntries.slice(0, 20).join('\n') || '(keine Logs sichtbar)';
        const threatSample = unauthorized.slice(0, 10).join('\n') || '(keine unbefugten Zugriffsversuche)';

        const analysis = await aiCall(
            `Du bist Sicherheitsanalyst für WaveVapes (Admin-Panel, Deutschland). Analysiere die folgenden Admin-Log-Daten auf Anomalien.

Statistiken:
- Log-Einträge gesamt: ${logCount}
- Unbefugte Zugriffsversuche: ${threatCount}
- Gebannte IPs: ${bannedCount}

Aktuelle Log-Einträge (Auszug):
${logSample}

Unbefugte Zugriffsversuche (Auszug):
${threatSample}

Antworte NUR in diesem Format auf Deutsch:
🛡️ Sicherheitsstatus: [grün/gelb/rot + 1 Satz Einschätzung]
🔍 Erkannte Muster: [was fällt auf, z.B. "gehäufte Zugriffsversuche", "ungewöhnliche Aktionen"]
⚠️ Risiko-Einschätzung: [konkrete Beschreibung des größten Risikos oder "kein erhöhtes Risiko erkennbar"]
🚨 Empfohlene Maßnahme: [was jetzt zu tun ist]
💡 Präventions-Tipp: [eine konkrete Empfehlung zur Verbesserung der Sicherheit]`, 380
        );

        // Color-code based on status
        const isRed    = analysis.toLowerCase().includes('rot');
        const isYellow = analysis.toLowerCase().includes('gelb');
        const statusColor = isRed ? '#f87171' : isYellow ? '#fbbf24' : '#34d399';
        const statusBg    = isRed ? 'rgba(248,113,113,.08)' : isYellow ? 'rgba(251,191,36,.08)' : 'rgba(52,211,153,.08)';
        const statusBorder = isRed ? 'rgba(248,113,113,.25)' : isYellow ? 'rgba(251,191,36,.25)' : 'rgba(52,211,153,.25)';

        result.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
                <div style="width:32px;height:32px;border-radius:10px;background:${statusBg};border:1px solid ${statusBorder};display:flex;align-items:center;justify-content:center;color:${statusColor};font-size:14px"><i class="fa-solid fa-shield-halved"></i></div>
                <div style="font-size:13px;font-weight:700;color:${statusColor}">KI-Sicherheitsanalyse</div>
                <div style="margin-left:auto;font-size:10px;color:rgba(255,255,255,.25);font-family:'JetBrains Mono',monospace">${new Date().toLocaleTimeString('de-DE')}</div>
            </div>
            <div style="font-size:12px;line-height:1.85;color:rgba(255,255,255,.82);white-space:pre-line">${analysis.trim().replace(/</g,'&lt;')}</div>
            <div style="margin-top:14px;display:flex;gap:8px">
                <button onclick="loadAdminLogs();showToast('🔄 Logs aktualisiert')" style="padding:6px 14px;border-radius:8px;background:rgba(103,232,249,.1);border:1px solid rgba(103,232,249,.25);color:#67e8f9;font-size:11px;font-weight:700;cursor:pointer"><i class="fa-solid fa-rotate-right" style="margin-right:4px"></i>Logs neu laden</button>
                <button onclick="document.getElementById('lg-ai-result').style.display='none'" style="padding:6px 12px;border-radius:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.4);font-size:11px;cursor:pointer">✕ Schließen</button>
            </div>`;
    } catch(e) {
        result.innerHTML = `<span style="color:#f87171;font-size:12px">❌ ${escA(e.message)}</span>`;
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> KI-Anomalie-Check'; }
    }
}


async function aiCustomerSegments() {
    const result = document.getElementById('cu-ai-result');
    const btn    = document.getElementById('cu-ai-btn');
    if (!result) return;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analysiert…'; }
    aiSetLoading(result, 'KI segmentiert deine Kunden…');

    try {
        // Pull data from the already-loaded euAllUsers and customer analytics
        const users = euAllUsers || [];
        const total = users.length;
        if (total === 0) throw new Error('Keine Kundendaten geladen — öffne zuerst Tab "Erw. Benutzer".');

        const withOrders  = users.filter(u => (u.orderCount || 0) > 0).length;
        const noOrders    = total - withOrders;
        const avgPts      = total ? Math.round(users.reduce((s,u)=>s+(u.totalBonusPoints||0),0)/total) : 0;
        const avgSpend    = withOrders ? (users.reduce((s,u)=>s+(u.totalSpent||0),0)/withOrders).toFixed(2) : '0';
        const vip         = users.filter(u => (u.totalSpent||0) > 100).length;
        const disabled    = users.filter(u => u.disabled).length;

        // Rough inactivity: users with orders but 0 recent activity (no Firestore date available client-side, so approximate)
        const oneOrderOnly = users.filter(u => (u.orderCount||0) === 1).length;

        const analysis = await aiCall(
            `Du analysierst die Kundenbasis von WaveVapes (Disposable Vapes, Deutschland) und gibst strategische Empfehlungen.

Kundendaten:
- Registrierte Kunden gesamt: ${total}
- Kunden mit mindestens 1 Bestellung: ${withOrders}
- Kunden ohne Bestellung: ${noOrders}
- VIP-Kunden (>100 € Gesamtumsatz): ${vip}
- Nur-einmal-Käufer: ${oneOrderOnly}
- Gesperrte Accounts: ${disabled}
- Ø Loyalty-Punkte: ${avgPts}
- Ø Ausgaben pro Bestellkunde: ${avgSpend} €

Erstelle eine Kundensegment-Analyse auf Deutsch mit GENAU diesen Abschnitten:

📊 SEGMENTE:
[Liste 3–4 Segmente mit Anzahl und %-Anteil, z.B. "Stammkunden (X, Y%): ..."]

🚨 GRÖSSTES RISIKO:
[1 konkretes Problem benennen]

🎯 TOP-3 MASSNAHMEN:
[3 konkrete, umsetzbare Handlungsempfehlungen mit direktem Bezug zu den Zahlen]

Kein Markdown außer den Emoji-Überschriften.`, 500
        );

        result.style.cssText = 'font-size:13px;color:rgba(255,255,255,.82);line-height:1.75;white-space:pre-wrap';
        result.textContent = analysis.trim();
    } catch(e) {
        result.style.color = '#f87171';
        result.textContent = '❌ ' + e.message;
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-users-viewfinder"></i> Jetzt analysieren'; }
    }
}

async function bndAICalc(strategy) {
    const el=document.getElementById('bnd-ai-result');
    if(!el)return;
    if(!_bundleItems.length){el.textContent='⚠️ Füge zuerst Produkte hinzu.';return;}

    // Prüfen ob alle Einkaufspreise bekannt sind
    const missingEK = _bundleItems.filter(it => bndRealCost(it) === null);
    if (missingEK.length > 0) {
        el.innerHTML = `<span style="color:#f87171"><i class="fa-solid fa-triangle-exclamation" style="margin-right:6px"></i>Einkaufspreis fehlt bei: <strong>${missingEK.map(it=>escA(it.name||'')).join(', ')}</strong><br><span style="font-size:11px;opacity:.7">Trage zuerst den Einkaufspreis ein (Produkte → Stift-Icon → Einkaufspreis), damit die KI profitabel rechnen kann.</span></span>`;
        return;
    }

    const btns=['c','b','a'].map(k=>document.getElementById('bnd-ai-btn-'+k));
    btns.forEach(b=>{if(b)b.disabled=true;});
    el.innerHTML='<i class="fa-solid fa-spinner fa-spin" style="margin-right:8px"></i>KI analysiert dein Bundle…';

    const orig = _bundleItems.reduce((s,it)=>s+it.price*it.qty, 0);
    const cost = _bundleItems.reduce((s,it)=>s+bndRealCost(it)*it.qty, 0);
    const name = document.getElementById('bnd-f-name')?.value||'Bundle';

    // Maximaler sinnvoller Bundle-Preis = leicht unter dem Einzelkauf (mind. 1% günstiger)
    const maxBundlePrice = orig * 0.99;

    // Prüfen ob mit dieser Strategie überhaupt Profit UND Kundenersparnis möglich ist
    const minMarginByStrategy = { conservative: 0.35, balanced: 0.25, aggressive: 0.15 };
    const minMargin = minMarginByStrategy[strategy] || 0.25;
    // Mindestpreis für Ziel-Marge: cost / (1 - margin)
    const minPriceForMargin = cost / (1 - minMargin);

    // Wenn Ziel-Marge nur durch Preis ÜBER dem Einzelkauf erreichbar → Warnung + reduziertes Ziel
    let actualMaxMargin = maxBundlePrice > cost ? ((maxBundlePrice - cost) / maxBundlePrice * 100) : 0;
    let feasibilityWarning = '';

    if (minPriceForMargin >= orig) {
        // Ziel-Marge nicht erreichbar ohne Bundle zu verteuern
        feasibilityWarning = `
<div style="margin-bottom:12px;padding:10px 14px;border-radius:12px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2);font-size:12px;color:#fbbf24">
  <i class="fa-solid fa-triangle-exclamation" style="margin-right:6px"></i>
  <strong>Hinweis:</strong> Die ${Math.round(minMargin*100)}%-Marge ist bei diesem Bundle nicht erreichbar ohne den Preis über den Einzelkauf (${bndFmt(orig)}) zu heben.<br>
  <span style="opacity:.75;margin-top:4px;display:block">Maximal mögliche Marge: <strong style="color:#fbbf24">${actualMaxMargin.toFixed(1)}%</strong> bei ${bndFmt(maxBundlePrice)}. Die KI empfiehlt den besten Kompromiss.</span>
</div>`;
    }

    if (actualMaxMargin <= 0) {
        // EK bereits über dem Einzelkaufpreis — gar kein sinnvolles Bundle möglich
        el.innerHTML = `<div style="color:#f87171;font-size:12px"><i class="fa-solid fa-triangle-exclamation" style="margin-right:6px"></i>
            <strong>Bundle nicht profitabel möglich:</strong> Dein Einkaufspreis (${bndFmt(cost)}) ist bereits höher als oder gleich dem Einzelkaufpreis (${bndFmt(orig)}).<br>
            <span style="opacity:.7;margin-top:4px;display:block">Jeder Bundle-Preis der für den Kunden attraktiv ist würde zu Verlust führen. Überprüfe deine Einkaufspreise.</span>
        </div>`;
        btns.forEach(b=>{if(b)b.disabled=false;});
        return;
    }

    const labels = {
        conservative: `konservativ — maximiere Marge, bleibe aber UNTER ${bndFmt(orig)} (Einzelkauf)`,
        balanced:     `ausgewogen — balance Marge und Attraktivität, bleibe UNTER ${bndFmt(orig)}`,
        aggressive:   `aggressiv — maximale Kundenersparnis, bleibe UNTER ${bndFmt(orig)}`
    };

    const prompt=`Du bist Pricing-Experte für WaveVapes, einen deutschen Disposable-Vape Online-Shop.

ABSOLUTE REGEL: Der Bundle-Preis MUSS KLEINER sein als ${orig.toFixed(2)} € (Summe Einzelkauf). Sonst kauft kein Kunde das Bundle!
ABSOLUTE REGEL: Der Bundle-Preis MUSS GRÖSSER sein als ${cost.toFixed(2)} € (Einkaufspreis). Sonst machst du Verlust!
Erlaubter Preisbereich: ${cost.toFixed(2)} € bis maximal ${maxBundlePrice.toFixed(2)} €

Bundle: "${name}"
Strategie: ${labels[strategy]}

Produkte (mit echten Einkaufspreisen):
${_bundleItems.map(it=>`- ${it.name} ×${it.qty}: Einzelpreis ${(it.price*it.qty).toFixed(2)} € | Einkaufspreis ${(bndRealCost(it)*it.qty).toFixed(2)} €`).join('\n')}

Summe Einzelpreise: ${orig.toFixed(2)} €
Gesamteinkaufspreis: ${cost.toFixed(2)} €
Maximale erreichbare Marge (bei ${maxBundlePrice.toFixed(2)} €): ${actualMaxMargin.toFixed(1)}%

Wähle einen Bundle-Preis im Bereich ${cost.toFixed(2)} € – ${maxBundlePrice.toFixed(2)} €, der die Strategie möglichst gut erfüllt.
Falls die Ziel-Marge (${Math.round(minMargin*100)}%) nicht erreichbar ist, nimm den bestmöglichen Preis innerhalb des Bereichs.

Antworte NUR auf Deutsch, in diesem Format:
💡 Empfohlener Bundle-Preis: XX,XX €
🏷️ Rabatt: X,X% (Kundenersparnis: XX,XX €)
💰 Dein Profit: XX,XX € | Marge: XX%
📊 Begründung: [1-2 Sätze]
🚀 Marketingtipp: [1 konkreter Tipp]`;

    try {
        if (feasibilityWarning) {
            el.innerHTML = feasibilityWarning + '<i class="fa-solid fa-spinner fa-spin" style="margin-right:8px"></i>KI berechnet besten Kompromiss…';
        }
        const res=await fetch('https://wavevapes.clever-selling-station.workers.dev',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({prompt:prompt,max_tokens:600})
        });
        const data=await res.json();
        if(data.error) throw new Error(data.error.message||data.error);
        const text=(data.content||[]).map(c=>c.text||'').join('');

        el.innerHTML = feasibilityWarning; // Warnung beibehalten, Spinner entfernen

        // Preis extrahieren & Auto-Fill Button — nur wenn im gültigen Bereich
        const m=text.match(/Bundle-Preis[:\s]+(\d+)[,.](\d+)\s*€/i);
        if(m){
            const suggested=parseFloat(m[1]+'.'+m[2]);
            // Sicherheitsprüfung: vorgeschlagener Preis muss im erlaubten Bereich sein
            const safePrice = Math.min(Math.max(suggested, cost + 0.01), maxBundlePrice);
            const priceWasAdjusted = Math.abs(safePrice - suggested) > 0.01;
            const applyBtn=document.createElement('button');
            applyBtn.className='bnd-btn bnd-btn-green';
            applyBtn.style.cssText='font-size:11px;padding:6px 14px;margin-bottom:12px';
            applyBtn.innerHTML=`<i class="fa-solid fa-check"></i> Preis übernehmen: ${bndFmt(safePrice)}${priceWasAdjusted?' (korrigiert)':''}`;
            applyBtn.onclick=()=>{
                const inp=document.getElementById('bnd-f-price');
                if(inp){inp.value=safePrice.toFixed(2);bndUpdateSummary();}
                showToast('💡 Bundle-Preis auf '+bndFmt(safePrice)+' gesetzt');
                applyBtn.innerHTML='<i class="fa-solid fa-check"></i> Übernommen!';
                applyBtn.disabled=true;
            };
            el.appendChild(applyBtn);
        }

        const textDiv=document.createElement('div');
        textDiv.className='bnd-ai-result';
        textDiv.textContent=text;
        el.appendChild(textDiv);

    } catch(e) {
        el.textContent='❌ KI-Fehler: '+e.message;
    } finally {
        btns.forEach(b=>{if(b)b.disabled=false;});
    }
}

// ── Speichern ─────────────────────────────────────────────────────────────

let _bndImageFile = null;
let _bndRemoveImage = false;

function bndPreviewImage(input) {
    const file = input.files[0];
    if (!file) return;
    _bndImageFile = file;
    _bndRemoveImage = false;
    const url = URL.createObjectURL(file);
    const preview = document.getElementById('bnd-img-preview');
    if (preview) preview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:14px">`;
}

function bndRemoveImage() {
    _bndImageFile = null;
    _bndRemoveImage = true;
    const preview = document.getElementById('bnd-img-preview');
    if (preview) preview.innerHTML = `<i class="fa-solid fa-trash" style="font-size:20px;color:#f87171"></i>`;
}

async function bndSave() {
    const name    = document.getElementById('bnd-f-name')?.value?.trim();
    const price   = parseFloat(document.getElementById('bnd-f-price')?.value);
    const desc    = document.getElementById('bnd-f-desc')?.value?.trim()||'';
    const category= document.getElementById('bnd-f-category')?.value||'';
    if(!name){showToast('⚠️ Bundle-Name fehlt','warning');return;}
    if(!price||price<=0){showToast('⚠️ Bitte einen gültigen Preis eingeben','warning');return;}
    if(!_bundleItems.length){showToast('⚠️ Mindestens ein Produkt hinzufügen','warning');return;}

    const saveBtn = document.querySelector('#bnd-modal-overlay .bnd-btn-gold');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Speichere…'; }

    try {
        const orig=_bundleItems.reduce((s,it)=>s+it.price*it.qty,0);
        const disc=orig>0?((orig-price)/orig*100):0;
        const payload={name,description:desc,category:category||null,bundlePrice:price,originalTotal:orig,discountPct:disc,items:_bundleItems,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};

        // Bild hochladen
        if (_bndImageFile) {
            const fd = new FormData();
            fd.append('file', _bndImageFile);
            fd.append('upload_preset', 'wavevapes');
            const res = await fetch('https://api.cloudinary.com/v1_1/dbbkmjsr5/image/upload', { method:'POST', body:fd });
            const json = await res.json();
            if (json.secure_url) payload.image = json.secure_url;
        } else if (_bndRemoveImage) {
            payload.image = firebase.firestore.FieldValue.delete();
        }

        if(_bundleEditId){
            await db.collection(BND_COL).doc(_bundleEditId).update(payload);
            await logAction('bundle_updated',_bundleEditId,{name,price,discountPct:disc});
            showToast('✅ Bundle aktualisiert');
        } else {
            payload.createdAt=firebase.firestore.FieldValue.serverTimestamp();
            payload.soldCount=0;
            payload.active=true;
            const ref=await db.collection(BND_COL).add(payload);
            await logAction('bundle_created',ref.id,{name,price,discountPct:disc});
            showToast('✅ Bundle erstellt!');
        }
        _bndImageFile = null; _bndRemoveImage = false;
        document.getElementById('bnd-modal-overlay')?.remove();
        await loadBundles();
    } catch(e){
        showToast('❌ Fehler: '+e.message,'error');
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Bundle speichern'; }
    }
}

// ── Toggle Aktiv ──────────────────────────────────────────────────────────

async function bndToggleActive(id,val) {
    try {
        await db.collection(BND_COL).doc(id).update({active:val});
        await logAction('bundle_toggle',id,{active:val});
        showToast(val?'✅ Bundle aktiviert':'⏸ Bundle deaktiviert');
        await loadBundles();
    } catch(e){showToast('❌ '+e.message,'error');}
}

// ── Löschen ───────────────────────────────────────────────────────────────

async function bndDelete(id) {
    const b=_bundles.find(x=>x.id===id);
    if(!confirm('Bundle "'+( b?.name||id)+'" wirklich löschen?'))return;
    try {
        await db.collection(BND_COL).doc(id).delete();
        await logAction('bundle_deleted',id,{name:b?.name});
        showToast('🗑️ Bundle gelöscht');
        await loadBundles();
    } catch(e){showToast('❌ '+e.message,'error');}
}

// ═══════════════════════════════════════════════════════
//  KATEGORIE-EINKAUFSPREIS (Bulk-EK für ganze Kategorie)
// ═══════════════════════════════════════════════════════

function openCatCostModal() {
    // Populate category select
    const sel = document.getElementById('catcost-category');
    sel.innerHTML = '<option value="">— Kategorie wählen —</option>';
    allCategories.forEach(c => {
        const o = document.createElement('option');
        o.value = c.name; o.textContent = c.name;
        sel.appendChild(o);
    });
    document.getElementById('catcost-price').value = '';
    document.getElementById('catcost-preview').style.display = 'none';
    document.getElementById('catcost-overlay').style.display = 'flex';
    document.getElementById('catcost-modal').style.display = 'block';
}

function closeCatCostModal() {
    document.getElementById('catcost-overlay').style.display = 'none';
    document.getElementById('catcost-modal').style.display = 'none';
}

function catCostUpdatePreview() {
    const cat = document.getElementById('catcost-category').value;
    const ek  = parseFloat(document.getElementById('catcost-price').value);
    const preview = document.getElementById('catcost-preview');

    if (!cat) { preview.style.display = 'none'; return; }

    const prods = allProducts.filter(p => p.category === cat);
    document.getElementById('catcost-count').textContent = prods.length;

    const avgVK = prods.length
        ? (prods.reduce((s, p) => s + (p.price || 0), 0) / prods.length)
        : 0;
    document.getElementById('catcost-avg-price').textContent =
        avgVK > 0 ? avgVK.toFixed(2) + ' €' : '—';

    const marginRow = document.getElementById('catcost-margin-row');
    if (ek > 0 && avgVK > 0) {
        const margin = ((avgVK - ek) / avgVK * 100);
        const col = margin > 30 ? '#34d399' : margin > 15 ? '#fbbf24' : '#f87171';
        document.getElementById('catcost-avg-margin').innerHTML =
            `<span style="color:${col}">${margin.toFixed(1)}%</span> <span style="color:rgba(255,255,255,.35);font-size:10px">Ø Marge</span>`;
        marginRow.style.display = 'flex';
    } else {
        marginRow.style.display = 'none';
    }

    preview.style.display = prods.length > 0 ? 'block' : 'none';
}

async function executeCatCostUpdate() {
    const cat   = document.getElementById('catcost-category').value;
    const ek    = parseFloat(document.getElementById('catcost-price').value);
    if (!cat)  { showToast('⚠️ Bitte eine Kategorie wählen', 'warning'); return; }
    if (!ek || ek <= 0) { showToast('⚠️ Bitte einen gültigen Einkaufspreis eingeben', 'warning'); return; }

    const prods = allProducts.filter(p => p.category === cat);
    if (!prods.length) { showToast('Keine Produkte in dieser Kategorie', 'error'); return; }

    const btn = document.querySelector('#catcost-modal button[onclick="executeCatCostUpdate()"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Speichere...'; }

    try {
        for (let i = 0; i < prods.length; i += 400) {
            const batch = db.batch();
            prods.slice(i, i + 400).forEach(p => {
                batch.update(db.collection('products').doc(p.id), { costPrice: ek });
            });
            await batch.commit();
        }
        await logAction('bulk_cost_price_set', cat, { costPrice: ek, count: prods.length });
        showToast(`✅ Einkaufspreis ${ek.toFixed(2)} € für ${prods.length} Produkte in „${cat}" gesetzt!`, 'success');
        closeCatCostModal();
    } catch(e) {
        showToast('❌ Fehler: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-tag"></i> Einkaufspreis setzen'; }
    }
}

// ═══════════════════════════════════════════════════════════════
//  FAKE REVIEW GENERATOR (Tab 18) — clean IIFE, event-listener only
// ═══════════════════════════════════════════════════════════════
(function() {
    var _mode = 'all', _products = [], _previews = [], _inited = false;

    var NAMES_DE = [
        'Leon K.','Mia S.','Noah W.','Emma T.','Luca M.','Hannah B.','Felix R.','Sophie L.',
        'Tim G.','Laura H.','Jonas P.','Anna F.','Max D.','Julia N.','Markus E.','Nina W.',
        'Stefan R.','Michael T.','Tobias H.','Sabrina K.','Fabian L.','Carina M.','Patrick S.',
        'Sandra B.','Lukas F.','Melanie R.','Simon G.','Katharina W.','David N.','Jennifer P.',
        'Florian T.','Christina H.','Alexander B.','Nadine L.','Kevin M.','Vanessa S.',
        'Philipp K.','Jasmin R.','Dominik F.','Marie G.','Benjamin W.','Alina T.','Lars N.',
        'Leonie H.','Steffen B.','Franziska M.','Niklas P.','Lena S.','Moritz K.','Jana R.',
        'Christian L.','Tanja F.','Sebastian G.','Isabell W.','Manuel N.','Bianca T.',
        'Dennis H.','Verena B.','Christoph M.','Rebecca S.','Jannik P.','Sonja K.',
        'Marcel L.','Antonia R.','René F.','Stefanie G.','Thorsten W.','Kerstin N.',
        'Oliver H.','Claudia B.','Adrian M.','Johanna T.','Hendrik S.','Petra K.'
    ];
    var NAMES_INT = [
        'Alex C.','Sam R.','Jordan M.','Taylor B.','Morgan K.','Casey W.','Mateusz K.',
        'Ahmed S.','Ivan P.','Marco B.','Giulia M.','Liam O.','Noah A.','Olivia J.',
        'Emma W.','Ava L.','Lucas D.','Mason T.','Ethan N.','Aiden C.','Sofia R.',
        'Isabella F.','Amelia G.','Mia H.','Charlotte K.','William S.','James B.',
        'Benjamin V.','Elijah Q.','Logan X.','Charlotte Z.','Harper Y.','Evelyn U.',
        'Abigail I.','Emily E.','Elizabeth A.','Mila O.','Ella P.','Avery J.','Scarlett D.',
        'Chloe N.','Zoey M.','Penelope L.','Riley K.','Layla H.','Nora G.','Lily F.',
        'Eleanor C.','Hannah B.','Aubrey W.','Addison V.','Ellie T.','Stella S.',
        'Natalie R.','Zoe Q.','Leah P.','Hazel O.','Violet N.','Aurora M.','Savannah L.',
        'Audrey K.','Brooklyn J.','Bella I.','Claire H.','Skylar G.','Lucy F.','Paisley E.'
    ];
    var NAMES_ANON = [
        'Max M.','Lisa K.','Jan S.','Sara B.','Tom W.','Eva H.','Kai R.','Lea T.',
        'Ben F.','Nina G.','Paul H.','Anna L.','Mike R.','Julia S.','Chris B.',
        'Sarah T.','Marc F.','Lena N.','Tobi K.','Vera M.','René P.','Ines W.',
        'Lars D.','Tina G.','Sven H.','Maja R.','Alex B.','Kim S.','Nico F.','Dana L.'
    ];

    // Globaler Name-Pool – einmal befüllt, dann werden Namen gezogen (nie doppelt im ganzen Shop)
    var _globalNamePool = null;
    function _initNamePool(style) {
        var base = style === 'de' ? NAMES_DE.slice()
                 : style === 'anonym' ? NAMES_ANON.slice()
                 : NAMES_DE.concat(NAMES_INT);
        // Shuffle
        for (var i = base.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = base[i]; base[i] = base[j]; base[j] = tmp;
        }
        return base;
    }
    function pickName(s) {
        if (!_globalNamePool || _globalNamePool.length === 0) {
            // Pool leer oder nicht initialisiert → neu befüllen (Fallback, sollte selten passieren)
            _globalNamePool = _initNamePool(s);
        }
        return _globalNamePool.pop();
    }
    // Pool beim Start der Session zurücksetzen
    function resetNamePool(style) {
        _globalNamePool = _initNamePool(style || 'mixed');
    }
    function pickStars(a) { return a.length ? parseInt(a[Math.floor(Math.random() * a.length)]) : 5; }
    function randDate(d) { return new Date(Date.now() - Math.floor(Math.random() * d * 86400000)); }

    var FB = {
        5:[
            'Super Qualität! Schnelle Lieferung. Gerne wieder 🔥',
            'Mega zufrieden! Beste Qualität. Klare Empfehlung!',
            'Absolut top! {n} übertrifft alle Erwartungen. ★★★★★',
            'Wieder bestellt und wieder begeistert. {n} ist einfach perfekt!',
            'Unglaublich gut! {n} macht einfach Spaß 🚀',
            'Hammer Produkt! {n} läuft einwandfrei. Sehr gerne wieder 👌',
            'Bin begeistert! {n} hält genau was es verspricht.',
            'Lieferung super schnell, Qualität top. {n} – volle Punktzahl!',
            '{n} ist der Wahnsinn. Hab schon mehrfach nachbestellt 🙌',
            'Einfach klasse! {n} ist sein Geld definitiv wert.',
            'Absolut empfehlenswert. {n} macht richtig Laune 🔥',
            'Sehr zufrieden mit {n}. Versand war blitzschnell!',
            'Top Produkt, top Service. {n} – mehr brauche ich nicht.',
            'Alles perfekt! {n} überzeugt auf ganzer Linie.',
            '{n} ist mein neuer Favorit. Nie wieder was anderes 😍',
            'Qualität ist außergewöhnlich gut. {n} – absolute Kaufempfehlung!',
            'Schnell, diskret, perfekte Qualität. {n} macht einfach Spaß.',
            'Zweite Bestellung, wieder top. {n} enttäuscht nie 👍',
            'Freunde haben mich gefragt – natürlich {n} empfohlen!',
            'Preis-Leistung bei {n} ist unschlagbar. Immer wieder gerne!'
        ],
        4:[
            'Sehr gut! {n} – kleiner Abzug aber insgesamt top.',
            'Fast 5 Sterne! {n} überzeugt. Lieferung war schnell.',
            'Bin zufrieden! {n} ist gut, kommt gerne wieder.',
            '{n} ist wirklich gut. Nur minimal Luft nach oben.',
            'Lieferung etwas langsamer als erwartet, aber {n} selbst ist top.',
            'Gutes Produkt! {n} macht was es soll. 4/5 🙂',
            '{n} überzeugt größtenteils. Würde ich weiterempfehlen.',
            'Solide Qualität bei {n}. Kleine Abstriche, aber insgesamt zufrieden.',
            'Fast perfekt! {n} hat mich überzeugt. Nächste Bestellung kommt bestimmt.',
            'Sehr ordentlich. {n} hält gut, was versprochen wird.'
        ],
        3:[
            'Solides Produkt. {n} ist ok für den Preis.',
            'Geht so. Hatte mehr erwartet.',
            '{n} ist in Ordnung – weder begeistert noch enttäuscht.',
            'Mittelfeld. {n} tut was es soll, mehr aber auch nicht.',
            'Ok für den Preis. {n} könnte aber besser sein.'
        ],
        2:[
            'Leider enttäuscht. Hatte mehr von {n} erwartet.',
            '{n} hat mich nicht wirklich überzeugt. Mal abwarten.',
            'Unter meinen Erwartungen. {n} war solala.'
        ],
        1:[
            'Nicht mein Fall. {n} hat mich nicht überzeugt.',
            'Leider gar nicht meins. {n} werde ich nicht nochmal bestellen.'
        ]
    };
    // Shuffled pool pro Produkt+Rating – verhindert Wiederholungen bis alle Texte einmal genutzt
    var _fbIdx = {};
    function localTxt(productId, name, r) {
        var key = productId + '_' + r;
        var base = (FB[r] || FB[5]).slice();
        if (!_fbIdx[key]) _fbIdx[key] = { pool: base.slice(), used: [] };
        var state = _fbIdx[key];
        if (state.pool.length === 0) { state.pool = state.used.slice(); state.used = []; }
        var idx = Math.floor(Math.random() * state.pool.length);
        var tpl = state.pool.splice(idx, 1)[0];
        state.used.push(tpl);
        return tpl.replace(/{n}/g, name);
    }

    function g(id) { return document.getElementById(id); }

    function setStatus(msg, pct) {
        var el = g('frv-status');
        if (el) el.style.display = 'flex';
        var tx = g('frv-status-text');
        if (tx) tx.textContent = msg;
        var bar = g('frv-progress-fill');
        if (bar && pct !== undefined) bar.style.width = pct + '%';
    }
    function hideStatus() {
        var el = g('frv-status'); if (el) el.style.display = 'none';
        var bar = g('frv-progress-fill'); if (bar) bar.style.width = '0%';
    }

    function setMode(mode) {
        _mode = mode;
        ['frv-mode-all','frv-mode-one'].forEach(function(id) {
            var b = g(id); if (!b) return;
            var active = (id === 'frv-mode-all' && mode === 'all') || (id === 'frv-mode-one' && mode === 'one');
            b.style.background = active ? 'rgba(167,139,250,.22)' : 'rgba(255,255,255,.04)';
            b.style.border     = active ? '1px solid rgba(167,139,250,.55)' : '1px solid rgba(255,255,255,.1)';
            b.style.color      = active ? '#a78bfa' : 'rgba(255,255,255,.4)';
        });
        var sel  = g('frv-product-select');
        var info = g('frv-info-banner');
        if (sel) sel.style.display = mode === 'one' ? '' : 'none';
        if (info) {
            if (mode === 'all' && _products.length) {
                var cMin = parseInt((g('frv-count-min')||{}).value)||2;
                var cMax = parseInt((g('frv-count-max')||{}).value)||5;
                if (cMin > cMax) cMax = cMin;
                var avgEst = Math.round(_products.length * (cMin + cMax) / 2);
                info.innerHTML = '<i class="fa-solid fa-circle-info"></i> ' + _products.length + ' Produkte × ' + cMin + '–' + cMax + ' = ca. <b>' + avgEst + '</b> Reviews';
                info.style.display = 'block';
            } else { info.style.display = 'none'; }
        }
    }

    function renderPreviews() {
        var grid = g('frv-preview-grid');
        var cnt  = g('frv-preview-count');
        if (!grid) return;
        if (cnt) cnt.textContent = _previews.length ? '(' + _previews.length + ')' : '';
        if (!_previews.length) {
            grid.innerHTML = '<div style="text-align:center;padding:40px;color:rgba(255,255,255,.2);font-size:13px"><i class="fa-solid fa-wand-magic-sparkles" style="font-size:28px;display:block;margin-bottom:10px;opacity:.3"></i>Noch keine Reviews generiert</div>';
            return;
        }
        grid.innerHTML = _previews.map(function(rv, i) {
            var stars = [1,2,3,4,5].map(function(n){ return '<span style="color:' + (n<=rv.rating?'#fbbf24':'rgba(255,255,255,.15)') + ';font-size:13px">★</span>'; }).join('');
            var d = rv.date.toLocaleDateString('de-DE', {day:'2-digit',month:'short',year:'numeric'});
            return '<div data-frv-idx="'+i+'" style="display:flex;align-items:flex-start;gap:12px;padding:13px 16px;border-radius:13px;background:'+(rv.selected?'rgba(167,139,250,.06)':'rgba(255,255,255,.02)')+';border:1px solid '+(rv.selected?'rgba(167,139,250,.2)':'rgba(255,255,255,.06)')+'"><input type="checkbox" data-frv-check="'+i+'" '+(rv.selected?'checked':'')+' style="accent-color:#a78bfa;width:16px;height:16px;flex-shrink:0;margin-top:3px;cursor:pointer"><div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:10px;margin-bottom:5px;flex-wrap:wrap"><span style="font-size:13px;font-weight:600;color:rgba(255,255,255,.85)">'+rv.username+'</span><div>'+stars+'</div><span style="font-size:10px;color:rgba(255,255,255,.3);margin-left:auto">'+d+'</span></div><div style="font-size:12px;color:rgba(255,255,255,.55);line-height:1.55;margin-bottom:6px">'+rv.text+'</div><div style="font-size:10px;color:rgba(167,139,250,.5)">📦 '+rv.productName+'</div></div><div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0"><button data-frv-edit="'+i+'" style="width:30px;height:30px;border-radius:8px;background:rgba(103,232,249,.08);border:1px solid rgba(103,232,249,.15);color:#67e8f9;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center" title="Bearbeiten"><i class="fa-solid fa-pen"></i></button><button data-frv-rm="'+i+'" style="width:30px;height:30px;border-radius:8px;background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.15);color:#f87171;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center" title="Löschen"><i class="fa-solid fa-trash"></i></button></div></div>';
        }).join('');
    }

    async function callAI(name, count, tone, lang, stars) {
        var prompt = 'Generiere ' + count + ' realistische Kundenbewertungen auf ' + (lang==='de'?'Deutsch':'Englisch') + ' für "' + name + '" (Vape-Produkt, wavevapes.de).\nStil: ' + (tone==='gemischt'?'abwechslungsreich':tone) + '. Erlaubte Sterne: ' + stars.join(',') + '.\nMenschlich, gelegentlich Emojis, manchmal kleine Kritik, unterschiedliche Längen.\nNUR JSON-Array: [{"rating":5,"text":"..."},...]';
        var resp = await fetch('https://wavevapes.clever-selling-station.workers.dev', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt, max_tokens: 1500 })
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var data = await resp.json();
        if (data.error) throw new Error(data.error.message || data.error);
        var raw = ((data.content || [])[0] || {}).text || '';
        var m = raw.replace(/```json|```/g, '').trim().match(/\[[\s\S]*\]/);
        if (!m) throw new Error('no array');
        return JSON.parse(m[0]);
    }

    async function generate() {
        var lang = (g('frv-lang')||{}).value || 'de';
        var tone = (g('frv-tone')||{}).value || 'gemischt';
        var ns   = (g('frv-name-style')||{}).value || 'mixed';
        var days = parseInt((g('frv-date-spread')||{}).value) || 90;
        var cntMin = Math.min(20, Math.max(1, parseInt((g('frv-count-min')||{}).value) || 2));
        var cntMax = Math.min(20, Math.max(1, parseInt((g('frv-count-max')||{}).value) || 5));
        if (cntMin > cntMax) cntMax = cntMin;
        var stars = Array.from(document.querySelectorAll('#frv-star-dist input:checked')).map(function(e){return e.value;});
        if (!stars.length) { showToast('⚠️ Mindestens eine Sternzahl wählen','error'); return; }

        var targets;
        if (_mode === 'all') {
            if (!_products.length) { showToast('⚠️ Produkte noch nicht geladen','error'); return; }
            targets = _products;
        } else {
            var sel = g('frv-product-select');
            if (!sel || !sel.value) { showToast('⚠️ Bitte ein Produkt wählen','error'); return; }
            targets = [{ id: sel.value, name: sel.selectedOptions[0].text.split(' — ')[0].trim() }];
        }

        var btn = g('frv-btn-gen');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generiere…'; }

        // Globalen Name-Pool für diesen Generier-Lauf initialisieren.
        // Bereits in _previews verwendete Namen entfernen, damit keine Doppelungen im Shop entstehen.
        resetNamePool(ns);
        var allUsedNames = new Set(_previews.map(function(rv){ return rv.username; }));
        _globalNamePool = _globalNamePool.filter(function(n){ return !allUsedNames.has(n); });

        var generated = [];
        for (var i = 0; i < targets.length; i++) {
            var p = targets[i];
            setStatus((i+1) + ' / ' + targets.length + ': ' + p.name, Math.round(i/targets.length*100));

            // Texte pro Produkt verfolgen (Namen sind global eindeutig)
            var usedTextsForProduct = new Set();
            _previews.forEach(function(rv) {
                if (rv.productId === p.id) usedTextsForProduct.add(rv.text.toLowerCase().trim());
            });
            generated.forEach(function(rv) {
                if (rv.productId === p.id) usedTextsForProduct.add(rv.text.toLowerCase().trim());
            });

            // Zufällige Anzahl Reviews für dieses Produkt innerhalb der Spanne
            var cnt = cntMin + Math.floor(Math.random() * (cntMax - cntMin + 1));
            var rows = [];
            try { rows = await callAI(p.name, cnt, tone, lang, stars); } catch(e) { rows = []; }
            for (var j = 0; j < cnt; j++) {
                // Name global eindeutig (jeder Name nur einmal im gesamten Shop)
                var name = pickName(ns);
                // Bereits in diesem Batch verwendete Namen überspringen
                var usedInBatch = new Set(generated.map(function(r){ return r.username; }));
                var fallbackTries = 0;
                while (usedInBatch.has(name) && fallbackTries < 10) {
                    name = pickName(ns); fallbackTries++;
                }

                var ai = rows[j];
                var rating = (ai && ai.rating && stars.indexOf(String(ai.rating)) >= 0) ? Number(ai.rating) : pickStars(stars);
                var text = (ai && ai.text && ai.text.trim().length > 4) ? ai.text.trim() : localTxt(p.id, p.name, rating);

                // Text pro Produkt eindeutig
                var textTries = 0;
                while (usedTextsForProduct.has(text.toLowerCase().trim()) && textTries < 15) {
                    var nextAI = rows[cnt + textTries];
                    text = (nextAI && nextAI.text && nextAI.text.trim().length > 4) ? nextAI.text.trim() : localTxt(p.id, p.name, rating);
                    textTries++;
                }
                usedTextsForProduct.add(text.toLowerCase().trim());

                generated.push({ id: 'frv_'+Date.now()+'_'+Math.random().toString(36).slice(2), productId: p.id, productName: p.name, username: name, rating: rating, text: text, date: randDate(days), selected: true });
            }
        }
        _previews = generated.concat(_previews);
        hideStatus();
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Generieren'; }
        renderPreviews();
        showToast('✅ ' + generated.length + ' Reviews für ' + targets.length + ' Produkt' + (targets.length>1?'e':'') + ' generiert', 'success');
    }

    async function publish() {
        var toSave = _previews.filter(function(r){ return r.selected; });
        if (!toSave.length) { showToast('⚠️ Keine Reviews ausgewählt','error'); return; }
        var autoApprove = g('frv-auto-approve') ? g('frv-auto-approve').checked : true;
        var btn = g('frv-btn-pub');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Speichere…'; }
        setStatus('0 / ' + toSave.length + ' gespeichert…', 0);
        try {
            var CHUNK = 400;
            for (var i = 0; i < toSave.length; i += CHUNK) {
                var batch = db.batch();
                toSave.slice(i, i+CHUNK).forEach(function(rv) {
                    batch.set(db.collection('reviews').doc(), { productId: rv.productId, username: rv.username, rating: rv.rating, text: rv.text, approved: autoApprove, rejected: false, fake: true, createdAt: firebase.firestore.Timestamp.fromDate(rv.date), generatedAt: firebase.firestore.FieldValue.serverTimestamp(), generatedBy: (auth.currentUser||{}).email||'admin' });
                });
                await batch.commit();
                var saved = Math.min(i+CHUNK, toSave.length);
                setStatus(saved + ' / ' + toSave.length + ' gespeichert…', Math.round(saved/toSave.length*100));
            }
            await logAction('fake_reviews_published', null, { count: toSave.length, autoApprove: autoApprove });
            _previews = _previews.filter(function(r){ return !r.selected; });
            renderPreviews();
            showToast('✅ ' + toSave.length + ' Reviews veröffentlicht!', 'success');
        } catch(e) { showToast('❌ Fehler: ' + e.message, 'error'); }
        finally { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-upload"></i> Veröffentlichen'; } hideStatus(); }
    }

    async function deleteAllFake() {
        try {
            var snap = await db.collection('reviews').where('fake','==',true).get();
            if (snap.empty) { showToast('Keine Fake-Reviews vorhanden','error'); return; }
            if (!confirm(snap.size + ' Fake-Reviews endgültig löschen?')) return;
            setStatus('Lösche ' + snap.size + ' Reviews…', 50);
            var CHUNK = 400;
            for (var i = 0; i < snap.docs.length; i += CHUNK) {
                var batch = db.batch();
                snap.docs.slice(i, i+CHUNK).forEach(function(d){ batch.delete(d.ref); });
                await batch.commit();
            }
            await logAction('fake_reviews_deleted', null, { count: snap.size });
            hideStatus();
            showToast('🗑️ ' + snap.size + ' Fake-Reviews gelöscht', 'success');
            var el = g('rv-stat-fake'); if (el) el.textContent = '0';
        } catch(e) { hideStatus(); showToast('❌ ' + e.message, 'error'); }
    }

    function editReview(idx) {
        var rv = _previews[idx]; if (!rv) return;
        var editRating = rv.rating;
        var ov = document.createElement('div');
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px';
        ov.innerHTML = '<div style="background:linear-gradient(160deg,#0f0f1a,#1a1a2e);border:1px solid rgba(167,139,250,.3);border-radius:22px;padding:28px;width:100%;max-width:500px"><div style="font-family:\'Orbitron\',sans-serif;font-size:15px;font-weight:700;color:#a78bfa;margin-bottom:20px"><i class="fa-solid fa-pen"></i> Bewertung bearbeiten</div><div style="margin-bottom:14px"><div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.28);margin-bottom:8px">Sterne</div><div style="display:flex;gap:8px" id="_frv_stars">' + [1,2,3,4,5].map(function(n){ return '<span data-s="'+n+'" style="font-size:28px;cursor:pointer;color:'+(n<=rv.rating?'#fbbf24':'rgba(255,255,255,.2)')+'">★</span>'; }).join('') + '</div></div><div style="margin-bottom:12px"><div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.28);margin-bottom:6px">Name</div><input id="_frv_name" value="'+rv.username+'" style="width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:9px 12px;color:#fff;font-size:13px;outline:none;box-sizing:border-box"></div><div style="margin-bottom:20px"><div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.28);margin-bottom:6px">Text</div><textarea id="_frv_text" rows="4" style="width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:9px 12px;color:#fff;font-size:13px;resize:vertical;outline:none;font-family:inherit;box-sizing:border-box">'+rv.text+'</textarea></div><div style="display:flex;gap:10px"><button id="_frv_save" style="flex:1;padding:11px;border-radius:12px;background:linear-gradient(135deg,#a78bfa,#7c3aed);color:#fff;font-size:13px;font-weight:700;border:none;cursor:pointer">Speichern</button><button id="_frv_cancel" style="padding:11px 20px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.5);font-size:13px;cursor:pointer;border:1px solid rgba(255,255,255,.1)">Abbrechen</button></div></div>';
        document.body.appendChild(ov);
        ov.querySelectorAll('[data-s]').forEach(function(el) {
            el.addEventListener('click', function() {
                editRating = parseInt(el.dataset.s);
                ov.querySelectorAll('[data-s]').forEach(function(s){ s.style.color = parseInt(s.dataset.s) <= editRating ? '#fbbf24' : 'rgba(255,255,255,.2)'; });
            });
        });
        ov.querySelector('#_frv_save').addEventListener('click', function() {
            var t = (ov.querySelector('#_frv_text')||{}).value||''; var n = (ov.querySelector('#_frv_name')||{}).value||'';
            if (t.trim()) rv.text = t.trim(); if (n.trim()) rv.username = n.trim(); rv.rating = editRating;
            ov.remove(); renderPreviews(); showToast('✅ Gespeichert');
        });
        ov.querySelector('#_frv_cancel').addEventListener('click', function(){ ov.remove(); });
        ov.addEventListener('click', function(e){ if (e.target === ov) ov.remove(); });
    }

    async function init() {
        if (_inited) return;
        try {
            setStatus('Lade Produkte…', 10);
            var snap = await db.collection('products').orderBy('name').get();
            _products = snap.docs.map(function(d){ return { id: d.id, name: d.data().name||'?', category: d.data().category||'' }; });
            var sel = g('frv-product-select');
            if (sel && sel.options.length <= 1) {
                _products.forEach(function(p) {
                    var o = document.createElement('option');
                    o.value = p.id; o.textContent = p.name + (p.category ? ' — ' + p.category.replace('WaveVapes ','') : '');
                    sel.appendChild(o);
                });
            }
            _inited = true;
            hideStatus();
            setMode(_mode);
        } catch(e) { hideStatus(); showToast('❌ Laden fehlgeschlagen: ' + e.message, 'error'); }
    }

    function _updateRangeHint() {
        var mn = parseInt((g('frv-count-min')||{}).value) || 2;
        var mx = parseInt((g('frv-count-max')||{}).value) || 5;
        if (mn > mx) { mx = mn; var el = g('frv-count-max'); if (el) el.value = mx; }
        var hint = g('frv-range-hint');
        if (hint) hint.textContent = 'Jedes Produkt bekommt zufällig ' + mn + '–' + mx + ' Reviews';
    }

    function wireUp() {
        var btnGen   = g('frv-btn-gen');
        var btnPub   = g('frv-btn-pub');
        var btnDel   = g('frv-btn-del');
        var btnMAll  = g('frv-mode-all');
        var btnMOne  = g('frv-mode-one');
        var btnSelA  = g('frv-btn-selall');
        var btnDesel = g('frv-btn-desel');
        var btnDels  = g('frv-btn-delsel');
        var grid     = g('frv-preview-grid');
        var cntInput = g('frv-count-min');
        var cntInputMax = g('frv-count-max');

        if (btnGen)  btnGen.addEventListener('click',  generate);
        if (btnPub)  btnPub.addEventListener('click',  publish);
        if (btnDel)  btnDel.addEventListener('click',  deleteAllFake);
        if (btnMAll) btnMAll.addEventListener('click', function(){ setMode('all'); });
        if (btnMOne) btnMOne.addEventListener('click', function(){ setMode('one'); });
        if (btnSelA) btnSelA.addEventListener('click',  function(){ _previews.forEach(function(r){ r.selected=true; }); renderPreviews(); });
        if (btnDesel)btnDesel.addEventListener('click', function(){ _previews.forEach(function(r){ r.selected=false; }); renderPreviews(); });
        if (btnDels) btnDels.addEventListener('click',  function(){ _previews=_previews.filter(function(r){return !r.selected;}); renderPreviews(); showToast('🗑️ Entfernt'); });
        if (cntInput) cntInput.addEventListener('input', function(){ _updateRangeHint(); if (_mode==='all') setMode('all'); });
        if (cntInputMax) cntInputMax.addEventListener('input', function(){ _updateRangeHint(); if (_mode==='all') setMode('all'); });

        if (grid) {
            grid.addEventListener('change', function(e) {
                var idx = e.target.getAttribute('data-frv-check');
                if (idx !== null && _previews[parseInt(idx)]) _previews[parseInt(idx)].selected = e.target.checked;
            });
            grid.addEventListener('click', function(e) {
                var eb = e.target.closest('[data-frv-edit]');
                var rb = e.target.closest('[data-frv-rm]');
                if (eb) editReview(parseInt(eb.getAttribute('data-frv-edit')));
                if (rb) { _previews.splice(parseInt(rb.getAttribute('data-frv-rm')), 1); renderPreviews(); }
            });
        }
    }

    var _wired = false;
    window.frvInit = async function() {
        if (!_wired) { wireUp(); _wired = true; }
        await init();
    };

    window.rvDeleteAllFake = async function() { await deleteAllFake(); };

})();

