import { AMBER, GOLD, WHITE } from '../core/color';
import { Framebuffer } from '../core/framebuffer';
import { GoalDetector, type GoalEvent } from '../animation/goalDetector';
import { renderGoal, type GoalCelebration } from '../animation/goal';
import type { PlacedElement, RenderContext } from '../layouts/context';
import { autoLayout, renderLayout, renderMessage, type LayoutId } from '../layouts/layouts';
import type { LogoSource } from '../logos/logoCache';
import { formatDayLabel } from '../nhl/time';
import type { Game } from '../nhl/types';
import { involves, selectGame, type GameMode, type Selection } from '../scheduler/rotation';

export interface EngineSettings {
  gameMode: GameMode;
  favorite: string;
  selectedGameId: string | null;
  rotation: boolean;
  rotationSec: number;
  layout: 'auto' | LayoutId | 'goal';
  liveLayout: 'classic' | 'big';
  goalCelebrations: 'favorite' | 'all' | 'off';
  timeZone: string;
  finalHoldMin: number;
}

export interface EngineData {
  games: Game[];
  upcoming: Game[];
  stale: boolean;
  status: 'idle' | 'loading' | 'ok' | 'error';
  source: 'live' | 'demo';
}

export interface FrameInfo {
  gameId: string | null;
  layout: LayoutId | 'goal' | 'message';
  selection: Selection | null;
  celebrating: boolean;
  placed: PlacedElement[];
  clipCount: number;
}

/**
 * The DOM-free heart of the scoreboard: owns the framebuffer, picks the game,
 * chooses a layout, runs animations. The browser simulator and the future
 * Raspberry Pi runner both just call render() and ship fb.data to a display.
 */
export class ScoreboardEngine {
  fb: Framebuffer;
  private data: EngineData = { games: [], upcoming: [], stale: false, status: 'idle', source: 'demo' };
  private detector = new GoalDetector();
  private celebration: GoalCelebration | null = null;
  private queue: GoalCelebration[] = [];
  private favoriteFinalSince = new Map<string, number>();
  /** Set when rotation is paused: the game shown when rotation was switched off. */
  private pinnedGameId: string | null = null;
  lastGoals: GoalEvent[] = [];

  constructor(
    width: number,
    height: number,
    public logos: LogoSource,
    public settings: EngineSettings,
  ) {
    this.fb = new Framebuffer(width, height);
  }

  setResolution(width: number, height: number): void {
    if (width !== this.fb.width || height !== this.fb.height) this.fb = new Framebuffer(width, height);
  }

  /** Switching between demo and live must never produce a celebration. */
  resetDetection(): void {
    this.detector.reset();
    this.celebration = null;
    this.queue = [];
  }

  setData(d: EngineData, now = Date.now()): GoalEvent[] {
    if (d.source !== this.data.source) this.resetDetection();
    this.data = d;
    if (d.stale) {
      this.detector.markStale();
      return [];
    }
    for (const g of d.games) {
      if (g.status === 'final' && !this.favoriteFinalSince.has(g.id)) this.favoriteFinalSince.set(g.id, now);
    }
    const events = this.detector.update(d.games);
    this.lastGoals = events;
    for (const e of events) {
      if (this.settings.goalCelebrations === 'off') continue;
      if (this.settings.goalCelebrations === 'favorite' && e.team !== this.settings.favorite) continue;
      const game = d.games.find((g) => g.id === e.gameId);
      if (game) this.queue.push({ game, team: e.team, side: e.side, startedAt: -1 });
    }
    return events;
  }

  /** Manually trigger a celebration (demo / test button). */
  triggerGoal(team?: string, gameId?: string): boolean {
    const game =
      (gameId && this.data.games.find((g) => g.id === gameId)) || this.currentGame(Date.now()) || this.data.games[0];
    if (!game) return false;
    const t = team ?? (involves(game, this.settings.favorite) ? this.settings.favorite : game.home.abbrev);
    const side = game.away.abbrev === t ? 'away' : 'home';
    this.queue.push({ game, team: t, side, startedAt: -1 });
    return true;
  }

