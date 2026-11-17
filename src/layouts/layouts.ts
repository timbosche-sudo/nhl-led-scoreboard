import { GOLD, GRAY, WHITE, AMBER, type RGB } from '../core/color';
import { drawText, measureText, type TextStyle } from '../core/text';
import { gameCountdown, statusLines } from '../nhl/status';
import type { Game } from '../nhl/types';
import { teamLedColor } from '../teams/teams';
import { STYLE_NORMAL, STYLE_TINY, bestStyle, drawLogo, drawStatusRow, textCentered } from './common';
import { place, type Box, type RenderContext } from './context';

export type LayoutId = 'classic' | 'big' | 'matchup' | 'final';

export const LAYOUTS: { id: LayoutId; letter: string; label: string; description: string }[] = [
  { id: 'classic', letter: 'A', label: 'Classic', description: 'Logos left/right, score, period and clock in the centre.' },
  { id: 'big', letter: 'B', label: 'Large score', description: 'Abbreviations and big score digits for across-the-room reading.' },
  { id: 'matchup', letter: 'C', label: 'Matchup', description: 'Logos with VS, start time and countdown.' },
  { id: 'final', letter: 'D', label: 'Final', description: 'Logos, final score and FINAL / FINAL/OT / FINAL/SO.' },
];

/** Shared geometry: logo boxes on both sides and a centre column. */
export function sideGeometry(W: number, H: number): { left: Box; right: Box; center: Box } {
  const tall = H >= 64;
  const lw = W >= 192 ? 44 : tall ? 34 : 32;
  const lh = tall ? Math.min(40, H - 22) : H - 2;
  const pad = 1;
  const left = { x: pad, y: tall ? 2 : 1, w: lw, h: lh };
  const right = { x: W - pad - lw, y: left.y, w: lw, h: lh };
  const center = { x: left.x + lw + 2, y: 0, w: right.x - 2 - (left.x + lw + 2), h: H };
  return { left, right, center };
}

const SCORE: TextStyle = { font: 'score' };

/** Draws "A - B" with the bold score font. Picks the largest integer scale that fits. Returns its box. */
function drawScoreLine(
  ctx: RenderContext,
  game: Game,
  box: Box,
  maxScale: number,
  colors: { away: RGB; home: RGB },
  hide?: 'away' | 'home',
): Box | null {
  const a = game.away.score;
  const h = game.home.score;
  if (a === null || h === null) return null; // never invent a score
  for (let s = maxScale; s >= 1; s--) {
    const st = { ...SCORE, scale: s };
    const gap = 3 * s;
    const wa = measureText(String(a), st).width;
    const wd = measureText('-', st).width;
    const wh = measureText(String(h), st).width;
    const total = wa + gap + wd + gap + wh;
    const height = 14 * s;
    if (total <= box.w && height <= box.h) {
      const x = box.x + Math.floor((box.w - total) / 2);
      const y = box.y + Math.floor((box.h - height) / 2);
      if (hide !== 'away') drawText(ctx.fb, String(a), x, y, colors.away, st);
      drawText(ctx.fb, '-', x + wa + gap, y, GRAY, st);
      if (hide !== 'home') drawText(ctx.fb, String(h), x + wa + gap + wd + gap, y, colors.home, st);
      return place(ctx, 'score', { x, y, w: total, h: height });
    }
  }
  return null;
}

function scoreColors(game: Game, final: boolean): { away: RGB; home: RGB } {
  if (!final || game.away.score === null || game.home.score === null || game.away.score === game.home.score) return { away: WHITE, home: WHITE };
  const awayWon = game.away.score > game.home.score;
  return { away: awayWon ? WHITE : GRAY, home: awayWon ? GRAY : WHITE };
}

export interface ClassicOptions {
  /** Blink one side's score (used by the goal celebration). */
  blink?: 'away' | 'home';
  logoBrightness?: { away?: number; home?: number };
  final?: boolean;
}

