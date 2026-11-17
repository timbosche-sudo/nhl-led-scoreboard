/** Normalised game model used by every layout. Built only from real API data or explicit DEMO data. */
export type GameStatus =
  | 'scheduled'
  | 'pregame'
  | 'live'
  | 'intermission'
  | 'final'
  | 'postponed'
  | 'suspended'
  | 'cancelled'
  | 'unknown';

export type PeriodType = 'REG' | 'OT' | 'SO';

export interface TeamSide {
  abbrev: string;
  name: string;
  /** null when the API did not provide a score (e.g. future games). Never guessed. */
  score: number | null;
  sog: number | null;
  logoUrl: string | null;
  darkLogoUrl: string | null;
}

export interface GameClock {
  timeRemaining: string | null;
  secondsRemaining: number | null;
  running: boolean;
  inIntermission: boolean;
}

export interface Game {
  id: string;
  source: 'live' | 'demo';
  gameType: number | null;
  /** ISO timestamp in UTC, null if unknown. */
  startTimeUTC: string | null;
  status: GameStatus;
  rawGameState: string | null;
  rawScheduleState: string | null;
  away: TeamSide;
  home: TeamSide;
  period: number | null;
  periodType: PeriodType | null;
  maxRegulationPeriods: number;
  clock: GameClock | null;
  lastPeriodType: PeriodType | null;
}
