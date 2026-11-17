import { createImage, type RGBAImage } from './image';

export type ResizeMethod = 'nearest' | 'bilinear' | 'area' | 'led';

export const RESIZE_METHODS: { id: ResizeMethod; label: string; description: string }[] = [
  { id: 'nearest', label: 'Nearest neighbour', description: 'Picks one source pixel per LED. Crisp but drops thin details and aliases.' },
  { id: 'bilinear', label: 'Bilinear', description: 'Blends the 4 nearest source pixels. Smooth but can skip detail at large reductions.' },
  { id: 'area', label: 'Area average', description: 'Averages every source pixel covered by an LED (high-quality downsampling).' },
  { id: 'led', label: 'LED optimised', description: 'Area average + sharpen, hard alpha edges, black outlines left unlit, dark brand colours lifted.' },
];

/** Bounding box of pixels with alpha above threshold. Returns null for an empty image. */
export function alphaBounds(img: RGBAImage, threshold = 8): { x: number; y: number; w: number; h: number } | null {
  let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function crop(img: RGBAImage, x: number, y: number, w: number, h: number): RGBAImage {
  const out = createImage(w, h);
  for (let yy = 0; yy < h; yy++) {
    const src = ((y + yy) * img.width + x) * 4;
    out.data.set(img.data.subarray(src, src + w * 4), yy * w * 4);
  }
  return out;
}

/** Largest size that fits in maxW x maxH while preserving aspect ratio (min 1x1). */
export function fitSize(srcW: number, srcH: number, maxW: number, maxH: number): { width: number; height: number } {
  const s = Math.min(maxW / srcW, maxH / srcH);
  return { width: Math.max(1, Math.min(maxW, Math.round(srcW * s))), height: Math.max(1, Math.min(maxH, Math.round(srcH * s))) };
}

function nearest(src: RGBAImage, w: number, h: number): RGBAImage {
  const out = createImage(w, h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(src.height - 1, Math.floor(((y + 0.5) * src.height) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.width - 1, Math.floor(((x + 0.5) * src.width) / w));
      const s = (sy * src.width + sx) * 4;
      const d = (y * w + x) * 4;
      out.data[d] = src.data[s];
      out.data[d + 1] = src.data[s + 1];
      out.data[d + 2] = src.data[s + 2];
      out.data[d + 3] = src.data[s + 3];
    }
  }
  return out;
}

function bilinear(src: RGBAImage, w: number, h: number): RGBAImage {
  const out = createImage(w, h);
  const px = (x: number, y: number, c: number) => src.data[(y * src.width + x) * 4 + c];
  for (let y = 0; y < h; y++) {
    const fy = Math.max(0, ((y + 0.5) * src.height) / h - 0.5);
    const y0 = Math.min(src.height - 1, Math.floor(fy));
    const y1 = Math.min(src.height - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.max(0, ((x + 0.5) * src.width) / w - 0.5);
      const x0 = Math.min(src.width - 1, Math.floor(fx));
      const x1 = Math.min(src.width - 1, x0 + 1);
      const tx = fx - x0;
      const d = (y * w + x) * 4;
      // premultiplied interpolation so transparent pixels don't bleed black
      let a = 0, r = 0, g = 0, b = 0;
      for (const [sx, sy, wt] of [[x0, y0, (1 - tx) * (1 - ty)], [x1, y0, tx * (1 - ty)], [x0, y1, (1 - tx) * ty], [x1, y1, tx * ty]] as const) {
        const al = px(sx, sy, 3) / 255;
        a += al * wt;
        r += px(sx, sy, 0) * al * wt;
        g += px(sx, sy, 1) * al * wt;
        b += px(sx, sy, 2) * al * wt;
      }
      out.data[d + 3] = a * 255;
      if (a > 0) {
        out.data[d] = r / a;
        out.data[d + 1] = g / a;
        out.data[d + 2] = b / a;
      }
    }
  }
  return out;
}

function area(src: RGBAImage, w: number, h: number): RGBAImage {
  const out = createImage(w, h);
  const sxScale = src.width / w;
  const syScale = src.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = y * syScale, y1 = (y + 1) * syScale;
    for (let x = 0; x < w; x++) {
      const x0 = x * sxScale, x1 = (x + 1) * sxScale;
      let a = 0, r = 0, g = 0, b = 0, total = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        if (wy <= 0 || sy >= src.height) continue;
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx);
          if (wx <= 0 || sx >= src.width) continue;
          const wt = wx * wy;
          const i = (sy * src.width + sx) * 4;
          const al = src.data[i + 3] / 255;
          a += al * wt;
          r += src.data[i] * al * wt;
          g += src.data[i + 1] * al * wt;
          b += src.data[i + 2] * al * wt;
          total += wt;
        }
      }
      const d = (y * w + x) * 4;
      if (total > 0 && a > 0) {
        out.data[d] = r / a;
        out.data[d + 1] = g / a;
        out.data[d + 2] = b / a;
        out.data[d + 3] = (a / total) * 255;
      }
    }
  }
  return out;
}

