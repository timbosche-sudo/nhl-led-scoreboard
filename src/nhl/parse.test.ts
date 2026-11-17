import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/schedule-2025-10-07.json';
import { mapStatus, parseGame, parseScheduleResponse, parseScoreResponse } from './parse';
import { apiGame } from '../test/helpers';

describe('parseScheduleResponse (real captured payload)', () => {
  const r = parseScheduleResponse(fixture);
  it('parses every game of the week', () => {
    const total = fixture.gameWeek.reduce((n, d) => n + d.games.length, 0);
    expect(r.rejected).toBe(0);
    expect(r.days.flatMap((d) => d.games)).toHaveLength(total);
    expect(r.days.map((d) => d.date)).toContain('2025-10-07');
  });
  it('maps the season opener correctly', () => {
    const g = r.days[0].games[0];
    expect(g.id).toBe('2025020001');
    expect(g.away.abbrev).toBe('CHI');
    expect(g.home.abbrev).toBe('FLA');
    expect(g.away.score).toBe(2);
    expect(g.home.score).toBe(3);
    expect(g.status).toBe('final');
    expect(g.lastPeriodType).toBe('REG');
    expect(g.home.darkLogoUrl).toContain('FLA_dark.svg');
  });
  it('future games have null scores (never zero-filled)', () => {
    const fut = r.days.flatMap((d) => d.games).filter((g) => g.rawGameState === 'FUT');
    expect(fut.length).toBeGreaterThan(0);
    for (const g of fut) {
      expect(g.status).toBe('scheduled');
      expect(g.away.score).toBeNull();
      expect(g.home.score).toBeNull();
    }
  });
  it('covers all 32 clubs', () => {
    const abbrevs = new Set(r.days.flatMap((d) => d.games).flatMap((g) => [g.away.abbrev, g.home.abbrev]));
    expect(abbrevs.size).toBe(32);
  });
});

describe('parseScoreResponse', () => {
  it('parses live game with clock', () => {
    const r = parseScoreResponse({ currentDate: '2026-11-17', games: [apiGame({ awayScore: 2, homeScore: 1 })] });
    const g = r.games[0];
    expect(g.status).toBe('live');
    expect(g.period).toBe(3);
    expect(g.clock?.timeRemaining).toBe('12:41');
    expect(g.clock?.running).toBe(true);
  });
  it('rejects malformed entries without throwing', () => {
    const r = parseScoreResponse({ games: [{ id: 1 }, null, apiGame({})] });
    expect(r.games).toHaveLength(1);
    expect(r.rejected).toBe(2);
  });
  it('throws on a non-score payload (e.g. an HTML error page parsed as JSON)', () => {
    expect(() => parseScoreResponse('<html>')).toThrow();
    expect(() => parseScoreResponse({ foo: 1 })).toThrow();
  });
  it('handles missing clock gracefully', () => {
    const g = parseGame(apiGame({ clock: null }))!;
    expect(g.clock).toBeNull();
    expect(g.status).toBe('live');
  });
});

describe('mapStatus', () => {
  const clock = (inIntermission: boolean) => ({ timeRemaining: '10:00', secondsRemaining: 600, running: false, inIntermission });
  it.each([
    ['FUT', 'OK', null, 'scheduled'],
    ['PRE', 'OK', null, 'pregame'],
    ['LIVE', 'OK', clock(false), 'live'],
    ['CRIT', 'OK', clock(false), 'live'],
    ['LIVE', 'OK', clock(true), 'intermission'],
    ['FINAL', 'OK', null, 'final'],
    ['OFF', 'OK', null, 'final'],
    ['FUT', 'PPD', null, 'postponed'],
    ['LIVE', 'SUSP', null, 'suspended'],
    ['FUT', 'CNCL', null, 'cancelled'],
    ['WAT', 'OK', null, 'unknown'],
    [null, null, null, 'unknown'],
  ] as const)('%s / %s => %s', (gs, ss, c, expected) => {
    expect(mapStatus(gs, ss, c)).toBe(expected);
  });
});
