import { isInProgress } from '../nhl/status';
import type { Game } from '../nhl/types';

/** favorite = Layout F (Blues priority), rotate = Layout E (Around the NHL), single = one chosen game. */
export type GameMode = 'favorite' | 'rotate' | 'single';

export interface SelectionInput {
  games: Game[];
  upcoming: Game[];
  mode: GameMode;
  favorite: string;
  selectedGameId: string | null;
  rotationMs: number;
  now: number;
  /** When the favourite's game was first seen as final (ms), for the post-game hold. */
  favoriteFinalSince: number | null;
  finalHoldMs: number;
}

export interface Selection {
  game: Game | null;
  reason: 'selected' | 'favorite' | 'favorite-next' | 'rotation' | 'none';
  index: number;
  total: number;
}

const byStart = (a: Game, b: Game) => (a.startTimeUTC ?? '').localeCompare(b.startTimeUTC ?? '') || a.id.localeCompare(b.id);

export const involves = (g: Game, team: string) => g.away.abbrev === team || g.home.abbrev === team;

/** Games to cycle through: in-progress games first; otherwise today's slate; otherwise upcoming. */
export function rotationPool(games: Game[], upcoming: Game[]): Game[] {
  const live = games.filter(isInProgress).sort(byStart);
  if (live.length) return live;
  if (games.length) return [...games].sort(byStart);
  return [...upcoming].sort(byStart).slice(0, 8);
}

export function selectGame(i: SelectionInput): Selection {
  if (i.mode === 'single' && i.selectedGameId) {
    const g = [...i.games, ...i.upcoming].find((x) => x.id === i.selectedGameId);
    if (g) return { game: g, reason: 'selected', index: 0, total: 1 };
  }
  if (i.mode === 'favorite') {
    const fav = i.games.find((g) => involves(g, i.favorite));
    if (fav) {
      const holding = fav.status !== 'final' || i.favoriteFinalSince === null || i.now - i.favoriteFinalSince < i.finalHoldMs;
      if (holding) return { game: fav, reason: 'favorite', index: 0, total: 1 };
    }
    // Nothing today at all: preview the favourite's next game instead of a blank board.
    if (!i.games.length) {
      const next = [...i.upcoming].sort(byStart).find((g) => involves(g, i.favorite));
      if (next) return { game: next, reason: 'favorite-next', index: 0, total: 1 };
    }
  }
  const pool = rotationPool(i.mode === 'favorite' ? i.games.filter((g) => !involves(g, i.favorite)) : i.games, i.upcoming);
  const finalPool = pool.length ? pool : rotationPool(i.games, i.upcoming);
  if (!finalPool.length) return { game: null, reason: 'none', index: 0, total: 0 };
  const idx = Math.floor(i.now / Math.max(1000, i.rotationMs)) % finalPool.length;
  return { game: finalPool[idx], reason: 'rotation', index: idx, total: finalPool.length };
}