/** Layout A (and D when final): logos, abbreviations, score, status. */
export function renderClassic(ctx: RenderContext, game: Game, opts: ClassicOptions = {}): void {
  const { fb } = ctx;
  const W = fb.width;
  const H = fb.height;
  const tall = H >= 64;
  const { left, right, center } = sideGeometry(W, H);
  drawLogo(ctx, 'logo-away', game.away.abbrev, left, { brightness: opts.logoBrightness?.away });
  drawLogo(ctx, 'logo-home', game.home.abbrev, right, { brightness: opts.logoBrightness?.home });

  const final = opts.final ?? game.status === 'final';
  const { line1, line2 } = statusLines(game, ctx.now, ctx.timeZone);
  const statusStyles: TextStyle[] = tall ? [{ font: 'normal', scale: 2 }, STYLE_NORMAL, STYLE_TINY] : [STYLE_NORMAL, STYLE_TINY];
  const statusH = tall ? 14 : 7;
  const statusBox = tall ? { x: 0, y: H - statusH - 2, w: W, h: statusH } : { x: center.x, y: H - statusH - 1, w: center.w, h: statusH };

  // abbreviations: small, team-coloured, above the score (or on the score row when wide)
  const abbrStyle: TextStyle = tall || W >= 192 ? STYLE_NORMAL : STYLE_TINY;
  const abbrH = measureText('A', abbrStyle).height;
  const abbrY = tall ? 4 : 1;
  const ac = teamLedColor(game.away.abbrev);
  const hc = teamLedColor(game.home.abbrev);
  const aw = measureText(game.away.abbrev, abbrStyle).width;
  const hw = measureText(game.home.abbrev, abbrStyle).width;
  drawText(fb, game.away.abbrev, center.x + 1, abbrY, ac, abbrStyle);
  place(ctx, 'abbr-away', { x: center.x + 1, y: abbrY, w: aw, h: abbrH });
  drawText(fb, game.home.abbrev, center.x + center.w - 1 - hw, abbrY, hc, abbrStyle);
  place(ctx, 'abbr-home', { x: center.x + center.w - 1 - hw, y: abbrY, w: hw, h: abbrH });

  const scoreTop = abbrY + abbrH + 1;
  const scoreBottom = tall ? statusBox.y - 2 : statusBox.y - 2;
  const scoreBox = { x: center.x, y: scoreTop, w: center.w, h: scoreBottom - scoreTop };
  const colors = scoreColors(game, final);
  const hide = opts.blink && Math.floor(ctx.t / 250) % 2 === 1 ? opts.blink : undefined;
  const drawn = drawScoreLine(ctx, game, scoreBox, tall ? 2 : 1, colors, hide);
  if (!drawn) {
    // No score from the API (e.g. scheduled game shown in Classic): say so rather than show 0-0.
    textCentered(ctx, 'score', 'VS', scoreBox, GOLD, tall ? { font: 'normal', scale: 2 } : STYLE_NORMAL, true);
  }
  drawStatusRow(ctx, 'status', line1, line2, statusBox, statusStyles);
}

/** Layout D: classic geometry with final-score emphasis. */
export function renderFinal(ctx: RenderContext, game: Game): void {
  renderClassic(ctx, game, { final: true });
}

