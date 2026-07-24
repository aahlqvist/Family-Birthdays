/**
 * Family Birthdays — Cloudflare Worker
 *
 * Provides a per-family JSON store backed by Cloudflare KV.
 * Each family is identified by its code (a short alphanumeric string).
 * The code acts as both the identifier and the access key — keep it secret.
 *
 * Routes:
 *   GET     /family/:code  → return stored JSON (404 if code not yet used)
 *   PUT     /family/:code  → upsert JSON body (max 2 MB)
 *   OPTIONS /family/:code  → CORS preflight
 *
 * KV binding: FAMILY_DATA  (configure in wrangler.toml)
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age':       '86400',
};

const MAX_BYTES = 2_000_000; // 2 MB per family

export default {
  async fetch(request, env) {

    // ── CORS preflight ──────────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);

    // Route: /family/:code  (3–48 alphanumeric chars / hyphens)
    const match = url.pathname.match(/^\/family\/([\w-]{3,48})$/);
    if (!match) return reply('Not found', 404);
    const code = match[1];

    // ── GET ─────────────────────────────────────────────────────────────────
    if (request.method === 'GET') {
      const data = await env.FAMILY_DATA.get(code);
      if (data === null) return reply(null, 404);
      return new Response(data, {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── PUT ─────────────────────────────────────────────────────────────────
    if (request.method === 'PUT') {
      let body;
      try   { body = await request.text(); }
      catch { return reply('Could not read request body', 400); }

      if (body.length > MAX_BYTES)
        return reply(`Payload too large (max ${MAX_BYTES / 1e6} MB)`, 413);

      try   { JSON.parse(body); }
      catch { return reply('Body must be valid JSON', 400); }

      // 10-year TTL — data does not disappear on its own
      await env.FAMILY_DATA.put(code, body, {
        expirationTtl: 60 * 60 * 24 * 365 * 10,
      });

      return reply('OK', 200);
    }

    return reply('Method not allowed', 405);
  },
};

function reply(body, status) {
  return new Response(body, { status, headers: CORS });
}
