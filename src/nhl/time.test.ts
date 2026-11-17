import { describe, expect, it } from 'vitest';
import { addDays, countdown, formatDayLabel, formatStartTime, hockeyDate, isValidTimeZone, localDateString } from './time';

describe('time zones', () => {
  it('formats start times in the requested zone, independent of machine zone', () => {
    const iso = '2026-11-18T01:00:00Z'; // 7 PM Central
    expect(formatStartTime(iso, 'America/Chicago')).toBe('7:00PM');
    expect(formatStartTime(iso, 'America/New_York')).toBe('8:00PM');
    expect(formatStartTime(iso, 'America/Los_Angeles')).toBe('5:00PM');
    expect(formatStartTime('2026-11-17T18:30:00Z', 'America/Chicago')).toBe('12:30PM');
    expect(formatStartTime('2026-11-17T06:05:00Z', 'America/Chicago')).toBe('12:05AM');
  });
  it('local date differs from UTC date in the evening', () => {
    const t = new Date('2026-11-18T03:30:00Z'); // 9:30 PM Nov 17 Central
    expect(localDateString(t, 'America/Chicago')).toBe('2026-11-17');
    expect(localDateString(t, 'UTC')).toBe('2026-11-18');
  });
  it('hockey day rolls over at 5 AM local, not midnight', () => {
    expect(hockeyDate(new Date('2026-11-18T05:30:00Z'), 'America/Chicago')).toBe('2026-11-17'); // 11:30 PM
    expect(hockeyDate(new Date('2026-11-18T07:30:00Z'), 'America/Chicago')).toBe('2026-11-17'); // 1:30 AM next day
    expect(hockeyDate(new Date('2026-11-18T11:30:00Z'), 'America/Chicago')).toBe('2026-11-18'); // 5:30 AM
  });
  it('handles DST transitions and month/year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
    // 2027-03-14 is the US spring-forward date
    expect(formatStartTime('2027-03-14T23:00:00Z', 'America/Chicago')).toBe('6:00PM');
    expect(formatStartTime('2027-03-13T23:00:00Z', 'America/Chicago')).toBe('5:00PM');
  });
  it('day labels', () => {
    const now = new Date('2026-11-17T18:00:00Z'); // noon Central, Tue
    expect(formatDayLabel('2026-11-18T01:00:00Z', now, 'America/Chicago')).toBe('TONIGHT');
    expect(formatDayLabel('2026-11-17T19:00:00Z', now, 'America/Chicago')).toBe('TODAY');
    expect(formatDayLabel('2026-11-19T01:00:00Z', now, 'America/Chicago')).toBe('TMRW');
    expect(formatDayLabel('2026-11-20T01:00:00Z', now, 'America/Chicago')).toBe('THU 11/19');
  });
  it('countdown', () => {
    const now = new Date('2026-11-17T23:00:00Z');
    expect(countdown('2026-11-18T01:05:00Z', now)).toBe('IN 2H 05M');
    expect(countdown('2026-11-17T23:09:00Z', now)).toBe('IN 9M');
    expect(countdown('2026-11-17T22:00:00Z', now)).toBeNull();
    expect(countdown('2026-11-19T01:00:00Z', now)).toBeNull();
  });
  it('validates zones', () => {
    expect(isValidTimeZone('America/Chicago')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});
