import { createImage, type RGBAImage } from '../core/image';
import { parseGame } from '../nhl/parse';
import type { Game } from '../nhl/types';

/** Raw api-web.nhle.com-shaped game JSON (fields as seen in real /v1/score and /v1/schedule payloads). */
export function apiGame(o: {
  id?: number;
  away?: string;
  home?: string;
  awayScore?: number;
  homeScore?: number;
  gameState?: string;
  scheduleState?: string;
  period?: number;
  periodType?: string;
  clock?: { timeRemaining: string; secondsRemaining: number; running: boolean; inIntermission: boolean } | null;
  lastPeriodType?: string;
  startTimeUTC?: string;
}): Record<string, unknown> {
  const team = (abbrev: string, score?: number) => ({
    id: 1,
    commonName: { default: abbrev },
    abbrev,
    logo: `https://assets.nhle.com/logos/nhl/svg/${abbrev}_light.svg`,
    darkLogo: `https://assets.nhle.com/logos/nhl/svg/${abbrev}_dark.svg`,
    ...(score === undefined ? {} : { score }),
  });
  return {
    id: o.id ?? 2026020100,
    season: 20262027,
    gameType: 2,
    startTimeUTC: o.startTimeUTC ?? '2026-11-18T01:00:00Z',
    gameState: o.gameState ?? 'LIVE',
    gameScheduleState: o.scheduleState ?? 'OK',
    awayTeam: team(o.away ?? 'STL', o.awayScore),
    homeTeam: team(o.home ?? 'CHI', o.homeScore),
    ...(o.clock === null ? {} : { clock: o.clock ?? { timeRemaining: '12:41', secondsRemaining: 761, running: true, inIntermission: false } }),
    periodDescriptor: { number: o.period ?? 3, periodType: o.periodType ?? 'REG', maxRegulationPeriods: 3 },
    ...(o.lastPeriodType ? { gameOutcome: { lastPeriodType: o.lastPeriodType } } : {}),
  };
}

export function game(o: Parameters<typeof apiGame>[0] = {}): Game {
  const g = parseGame(apiGame(o));
  if (!g) throw new Error('bad test game');
  return g;
}

/** A synthetic "logo": coloured disc with a white stripe on a transparent canvas. */
export function syntheticLogo(w = 200, h = 160, color: [number, number, number] = [0, 47, 135]): RGBAImage {
  const img = createImage(w, h);
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.4;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
        const stripe = Math.abs(y - cy) < r * 0.15;
        img.data.set(stripe ? [255, 255, 255, 255] : [...color, 255], i);
      }
    }
  return img;
}
