/* Time-zone helpers. All conversions go through Intl with an explicit IANA zone,
 * so results do not depend on the machine's own zone (important for tests and
 * for a Raspberry Pi that may be left in UTC). */

export const DEFAULT_TIME_ZONE = 'America/Chicago';

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function zonedParts(date: Date, tz: string): ZonedParts {
  const parts = Object.fromEntries(partsFormatter(tz).formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: String(parts.weekday).toUpperCase().slice(0, 3),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

export function localDateString(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/**
 * The "hockey day" whose slate the scoreboard should show. Late games run past
 * midnight, so until `rolloverHour` local time we keep showing the previous
 * evening's slate (and its finals) instead of jumping to the next day.
 */
export function hockeyDate(now: Date, tz: string, rolloverHour = 5): string {
  const p = zonedParts(now, tz);
  const today = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  return p.hour < rolloverHour ? addDays(today, -1) : today;
}

/** "7:00PM" in the given zone (compact for LED). */
export function formatStartTime(iso: string, tz: string): string {
  const p = zonedParts(new Date(iso), tz);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h12}:${pad(p.minute)}${p.hour < 12 ? 'AM' : 'PM'}`;
}

/** TODAY / TONIGHT / TMRW / "TUE 11/18" relative to `now` in the given zone. */
export function formatDayLabel(iso: string, now: Date, tz: string): string {
  const start = new Date(iso);
  const sd = localDateString(start, tz);
  const nd = localDateString(now, tz);
  if (sd === nd) return zonedParts(start, tz).hour >= 17 ? 'TONIGHT' : 'TODAY';
  if (sd === addDays(nd, 1)) return 'TMRW';
  const p = zonedParts(start, tz);
  return `${p.weekday} ${p.month}/${p.day}`;
}

/** "IN 2H 05M" / "IN 9M" until start, or null when started or more than 12 hours away. */
export function countdown(iso: string, now: Date): string | null {
  const ms = new Date(iso).getTime() - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0 || ms > 12 * 3600_000) return null;
  const mins = Math.ceil(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `IN ${h}H ${pad(m)}M` : `IN ${m}M`;
}
