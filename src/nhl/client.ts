/* Resilient HTTP client for the NHL web API.
 *
 * The NHL API does not send CORS headers, so a browser on GitHub Pages cannot
 * call it directly. The client therefore tries a list of "endpoints", each a
 * pair of base URLs that expose the same paths:
 *   1. a user-configured proxy (Cloudflare Worker in proxy/, or the Pi server)
 *   2. the same origin (Vite dev server / Raspberry Pi server: ./nhl-api)
 *   3. the NHL hosts directly (works from Node, and from browsers only if the NHL
 *      ever enables CORS)
 * The first endpoint that answers with valid JSON is remembered. */

export interface Endpoint {
  id: string;
  label: string;
  /** Base for api-web.nhle.com paths, e.g. "https://x.workers.dev/nhl-api". */
  api: string;
  /** Base for assets.nhle.com paths, e.g. "https://x.workers.dev/nhl-assets". */
  assets: string;
}

export const DIRECT_ENDPOINT: Endpoint = {
  id: 'direct',
  label: 'NHL direct (api-web.nhle.com)',
  api: 'https://api-web.nhle.com',
  assets: 'https://assets.nhle.com',
};

export function proxyEndpoint(proxyUrl: string): Endpoint {
  const base = proxyUrl.trim().replace(/\/+$/, '');
  return { id: 'proxy', label: `Proxy (${base})`, api: `${base}/nhl-api`, assets: `${base}/nhl-assets` };
}

export const SAME_ORIGIN_ENDPOINT: Endpoint = { id: 'same-origin', label: 'Same-origin proxy (/nhl-api)', api: './nhl-api', assets: './nhl-assets' };

export function buildEndpoints(proxyUrl: string | null | undefined): Endpoint[] {
  const list: Endpoint[] = [];
  if (proxyUrl && /^https?:\/\//i.test(proxyUrl.trim())) list.push(proxyEndpoint(proxyUrl));
  list.push(SAME_ORIGIN_ENDPOINT, DIRECT_ENDPOINT);
  return list;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly attempts: { endpoint: string; error: string }[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ClientOptions {
  endpoints: Endpoint[];
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  /** Extra attempts per endpoint after the first. */
  retries?: number;
  backoffMs?: number;
  /** Identical requests within this window are served from memory. */
  cacheTtlMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface FetchResult<T> {
  data: T;
  fetchedAt: number;
  fromCache: boolean;
  endpoint: Endpoint;
}

export interface ClientDiagnostics {
  activeEndpoint: string | null;
  lastError: string | null;
  lastErrorAt: number | null;
  lastSuccessAt: number | null;
  requests: number;
  failures: number;
}

export class NhlClient {
  private endpoints: Endpoint[];
  private active: Endpoint | null = null;
  private cache = new Map<string, { at: number; data: unknown; endpoint: Endpoint }>();
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly backoffMs: number;
  private readonly cacheTtlMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  readonly diagnostics: ClientDiagnostics = {
    activeEndpoint: null,
    lastError: null,
    lastErrorAt: null,
    lastSuccessAt: null,
    requests: 0,
    failures: 0,
  };

  constructor(opts: ClientOptions) {
    this.endpoints = opts.endpoints;
    this.fetchFn = opts.fetchFn ?? ((...a) => fetch(...a));
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.retries = opts.retries ?? 1;
    this.backoffMs = opts.backoffMs ?? 800;
    this.cacheTtlMs = opts.cacheTtlMs ?? 5_000;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? Date.now;
  }

  get activeEndpoint(): Endpoint | null {
    return this.active;
  }

  setEndpoints(endpoints: Endpoint[]): void {
    this.endpoints = endpoints;
    this.active = null;
    this.cache.clear();
  }

  private async fetchJsonOnce(url: string): Promise<unknown> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      this.diagnostics.requests++;
      const res = await this.fetchFn(url, { signal: ctrl.signal, headers: { Accept: 'application/json' }, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error('Response was not JSON');
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw new Error(`Timed out after ${this.timeoutMs} ms`);
      throw e instanceof Error ? e : new Error(String(e));
    } finally {
      clearTimeout(timer);
    }
  }

  /** GET an api-web.nhle.com path (e.g. "/v1/score/2026-11-17"). */
  async getJson(path: string): Promise<FetchResult<unknown>> {
    const cached = this.cache.get(path);
    if (cached && this.now() - cached.at < this.cacheTtlMs) {
      return { data: cached.data, fetchedAt: cached.at, fromCache: true, endpoint: cached.endpoint };
    }
    const order = this.active ? [this.active, ...this.endpoints.filter((e) => e.id !== this.active!.id)] : this.endpoints;
    const attempts: { endpoint: string; error: string }[] = [];
    for (const ep of order) {
      for (let attempt = 0; attempt <= this.retries; attempt++) {
        if (attempt > 0) await this.sleep(this.backoffMs * 2 ** (attempt - 1) * (0.75 + Math.random() * 0.5));
        try {
          const data = await this.fetchJsonOnce(ep.api + path);
          const at = this.now();
          this.active = ep;
          this.cache.set(path, { at, data, endpoint: ep });
          this.diagnostics.activeEndpoint = ep.label;
          this.diagnostics.lastSuccessAt = at;
          return { data, fetchedAt: at, fromCache: false, endpoint: ep };
        } catch (e) {
          const msg = (e as Error).message || String(e);
          attempts.push({ endpoint: ep.label, error: msg });
          // A CORS block / DNS failure / HTML 404 won't fix itself on retry; move to next endpoint.
          if (/not JSON|HTTP 4\d\d|Failed to fetch|Load failed|NetworkError|CORS/i.test(msg)) break;
        }
      }
    }
    this.active = null;
    this.diagnostics.failures++;
    this.diagnostics.lastErrorAt = this.now();
    this.diagnostics.lastError = attempts.map((a) => `${a.endpoint}: ${a.error}`).join(' | ') || 'No endpoints configured';
    throw new ApiError('NHL data unavailable from every configured endpoint', attempts);
  }
}
