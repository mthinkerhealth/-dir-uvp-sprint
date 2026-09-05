// Short-lived HMAC capture ticket.
//
// Why this exists: /api/uvp-clarity-check verifies a Turnstile token, but a Turnstile token is
// single-use, so it is already spent by the time the prospect reaches the email-capture step.
// /api/fit-check therefore had no bot gate at all. Rather than challenge the user a second time,
// the clarity check mints a signed, expiring ticket on success and fit-check requires it.
//
// The ticket proves only one thing: "this caller completed a Turnstile-verified clarity check
// recently." It carries no user data and is not a session.

const PURPOSE = 'fit-check-capture-v1';
const DEFAULT_TTL_SECONDS = 60 * 60; // one hour: long enough to read a report and decide.
const MAX_SKEW_SECONDS = 120;        // tolerate modest clock drift between edge locations.

function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

// Constant-time-ish compare. Both inputs are base64url of a fixed-width digest, so length
// equality is expected; the loop still runs to completion on a length match.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Mint a ticket valid for ttlSeconds. Returns `<expiry>.<signature>`. */
export async function mintCaptureTicket(secret, ttlSeconds = DEFAULT_TTL_SECONDS, now = Date.now()) {
  if (!secret) return '';
  const exp = Math.floor(now / 1000) + ttlSeconds;
  return `${exp}.${await hmac(secret, `${PURPOSE}:${exp}`)}`;
}

/** Returns null when valid, else a short reason code (logged server-side, never sent to the client). */
export async function verifyCaptureTicket(ticket, secret, now = Date.now()) {
  if (!secret) return 'no_secret';
  if (typeof ticket !== 'string' || ticket.length === 0 || ticket.length > 256) return 'malformed';
  const dot = ticket.indexOf('.');
  if (dot < 1) return 'malformed';
  const expRaw = ticket.slice(0, dot);
  const sig = ticket.slice(dot + 1);
  if (!/^\d{1,12}$/.test(expRaw) || sig.length === 0) return 'malformed';
  const exp = Number(expRaw);
  if (Math.floor(now / 1000) > exp + MAX_SKEW_SECONDS) return 'expired';
  if (!safeEqual(sig, await hmac(secret, `${PURPOSE}:${exp}`))) return 'bad_signature';
  return null;
}

export const TICKET_FIELD = 'capture_ticket';
export const __ticketInternals = { PURPOSE, DEFAULT_TTL_SECONDS, MAX_SKEW_SECONDS };
