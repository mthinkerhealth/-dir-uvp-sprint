// Cloudflare Pages Function — POST /api/fit-check
// Proxies the lead-capture payload to the Google Apps Script webhook. Never echoes the
// upstream body back to the client (SEC-3); logs detail server-side instead.
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbw2uKM3ZVN54JNkCZJXrDt6IJMDoUX-_iGh3RJIt5wS8QXaReWrYaPqN6s4tMMXMqNByA/exec';

const HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export async function onRequestPost(context) {
  const { request, env } = context;

  // SEC-3: rate-limit by IP (shares the same binding as the analysis endpoint, distinct key).
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (env.RATE_LIMITER) {
    try {
      const allowed = await env.RATE_LIMITER.limit({ key: `fit-check:${ip}` });
      if (!allowed.success) return Response.json({ ok: false, error: 'rate_limited' }, { status: 429, headers: HEADERS });
    } catch (_) { /* limiter unavailable: fail open */ }
  }

  let payload;
  try { payload = await request.json(); }
  catch { return Response.json({ ok: false, error: 'invalid_request' }, { status: 400, headers: HEADERS }); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return Response.json({ ok: false, error: 'invalid_request' }, { status: 400, headers: HEADERS });
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
    console.error(JSON.stringify({ event: 'fit_check_upstream_error', status: response.status, body: text.slice(0, 500) }));
    return Response.json({ ok: false, error: 'capture_failed' }, { status: 502, headers: HEADERS });
  } catch (err) {
    console.error(JSON.stringify({ event: 'fit_check_proxy_error', message: String((err && err.message) || err) }));
    return Response.json({ ok: false, error: 'capture_failed' }, { status: 502, headers: HEADERS });
  }
}
