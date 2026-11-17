import type { Game, GameClock, GameStatus, PeriodType, TeamSide } from './types';

/* Parsers for https://api-web.nhle.com/v1/score/{date} and /v1/schedule/{date}.
 * The API is unofficial and undocumented, so every field is treated as optional
 * and validated. Missing values become null, never invented defaults. */

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const localized = (v: unknown): string | null => (isObj(v) ? str(v.default) : str(v));

function periodType(v: unknown): PeriodType | null {
  return v === 'REG' || v === 'OT' || v === 'SO' ? v : null;
}

export function mapStatus(gameState: string | null, scheduleState: string | null, clock: GameClock | null): GameStatus {
  // Schedule state wins: a postponed game may still carry gameState "FUT".
  switch (scheduleState) {
    case 'PPD':
      return 'postponed';
    case 'SUSP':
      return 'suspended';
    case 'CNCL':
      return 'cancelled';
  }
  switch (gameState) {
    case 'FUT':
      return 'scheduled';
    case 'PRE':
      return 'pregame';
    case 'LIVE':
    case 'CRIT':
      return clock?.inIntermission ? 'intermission' : 'live';
    case 'FINAL':
    case 'OFF':
      return 'final';
    default:
      return 'unknown';
  }
}

function parseTeam(v: unknown): TeamSide | null {
  if (!isObj(v)) return null;
  const abbrev = str(v.abbrev);
  if (!abbrev) return null;
  const name =
    localized(v.commonName) ?? localized(v.name) ?? [localized(v.placeName), localized(v.commonName)].filter(Boolean).join(' ') ?? abbrev;
  return {
    abbrev: abbrev.toUpperCase(),
    name: name || abbrev,
    score: num(v.score),
    sog: num(v.sog),
    logoUrl: str(v.logo),
    darkLogoUrl: str(v.darkLogo),
  };
}

function parseClock(v: unknown): GameClock | null {
  if (!isObj(v)) return null;
  return {
    timeRemaining: str(v.timeRemaining),
    secondsRemaining: num(v.secondsRemaining),
    running: v.running === true,
    inIntermission: v.inIntermission === true,
  };
}

export function parseGame(v: unknown): Game | null {
  if (!isObj(v)) return null;
  const id = num(v.id) ?? str(v.id);
  const away = parseTeam(v.awayTeam);
  const home = parseTeam(v.homeTeam);
  if (id === null || !away || !home) return null;
  const clock = parseClock(v.clock);
  const pd = isObj(v.periodDescriptor) ? v.periodDescriptor : {};
  const gameState = str(v.gameState);
  const scheduleState = str(v.gameScheduleState);
  return {
    id: String(id),
    source: 'live',
    gameType: num(v.gameType),
    startTimeUTC: str(v.startTimeUTC),
    status: mapStatus(gameState, scheduleState, clock),
    rawGameState: gameState,
    rawScheduleState: scheduleState,
    away,
    home,
    period: num(pd.number) ?? num(v.period),
    periodType: periodType(pd.periodType),
    maxRegulationPeriods: num(pd.maxRegulationPeriods) ?? 3,
    clock,
    lastPeriodType: isObj(v.gameOutcome) ? periodType(v.gameOutcome.lastPeriodType) : null,
  };
}

export interface ScoreResponse {
  currentDate: string | null;
  games: Game[];
  /** Number of game entries that could not be parsed (reported in diagnostics). */
  rejected: number;
}

function parseGames(list: unknown): { games: Game[]; rejected: number } {
  const games: Game[] = [];
  let rejected = 0;
  if (Array.isArray(list)) {
    for (const g of list) {
      const p = parseGame(g);
      if (p) games.push(p);
      else rejected++;
    }
  }
  return { games, rejected };
}

/** /v1/score/{date} — today's games with live scores. */
export function parseScoreResponse(body: unknown): ScoreResponse {
  if (!isObj(body)) throw new Error('Score response is not an object');
  if (!Array.isArray(body.games)) throw new Error('Score response has no games array');
  return { currentDate: str(body.currentDate), ...parseGames(body.games) };
}

export interface ScheduleDay {
  date: string;
  games: Game[];
}

/** /v1/schedule/{date} — a week of games, used for upcoming matchups. */
export function parseScheduleResponse(body: unknown): { days: ScheduleDay[]; rejected: number } {
  if (!isObj(body) || !Array.isArray(body.gameWeek)) throw new Error('Schedule response has no gameWeek array');
  let rejected = 0;
  const days: ScheduleDay[] = [];
  for (const d of body.gameWeek) {
    if (!isObj(d)) continue;
    const date = str(d.date);
    if (!date) continue;
    const parsed = parseGames(d.games);
    rejected += parsed.rejected;
    days.push({ date, games: parsed.games });
  }
  return { days, rejected };
}