  pinCurrent(now: number): void {
    this.pinnedGameId = this.select(now).game?.id ?? null;
  }

  private select(now: number): Selection {
    const s = this.settings;
    const favGame = this.data.games.find((g) => involves(g, s.favorite));
    const base = {
      games: this.data.games,
      upcoming: this.data.upcoming,
      favorite: s.favorite,
      rotationMs: s.rotationSec * 1000,
      now,
      favoriteFinalSince: favGame ? (this.favoriteFinalSince.get(favGame.id) ?? null) : null,
      finalHoldMs: s.finalHoldMin * 60_000,
    };
    if (!s.rotation && s.gameMode !== 'single' && this.pinnedGameId) {
      const sel = selectGame({ ...base, mode: 'single', selectedGameId: this.pinnedGameId });
      if (sel.game) return sel;
    }
    return selectGame({ ...base, mode: s.gameMode, selectedGameId: s.selectedGameId });
  }

  currentGame(now: number): Game | null {
    return this.select(now).game;
  }

  render(now: number = Date.now(), wallClock: Date = new Date(now)): FrameInfo {
    const fb = this.fb;
    fb.clear();
    const placed: PlacedElement[] = [];
    const ctx: RenderContext = { fb, now: wallClock, t: now, timeZone: this.settings.timeZone, logos: this.logos, stale: this.data.stale, placed };
    const selection = this.select(now);
    const game = selection.game;

    // Goal celebration in progress or queued?
    if (!this.celebration && this.queue.length) {
      this.celebration = this.queue.shift()!;
      this.celebration.startedAt = now;
    }
    if (this.settings.layout === 'goal' && !this.celebration && game) {
      const fav = involves(game, this.settings.favorite) ? this.settings.favorite : game.home.abbrev;
      this.celebration = { game, team: fav, side: game.away.abbrev === fav ? 'away' : 'home', startedAt: now };
    }
    if (this.celebration) {
      // show the latest score for that game during the celebration
      const fresh = this.data.games.find((g) => g.id === this.celebration!.game.id);
      if (fresh) this.celebration.game = fresh;
      if (renderGoal(ctx, this.celebration)) {
        return { gameId: this.celebration.game.id, layout: 'goal', selection, celebrating: true, placed, clipCount: fb.clipCount };
      }
      this.celebration = null;
      fb.clear();
      placed.length = 0;
    }

    if (!game) {
      const lines = this.messageLines(wallClock);
      renderMessage(ctx, lines);
      return { gameId: null, layout: 'message', selection, celebrating: false, placed, clipCount: fb.clipCount };
    }
    const layout: LayoutId =
      this.settings.layout === 'auto' || this.settings.layout === 'goal' ? autoLayout(game, this.settings.liveLayout) : this.settings.layout;
    renderLayout(ctx, layout, game);
    return { gameId: game.id, layout, selection, celebrating: false, placed, clipCount: fb.clipCount };
  }

  private messageLines(now: Date): { text: string; color?: typeof WHITE }[] {
    const d = this.data;
    if (d.status === 'loading' || d.status === 'idle') return [{ text: 'NHL SCORES', color: GOLD }, { text: 'CONNECTING...' }];
    if (d.status === 'error') return [{ text: 'NHL DATA', color: AMBER }, { text: 'UNAVAILABLE', color: AMBER }];
    const next = [...d.upcoming].sort((a, b) => (a.startTimeUTC ?? '').localeCompare(b.startTimeUTC ?? ''))[0];
    if (next?.startTimeUTC) {
      return [
        { text: 'NO GAMES TODAY', color: GOLD },
        { text: `NEXT ${formatDayLabel(next.startTimeUTC, now, this.settings.timeZone)}` },
      ];
    }
    return [{ text: 'NO GAMES TODAY', color: GOLD }];
  }
}
