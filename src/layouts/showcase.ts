import { GOLD, WHITE } from '../core/color';
import { getTeam, teamLedColor } from '../teams/teams';
import { STYLE_NORMAL, STYLE_TINY, bestStyle, drawLogo, textCentered } from './common';
import type { RenderContext } from './context';

/** Logo gallery frame: the team's logo at full panel height with its name, for judging recognisability. */
export function renderLogoShowcase(ctx: RenderContext, abbrev: string, caption: string): void {
  const { fb } = ctx;
  const W = fb.width, H = fb.height;
  const lh = H - 2;
  const lw = Math.min(Math.floor(W / 2) - 2, Math.round(lh * 1.4));
  drawLogo(ctx, 'logo', abbrev, { x: 1, y: 1, w: lw, h: lh });
  const team = getTeam(abbrev);
  const tx = lw + 4;
  const box = { x: tx, y: 0, w: W - tx - 1, h: H };
  const tall = H >= 64;
  const nameSt = bestStyle(abbrev, box.w, tall ? [{ font: 'normal', scale: 2 }, STYLE_NORMAL] : [STYLE_NORMAL]);
  textCentered(ctx, 'abbr', abbrev, { ...box, y: tall ? 8 : 3 }, teamLedColor(abbrev), nameSt);
  const name = (team?.name ?? '').toUpperCase();
  textCentered(ctx, 'name', name, { ...box, y: tall ? 30 : 13 }, WHITE, bestStyle(name, box.w, [STYLE_NORMAL, STYLE_TINY]));
  const cap = caption.toUpperCase();
  textCentered(ctx, 'caption', cap, { ...box, y: H - (tall ? 12 : 7) }, GOLD, bestStyle(cap, box.w, [STYLE_TINY]));
}
