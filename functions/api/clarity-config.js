// Cloudflare Pages Function — GET /api/clarity-config
export function onRequestGet(context) {
  return Response.json(
    { turnstileSiteKey: context.env.TURNSTILE_SITE_KEY || '' },
    { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }
  );
}
