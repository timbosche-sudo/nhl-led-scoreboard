import type { RGB } from './color';
import { FONTS, type BitmapFont, type FontName } from './fonts';
import type { Framebuffer } from './framebuffer';

export interface TextStyle {
  font?: FontName | BitmapFont;
  /** Integer pixel scale. Never fractional, so glyphs stay pixel-perfect. */
  scale?: number;
  spacing?: number;
}

function resolveFont(f: TextStyle['font']): BitmapFont {
  if (!f) return FONTS.normal;
  return typeof f === 'string' ? FONTS[f] : f;
}

function glyphFor(font: BitmapFont, ch: string) {
  return font.glyphs[ch] ?? font.glyphs[ch.toUpperCase()] ?? font.glyphs['?'] ?? font.glyphs[' '];
}

export function measureText(text: string, style: TextStyle = {}): { width: number; height: number } {
  const font = resolveFont(style.font);
  const s = Math.max(1, Math.floor(style.scale ?? 1));
  const sp = style.spacing ?? font.spacing;
  let w = 0;
  const chars = [...text];
  chars.forEach((ch, i) => {
    w += glyphFor(font, ch).width * s;
    if (i < chars.length - 1) w += sp * s;
  });
  return { width: w, height: font.height * s };
}

/** Draws text with its top-left corner at (x, y). Returns the drawn width. */
export function drawText(fb: Framebuffer, text: string, x: number, y: number, color: RGB, style: TextStyle = {}): number {
  const font = resolveFont(style.font);
  const s = Math.max(1, Math.floor(style.scale ?? 1));
  const sp = style.spacing ?? font.spacing;
  let cx = Math.round(x);
  y = Math.round(y);
  for (const ch of text) {
    const g = glyphFor(font, ch);
    for (let row = 0; row < g.rows.length; row++) {
      const bits = g.rows[row];
      if (!bits) continue;
      for (let col = 0; col < g.width; col++) {
        if (bits & (1 << (g.width - 1 - col))) {
          if (s === 1) fb.set(cx + col, y + row, color);
          else fb.fillRect(cx + col * s, y + row * s, s, s, color);
        }
      }
    }
    cx += (g.width + sp) * s;
  }
  return measureText(text, style).width;
}

/** Fit text into maxWidth by trying progressively smaller fonts; returns chosen style or null. */
export function fitText(text: string, maxWidth: number, candidates: TextStyle[]): TextStyle | null {
  for (const c of candidates) if (measureText(text, c).width <= maxWidth) return c;
  return null;
}
