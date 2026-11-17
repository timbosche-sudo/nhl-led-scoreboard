import { describe, expect, it } from 'vitest';
import { ScoreboardEngine, type EngineSettings } from './engine';
import { NO_LOGOS } from '../logos/logoCache';
import { game } from '../test/helpers';
import { selectGame } from '../scheduler/rotation';

const settings: EngineSettings = {
  gameMode: 'favorite', favorite: 'STL', selectedGameId: null, rotation: true, rotationSec: 10, layout: 'auto', liveLayout: 'classic', goalCelebrations: 'favorite', timeZone: 'America/Chicago', finalHoldMin: 60,
};

const stl = game({ id: 1, away: 'STL', home: 'CHI', awayScore: 2, homeScore: 1 });
const others = [
  game({ id: 2, away: 'BOS', home: 'TOR', awayScore: 1, homeScore: 0, startTimeUTC: '2026-11-18T00:00:00Z' }),
  game({ id: 3, away: 'EDM', home: 'VAN', awayScore: 0, homeScore: 0, startTimeUTC: '2026-11-18T03:00:00Z' }),
];
const base = { upcoming: [], favorite: 'STL', selectedGameId: null, rotationMs: 10_000, favoriteFinalSince: null, finalHoldMs: 3600_000 };

describe('game selection', () => {
  it('favourite mode locks onto the Blues game', () => {
    for (let t = 0; t < 60_000; t += 10_000) expect(selectGame({ ...base, games: [...others, stl], mode: 'favorite', now: t }).game?.id).toBe('1');
  });
  it('favourite mode rotates others when the Blues are not playing', () => {
    const ids = new Set([0, 10_000, 20_000].map((t) => selectGame({ ...base, games: others, mode: 'favorite', now: t }).game?.id));
    expect(ids).toEqual(new Set(['2', '3']));
  });
  it('after the favourite final hold expires, rotation resumes', () => {
    const fin = game({ id: 1, gameState: 'OFF', awayScore: 2, homeScore: 1 });
    expect(selectGame({ ...base, games: [fin, ...others], mode: 'favorite', now: 100, favoriteFinalSince: 0 }).game?.id).toBe('1');
    expect(selectGame({ ...base, games: [fin, ...others], mode: 'favorite', now: 4_000_000, favoriteFinalSince: 0 }).reason).toBe('rotation');
  });
  it('rotate mode prefers live games over finals and scheduled', () => {
    const fin = game({ id: 9, gameState: 'OFF', awayScore: 1, homeScore: 2 });
    const fut = game({ id: 8, gameState: 'FUT', clock: null });
    for (let t = 0; t < 50_000; t += 10_000) expect(['2', '3']).toContain(selectGame({ ...base, games: [fin, fut, ...others], mode: 'rotate', now: t }).game?.id);
  });
  it('with no live games, rotate shows the full slate; with none at all, upcoming', () => {
    const fut = game({ id: 8, gameState: 'FUT', clock: null });
    expect(selectGame({ ...base, games: [fut], mode: 'rotate', now: 0 }).game?.id).toBe('8');
    expect(selectGame({ ...base, games: [], upcoming: [fut], mode: 'rotate', now: 0 }).game?.id).toBe('8');
    expect(selectGame({ ...base, games: [], mode: 'rotate', now: 0 }).game).toBeNull();
  });
  it('single mode shows the chosen game', () => {
    expect(selectGame({ ...base, games: [stl, ...others], mode: 'single', selectedGameId: '3', now: 0 }).game?.id).toBe('3');
  });
});

describe('ScoreboardEngine', () => {
  it('shows "unavailable" rather than inventing a game when the API fails with no cached data', () => {
    const e = new ScoreboardEngine(128, 32, NO_LOGOS, settings);
    e.setData({ games: [], upcoming: [], stale: true, status: 'error', source: 'live' });
    const f = e.render(0);
    expect(f.layout).toBe('message');
    expect(f.placed.map((p) => p.name)).toEqual(['line0', 'line1']);
  });
  it('no celebration on start-up or after stale recovery', () => {
    const e = new ScoreboardEngine(128, 32, NO_LOGOS, settings);
    e.setData({ games: [stl], upcoming: [], stale: false, status: 'ok', source: 'live' });
    e.setData({ games: [stl], upcoming: [], stale: true, status: 'error', source: 'live' });
    const later = game({ id: 1, away: 'STL', home: 'CHI', awayScore: 4, homeScore: 1 });
    e.setData({ games: [later], upcoming: [], stale: false, status: 'ok', source: 'live' });
    expect(e.render(0).celebrating).toBe(false);
  });
  it('switching demo -> live never celebrates', () => {
    const e = new ScoreboardEngine(128, 32, NO_LOGOS, settings);
    e.setData({ games: [stl], upcoming: [], stale: false, status: 'ok', source: 'demo' });
    e.setData({ games: [game({ id: 1, awayScore: 5, homeScore: 1 })], upcoming: [], stale: false, status: 'ok', source: 'live' });
    expect(e.render(0).celebrating).toBe(false);
  });
  it('all-teams celebration setting fires for opponents too; off fires never', () => {
    const e = new ScoreboardEngine(128, 32, NO_LOGOS, { ...settings, goalCelebrations: 'all' });
    e.setData({ games: [stl], upcoming: [], stale: false, status: 'ok', source: 'live' });
    e.setData({ games: [game({ id: 1, awayScore: 2, homeScore: 2 })], upcoming: [], stale: false, status: 'ok', source: 'live' });
    expect(e.render(0).celebrating).toBe(true);
    const off = new ScoreboardEngine(128, 32, NO_LOGOS, { ...settings, goalCelebrations: 'off' });
    off.setData({ games: [stl], upcoming: [], stale: false, status: 'ok', source: 'live' });
    off.setData({ games: [game({ id: 1, awayScore: 3, homeScore: 1 })], upcoming: [], stale: false, status: 'ok', source: 'live' });
    expect(off.render(0).celebrating).toBe(false);
  });
  it('produces raw RGB bytes of the documented size', () => {
    for (const [w, h] of [[128, 32], [192, 32], [128, 64]]) {
      const e = new ScoreboardEngine(w, h, NO_LOGOS, settings);
      e.setData({ games: [stl], upcoming: [], stale: false, status: 'ok', source: 'live' });
      e.render(0);
      expect(e.fb.toRawRGB().length).toBe(w * h * 3);
    }
  });
});
