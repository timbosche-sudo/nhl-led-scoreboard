import { NhlClient } from './client';
import { parseScheduleResponse, parseScoreResponse } from './parse';
import { addDays, hockeyDate } from './time';
import type { Game } from './types';

export interface DataSnapshot {
  /** Games for the current hockey day, from the last successful fetch. */
  games: Game[];
  /** Upcoming games (next ~7 days, excluding today), from the schedule endpoint. */
  upcoming: Game[];
  date: string | null;
  lastSuccessAt: number | null;
  lastAttemptAt: number | null;
  /** True when the most recent attempt failed or data is older than the stale threshold. */
  stale: boolean;
  status: 'idle' | 'loading' | 'ok' | 'error';
  error: string | null;
  rejected: number;
}

export interface ServiceOptions {
  client: NhlClient;
  timeZone: () => string;
  /** Poll interval while any game is live or about to start (ms). Default 30 s. */
  liveIntervalMs?: () => number;
  /** Poll interval when nothing is live (ms). Default 5 min. */
  idleIntervalMs?: () => number;
  scheduleIntervalMs?: number;
  now?: () => number;
  onUpdate: (s: DataSnapshot) => void;
}

/** Polls the NHL API on a timer with backoff. Contains no DOM code, so it can run on the Pi under Node. */
export class NhlDataService {
  private snap: DataSnapshot = {
    games: [],
    upcoming: [],
    date: null,
    lastSuccessAt: null,
    lastAttemptAt: null,
    stale: false,
    status: 'idle',
    error: null,
    rejected: 0,
  };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private lastScheduleAt = 0;
  private running = false;
  private readonly now: () => number;

  constructor(private readonly opts: ServiceOptions) {
    this.now = opts.now ?? Date.now;
  }

  get snapshot(): DataSnapshot {
    return this.snap;
  }

  /** Seed with previously persisted data (shown as stale until refreshed). */
  seed(s: Partial<DataSnapshot>): void {
    this.snap = { ...this.snap, ...s, stale: true, status: 'idle' };
    this.opts.onUpdate(this.snap);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  refreshNow(): void {
    if (!this.running) return;
    if (this.timer) clearTimeout(this.timer);
    this.lastScheduleAt = 0;
    void this.tick();
  }

  private emit(patch: Partial<DataSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    this.opts.onUpdate(this.snap);
  }

  private nextDelay(): number {
    const live = this.opts.liveIntervalMs?.() ?? 30_000;
    const idle = this.opts.idleIntervalMs?.() ?? 300_000;
    if (this.failures > 0) return Math.min(300_000, live * 2 ** (this.failures - 1));
    const now = this.now();
    const active = this.snap.games.some(
      (g) =>
        g.status === 'live' ||
        g.status === 'intermission' ||
        g.status === 'pregame' ||
        (g.status === 'scheduled' && g.startTimeUTC !== null && new Date(g.startTimeUTC).getTime() - now < 15 * 60_000),
    );
    return active ? live : idle;
  }

  async tick(): Promise<void> {
    const now = this.now();
    const date = hockeyDate(new Date(now), this.opts.timeZone());
    this.emit({ status: this.snap.lastSuccessAt ? this.snap.status : 'loading', lastAttemptAt: now });
    try {
      const score = await this.opts.client.getJson(`/v1/score/${date}`);
      const parsed = parseScoreResponse(score.data);
      let upcoming = this.snap.upcoming;
      if (now - this.lastScheduleAt > (this.opts.scheduleIntervalMs ?? 30 * 60_000) || this.snap.date !== date) {
        try {
          const sched = parseScheduleResponse((await this.opts.client.getJson(`/v1/schedule/${addDays(date, 1)}`)).data);
          upcoming = sched.days.filter((d) => d.date > date).flatMap((d) => d.games);
          this.lastScheduleAt = now;
        } catch {
          /* schedule is optional; keep previous upcoming list */
        }
      }
      this.failures = 0;
      this.emit({
        games: parsed.games,
        upcoming,
        date,
        lastSuccessAt: score.fetchedAt,
        stale: false,
        status: 'ok',
        error: null,
        rejected: parsed.rejected,
      });
    } catch (e) {
      this.failures++;
      // Keep the last known games, but flag them as stale. Never fabricate.
      this.emit({ stale: true, status: 'error', error: (e as Error).message + (this.opts.client.diagnostics.lastError ? ` — ${this.opts.client.diagnostics.lastError}` : '') });
    }
    if (this.running) this.timer = setTimeout(() => void this.tick(), this.nextDelay());
  }
}
