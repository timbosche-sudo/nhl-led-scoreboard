/**
 * NHL API proxy for the GitHub Pages build of the scoreboard (Cloudflare Workers, free tier).
 *
 * Why: api-web.nhle.com does not send CORS headers, so Safari blocks the static site from
 * reading it directly. This Worker fetches the NHL data server-side and adds CORS headers.
 * It exposes exactly the same paths as the Vite dev server and the Raspberry Pi server:
 *
 *   https://<your-worker>.workers.dev/nhl-api/v1/score/2026-11-17
 *   https://<your-worker>.workers.dev/nhl-assets/logos/nhl/svg/STL_dark.svg
 *
 * No secrets or API keys are involved. Only a small allow-list of read-only NHL paths is
 * forwarded, so it cannot be abused as a general-purpose open proxy.
 *
 * Optional: set a Worker variable ALLOWED_ORIGIN (e.g. https://<you>.github.io) to restrict
 * which site may use it. Default "*".
 */
const ROUTES = [
  { prefix: '/nhl-api/', upstream: 'https://api-web.nhle.com/', allow: /^v1\/(score|schedule|scoreboard|club-schedule|standings|gamecenter)\//, ttl: 15 },
  { prefix: '/nhl-assets/', upstream: 'https://assets.nhle.com/', allow: /^logos\/nhl\/svg\/[A-Z]{2,3}_(light|dark)\.svg$/, ttl: 86400 },
];

function cors(origin, env) {
  const allowed = env.ALLOWED_ORIGIN || '*';
  return {
    'access-control-allow-origin': allowed === '*' ? '*' : origin === allowed ? origin : allowed,
    'access-control-allow-methods': 'GET, HEAD, OPTIONS',
    'access-control-allow-headers': 'Accept',
    'access-control-max-age': '86400',
    ...(allowed === '*' ? {} : { vary: 'Origin' }),
  };
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('origin') || '';
    const headers = cors(origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers });

    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/healthz') {
      return new Response(JSON.stringify({ ok: true, service: 'nhl-led-scoreboard proxy' }), { headers: { ...headers, 'content-type': 'application/json' } });
    }
    const route = ROUTES.find((r) => url.pathname.startsWith(r.prefix));
    if (!route) return new Response('Not found', { status: 404, headers });
    const rest = url.pathname.slice(route.prefix.length);
    if (!route.allow.test(rest)) return new Response('Path not allowed', { status: 403, headers });

    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    const hit = await cache.match(cacheKey);
    if (hit) {
      const r = new Response(hit.body, hit);
      Object.entries(headers).forEach(([k, v]) => r.headers.set(k, v));
      r.headers.set('x-cache', 'HIT');
      return r;
    }

    let upstream;
    try {
      upstream = await fetch(route.upstream + rest, {
        redirect: 'follow',
        headers: { accept: route.prefix === '/nhl-api/' ? 'application/json' : 'image/svg+xml', 'user-agent': 'nhl-led-scoreboard-proxy/1.0' },
        cf: { cacheTtl: route.ttl, cacheEverything: true },
      });
    } catch (e) {
      return new Response(`Upstream error: ${e.message}`, { status: 502, headers });
    }
    const body = await upstream.arrayBuffer();
    const res = new Response(body, {
      status: upstream.status,
      headers: {
        ...headers,
        'content-type': upstream.headers.get('content-type') || 'application/octet-stream',
        'cache-control': `public, max-age=${route.ttl}`,
        'x-cache': 'MISS',
      },
    });
    if (upstream.ok) ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  },
};
