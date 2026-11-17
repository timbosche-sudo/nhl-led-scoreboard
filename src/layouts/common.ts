import { AMBER, GOLD, WHITE, mix, type RGB } from '../core/color';
import { measureText, drawText, fitText, type TextStyle } from '../core/text';
import { teamLedColor } from '../teams/teams';
import { place, type Box, type RenderContext } from './context';

export const STYLE_TINY: TextStyle = { font: 'tiny' };
export const STYLE_NORMAL: TextStyle = { font: 'normal' };

/** Draw text centred in a box (horizontally; top-aligned at box.y unless vCenter). Records its real bounds. */
export function textCentered(ctx: RenderContext, name: string, text: string, box: Box, color: RGB, style: TextStyle, vCenter = false): Box {
  const m = measureText(text, style);
  const x = box.x + Math.floor((box.w - m.width) / 2);
  const y = vCenter ? box.y + Math.floor((box.h - m.height) / 2) : box.y;
  drawText(ctx.fb, text, x, y, color, style);
  return place(ctx, name, { x, y, w: m.width, h: m.height });
}

/** Pick the first style whose rendering of `text` fits in `maxW`; falls back to the smallest one. */
export function bestStyle(text: string, maxW: number, candidates: TextStyle[]): TextStyle {
  return fitText(text, maxW, candidates) ?? candidates[candidates.length - 1];
}

/**
 * Draws a team logo fitted into `box`, centred. When no real logo is available
 * a clearly-marked placeholder is drawn instead: a dotted frame in the team
 * colour with the abbreviation. It never imitates the real logo.
 */
export function drawLogo(ctx: RenderContext, name: string, abbrev: string, box: Box, opts: { brightness?: number; dx?: number; clip?: boolean } = {}): Box {
  const img = ctx.logos.get(abbrev, box.w, box.h);
  const dx = opts.dx ?? 0;
  if (img) {
    const x = box.x + Math.floor((box.w - img.width) / 2) + dx;
    const y = box.y + Math.floor((box.h - img.height) / 2);
    ctx.fb.drawImage(img, x, y, { brightness: opts.brightness, clip: opts.clip });
    return opts.clip ? { x, y, w: img.width, h: img.height } : place(ctx, name, { x, y, w: img.width, h: img.height });
  }
  return drawPlaceholder(ctx, name, abbrev, { ...box, x: box.x + dx }, opts.clip);
}

export function drawPlaceholder(ctx: RenderContext, name: string, abbrev: string, box: Box, clip = false): Box {
  const c = teamLedColor(abbrev);
  const dim = mix([0, 0, 0], c, 0.55);
  const set = (x: number, y: number, col: typeof c) => {
    if (clip && !ctx.fb.inBounds(x, y)) return;
    ctx.fb.set(x, y, col);
  };
  // dotted frame = "this is not a logo"
  for (let x = box.x; x < box.x + box.w; x++) {
    if ((x - box.x) % 2 === 0) {
      set(x, box.y, dim);
      set(x, box.y + box.h - 1, dim);
    }
  }
  for (let y = box.y; y < box.y + box.h; y++) {
    if ((y - box.y) % 2 === 0) {
      set(box.x, y, dim);
      set(box.x + box.w - 1, y, dim);
    }
  }
  const style = bestStyle(abbrev, box.w - 4, [{ font: 'normal', scale: 2 }, STYLE_NORMAL, STYLE_TINY]);
  const m = measureText(abbrev, style);
  if (m.height <= box.h - 2) {
    const tx = box.x + Math.floor((box.w - m.width) / 2);
    const ty = box.y + Math.floor((box.h - m.height) / 2);
    if (!clip || (ctx.fb.inBounds(tx, ty) && ctx.fb.inBounds(tx + m.width - 1, ty + m.height - 1))) drawText(ctx.fb, abbrev, tx, ty, c, style);
  }
  return clip ? box : place(ctx, name, box);
}

/** Status text: line1 in gold, line2 in white, on one row when it fits; otherwise the best compact version. */
export function drawStatusRow(ctx: RenderContext, name: string, line1: string, line2: string | null, box: Box, styles: TextStyle[]): Box {
  // When data is stale, alternate the status with a STALE warning (never hide that it's old).
  if (ctx.stale && Math.floor(ctx.t / 2000) % 2 === 1) {
    const st = bestStyle('STALE', box.w, styles);
    return textCentered(ctx, name, 'STALE', box, AMBER, st);
  }
  const full = line2 ? `${line1} ${line2}` : line1;
  let style = fitText(full, box.w, styles);
  let show2 = line2;
  if (!style) {
    show2 = null;
    style = bestStyle(line1, box.w, styles);
  }
  const shown = show2 ? `${line1} ${show2}` : line1;
  const m = measureText(shown, style);
  const x = box.x + Math.floor((box.w - m.width) / 2);
  const t1 = show2 ? `${line1} ` : line1;
  const w1 = drawText(ctx.fb, t1, x, box.y, GOLD, style);
  if (show2) drawText(ctx.fb, show2, x + w1 + (style.spacing ?? 1) * (style.scale ?? 1), box.y, WHITE, style);
  const width = m.width;
  const h = m.height;
  return place(ctx, name, { x, y: box.y, w: Math.min(width, box.w), h });
}
