// Cloudflare Pages Function — POST /api/fit-check
// Proxies the lead-capture payload to the Google Apps Script webhook. The webhook URL is an
// env var (no infra detail in source). Validates the payload before forwarding and never
// echoes the upstream body back to the client (detail is logged server-side only).

const HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

const MAX_BODY_BYTES = 32 * 1024;
const MAX_FIELD_LEN = 5000;
const MAX_ARRAY_LEN = 30;
// Clarity-check intents PLUS the legacy website form's values, so this proxy validates both
// without rejecting older submissions.
const ALLOWED_NEXT_STEPS = new Set(['email', 'call', 'partner_intro', '']);

export function validEmail(e) {
  return typeof e === 'string' && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export function validWebsite(u) {
  if (u === undefined || u === null || u === '') return true; // optional
  if (typeof u !== 'string' || u.length > 2048) return false;
  try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:'; }
  catch { return false; }
}

// Returns null when valid, else a short reason code (logged server-side, never sent to the client).
export function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'not_object';
  for (const [k, v] of Object.entries(payload)) {
    if (v === null || typeof v === 'number' || typeof v === 'boolean') continue;
    if (typeof v === 'string') { if (v.length > MAX_FIELD_LEN) return 'field_too_long:' + k; continue; }
    if (Array.isArray(v)) {
      if (v.length > MAX_ARRAY_LEN) return 'array_too_long:' + k;
      if (!v.every((x) => typeof x === 'string' && x.length <= MAX_FIELD_LEN)) return 'bad_array:' + k;
      continue;
    }
    return 'nested_object:' + k; // reject arbitrary nested objects
  }
  if ('email' in payload && payload.email !== '' && payload.email != null && !validEmail(payload.email)) return 'bad_email';
  if ('next_step_choice' in payload && !ALLOWED_NEXT_STEPS.has(String(payload.next_step_choice))) return 'bad_next_step';
  if (!validWebsite(payload.company_website)) return 'bad_website';
  return null;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const WEBHOOK_URL = env.FIT_CHECK_WEBHOOK_URL;
  if (!WEBHOOK_URL) {
    console.error(JSON.stringify({ event: 'fit_check_misconfigured' }));
    return Response.json({ ok: false, error: 'configuration_error' }, { status: 500, headers: HEADERS });
  }

  // Rate-limit by IP (shares the analysis binding; distinct key namespace).
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (env.RATE_LIMITER) {
    try {
      const allowed = await env.RATE_LIMITER.limit({ key: `fit-check:${ip}` });
      if (!allowed.success) return Response.json({ ok: false, error: 'rate_limited' }, { status: 429, headers: HEADERS });
    } catch (_) { /* limiter unavailable: fail open */ }
  }

  // Size-cap, parse, and validate before anything is forwarded upstream.
  let raw;
  try { raw = await request.text(); }
  catch { return Response.json({ ok: false, error: 'invalid_submission' }, { status: 400, headers: HEADERS }); }
  if (raw.length > MAX_BODY_BYTES) return Response.json({ ok: false, error: 'invalid_submission' }, { status: 413, headers: HEADERS });

  let payload;
  try { payload = JSON.parse(raw); }
  catch { return Response.json({ ok: false, error: 'invalid_submission' }, { status: 400, headers: HEADERS }); }

  const bad = validatePayload(payload);
  if (bad) {
    console.error(JSON.stringify({ event: 'fit_check_invalid', reason: bad }));
    return Response.json({ ok: false, error: 'invalid_submission' }, { status: 400, headers: HEADERS });
  }

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) { /* non-JSON upstream */ }

    if (response.ok && data && data.ok !== false) {
      return Response.json({ ok: true }, { status: 200, headers: HEADERS });
    }
    // Failure: log detail server-side, return a generic error (no upstream body echoed).
    console.error(JSON.stringify({ event: 'fit_check_upstream_error', status: response.status, body: text.slice(0, 300) }));
    return Response.json({ ok: false, error: 'capture_failed' }, { status: 502, headers: HEADERS });
  } catch (err) {
    console.error(JSON.stringify({ event: 'fit_check_proxy_error', message: String((err && err.message) || err) }));
    return Response.json({ ok: false, error: 'capture_failed' }, { status: 502, headers: HEADERS });
  }
}
