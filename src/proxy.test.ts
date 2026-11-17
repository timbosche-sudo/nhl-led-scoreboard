import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain JS module deployed to Cloudflare Workers
import worker from '../proxy/cloudflare-worker.js';

const store = new Map<string, Response>();
const caches = { default: { match: async (r: Request) => store.get(r.url)?.clone(), put: async (r: Request, res: Response) => void store.set(r.url, res) } };
const ctx = { waitUntil: (p: Promise<unknown>) => p };

afterEach(() => {
  vi.unstubAllGlobals();
  store.clear();
});

describe('Cloudflare Worker proxy', () => {
  it('forwards allowed NHL API paths with CORS headers, then serves from cache', async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response('{"games":[]}', { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('caches', caches);
    const req = new Request('https://p.example.workers.dev/nhl-api/v1/score/2026-11-17', { headers: { origin: 'https://me.github.io' } });
    const res = await worker.fetch(req, {}, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(await res.json()).toEqual({ games: [] });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api-web.nhle.com/v1/score/2026-11-17');
    await new Promise((r) => setTimeout(r, 0));
    const again = await worker.fetch(req, {}, ctx);
    expect(again.headers.get('x-cache')).toBe('HIT');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('maps logo paths to assets.nhle.com', async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('caches', caches);
    await worker.fetch(new Request('https://p.dev/nhl-assets/logos/nhl/svg/STL_dark.svg'), {}, ctx);
    expect(fetchMock.mock.calls[0][0]).toBe('https://assets.nhle.com/logos/nhl/svg/STL_dark.svg');
  });
  it('refuses anything outside the allow-list (not an open proxy)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('caches', caches);
    for (const path of ['/nhl-api/v2/anything', '/nhl-api/../../etc', '/nhl-assets/logos/nhl/svg/x.js', '/https://evil.example/']) {
      const res = await worker.fetch(new Request('https://p.dev' + path), {}, ctx);
      expect([403, 404]).toContain(res.status);
    }
    expect((await worker.fetch(new Request('https://p.dev/nhl-api/v1/score/now', { method: 'POST' }), {}, ctx)).status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('honours ALLOWED_ORIGIN', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
    vi.stubGlobal('caches', caches);
    const res = await worker.fetch(new Request('https://p.dev/nhl-api/v1/schedule/now', { headers: { origin: 'https://me.github.io' } }), { ALLOWED_ORIGIN: 'https://me.github.io' }, ctx);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://me.github.io');
  });
});
