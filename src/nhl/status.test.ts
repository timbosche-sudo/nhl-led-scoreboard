import { describe, expect, it } from 'vitest';
import { finalLabel, formatClock, periodLabel, statusLines, statusText } from './status';
import { game } from '../test/helpers';

const now = new Date('2026-11-17T20:00:00Z');
const tz = 'America/Chicago';

describe('status labels', () => {
  it('period labels', () => {
    expect(periodLabel({ period: 1, periodType: 'REG', maxRegulationPeriods: 3 })).toBe('1ST');
    expect(periodLabel({ period: 2, periodType: 'REG', maxRegulationPeriods: 3 })).toBe('2ND');
    expect(periodLabel({ period: 3, periodType: 'REG', maxRegulationPeriods: 3 })).toBe('3RD');
    expect(periodLabel({ period: 4, periodType: 'OT', maxRegulationPeriods: 3 })).toBe('OT');
    expect(periodLabel({ period: 6, periodType: 'OT', maxRegulationPeriods: 3 })).toBe('3OT');
    expect(periodLabel({ period: 5, periodType: 'SO', maxRegulationPeriods: 3 })).toBe('SO');
    expect(periodLabel({ period: null, periodType: null, maxRegulationPeriods: 3 })).toBeNull();
  });
  it('clock formatting drops the leading zero', () => {
    expect(formatClock('08:15')).toBe('8:15');
    expect(formatClock('00:42')).toBe('0:42');
    expect(formatClock('20:00')).toBe('20:00');
    expect(formatClock('weird')).toBe('weird');
    expect(formatClock(null)).toBeNull();
    expect(statusText(game({ clock: { timeRemaining: '08:15', secondsRemaining: 495, running: true, inIntermission: false } }), now, tz)).toBe('3RD 8:15');
  });
  it('live game: 3RD 12:41', () => {
    expect(statusText(game({}), now, tz)).toBe('3RD 12:41');
  });
  it('intermission', () => {
    const g = game({ period: 1, clock: { timeRemaining: '14:22', secondsRemaining: 862, running: true, inIntermission: true } });
    expect(g.status).toBe('intermission');
    expect(statusLines(g, now, tz)).toEqual({ line1: '1ST INT', line2: '14:22' });
  });
  it('end of period before the API flags intermission', () => {
    const g = game({ period: 1, clock: { timeRemaining: '00:00', secondsRemaining: 0, running: false, inIntermission: false } });
    expect(statusLines(g, now, tz)).toEqual({ line1: 'END', line2: '1ST' });
  });
  it('final variants', () => {
    expect(finalLabel(game({ gameState: 'OFF', lastPeriodType: 'REG' }))).toBe('FINAL');
    expect(finalLabel(game({ gameState: 'FINAL', period: 4, periodType: 'OT', lastPeriodType: 'OT' }))).toBe('FINAL/OT');
    expect(finalLabel(game({ gameState: 'OFF', period: 5, periodType: 'SO', lastPeriodType: 'SO' }))).toBe('FINAL/SO');
    expect(finalLabel(game({ gameState: 'OFF', period: 5, periodType: 'OT', lastPeriodType: 'OT' }))).toBe('FINAL/2OT');
    expect(statusLines(game({ gameState: 'OFF', lastPeriodType: 'OT', period: 4 }), now, tz)).toEqual({ line1: 'FINAL', line2: 'OT' });
  });
  it('scheduled game shows local start time', () => {
    const g = game({ gameState: 'FUT', startTimeUTC: '2026-11-18T01:00:00Z', clock: null });
    expect(statusLines(g, now, tz)).toEqual({ line1: 'TONIGHT', line2: '7:00PM' });
    expect(statusText(g, now, 'America/New_York')).toBe('8:00PM');
  });
  it('postponed / suspended / cancelled / unknown', () => {
    expect(statusText(game({ gameState: 'FUT', scheduleState: 'PPD' }), now, tz)).toBe('PPD');
    expect(statusText(game({ scheduleState: 'SUSP' }), now, tz)).toBe('SUSP');
    expect(statusText(game({ scheduleState: 'CNCL' }), now, tz)).toBe('CNCL');
    expect(statusText(game({ gameState: '???' }), now, tz)).toBe('N/A');
  });
  it('live game without clock still shows period', () => {
    expect(statusText(game({ clock: null, period: 2 }), now, tz)).toBe('2ND');
  });
});
