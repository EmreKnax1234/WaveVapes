/**
 * WaveVapes — Cloudflare AI Worker (Groq)
 * ─────────────────────────────────────────────────────────────
 * Proxies Groq API calls from the WaveVapes Admin Dashboard.
 * Keeps the API key server-side (never exposed to the browser).
 *
 * Endpoint:  POST /
 *   Body:    { prompt: string, max_tokens?: number }
 *   Returns: { content: [{ type: "text", text: "..." }] }
 *             (identisches Format wie vorher — kein Frontend-Change nötig)
 *
 * Env secrets (set via "wrangler secret put"):
 *   GROQ_API_KEY  — dein Groq API Key von https://console.groq.com/keys
 *
 * Deploy:
 *   wrangler deploy
 *   wrangler secret put GROQ_API_KEY
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL    = 'llama-3.1-8b-instant'; // schnell + kostenlos

// ── Allowed origins ───────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://wavevapes.de',
  'https://www.wavevapes.de',
  'https://wavevapes-main.vercel.app',
];

function isAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return true;
  if (/^https:\/\/wavevapes[a-z0-9-]*\.vercel\.app$/.test(origin)) return true;
  return false;
}

function corsHeaders(origin) {
  const allowedOrigin = isAllowed(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age':       '86400',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    // ── Preflight ─────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders(origin) });
    }

    if (!isAllowed(origin)) {
      return new Response(JSON.stringify({ error: { message: 'Host not in allowlist' } }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    // ── Parse body ────────────────────────────────────────────
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: { message: 'Invalid JSON body' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    const { prompt, max_tokens = 600 } = body;

    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({ error: { message: '`prompt` field is required' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    // BUG-FIX (security): Hardcoded API-Key-Fallback entfernt.
    // Der Key darf niemals im Quellcode stehen — er gehört ausschließlich
    // als Wrangler-Secret gesetzt: wrangler secret put GROQ_API_KEY
    const apiKey = env && env.GROQ_API_KEY;
    if (!apiKey) {
      console.error('GROQ_API_KEY secret ist nicht gesetzt!');
      return new Response(JSON.stringify({ error: { message: 'Server misconfiguration: API key missing' } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    // ── Forward to Groq ───────────────────────────────────────
    try {
      const groqRes = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model:      MODEL,
          max_tokens: Math.min(Math.max(1, parseInt(max_tokens) || 600), 4096),
          messages:   [{ role: 'user', content: prompt }],
          temperature: 0.7,
        }),
      });

      const data = await groqRes.json();

      if (!groqRes.ok) {
        console.error('Groq API error:', groqRes.status, JSON.stringify(data));
        return new Response(JSON.stringify({
          error: { message: data?.error?.message || `Groq error ${groqRes.status}` }
        }), {
          status: groqRes.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        });
      }

      // Groq gibt OpenAI-Format zurück → in Anthropic-Format konvertieren
      // damit das Frontend (admin-superadmin.js) unverändert bleibt.
      const text = data?.choices?.[0]?.message?.content || '';
      const anthropicShape = {
        content: [{ type: 'text', text }],
        model:   MODEL,
        usage:   data?.usage || {},
      };

      return new Response(JSON.stringify(anthropicShape), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });

    } catch (err) {
      console.error('Worker fetch error:', err);
      return new Response(JSON.stringify({ error: { message: 'Worker internal error: ' + err.message } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }
  },
};
