import { BLACK, type RGB } from './color';
import type { RGBAImage } from './image';

/**
 * The single source of truth for what the LED matrix shows.
 *
 * Framebuffer specification (shared by the browser simulator and the future
 * Raspberry Pi driver, see docs/FRAMEBUFFER_SPEC.md):
 *   - width x height pixels, origin top-left, row-major
 *   - 3 bytes per pixel: R, G, B (0-255, sRGB, no gamma or brightness applied)
 *   - total length = width * height * 3
 */
export class Framebuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  /** Number of pixel writes that fell outside the matrix. Static layouts must keep this at 0. */
  clipCount = 0;

  constructor(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new Error(`Invalid framebuffer size ${width}x${height}`);
    }
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 3);
  }

  clear(c: RGB = BLACK): void {
    for (let i = 0; i < this.data.length; i += 3) {
      this.data[i] = c[0];
      this.data[i + 1] = c[1];
      this.data[i + 2] = c[2];
    }
    this.clipCount = 0;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  set(x: number, y: number, c: RGB): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.inBounds(x, y)) {
      this.clipCount++;
      return;
    }
    const i = (y * this.width + x) * 3;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
  }

  get(x: number, y: number): RGB {
    if (!this.inBounds(x, y)) return BLACK;
    const i = (y * this.width + x) * 3;
    return [this.data[i], this.data[i + 1], this.data[i + 2]];
  }

  /** Alpha-blend a colour over the existing pixel (alpha 0-1). */
  blend(x: number, y: number, c: RGB, alpha: number): void {
    if (alpha >= 1) return this.set(x, y, c);
    if (alpha <= 0) return;
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.inBounds(x, y)) {
      this.clipCount++;
      return;
    }
    const i = (y * this.width + x) * 3;
    this.data[i] = this.data[i] + (c[0] - this.data[i]) * alpha;
    this.data[i + 1] = this.data[i + 1] + (c[1] - this.data[i + 1]) * alpha;
    this.data[i + 2] = this.data[i + 2] + (c[2] - this.data[i + 2]) * alpha;
  }

  fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c);
  }

  strokeRect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let xx = x; xx < x + w; xx++) {
      this.set(xx, y, c);
      this.set(xx, y + h - 1, c);
    }
    for (let yy = y + 1; yy < y + h - 1; yy++) {
      this.set(x, yy, c);
      this.set(x + w - 1, yy, c);
    }
  }

  /**
   * Draw an RGBA image with alpha blending. Pixels falling outside the matrix are
   * skipped silently when `clip` is true (used by sliding animations).
   */
  drawImage(img: RGBAImage, x: number, y: number, opts: { opacity?: number; brightness?: number; clip?: boolean } = {}): void {
    const opacity = opts.opacity ?? 1;
    const bright = opts.brightness ?? 1;
    x = Math.round(x);
    y = Math.round(y);
    for (let iy = 0; iy < img.height; iy++) {
      for (let ix = 0; ix < img.width; ix++) {
        const j = (iy * img.width + ix) * 4;
        const a = (img.data[j + 3] / 255) * opacity;
        if (a <= 0) continue;
        const px = x + ix;
        const py = y + iy;
        if (opts.clip && !this.inBounds(px, py)) continue;
        this.blend(px, py, [img.data[j] * bright, img.data[j + 1] * bright, img.data[j + 2] * bright], a);
      }
    }
  }

  /** Raw RGB24 bytes, exactly what a hardware driver consumes. */
  toRawRGB(): Uint8Array {
    return new Uint8Array(this.data);
  }

  /** RGBA copy (alpha = 255) for canvas ImageData or PNG encoding. */
  toRGBA(): Uint8ClampedArray {
    const out = new Uint8ClampedArray(this.width * this.height * 4);
    for (let p = 0, q = 0; p < this.data.length; p += 3, q += 4) {
      out[q] = this.data[p];
      out[q + 1] = this.data[p + 1];
      out[q + 2] = this.data[p + 2];
      out[q + 3] = 255;
    }
    return out;
  }

  /** Count of lit (non-black) pixels; handy for tests and diagnostics. */
  litCount(): number {
    let n = 0;
    for (let i = 0; i < this.data.length; i += 3) if (this.data[i] | this.data[i + 1] | this.data[i + 2]) n++;
    return n;
  }

  /** Cheap FNV-1a hash used to skip redundant redraws in the simulator. */
  hash(): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < this.data.length; i++) {
      h ^= this.data[i];
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }
}
