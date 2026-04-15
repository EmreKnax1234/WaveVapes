/**
 * WaveVapes — Cloudflare Email Worker
 * ─────────────────────────────────────────────────────────────
 * Endpoints:
 *   POST /send   — authenticated (X-API-Key header)
 *     body: { type, data }
 *     types: order_confirmation | admin_alert | contact_form | newsletter
 *
 * Env vars (set in wrangler.toml or via "wrangler secret put"):
 *   API_SECRET_KEY  — required for all non-contact requests
 *   FROM_EMAIL      — noreply@wavevapes.de
 *   FROM_NAME       — WaveVapes
 *   ADMIN_EMAIL     — admin@wavevapes.de
 *   SHOP_URL        — https://wavevapes.de
 *   SEND_EMAIL      — Cloudflare send_email binding
 */

import { EmailMessage } from "cloudflare:email";

// ── CORS headers (restrict to your domain in production) ──────
const CORS = {
  "Access-Control-Allow-Origin":  "https://wavevapes.de",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
};

// ─────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    // Handle preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/send" || request.method !== "POST") {
      return json({ error: "Not found" }, 404);
    }

    // ── Parse body ──────────────────────────────────────────
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const { type, data = {} } = body;

    // ── Auth — contact_form is public, everything else needs key ──
    if (type !== "contact_form") {
      const key = request.headers.get("X-API-Key");
      if (!key || key !== env.API_SECRET_KEY) {
        return json({ error: "Unauthorized" }, 401);
      }
    }

    // ── Route to handler ────────────────────────────────────
    try {
      switch (type) {
        case "order_confirmation": await sendOrderConfirmation(env, data); break;
        case "admin_alert":        await sendAdminAlert(env, data);        break;
        case "contact_form":       await sendContactForm(env, data);       break;
        case "newsletter":         await sendNewsletter(env, data);        break;
        default: return json({ error: `Unknown type: ${type}` }, 400);
      }
      return json({ ok: true }, 200);
    } catch (err) {
      console.error(`[email-worker] ${type} failed:`, err);
      return json({ error: "Send failed", detail: err.message }, 500);
    }
  },
};

// ═══════════════════════════════════════════════════════════════
// 1. ORDER CONFIRMATION — sent to the customer
// ═══════════════════════════════════════════════════════════════
async function sendOrderConfirmation(env, d) {
  // d: { orderId, customerEmail, customerName, items[], total, address }
  assertFields(d, ["orderId", "customerEmail", "customerName", "items", "total"]);

  const itemsHtml = d.items.map(i =>
    `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #2a2a2a">${esc(i.name)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #2a2a2a;text-align:center">${esc(i.qty)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #2a2a2a;text-align:right">${fmt(i.price * i.qty)}</td>
    </tr>`
  ).join("");

  const html = template(`
    <h2 style="color:#00d4ff;margin:0 0 8px">Bestellbestätigung</h2>
    <p style="color:#aaa;margin:0 0 24px">Bestellung #${esc(d.orderId)}</p>

    <p>Hey ${esc(d.customerName)},<br>
    vielen Dank für deine Bestellung! Wir bearbeiten sie sofort.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0">
      <tr>
        <th style="text-align:left;color:#aaa;font-weight:500;padding-bottom:8px;border-bottom:1px solid #333">Produkt</th>
        <th style="text-align:center;color:#aaa;font-weight:500;padding-bottom:8px;border-bottom:1px solid #333">Menge</th>
        <th style="text-align:right;color:#aaa;font-weight:500;padding-bottom:8px;border-bottom:1px solid #333">Preis</th>
      </tr>
      ${itemsHtml}
      <tr>
        <td colspan="2" style="padding-top:12px;font-weight:700">Gesamt</td>
        <td style="padding-top:12px;font-weight:700;text-align:right;color:#00d4ff">${fmt(d.total)}</td>
      </tr>
    </table>

    <a href="${env.SHOP_URL}/account" style="display:inline-block;background:#00d4ff;color:#000;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:700;margin-top:8px">
      Bestellung verfolgen
    </a>
  `, { title: `Bestellung #${d.orderId} bestätigt`, env });

  await send(env, {
    from: `${env.FROM_NAME} <${env.FROM_EMAIL}>`,
    to:   d.customerEmail,
    subject: `✅ Deine WaveVapes-Bestellung #${d.orderId}`,
    html,
  });
}

