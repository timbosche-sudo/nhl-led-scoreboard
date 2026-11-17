import type { Game } from './types';
import { countdown, formatDayLabel, formatStartTime } from './time';

export function ordinal(n: number): string {
  return n === 1 ? '1ST' : n === 2 ? '2ND' : n === 3 ? '3RD' : `${n}TH`;
}

/** 1ST / 2ND / 3RD / OT / 2OT / SO. Playoff overtimes are numbered. */
export function periodLabel(game: Pick<Game, 'period' | 'periodType' | 'maxRegulationPeriods'>): string | null {
  if (game.periodType === 'SO') return 'SO';
  if (game.period === null) return null;
  const reg = game.maxRegulationPeriods || 3;
  if (game.periodType === 'OT' || game.period > reg) {
    const ot = game.period - reg;
    return ot <= 1 ? 'OT' : `${ot}OT`;
  }
  return ordinal(game.period);
}

/** "08:15" -> "8:15", "00:42" -> "0:42" (scoreboard style). Leaves unknown formats untouched. */
export function formatClock(t: string | null | undefined): string | null {
  if (!t) return null;
  const m = /^0?(\d{1,2}):(\d{2})$/.exec(t.trim());
  return m ? `${Number(m[1])}:${m[2]}` : t;
}

export function finalLabel(game: Game): string {
  const lp = game.lastPeriodType ?? game.periodType;
  if (lp === 'SO') return 'FINAL/SO';
  if (lp === 'OT') {
    const ot = (game.period ?? 4) - (game.maxRegulationPeriods || 3);
    return ot > 1 ? `FINAL/${ot}OT` : 'FINAL/OT';
  }
  return 'FINAL';
}

/** True when the clock has hit 0:00 but the API has not yet flagged intermission (a known API lag). */
export function isEndOfPeriod(game: Game): boolean {
  return game.status === 'live' && !!game.clock && game.clock.secondsRemaining === 0 && !game.clock.running;
}

/**
 * Two short lines describing game status, sized for a 5x7 font:
 * line1 = period / state word, line2 = clock / qualifier (may be null).
 */
export function statusLines(game: Game, now: Date, tz: string): { line1: string; line2: string | null } {
  switch (game.status) {
    case 'live': {
      const p = periodLabel(game);
      if (game.periodType === 'SO') return { line1: 'SO', line2: null };
      if (isEndOfPeriod(game)) return { line1: 'END', line2: p };
      return { line1: p ?? 'LIVE', line2: formatClock(game.clock?.timeRemaining) };
    }
    case 'intermission': {
      const p = periodLabel(game);
      return { line1: p ? `${p} INT` : 'INT', line2: formatClock(game.clock?.timeRemaining) };
    }
    case 'final': {
      const f = finalLabel(game);
      const [a, b] = f.split('/');
      return { line1: a, line2: b ?? null };
    }
    case 'scheduled':
    case 'pregame':
      if (!game.startTimeUTC) return { line1: game.status === 'pregame' ? 'PREGAME' : 'TBD', line2: null };
      return {
        line1: game.status === 'pregame' ? 'PREGAME' : formatDayLabel(game.startTimeUTC, now, tz),
        line2: formatStartTime(game.startTimeUTC, tz),
      };
    case 'postponed':
      return { line1: 'PPD', line2: null };
    case 'suspended':
      return { line1: 'SUSP', line2: null };
    case 'cancelled':
      return { line1: 'CNCL', line2: null };
    default:
      return { line1: 'N/A', line2: null };
  }
}

/** Single-line status, e.g. "3RD 12:41", "FINAL/OT", "7:00PM". */
export function statusText(game: Game, now: Date, tz: string): string {
  if (game.status === 'final') return finalLabel(game);
  if (game.status === 'scheduled' && game.startTimeUTC) return formatStartTime(game.startTimeUTC, tz);
  const { line1, line2 } = statusLines(game, now, tz);
  return line2 ? `${line1} ${line2}` : line1;
}

/** Countdown string for scheduled games, when close enough to start. */
export function gameCountdown(game: Game, now: Date): string | null {
  if (game.status !== 'scheduled' || !game.startTimeUTC) return null;
  return countdown(game.startTimeUTC, now);
}

export const isInProgress = (g: Game) => g.status === 'live' || g.status === 'intermission';
export const isUpcoming = (g: Game) => g.status === 'scheduled' || g.status === 'pregame';