/** Layout B: large score digits and abbreviations, compact status in the middle. */
export function renderBig(ctx: RenderContext, game: Game): void {
  const { fb } = ctx;
  const W = fb.width;
  const H = fb.height;
  const { line1, line2 } = statusLines(game, ctx.now, ctx.timeZone);
  const final = game.status === 'final';
  const colors = scoreColors(game, final);
  const ac = teamLedColor(game.away.abbrev);
  const hc = teamLedColor(game.home.abbrev);

  if (H >= 64) {
    const half = Math.floor((W - 16) / 2);
    const leftZ = { x: 0, y: 0, w: half, h: H };
    const rightZ = { x: W - half, y: 0, w: half, h: H };
    const abbrSt = bestStyle('WWW', half - 2, [{ font: 'normal', scale: 2 }, STYLE_NORMAL]);
    textCentered(ctx, 'abbr-away', game.away.abbrev, { ...leftZ, y: 2 }, ac, abbrSt);
    textCentered(ctx, 'abbr-home', game.home.abbrev, { ...rightZ, y: 2 }, hc, abbrSt);
    const sy = 19;
    const sh = 28;
    for (const [side, z, col] of [['away', leftZ, colors.away], ['home', rightZ, colors.home]] as const) {
      const s = game[side].score;
      if (s === null) continue;
      const st = bestStyle(String(s), z.w - 2, [{ ...SCORE, scale: 2 }, SCORE]);
      textCentered(ctx, `score-${side}`, String(s), { x: z.x, y: sy, w: z.w, h: sh }, col, st, true);
    }
    if (game.away.score !== null && game.home.score !== null)
      textCentered(ctx, 'dash', '-', { x: half, y: sy, w: W - 2 * half, h: sh }, GRAY, SCORE, true);
    drawStatusRow(ctx, 'status', line1, line2, { x: 0, y: H - 15, w: W, h: 14 }, [{ font: 'normal', scale: 2 }, STYLE_NORMAL]);
    return;
  }

  // 32-pixel-high variants
  const wide = W >= 192;
  const abbrW = wide ? 30 : 19;
  const scoreW = wide ? 44 : 28;
  const centerW = W - 2 * (abbrW + scoreW) - 2;
  const zA = { x: 0, y: 0, w: abbrW, h: H };
  const zSA = { x: abbrW + 1, y: 0, w: scoreW, h: H };
  const zC = { x: abbrW + scoreW + 1, y: 0, w: centerW, h: H };
  const zSH = { x: zC.x + centerW, y: 0, w: scoreW, h: H };
  const zH = { x: zSH.x + scoreW + 1, y: 0, w: W - (zSH.x + scoreW + 1), h: H };

  const abbrSt = STYLE_NORMAL;
  for (const [name, abbr, z, col] of [['away', game.away.abbrev, zA, ac], ['home', game.home.abbrev, zH, hc]] as const) {
    const b = textCentered(ctx, `abbr-${name}`, abbr, { ...z, y: 11 }, col, abbrSt);
    ctx.fb.fillRect(b.x, 20, b.w, 2, col);
    place(ctx, `bar-${name}`, { x: b.x, y: 20, w: b.w, h: 2 });
  }
  for (const [side, z, col] of [['away', zSA, colors.away], ['home', zSH, colors.home]] as const) {
    const s = game[side].score;
    if (s === null) continue;
    const st = bestStyle(String(s), z.w - 2, [{ ...SCORE, scale: 2 }, SCORE]);
    textCentered(ctx, `score-${side}`, String(s), { ...z, y: 2, h: 28 }, col, st, true);
  }
  const styles = [STYLE_NORMAL, STYLE_TINY];
  if (ctx.stale && Math.floor(ctx.t / 2000) % 2 === 1) {
    textCentered(ctx, 'status1', 'STALE', { ...zC, y: 12 }, AMBER, bestStyle('STALE', zC.w, styles));
    return;
  }
  textCentered(ctx, 'status1', line1, { ...zC, y: line2 ? 6 : 12 }, GOLD, bestStyle(line1, zC.w, styles));
  if (line2) textCentered(ctx, 'status2', line2, { ...zC, y: 18 }, WHITE, bestStyle(line2, zC.w, styles));
}

