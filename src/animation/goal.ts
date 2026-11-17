import { BLACK, WHITE, mix, scale, type RGB } from '../core/color';
import { drawText, measureText } from '../core/text';
import type { Game } from '../nhl/types';
import { teamLedColor } from '../teams/teams';
import { drawLogo } from '../layouts/common';
import { place, type RenderContext } from '../layouts/context';
import { renderClassic, sideGeometry } from '../layouts/layouts';

export const GOAL_DURATION_MS = 7000;

export interface GoalCelebration {
  game: Game;
  team: string;
  side: 'away' | 'home';
  startedAt: number;
}

const easeOut = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;

/** Marquee lights chasing around the border in the team's two colours. */
function chaseBorder(ctx: RenderContext, a: RGB, b: RGB, phase: number): void {
  const { fb } = ctx;
  const W = fb.width, H = fb.height;
  const perim: [number, number][] = [];
  for (let x = 0; x < W; x++) perim.push([x, 0]);
  for (let y = 1; y < H; y++) perim.push([W - 1, y]);
  for (let x = W - 2; x >= 0; x--) perim.push([x, H - 1]);
  for (let y = H - 2; y > 0; y--) perim.push([0, y]);
  perim.forEach(([x, y], i) => {
    const k = (i + phase) % 6;
    if (k < 2) fb.set(x, y, a);
    else if (k < 4) fb.set(x, y, b);
  });
}

function goalText(ctx: RenderContext, text: string, cx: number, color: RGB, maxW: number, y?: number, maxH?: number): void {
  const { fb } = ctx;
  const limitH = maxH ?? fb.height - 6;
  let s = 4;
  while (s > 1 && (measureText(text, { font: 'normal', scale: s }).width > maxW || 7 * s > limitH)) s--;
  const m = measureText(text, { font: 'normal', scale: s });
  const x = cx - Math.floor(m.width / 2);
  const yy = y ?? Math.floor((fb.height - m.height) / 2);
  drawText(fb, text, x, yy, color, { font: 'normal', scale: s });
  place(ctx, `goal-text-${text}`, { x, y: yy, w: m.width, h: m.height });
}

/**
 * Goal celebration (Layout G). Three phases over ~7 s:
 *   1. 0-1.8 s  flashing team colours with a big GOAL!
 *   2. 1.8-4.6 s logo slides in, GOAL + team abbreviation, chasing border lights
 *   3. 4.6-7 s  normal scoreboard with the new score blinking and the logo pulsing
 * Returns false once finished.
 */
export function renderGoal(ctx: RenderContext, c: GoalCelebration): boolean {
  const el = ctx.t - c.startedAt;
  if (el >= GOAL_DURATION_MS || el < 0) return false;
  const { fb } = ctx;
  const W = fb.width, H = fb.height;
  const p = teamLedColor(c.team, 'primary');
  const s = teamLedColor(c.team, 'secondary');

  if (el < 1800) {
    const on = Math.floor(el / 150) % 2 === 0;
    fb.clear(on ? scale(p, 0.85) : BLACK);
    if (!on) chaseBorder(ctx, p, s, Math.floor(el / 60));
    goalText(ctx, 'GOAL!', Math.floor(W / 2), on ? WHITE : p, W - 6);
    return true;
  }
  if (el < 4600) {
    const k = (el - 1800) / 2800;
    fb.clear(BLACK);
    chaseBorder(ctx, p, s, Math.floor(el / 60));
    const { left } = sideGeometry(W, H);
    const box = { x: 2, y: 2, w: left.w, h: H - 4 };
    const startX = -box.w - 4;
    const dx = Math.round((startX - box.x) * (1 - easeOut(k * 2.2)));
    const pulse = 0.75 + 0.25 * Math.sin(el / 120);
    drawLogo(ctx, 'goal-logo', c.team, box, { dx, clip: true, brightness: pulse });
    const textX = box.x + box.w + Math.floor((W - (box.x + box.w)) / 2);
    const flashOn = Math.floor(el / 300) % 2 === 0;
    if (H >= 64) {
      goalText(ctx, 'GOAL!', textX, flashOn ? WHITE : p, W - box.w - 8, 6, 28);
      goalText(ctx, c.team, textX, s, W - box.w - 8, H - 24, 21);
    } else {
      goalText(ctx, 'GOAL!', textX, flashOn ? WHITE : p, W - box.w - 10, 3, 16);
      goalText(ctx, c.team, textX, mix(s, WHITE, 0.2), W - box.w - 10, H - 10, 7);
    }
    return true;
  }
  fb.clear(BLACK);
  const pulse = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(el / 90));
  renderClassic(ctx, c.game, {
    blink: c.side,
    logoBrightness: c.side === 'away' ? { away: pulse } : { home: pulse },
  });
  return true;
}