/** Mild 3x3 unsharp mask on colour channels (alpha untouched) to restore edges lost by averaging. */
export function sharpen(img: RGBAImage, amount = 0.5): RGBAImage {
  const { width: w, height: h, data } = img;
  const out = createImage(w, h);
  out.data.set(data);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] === 0) continue;
      for (let c = 0; c < 3; c++) {
        let sum = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const j = (yy * w + xx) * 4;
            if (data[j + 3] === 0) continue;
            sum += data[j + c];
            n++;
          }
        out.data[i + c] = data[i + c] + (data[i + c] - sum / n) * amount;
      }
    }
  return out;
}

/**
 * Post-process an area-averaged image for a black LED panel:
 *  - LEDs can't be "half transparent" against black, so alpha is thresholded:
 *    weak edge pixels are dropped, the rest become fully opaque.
 *  - A mild sharpen restores edges that averaging softened.
 *  - Near-black, unsaturated pixels (logo outlines) become unlit: on a black panel
 *    an unlit LED *is* the outline, which keeps details separated.
 *  - Dark but saturated brand colours (navy, deep green) are lifted so they stay visible.
 *  - Saturation is boosted a little because averaging washes colours out.
 */
export function ledOptimize(img: RGBAImage, opts: { alphaThreshold?: number; saturation?: number; minPeak?: number; blackCutoff?: number; sharpenAmount?: number } = {}): RGBAImage {
  const at = (opts.alphaThreshold ?? 0.4) * 255;
  const sat = opts.saturation ?? 1.2;
  const minPeak = opts.minPeak ?? 96;
  const cutoff = opts.blackCutoff ?? 48;
  const src = sharpen(img, opts.sharpenAmount ?? 0.45);
  const out = createImage(img.width, img.height);
  for (let i = 0; i < src.data.length; i += 4) {
    if (img.data[i + 3] < at) continue;
    let r = src.data[i], g = src.data[i + 1], b = src.data[i + 2];
    const peak = Math.max(r, g, b);
    const chroma = peak - Math.min(r, g, b);
    if (peak < cutoff * 0.75 || (peak < cutoff && chroma < peak * 0.6)) continue; // outline -> unlit LED
    const avg = (r + g + b) / 3;
    r = avg + (r - avg) * sat;
    g = avg + (g - avg) * sat;
    b = avg + (b - avg) * sat;
    const p2 = Math.max(r, g, b, 1);
    if (p2 < minPeak) {
      const k = minPeak / p2;
      r *= k; g *= k; b *= k;
    }
    out.data[i] = r;
    out.data[i + 1] = g;
    out.data[i + 2] = b;
    out.data[i + 3] = 255;
  }
  return out;
}

export function resize(src: RGBAImage, w: number, h: number, method: ResizeMethod): RGBAImage {
  switch (method) {
    case 'nearest':
      return nearest(src, w, h);
    case 'bilinear':
      return bilinear(src, w, h);
    case 'area':
      return area(src, w, h);
    case 'led':
      return ledOptimize(area(src, w, h));
  }
}

/** Trim transparent margins, then scale to fit maxW x maxH preserving aspect ratio. */
export function fitLogo(src: RGBAImage, maxW: number, maxH: number, method: ResizeMethod): RGBAImage | null {
  const bb = alphaBounds(src);
  if (!bb) return null;
  const trimmed = crop(src, bb.x, bb.y, bb.w, bb.h);
  const { width, height } = fitSize(bb.w, bb.h, maxW, maxH);
  return resize(trimmed, width, height, method);
}
