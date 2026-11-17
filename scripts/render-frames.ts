/**
 * Headless renderer: runs the real scoreboard engine in Node (no browser, no DOM)
 * and writes PNGs of the framebuffer for every layout and resolution.
 *
 *   npm run render                 -> docs/frames/*.png
 *
 * This is the same code path the Raspberry Pi runner will use. Logos are drawn as
 * labelled placeholders here because SVG rasterisation needs a browser (or a
 * library such as resvg on the Pi); see docs/RASPBERRY_PI.md.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { Framebuffer } from '../src/core/framebuffer';
import { encodePNG } from '../src/core/png';
import { renderLedPreview } from '../src/core/ledPreview';
import { drawText } from '../src/core/text';
import { RESOLUTIONS } from '../src/config/settings';
import { DemoController } from '../src/demo/demo';
import { renderGoal } from '../src/animation/goal';
import { renderLayout, renderMessage, type LayoutId } from '../src/layouts/layouts';
import { NO_LOGOS } from '../src/logos/logoCache';
import type { RenderContext } from '../src/layouts/context';
import type { Game } from '../src/nhl/types';

const out = join(process.cwd(), 'docs', 'frames');
mkdirSync(out, { recursive: true });
const now = new Date('2026-11-17T23:00:00Z');

function save(name: string, fb: Framebuffer) {
  writeFileSync(join(out, `${name}.png`), encodePNG(fb.width, fb.height, fb.toRGBA(), deflateSync));
  const led = renderLedPreview(fb, 8);
  writeFileSync(join(out, `${name}.led.png`), encodePNG(led.width, led.height, led.data, deflateSync));
}

const demo = new DemoController();
const live = demo.game();
const scheduled: Game = { ...live, id: 'S', status: 'scheduled', startTimeUTC: '2026-11-18T01:00:00Z', away: { ...live.away, score: null }, home: { ...live.home, score: null }, clock: null };
const final: Game = { ...live, id: 'F', status: 'final', period: 4, periodType: 'OT', lastPeriodType: 'OT', away: { ...live.away, score: 3 } };

for (const res of RESOLUTIONS) {
  const ctx = (t = 0): RenderContext => ({ fb: new Framebuffer(res.width, res.height), now, t, timeZone: 'America/Chicago', logos: NO_LOGOS, stale: false });
  const cases: [LayoutId, Game][] = [['classic', live], ['big', live], ['matchup', scheduled], ['final', final]];
  for (const [layout, game] of cases) {
    const c = ctx();
    renderLayout(c, layout, game);
    save(`${res.id}-${layout}`, c.fb);
  }
  for (const t of [400, 3000, 5000]) {
    const c = ctx(t);
    renderGoal(c, { game: { ...live, away: { ...live.away, score: 3 } }, team: 'STL', side: 'away', startedAt: 0 });
    save(`${res.id}-goal-${t}ms`, c.fb);
  }
  const m = ctx();
  renderMessage(m, [{ text: 'NHL DATA', color: [255, 140, 0] }, { text: 'UNAVAILABLE', color: [255, 140, 0] }]);
  save(`${res.id}-unavailable`, m.fb);
}

// iOS home-screen icon (one-off convenience)
const icon = new Framebuffer(36, 36);
icon.fillRect(0, 0, 36, 36, [7, 11, 20]);
drawText(icon, 'NHL', 5, 6, [252, 181, 20], { font: 'normal' });
drawText(icon, '2-1', 5, 20, [255, 255, 255], { font: 'normal' });
const iconPng = renderLedPreview(icon, 5, 0.2);
writeFileSync(join(process.cwd(), 'public', 'apple-touch-icon.png'), encodePNG(iconPng.width, iconPng.height, iconPng.data, deflateSync));
console.log(`Wrote frames to ${out}`);
