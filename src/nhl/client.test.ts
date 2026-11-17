import { describe, expect, it, vi } from 'vitest';
import { ApiError, NhlClient, buildEndpoints, DIRECT_ENDPOINT } from './client';
import { NhlDataService, type DataSnapshot } from './service';
import { apiGame } from '../test/helpers';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const noSleep = () => Promise.resolve();

describe('buildEndpoints', () => {
  it('puts a configured proxy first and strips trailing slashes', () => {
    const eps = buildEndpoints('https://nhl-proxy.example.workers.dev/');
    expect(eps[0].api).toBe('https://nhl-proxy.example.workers.dev/nhl-api');
    expect(eps[0].assets).toBe('https://nhl-proxy.example.workers.dev/nhl-assets');
    expect(eps.map((e) => e.id)).toEqual(['proxy', 'same-origin', 'direct']);
  });
  it('ignores junk proxy values', () => {
    expect(buildEndpoints('javascript:alert(1)').map((e) => e.id)).toEqual(['same-origin', 'direct']);
  });
});

describe('NhlClient', () => {
  it('falls through endpoints until one returns JSON, then remembers it', async () => {
    const calls: string[] = [];
    const fetchFn = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.startsWith('./nhl-api')) return new Response('<html>404</html>', { status: 404 });
      return json({ games: [] });
    }) as unknown as typeof fetch;
    const c = new NhlClient({ endpoints: buildEndpoints(''), fetchFn, sleep: noSleep, cacheTtlMs: 0 });
    const r = await c.getJson('/v1/score/2026-11-17');
    expect(r.endpoint.id).toBe('direct');
    expect(calls).toEqual(['./nhl-api/v1/score/2026-11-17', 'https://api-web.nhle.com/v1/score/2026-11-17']);
    await c.getJson('/v1/score/2026-11-18');
    expect(calls[2]).toBe('https://api-web.nhle.com/v1/score/2026-11-18');
  });

  it('retries transient errors with backoff', async () => {
    let n = 0;
    const fetchFn = (async () => (++n < 2 ? json({}, 503) : json({ ok: true }))) as unknown as typeof fetch;
    const sleep = vi.fn(noSleep);
    const c = new NhlClient({ endpoints: [DIRECT_ENDPOINT], fetchFn, sleep, retries: 2 });
    const r = await c.getJson('/x');
    expect(r.data).toEqual({ ok: true });
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('times out hung requests', async () => {
    const fetchFn = ((_u: string, init: RequestInit) =>
      new Promise((_, rej) => init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))) as unknown as typeof fetch;
    const c = new NhlClient({ endpoints: [DIRECT_ENDPOINT], fetchFn, sleep: noSleep, retries: 0, timeoutMs: 20 });
    await expect(c.getJson('/x')).rejects.toBeInstanceOf(ApiError);
    expect(c.diagnostics.lastError).toMatch(/Timed out/);
  });

  it('reports a CORS/network failure on every endpoint as ApiError', async () => {
    const fetchFn = (async () => {
      throw new TypeError('Load failed');
    }) as unknown as typeof fetch;
    const c = new NhlClient({ endpoints: buildEndpoints(''), fetchFn, sleep: noSleep });
    const err = await c.getJson('/x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.attempts).toHaveLength(2);
    expect(c.diagnostics.failures).toBe(1);
  });

  it('serves identical requests from the short cache', async () => {
    const fetchFn = vi.fn(async () => json({ a: 1 })) as unknown as typeof fetch;
    let t = 1000;
    const c = new NhlClient({ endpoints: [DIRECT_ENDPOINT], fetchFn, cacheTtlMs: 5000, now: () => t });
    await c.getJson('/x');
    t += 1000;
    const r = await c.getJson('/x');
    expect(r.fromCache).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('NhlDataService', () => {
  it('keeps last known games and flags stale on failure (never invents data)', async () => {
    let fail = false;
    const fetchFn = (async (url: string) => {
      if (fail) throw new TypeError('Load failed');
      if (url.includes('/score/')) return json({ games: [apiGame({ awayScore: 2, homeScore: 1 })] });
      return json({ gameWeek: [] });
    }) as unknown as typeof fetch;
    const client = new NhlClient({ endpoints: [DIRECT_ENDPOINT], fetchFn, sleep: noSleep, cacheTtlMs: 0 });
    const snaps: DataSnapshot[] = [];
    const svc = new NhlDataService({ client, timeZone: () => 'America/Chicago', onUpdate: (s) => snaps.push(s), now: () => Date.parse('2026-11-18T02:00:00Z') });
    await svc.tick();
    expect(svc.snapshot.status).toBe('ok');
    expect(svc.snapshot.date).toBe('2026-11-17');
    expect(svc.snapshot.games[0].away.score).toBe(2);
    fail = true;
    await svc.tick();
    expect(svc.snapshot.status).toBe('error');
    expect(svc.snapshot.stale).toBe(true);
    expect(svc.snapshot.games[0].away.score).toBe(2);
    expect(svc.snapshot.error).toMatch(/unavailable/);
  });
});