// ═══════════════════════════════════════════════════════════════
// 2. ADMIN ALERT — new order notification to shop owner
// ═══════════════════════════════════════════════════════════════
async function sendAdminAlert(env, d) {
  // d: { orderId, customerName, customerEmail, total, items[], address? }
  assertFields(d, ["orderId", "customerName", "total"]);

  const html = template(`
    <h2 style="color:#f59e0b;margin:0 0 8px">🛒 Neue Bestellung</h2>
    <p style="color:#aaa;margin:0 0 24px">Bestellung #${esc(d.orderId)}</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
      <tr><td style="color:#aaa;padding:4px 0;width:130px">Kunde</td><td>${esc(d.customerName)}</td></tr>
      <tr><td style="color:#aaa;padding:4px 0">E-Mail</td><td>${esc(d.customerEmail || "—")}</td></tr>
      <tr><td style="color:#aaa;padding:4px 0">Betrag</td><td style="color:#00d4ff;font-weight:700">${fmt(d.total)}</td></tr>
      <tr><td style="color:#aaa;padding:4px 0">Produkte</td><td>${esc(d.items?.length ?? "?")} Artikel</td></tr>
    </table>

    <a href="${env.SHOP_URL}/admin" style="display:inline-block;background:#f59e0b;color:#000;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:700">
      Im Admin öffnen
    </a>
  `, { title: `Neue Bestellung #${d.orderId}`, env });

  await send(env, {
    from: `${env.FROM_NAME} <${env.FROM_EMAIL}>`,
    to:   env.ADMIN_EMAIL,
    subject: `🛒 Neue Bestellung #${d.orderId} — ${fmt(d.total)}`,
    html,
  });
}

// ═══════════════════════════════════════════════════════════════
// 3. CONTACT FORM — forwarded to admin, auto-reply to sender
// ═══════════════════════════════════════════════════════════════
async function sendContactForm(env, d) {
  // d: { name, email, subject?, message }
  assertFields(d, ["name", "email", "message"]);

  // Simple spam guard
  if (isSpam(d.message)) throw new Error("Spam detected");

  const subj = d.subject || "Kontaktanfrage";

  // Forward to admin
  const adminHtml = template(`
    <h2 style="color:#a78bfa;margin:0 0 8px">📩 Neue Kontaktanfrage</h2>
    <p style="color:#aaa;margin:0 0 24px">via Kontaktformular auf wavevapes.de</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
      <tr><td style="color:#aaa;padding:4px 0;width:100px">Name</td><td>${esc(d.name)}</td></tr>
      <tr><td style="color:#aaa;padding:4px 0">E-Mail</td><td><a href="mailto:${esc(d.email)}" style="color:#00d4ff">${esc(d.email)}</a></td></tr>
      <tr><td style="color:#aaa;padding:4px 0">Betreff</td><td>${esc(subj)}</td></tr>
    </table>

    <div style="background:#1a1a1a;border-left:3px solid #a78bfa;padding:16px;border-radius:4px;white-space:pre-wrap">${esc(d.message)}</div>

    <a href="mailto:${esc(d.email)}?subject=Re: ${esc(subj)}" style="display:inline-block;background:#a78bfa;color:#000;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:700;margin-top:20px">
      Direkt antworten
    </a>
  `, { title: `Kontaktanfrage: ${subj}`, env });

  await send(env, {
    from: `${env.FROM_NAME} <${env.FROM_EMAIL}>`,
    to:   env.ADMIN_EMAIL,
    subject: `📩 Kontakt: ${subj} (von ${d.name})`,
    html:    adminHtml,
  });

  // Auto-reply to sender
  const replyHtml = template(`
    <h2 style="color:#00d4ff;margin:0 0 8px">Danke für deine Nachricht!</h2>
    <p>Hey ${esc(d.name)},</p>
    <p>wir haben deine Anfrage erhalten und melden uns so schnell wie möglich — in der Regel innerhalb von 24 Stunden.</p>
    <blockquote style="border-left:3px solid #333;margin:20px 0;padding:12px 16px;color:#aaa;white-space:pre-wrap">${esc(d.message)}</blockquote>
    <p style="color:#aaa;font-size:13px">Das ist eine automatische Bestätigung — bitte nicht auf diese E-Mail antworten.</p>
  `, { title: "Wir haben deine Nachricht erhalten", env });

  await send(env, {
    from: `${env.FROM_NAME} <${env.FROM_EMAIL}>`,
    to:   d.email,
    subject: `Re: ${subj} — Deine Anfrage bei WaveVapes`,
    html:    replyHtml,
  });
}

