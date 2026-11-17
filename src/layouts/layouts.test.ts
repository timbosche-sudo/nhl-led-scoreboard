import { describe, expect, it } from 'vitest';
import { Framebuffer } from '../core/framebuffer';
import { RESOLUTIONS } from '../config/settings';
import { LogoCache, NO_LOGOS, type LogoSource } from '../logos/logoCache';
import { boxesOverlap, type PlacedElement, type RenderContext } from './context';
import { renderLayout, renderMessage, LAYOUTS, type LayoutId } from './layouts';
import { renderGoal } from '../animation/goal';
import { game, syntheticLogo } from '../test/helpers';
import { TEAMS } from '../teams/teams';

const now = new Date('2026-11-17T23:00:00Z');

function ctxFor(w: number, h: number, logos: LogoSource, t = 0, stale = false) {
  const fb = new Framebuffer(w, h);
  const placed: PlacedElement[] = [];
  const ctx: RenderContext = { fb, now, t, timeZone: 'America/Chicago', logos, stale, placed };
  return { fb, placed, ctx };
}

const withLogos = new LogoCache('led');
for (const t of TEAMS) withLogos.setSource(t.abbrev, syntheticLogo(220, 180));
const wideLogos = new LogoCache('led');
for (const t of TEAMS) wideLogos.setSource(t.abbrev, syntheticLogo(400, 120));

const scenarios = {
  live: game({ awayScore: 2, homeScore: 1 }),
  liveDoubleDigits: game({ awayScore: 10, homeScore: 11, period: 6, periodType: 'OT', clock: { timeRemaining: '12:41', secondsRemaining: 761, running: true, inIntermission: false } }),
  intermission: game({ awayScore: 0, homeScore: 0, period: 2, clock: { timeRemaining: '17:59', secondsRemaining: 1079, running: true, inIntermission: true } }),
  endOfPeriod: game({ awayScore: 1, homeScore: 1, period: 1, clock: { timeRemaining: '00:00', secondsRemaining: 0, running: false, inIntermission: false } }),
  scheduled: game({ gameState: 'FUT', clock: null, startTimeUTC: '2026-11-18T01:00:00Z' }),
  pregame: game({ gameState: 'PRE', clock: null, awayScore: 0, homeScore: 0 }),
  finalSO: game({ gameState: 'OFF', awayScore: 3, homeScore: 2, period: 5, periodType: 'SO', lastPeriodType: 'SO' }),
  finalOT: game({ gameState: 'FINAL', awayScore: 3, homeScore: 4, period: 4, periodType: 'OT', lastPeriodType: 'OT' }),
  postponed: game({ gameState: 'FUT', scheduleState: 'PPD', clock: null }),
  longNames: game({ away: 'CBJ', home: 'VGK', awayScore: 7, homeScore: 8 }),
};

function checkFrame(fb: Framebuffer, placed: PlacedElement[], label: string) {
  expect(fb.clipCount, `${label}: pixels drawn outside the matrix`).toBe(0);
  for (const p of placed) {
    expect(p.x, `${label}: ${p.name} left edge`).toBeGreaterThanOrEqual(0);
    expect(p.y, `${label}: ${p.name} top edge`).toBeGreaterThanOrEqual(0);
    expect(p.x + p.w, `${label}: ${p.name} right edge`).toBeLessThanOrEqual(fb.width);
    expect(p.y + p.h, `${label}: ${p.name} bottom edge`).toBeLessThanOrEqual(fb.height);
  }
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++)
      expect(boxesOverlap(placed[i], placed[j]), `${label}: ${placed[i].name} overlaps ${placed[j].name} ${JSON.stringify([placed[i], placed[j]])}`).toBe(false);
  expect(fb.litCount(), `${label}: frame is blank`).toBeGreaterThan(20);
}

describe.each(RESOLUTIONS.map((r) => [r.id, r.width, r.height] as const))('layouts at %s', (id, W, H) => {
  for (const { id: layout } of LAYOUTS) {
    for (const [name, g] of Object.entries(scenarios)) {
      for (const [logoName, logos] of [['placeholder', NO_LOGOS], ['logo', withLogos], ['wide-logo', wideLogos]] as const) {
        for (const stale of [false, true]) {
          it(`${layout} / ${name} / ${logoName}${stale ? ' / stale' : ''}`, () => {
            const { fb, placed, ctx } = ctxFor(W, H, logos, stale ? 2500 : 0, stale);
            renderLayout(ctx, layout as LayoutId, g);
            checkFrame(fb, placed, `${id} ${layout} ${name} ${logoName}`);
          });
        }
      }
    }
  }

  it('message screens fit', () => {
    for (const lines of [[{ text: 'NO GAMES TODAY' }, { text: 'NEXT THU 11/19' }], [{ text: 'NHL DATA' }, { text: 'UNAVAILABLE' }], [{ text: 'A VERY LONG MESSAGE THAT CANNOT FIT' }]]) {
      const { fb, placed, ctx } = ctxFor(W, H, NO_LOGOS);
      renderMessage(ctx, lines);
      checkFrame(fb, placed, `${id} message`);
    }
  });

  it('goal celebration stays inside the panel in every phase', () => {
    for (let t = 0; t < 7000; t += 97) {
      const { fb, ctx, placed } = ctxFor(W, H, withLogos, t);
      const running = renderGoal(ctx, { game: scenarios.live, team: 'STL', side: 'away', startedAt: 0 });
      expect(running).toBe(true);
      expect(fb.clipCount, `goal t=${t}`).toBe(0);
      for (let i = 0; i < placed.length; i++)
        for (let j = i + 1; j < placed.length; j++) expect(boxesOverlap(placed[i], placed[j]), `goal t=${t}: ${placed[i].name} / ${placed[j].name}`).toBe(false);
      expect(fb.litCount()).toBeGreaterThan(0);
    }
    const { ctx } = ctxFor(W, H, withLogos, 7001);
    expect(renderGoal(ctx, { game: scenarios.live, team: 'STL', side: 'away', startedAt: 0 })).toBe(false);
  });
});

describe('resolution changes re-render, not stretch', () => {
  it('192x32 and 128x64 frames are laid out differently from 128x32', () => {
    const a = ctxFor(128, 32, withLogos);
    renderLayout(a.ctx, 'classic', scenarios.live);
    const b = ctxFor(192, 32, withLogos);
    renderLayout(b.ctx, 'classic', scenarios.live);
    const c = ctxFor(128, 64, withLogos);
    renderLayout(c.ctx, 'classic', scenarios.live);
    const logoA = a.placed.find((p) => p.name === 'logo-home')!;
    const logoB = b.placed.find((p) => p.name === 'logo-home')!;
    expect(logoB.x).toBeGreaterThan(logoA.x + 50); // home logo moves to the new right edge
    const scoreA = a.placed.find((p) => p.name === 'score')!;
    const scoreC = c.placed.find((p) => p.name === 'score')!;
    expect(scoreC.h).toBe(scoreA.h * 2); // taller panel uses a 2x pixel font, not a stretched bitmap
  });
});

describe('never invent a score', () => {
  it('scheduled game in Classic shows VS rather than 0-0', () => {
    const { placed, ctx } = ctxFor(128, 32, NO_LOGOS);
    renderLayout(ctx, 'classic', scenarios.scheduled);
    const score = placed.find((p) => p.name === 'score')!;
    expect(score.h).toBe(7); // the 5x7 "VS", not the 14px score digits
  });
});
