#!/usr/bin/env node
/*
 * Zero-dependency server for the built scoreboard (dist/) plus an NHL API proxy.
 * Used for local testing and, later, on the Raspberry Pi so the iPad can open the
 * control panel at http://<pi-address>:8080 on the home network.
 *
 *   /nhl-api/...     -> https://api-web.nhle.com/...   (JSON, cached ~15 s)
 *   /nhl-assets/...  -> https://assets.nhle.com/...    (logos, cached 24 h)
 *   everything else  -> static files from dist/
 *
 * Only GET/HEAD and a fixed set of upstream path prefixes are allowed, so this is not an open proxy.
 * Usage: npm run build && npm run serve      (PORT=8080 HOST=0.0.0.0 by default)
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)), 'dist');
const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';

const ROUTES = [
  { prefix: '/nhl-api/', upstream: 'https://api-web.nhle.com/', allow: /^v1\/(score|schedule|scoreboard|club-schedule|standings|gamecenter)\//, ttl: 15_000 },
  { prefix: '/nhl-assets/', upstream: 'https://assets.nhle.com/', allow: /^logos\/nhl\/svg\/[A-Z]{2,3}_(light|dark)\.svg$/, ttl: 86_400_000 },
];

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

const cache = new Map(); // url -> { at, status, type, body }

async function proxy(route, rest, res) {
  if (!route.allow.test(rest)) {
    res.writeHead(403, { 'content-type': 'text/plain' }).end('Path not allowed');
    return;
  }
  const url = route.upstream + rest;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < route.ttl) {
    res.writeHead(hit.status, { 'content-type': hit.type, 'x-cache': 'HIT', 'access-control-allow-origin': '*' }).end(hit.body);
    return;
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const up = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'user-agent': 'nhl-led-scoreboard/0.1 (personal scoreboard)' } });
    clearTimeout(timer);
    const body = Buffer.from(await up.arrayBuffer());
    const type = up.headers.get('content-type') ?? 'application/octet-stream';
    if (up.ok) cache.set(url, { at: Date.now(), status: up.status, type, body });
    res.writeHead(up.status, { 'content-type': type, 'x-cache': 'MISS', 'access-control-allow-origin': '*' }).end(body);
  } catch (e) {
    if (hit) {
      // upstream down: serve the last good copy, clearly marked
      res.writeHead(hit.status, { 'content-type': hit.type, 'x-cache': 'STALE', 'access-control-allow-origin': '*' }).end(hit.body);
      return;
    }
    res.writeHead(502, { 'content-type': 'text/plain' }).end(`Upstream error: ${e.message}`);
  }
}

async function serveStatic(pathname, res) {
  let p = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  if (p.endsWith('/')) p += 'index.html';
  const file = join(ROOT, p);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error('not a file');
    const body = await readFile(file);
    const long = p.startsWith('/assets/');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': long ? 'public, max-age=31536000, immutable' : 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  if (pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, uptime: process.uptime() }));
    return;
  }
  for (const r of ROUTES) if (pathname.startsWith(r.prefix)) return proxy(r, pathname.slice(r.prefix.length), res);
  return serveStatic(pathname, res);
});

server.listen(PORT, HOST, () => {
  console.log(`NHL LED scoreboard: http://localhost:${PORT}  (on your network: http://<this-computer-ip>:${PORT})`);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
