import type { RGBAImage } from '../core/image';
import { fitLogo, type ResizeMethod } from '../core/resize';

/** What layouts need from the logo system: a fitted image, or null => draw a labelled placeholder. */
export interface LogoSource {
  get(abbrev: string, maxW: number, maxH: number): RGBAImage | null;
}

export type LogoState = 'missing' | 'loading' | 'ready' | 'error';

/**
 * Holds high-resolution source rasters per team and produces LED-sized versions
 * on demand (cached per size + method). Pure TypeScript: the browser feeds it
 * rasterised SVGs, tests feed it synthetic images, the Pi can feed it PNGs.
 */
export class LogoCache implements LogoSource {
  private sources = new Map<string, RGBAImage>();
  private fitted = new Map<string, RGBAImage | null>();
  private states = new Map<string, LogoState>();
  private errors = new Map<string, string>();
  method: ResizeMethod;
  /** Per-team method chosen in the logo gallery (e.g. nearest for a busy logo). */
  overrides: Record<string, ResizeMethod> = {};

  constructor(method: ResizeMethod = 'led') {
    this.method = method;
  }

  setMethod(m: ResizeMethod): void {
    if (m !== this.method) {
      this.method = m;
      this.fitted.clear();
    }
  }

  setOverrides(o: Record<string, ResizeMethod>): void {
    const same = JSON.stringify(o) === JSON.stringify(this.overrides);
    if (!same) {
      this.overrides = { ...o };
      this.fitted.clear();
    }
  }

  methodFor(abbrev: string): ResizeMethod {
    return this.overrides[abbrev] ?? this.method;
  }

  setSource(abbrev: string, img: RGBAImage): void {
    this.sources.set(abbrev, img);
    this.states.set(abbrev, 'ready');
    this.errors.delete(abbrev);
    for (const k of [...this.fitted.keys()]) if (k.startsWith(abbrev + '|')) this.fitted.delete(k);
  }

  setState(abbrev: string, s: LogoState, error?: string): void {
    this.states.set(abbrev, s);
    if (error) this.errors.set(abbrev, error);
  }

  state(abbrev: string): LogoState {
    return this.states.get(abbrev) ?? 'missing';
  }

  error(abbrev: string): string | undefined {
    return this.errors.get(abbrev);
  }

  hasSource(abbrev: string): boolean {
    return this.sources.has(abbrev);
  }

  getSource(abbrev: string): RGBAImage | undefined {
    return this.sources.get(abbrev);
  }

  get(abbrev: string, maxW: number, maxH: number, method: ResizeMethod = this.methodFor(abbrev)): RGBAImage | null {
    const src = this.sources.get(abbrev);
    if (!src) return null;
    const key = `${abbrev}|${maxW}x${maxH}|${method}`;
    if (!this.fitted.has(key)) this.fitted.set(key, fitLogo(src, maxW, maxH, method));
    return this.fitted.get(key) ?? null;
  }
}

export const NO_LOGOS: LogoSource = { get: () => null };
