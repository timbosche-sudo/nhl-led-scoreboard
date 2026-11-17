import type { RGBAImage } from '../core/image';
import type { Endpoint } from '../nhl/client';
import type { LogoCache } from '../logos/logoCache';
import { logoPath } from '../teams/teams';

/** Where each team's logo came from (shown in the gallery as an attribution/source record). */
export interface LogoRecord {
  abbrev: string;
  url: string | null;
  sourceLabel: string | null;
  loadedAt: number | null;
  error: string | null;
}

const RASTER_SIZE = 384;

function loadImage(src: string, crossOrigin = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = src;
  });
}

/** Rasterise an <img> (SVG) to straight RGBA at a generous size; the pure-TS pipeline does the downsampling. */
function rasterize(img: HTMLImageElement): RGBAImage {
  // Safari reports 0x0 natural size for some SVGs without width/height; fall back to a square.
  const nw = img.naturalWidth || RASTER_SIZE;
  const nh = img.naturalHeight || RASTER_SIZE;
  const s = RASTER_SIZE / Math.max(nw, nh);
  const w = Math.max(1, Math.round(nw * s));
  const h = Math.max(1, Math.round(nh * s));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data; // throws SecurityError if the canvas is tainted
  // getImageData returns premultiplied-then-unpremultiplied data, which is already straight alpha.
  return { width: w, height: h, data: new Uint8ClampedArray(data) };
}

/**
 * NHL SVGs only carry a viewBox (e.g. "0 0 960 640") and no width/height. Safari then
 * reports a default 300x150 (or 0x0) intrinsic size and the logo would be distorted, so
 * give the root element explicit dimensions derived from the viewBox.
 */
export function withIntrinsicSize(svg: string): string {
  return svg.replace(/<svg\b([^>]*)>/i, (whole, attrs: string) => {
    if (/\swidth\s*=/.test(attrs) && /\sheight\s*=/.test(attrs)) return whole;
    const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(attrs);
    if (!vb) return whole;
    const w = parseFloat(vb[1]);
    const h = parseFloat(vb[2]);
    if (!(w > 0 && h > 0)) return whole;
    const s = RASTER_SIZE / Math.max(w, h);
    const cleaned = attrs.replace(/\s(width|height)\s*=\s*["'][^"']*["']/gi, '');
    return `<svg${cleaned} width="${Math.round(w * s)}" height="${Math.round(h * s)}">`;
  });
}

async function fetchSvgAsImage(url: string, timeoutMs = 10_000): Promise<HTMLImageElement> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!/<svg[\s>]/i.test(text)) throw new Error('not an SVG');
    const blobUrl = URL.createObjectURL(new Blob([withIntrinsicSize(text)], { type: 'image/svg+xml' }));
    try {
      return await loadImage(blobUrl);
    } finally {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    }
  } finally {
    clearTimeout(t);
  }
}

/**
 * Loads official NHL SVG logos (assets.nhle.com) through the same endpoint chain as the
 * data client, plus an optional local cache in ./logos/nhl/ created by `npm run fetch-logos`.
 * Logos that cannot be retrieved stay missing and are drawn as labelled placeholders.
 */
export class BrowserLogoLoader {
  records = new Map<string, LogoRecord>();
  private inflight = new Map<string, Promise<void>>();

  constructor(
    private cache: LogoCache,
    private endpoints: () => Endpoint[],
    private variant: () => 'dark' | 'light',
    private onChange: () => void,
  ) {}

  reset(): void {
    this.records.clear();
    this.inflight.clear();
  }

  ensure(abbrev: string): Promise<void> {
    const key = `${abbrev}_${this.variant()}`;
    if (this.cache.hasSource(abbrev) && this.records.get(abbrev)?.url?.includes(`_${this.variant()}`)) return Promise.resolve();
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const p = this.load(abbrev).finally(() => this.onChange());
    this.inflight.set(key, p);
    return p;
  }

  ensureAll(abbrevs: string[]): void {
    for (const a of abbrevs) void this.ensure(a);
  }

  private async load(abbrev: string): Promise<void> {
    const variant = this.variant();
    const path = logoPath(abbrev, variant);
    const candidates: { url: string; label: string }[] = [
      { url: `${import.meta.env.BASE_URL}logos/nhl/${abbrev}_${variant}.svg`, label: 'Local cache (fetched from assets.nhle.com)' },
      ...this.endpoints().map((e) => ({ url: e.assets + path, label: `${e.label} → assets.nhle.com` })),
    ];
    this.cache.setState(abbrev, 'loading');
    this.onChange();
    const errors: string[] = [];
    for (const c of candidates) {
      try {
        const img = await fetchSvgAsImage(c.url);
        this.cache.setSource(abbrev, rasterize(img));
        this.records.set(abbrev, { abbrev, url: c.url, sourceLabel: c.label, loadedAt: Date.now(), error: null });
        return;
      } catch (e) {
        errors.push(`${c.url}: ${(e as Error).message}`);
      }
    }
    // Last resort: CORS-enabled <img> straight from the NHL CDN (works only if it sends CORS headers).
    try {
      const url = `https://assets.nhle.com${path}`;
      const img = await loadImage(url, true);
      this.cache.setSource(abbrev, rasterize(img));
      this.records.set(abbrev, { abbrev, url, sourceLabel: 'assets.nhle.com (direct, CORS image)', loadedAt: Date.now(), error: null });
      return;
    } catch (e) {
      errors.push(`direct <img>: ${(e as Error).message}`);
    }
    const msg = errors.join(' | ');
    this.cache.setState(abbrev, 'error', msg);
    this.records.set(abbrev, { abbrev, url: null, sourceLabel: null, loadedAt: null, error: msg });
  }
}
