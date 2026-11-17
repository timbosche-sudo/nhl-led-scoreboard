/** An sRGB colour as a [r, g, b] tuple of 0-255 integers. */
export type RGB = readonly [number, number, number];

export const BLACK: RGB = [0, 0, 0];
export const WHITE: RGB = [255, 255, 255];
export const GOLD: RGB = [252, 181, 20];
export const AMBER: RGB = [255, 140, 0];
export const RED: RGB = [230, 30, 30];
export const GRAY: RGB = [110, 110, 110];
export const DIM: RGB = [60, 60, 60];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

export function scale([r, g, b]: RGB, f: number): RGB {
  return [clamp(r * f), clamp(g * f), clamp(b * f)];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [clamp(a[0] + (b[0] - a[0]) * t), clamp(a[1] + (b[1] - a[1]) * t), clamp(a[2] + (b[2] - a[2]) * t)];
}

export function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/** Perceived luminance 0-255. */
export function luminance([r, g, b]: RGB): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Make a colour readable on a black LED matrix. Very dark brand colours (navy,
 * black) are nearly invisible when lit at low duty cycle, so scale the colour up
 * until its brightest channel reaches `minPeak`, keeping its hue.
 */
export function ledSafe(c: RGB, minPeak = 170): RGB {
  const peak = Math.max(c[0], c[1], c[2]);
  if (peak === 0) return [minPeak, minPeak, minPeak];
  if (peak >= minPeak) return c;
  return scale(c, minPeak / peak);
}