/** Layout C: pre-game matchup with start time / countdown. */
export function renderMatchup(ctx: RenderContext, game: Game): void {
  const { fb } = ctx;
  const W = fb.width;
  const H = fb.height;
  const tall = H >= 64;
  const { left, right, center } = sideGeometry(W, H);
  drawLogo(ctx, 'logo-away', game.away.abbrev, left);
  drawLogo(ctx, 'logo-home', game.home.abbrev, right);
  const { line1, line2 } = statusLines(game, ctx.now, ctx.timeZone);
  const cd = gameCountdown(game, ctx.now);
  const topText = cd && Math.floor(ctx.t / 4000) % 2 === 1 ? cd : line1;
  const topStyles: TextStyle[] = tall ? [STYLE_NORMAL, STYLE_TINY] : [STYLE_TINY];
  const lineStyles: TextStyle[] = tall ? [{ font: 'normal', scale: 2 }, STYLE_NORMAL, STYLE_TINY] : [STYLE_NORMAL, STYLE_TINY];
  const topY = tall ? 3 : 1;
  textCentered(ctx, 'top', topText, { ...center, y: topY }, cd && topText === cd ? AMBER : WHITE, bestStyle(topText, center.w, topStyles));
  const vsSt = tall ? { font: 'normal' as const, scale: 2 } : STYLE_NORMAL;
  const vsY = tall ? 20 : 11;
  textCentered(ctx, 'vs', 'VS', { ...center, y: vsY }, GOLD, vsSt);
  if (ctx.stale && Math.floor(ctx.t / 2000) % 2 === 1) {
    const st = bestStyle('STALE', center.w, lineStyles);
    textCentered(ctx, 'time', 'STALE', { ...center, y: H - measureText('S', st).height - (tall ? 3 : 1) }, AMBER, st);
    return;
  }
  if (line2) {
    const st = tall ? bestStyle(line2, W - 4, lineStyles) : bestStyle(line2, center.w, lineStyles);
    const y = H - measureText(line2, st).height - (tall ? 3 : 1);
    textCentered(ctx, 'time', line2, tall ? { x: 0, y, w: W, h: 14 } : { ...center, y }, WHITE, st);
  }
}

/** Centred one- or two-line message (no games, data unavailable, connecting...). */
export function renderMessage(ctx: RenderContext, lines: { text: string; color?: RGB }[]): void {
  const H = ctx.fb.height;
  const W = ctx.fb.width;
  const tall = H >= 64;
  const styles: TextStyle[] = tall ? [{ font: 'normal', scale: 2 }, STYLE_NORMAL, STYLE_TINY] : [STYLE_NORMAL, STYLE_TINY];
  const chosen = lines.map((l) => bestStyle(l.text, W - 2, styles));
  const heights = chosen.map((s) => measureText('A', s).height);
  const gap = tall ? 6 : 3;
  const total = heights.reduce((a, b) => a + b, 0) + gap * (lines.length - 1);
  let y = Math.max(0, Math.floor((H - total) / 2));
  lines.forEach((l, i) => {
    // truncate defensively so text can never leave the panel
    let text = l.text;
    while (text.length > 1 && measureText(text, chosen[i]).width > W - 2) text = text.slice(0, -1);
    textCentered(ctx, `line${i}`, text, { x: 0, y, w: W, h: heights[i] }, l.color ?? WHITE, chosen[i]);
    y += heights[i] + gap;
  });
}

export function renderLayout(ctx: RenderContext, id: LayoutId, game: Game): void {
  switch (id) {
    case 'classic':
      return renderClassic(ctx, game);
    case 'big':
      return renderBig(ctx, game);
    case 'matchup':
      return renderMatchup(ctx, game);
    case 'final':
      return renderFinal(ctx, game);
  }
}

/** Automatic layout choice for a game state, honouring the preferred live layout. */
export function autoLayout(game: Game, liveLayout: 'classic' | 'big'): LayoutId {
  switch (game.status) {
    case 'scheduled':
    case 'pregame':
    case 'postponed':
    case 'suspended':
    case 'cancelled':
      return 'matchup';
    case 'final':
      return 'final';
    default:
      return liveLayout;
  }
}

export { STYLE_NORMAL, STYLE_TINY };
