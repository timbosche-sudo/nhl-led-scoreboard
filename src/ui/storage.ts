import { sanitizeSettings, type Settings } from '../config/settings';
import type { Game } from '../nhl/types';

const SETTINGS_KEY = 'nhl-led-settings-v1';
const LAST_LIVE_KEY = 'nhl-led-last-live-v1';

export function loadSettings(): Settings {
  try {
    return sanitizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}'));
  } catch {
    return sanitizeSettings({});
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* private mode etc. */
  }
}

export interface PersistedLive {
  games: Game[];
  upcoming: Game[];
  date: string | null;
  lastSuccessAt: number | null;
}

/** Last real API snapshot, shown flagged as STALE after a reload until fresh data arrives. */
export function loadLastLive(): PersistedLive | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_LIVE_KEY) ?? 'null');
    if (v && Array.isArray(v.games) && v.games.every((g: Game) => g.source === 'live')) return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function saveLastLive(v: PersistedLive): void {
  try {
    localStorage.setItem(LAST_LIVE_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}