// ═══════════════════════════════════════════════════════════════
// 4. NEWSLETTER — bulk send (one email at a time via loop)
// ═══════════════════════════════════════════════════════════════
async function sendNewsletter(env, d) {
  // d: { recipients: string[], subject, htmlContent, textContent? }
  assertFields(d, ["recipients", "subject", "htmlContent"]);
  if (!Array.isArray(d.recipients) || !d.recipients.length) {
    throw new Error("recipients must be a non-empty array");
  }

  const html = template(`
    ${d.htmlContent}
    <hr style="border:none;border-top:1px solid #222;margin:32px 0">
    <p style="color:#555;font-size:12px;text-align:center">
      Du erhältst diese E-Mail, weil du dich auf <a href="${env.SHOP_URL}" style="color:#555">wavevapes.de</a> angemeldet hast.<br>
      <a href="${env.SHOP_URL}/account" style="color:#555">Abmelden</a>
    </p>
  `, { title: d.subject, env });

  // Cloudflare Workers have a 30s CPU limit — for large lists use a queue
  // (connect Workers Queue or call this function in batches from admin)
  const results = await Promise.allSettled(
    d.recipients.map(to =>
      send(env, {
        from: `${env.FROM_NAME} <${env.FROM_EMAIL}>`,
        to,
        subject: d.subject,
        html,
      })
    )
  );

  const failed = results.filter(r => r.status === "rejected").length;
  if (failed > 0) {
    console.warn(`[newsletter] ${failed}/${d.recipients.length} emails failed`);
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/** Build a raw MIME message and send via Cloudflare send_email binding */
async function send(env, { from, to, subject, html }) {
  const boundary = `wv_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const encodedSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
  const encodedHtml    = btoa(unescape(encodeURIComponent(html)));

  const mime = [
    `MIME-Version: 1.0`,
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: quoted-printable`,
    ``,
    stripHtml(html),
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    encodedHtml,
    ``,
    `--${boundary}--`,
  ].join("\r\n");

  const msg = new EmailMessage(
    env.FROM_EMAIL,  // from (must be verified in Cloudflare Email Routing)
    to,
    mime
  );

  await env.SEND_EMAIL.send(msg);
}

/** Shared dark-theme HTML email shell */
function template(body, { title, env }) {
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e5e5e5">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 0">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%">

        <!-- Header -->
        <tr><td style="background:#111;border-radius:12px 12px 0 0;padding:28px 32px;border-bottom:1px solid #1e1e1e">
          <a href="${env.SHOP_URL}" style="text-decoration:none">
            <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px">
              Wave<span style="color:#00d4ff">Vapes</span>
            </span>
          </a>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#111;padding:32px;line-height:1.6">
          ${body}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#0d0d0d;border-radius:0 0 12px 12px;padding:20px 32px;border-top:1px solid #1e1e1e;text-align:center">
          <p style="margin:0;font-size:12px;color:#555">
            © ${new Date().getFullYear()} WaveVapes •
            <a href="${env.SHOP_URL}/impressum" style="color:#555">Impressum</a> •
            <a href="${env.SHOP_URL}/datenschutz" style="color:#555">Datenschutz</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmt(n) {
  return `${Number(n ?? 0).toFixed(2).replace(".", ",")} €`;
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function assertFields(obj, fields) {
  const missing = fields.filter(f => obj[f] == null || obj[f] === "");
  if (missing.length) throw new Error(`Missing fields: ${missing.join(", ")}`);
}

function isSpam(text) {
  const lower = String(text).toLowerCase();
  return /(buy cheap|casino|viagra|crypto|bitcoin|click here|free money)/i.test(lower);
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}
