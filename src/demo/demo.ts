import type { Game, PeriodType } from '../nhl/types';

/** Everything about the demo is explicit and labelled; it is never mixed with live data. */
export const DEMO_GAME_ID = 'DEMO-STL-CHI';

export interface DemoState {
  awayScore: number;
  homeScore: number;
  period: number; // 1-3 regulation, 4 = OT, 5 = SO
  secondsRemaining: number;
  running: boolean;
  intermission: boolean;
  final: boolean;
  /** Wall-clock ms of the last tick while running. */
  lastTickAt: number | null;
}

export const DEMO_INITIAL: DemoState = {
  awayScore: 2,
  homeScore: 1,
  period: 3,
  secondsRemaining: 12 * 60 + 41,
  running: false,
  intermission: false,
  final: false,
  lastTickAt: null,
};

const periodLength = (p: number) => (p === 4 ? 5 * 60 : 20 * 60);
const INTERMISSION_SECONDS = 18 * 60;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class DemoController {
  state: DemoState = { ...DEMO_INITIAL };
  /** St. Louis Blues (away) at Chicago Blackhawks (home). */
  readonly away = { abbrev: 'STL', name: 'Blues' };
  readonly home = { abbrev: 'CHI', name: 'Blackhawks' };

  reset(): void {
    this.state = { ...DEMO_INITIAL };
  }

  /** Advance the simulated clock by real elapsed time. */
  tick(now: number): void {
    const s = this.state;
    if (!s.running || s.final) {
      s.lastTickAt = null;
      return;
    }
    if (s.lastTickAt === null) {
      s.lastTickAt = now;
      return;
    }
    const dt = (now - s.lastTickAt) / 1000;
    s.lastTickAt = now;
    s.secondsRemaining = Math.max(0, s.secondsRemaining - dt);
    if (s.secondsRemaining === 0) {
      s.running = false;
      s.lastTickAt = null;
    }
  }

  addGoal(side: 'away' | 'home'): void {
    if (this.state.final) return;
    if (side === 'away') this.state.awayScore++;
    else this.state.homeScore++;
    // Sudden death: an overtime goal ends the game.
    if (this.state.period === 4) this.endGame();
  }

  removeGoal(side: 'away' | 'home'): void {
    if (side === 'away') this.state.awayScore = Math.max(0, this.state.awayScore - 1);
    else this.state.homeScore = Math.max(0, this.state.homeScore - 1);
  }

  toggleClock(now: number): void {
    const s = this.state;
    if (s.final || s.period === 5) return;
    if (s.secondsRemaining <= 0) return;
    s.running = !s.running;
    s.lastTickAt = s.running ? now : null;
  }

  startIntermission(): void {
    const s = this.state;
    if (s.final) return;
    s.running = false;
    s.intermission = true;
    s.secondsRemaining = INTERMISSION_SECONDS;
  }

  nextPeriod(): void {
    const s = this.state;
    if (s.final) return;
    if (s.period >= 5) return;
    s.period += 1;
    s.intermission = false;
    s.running = false;
    s.secondsRemaining = s.period === 5 ? 0 : periodLength(s.period);
  }

  prevPeriod(): void {
    const s = this.state;
    if (s.period <= 1) return;
    s.period -= 1;
    s.final = false;
    s.intermission = false;
    s.running = false;
    s.secondsRemaining = periodLength(s.period);
  }

  endGame(): void {
    const s = this.state;
    s.final = true;
    s.running = false;
    s.intermission = false;
  }

  game(): Game {
    const s = this.state;
    const pt: PeriodType = s.period === 5 ? 'SO' : s.period === 4 ? 'OT' : 'REG';
    return {
      id: DEMO_GAME_ID,
      source: 'demo',
      gameType: 2,
      startTimeUTC: null,
      status: s.final ? 'final' : s.intermission ? 'intermission' : 'live',
      rawGameState: 'DEMO',
      rawScheduleState: 'DEMO',
      away: { abbrev: this.away.abbrev, name: this.away.name, score: s.awayScore, sog: null, logoUrl: null, darkLogoUrl: null },
      home: { abbrev: this.home.abbrev, name: this.home.name, score: s.homeScore, sog: null, logoUrl: null, darkLogoUrl: null },
      period: s.period,
      periodType: pt,
      maxRegulationPeriods: 3,
      clock: {
        timeRemaining: s.period === 5 ? null : fmt(Math.ceil(s.secondsRemaining)),
        secondsRemaining: Math.ceil(s.secondsRemaining),
        running: s.running,
        inIntermission: s.intermission,
      },
      lastPeriodType: s.final ? pt : null,
    };
  }
}
