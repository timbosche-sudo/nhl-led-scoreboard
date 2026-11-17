import type { Game } from '../nhl/types';

export interface GoalEvent {
  gameId: string;
  team: string;
  side: 'away' | 'home';
  newScore: number;
  source: Game['source'];
}

interface Baseline {
  away: number | null;
  home: number | null;
}

/**
 * Detects real scoring changes between consecutive *fresh* snapshots.
 *
 * Rules (each covered by tests):
 *  - The first time a game is seen we only record a baseline (app start / page reload => no celebration).
 *  - After a failed/stale refresh, the next successful snapshot re-baselines silently
 *    (recovering from an outage must not replay goals scored while we were offline).
 *  - A score decrease (goal overturned) just updates the baseline.
 *  - Each (game, team, score) is celebrated at most once, so flip-flopping data can't repeat it.
 *  - Only games in progress (live / intermission) can produce goals.
 */
export class GoalDetector {
  private baselines = new Map<string, Baseline>();
  private celebrated = new Set<string>();
  private needsRebaseline = true;

  /** Call when a refresh failed or data became stale. */
  markStale(): void {
    this.needsRebaseline = true;
  }

  reset(): void {
    this.baselines.clear();
    this.celebrated.clear();
    this.needsRebaseline = true;
  }

  /** Feed a fresh snapshot; returns goals scored since the previous fresh snapshot. */
  update(games: Game[]): GoalEvent[] {
    const events: GoalEvent[] = [];
    const rebaseline = this.needsRebaseline;
    this.needsRebaseline = false;
    for (const g of games) {
      const prev = this.baselines.get(g.id);
      const cur = { away: g.away.score, home: g.home.score };
      this.baselines.set(g.id, cur);
      if (!prev || rebaseline) continue;
      if (g.status !== 'live' && g.status !== 'intermission') continue;
      for (const side of ['away', 'home'] as const) {
        const before = prev[side];
        const after = cur[side];
        if (before === null || after === null || after <= before) continue;
        const team = g[side].abbrev;
        const key = `${g.id}:${team}:${after}`;
        if (this.celebrated.has(key)) continue;
        this.celebrated.add(key);
        events.push({ gameId: g.id, team, side, newScore: after, source: g.source });
      }
    }
    return events;
  }
}
