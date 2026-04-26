/**
 * WaveVapes — Kontaktformular via Cloudflare Email Worker
 *
 * Dieses Snippet in die Seite einbinden, die das Kontaktformular enthält.
 * Den WORKER_URL auf die fertige Worker-URL anpassen.
 */

const WORKER_URL = "https://wavevapes-email.workers.dev/send"; // ← anpassen nach Deploy

/**
 * Kontaktformular absenden.
 * Erwartet: <form id="contact-form"> mit Feldern name, email, subject (optional), message
 */
document.getElementById("contact-form")?.addEventListener("submit", async function (e) {
    e.preventDefault();

    const btn = this.querySelector("button[type=submit]");
    const statusEl = document.getElementById("contact-status");
    const originalText = btn?.textContent;

    const data = {
        name:    this.querySelector('[name="name"]')?.value.trim(),
        email:   this.querySelector('[name="email"]')?.value.trim(),
        subject: this.querySelector('[name="subject"]')?.value.trim() || undefined,
        message: this.querySelector('[name="message"]')?.value.trim(),
    };

    if (!data.name || !data.email || !data.message) {
        showStatus(statusEl, "Bitte alle Pflichtfelder ausfüllen.", "error");
        return;
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        showStatus(statusEl, "Bitte eine gültige E-Mail-Adresse eingeben.", "error");
        return;
    }

    if (btn) { btn.disabled = true; btn.textContent = "Senden…"; }

    try {
        const res = await fetch(WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "contact_form", data }),
        });

        if (res.ok) {
            showStatus(statusEl, "✅ Nachricht gesendet! Wir melden uns bald.", "success");
            this.reset();
        } else {
            const err = await res.json().catch(() => ({}));
            showStatus(statusEl, err.error || "Fehler beim Senden. Bitte später erneut versuchen.", "error");
        }
    } catch {
        showStatus(statusEl, "Netzwerkfehler. Bitte Internetverbindung prüfen.", "error");
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = originalText; }
    }
});

function showStatus(el, msg, type) {
    if (!el) return;
    el.textContent = msg;
    el.style.color = type === "success" ? "#4ade80" : "#f87171";
    el.style.display = "block";
    setTimeout(() => { el.style.display = "none"; }, 6000);
}

/* ────────────────────────────────────────────────────────────
   Newsletter-Broadcast (nur Admin-Panel)
   Aufruf: sendNewsletter(recipients, subject, htmlContent)
   ──────────────────────────────────────────────────────────── */
async function sendNewsletter(recipients, subject, htmlContent, apiKey) {
    const res = await fetch(WORKER_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,           // aus Admin-Session oder .env
        },
        body: JSON.stringify({
            type: "newsletter",
            data: { recipients, subject, htmlContent },
        }),
    });
    if (!res.ok) throw new Error(`Newsletter-Fehler: ${res.status}`);
    return res.json();
}
