import type { ResizeMethod } from '../core/resize';
import type { LayoutId } from '../layouts/layouts';
import { DEFAULT_TIME_ZONE, isValidTimeZone } from '../nhl/time';
import type { GameMode } from '../scheduler/rotation';
import { getTeam } from '../teams/teams';

export interface Resolution {
  id: string;
  label: string;
  width: number;
  height: number;
  panels: string;
}

export const RESOLUTIONS: Resolution[] = [
  { id: '128x32', label: '128×32 — two 64×32 panels', width: 128, height: 32, panels: '2 × (64×32)' },
  { id: '192x32', label: '192×32 — three 64×32 panels', width: 192, height: 32, panels: '3 × (64×32)' },
  { id: '128x64', label: '128×64 — two 64×64 panels', width: 128, height: 64, panels: '2 × (64×64)' },
];

export interface Settings {
  dataMode: 'demo' | 'live';
  gameMode: GameMode;
  favorite: string;
  selectedGameId: string | null;
  layout: 'auto' | LayoutId | 'goal';
  liveLayout: 'classic' | 'big';
  resolutionId: string;
  rotation: boolean;
  rotationSec: number;
  goalCelebrations: 'favorite' | 'all' | 'off';
  timeZone: string; // 'auto' = browser zone
  liveIntervalSec: number;
  idleIntervalSec: number;
  proxyUrl: string;
  logoMethod: ResizeMethod;
  logoMethodOverrides: Record<string, ResizeMethod>;
  logoVariant: 'dark' | 'light';
  finalHoldMin: number;
  // simulator appearance
  brightness: number; // 0.1 - 1
  glow: boolean;
  glowAmount: number; // 0 - 1
  pixelGap: number; // 0 - 0.6 fraction of pitch
  pixelShape: 'round' | 'square';
  showSeams: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  dataMode: 'demo',
  gameMode: 'favorite',
  favorite: 'STL',
  selectedGameId: null,
  layout: 'auto',
  liveLayout: 'classic',
  resolutionId: '128x32',
  rotation: true,
  rotationSec: 10,
  goalCelebrations: 'favorite',
  timeZone: DEFAULT_TIME_ZONE,
  liveIntervalSec: 30,
  idleIntervalSec: 300,
  proxyUrl: (import.meta.env?.VITE_NHL_PROXY_URL as string | undefined) ?? '',
  logoMethod: 'led',
  logoMethodOverrides: {},
  logoVariant: 'dark',
  finalHoldMin: 60,
  brightness: 0.9,
  glow: true,
  glowAmount: 0.55,
  pixelGap: 0.28,
  pixelShape: 'round',
  showSeams: false,
};

const clampNum = (v: unknown, min: number, max: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d);

/** Validate untrusted settings (e.g. from localStorage), falling back to defaults field by field. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    dataMode: oneOf(r.dataMode, ['demo', 'live'] as const, d.dataMode),
    gameMode: oneOf(r.gameMode, ['favorite', 'rotate', 'single'] as const, d.gameMode),
    favorite: typeof r.favorite === 'string' && getTeam(r.favorite) ? r.favorite : d.favorite,
    selectedGameId: typeof r.selectedGameId === 'string' ? r.selectedGameId : null,
    layout: oneOf(r.layout, ['auto', 'classic', 'big', 'matchup', 'final', 'goal'] as const, d.layout),
    liveLayout: oneOf(r.liveLayout, ['classic', 'big'] as const, d.liveLayout),
    resolutionId: RESOLUTIONS.some((x) => x.id === r.resolutionId) ? (r.resolutionId as string) : d.resolutionId,
    rotation: typeof r.rotation === 'boolean' ? r.rotation : d.rotation,
    rotationSec: clampNum(r.rotationSec, 3, 120, d.rotationSec),
    goalCelebrations: oneOf(r.goalCelebrations, ['favorite', 'all', 'off'] as const, d.goalCelebrations),
    timeZone: typeof r.timeZone === 'string' && (r.timeZone === 'auto' || isValidTimeZone(r.timeZone)) ? r.timeZone : d.timeZone,
    liveIntervalSec: clampNum(r.liveIntervalSec, 10, 300, d.liveIntervalSec),
    idleIntervalSec: clampNum(r.idleIntervalSec, 30, 3600, d.idleIntervalSec),
    proxyUrl: typeof r.proxyUrl === 'string' && r.proxyUrl.trim() ? r.proxyUrl.trim() : d.proxyUrl,
    logoMethod: oneOf(r.logoMethod, ['nearest', 'bilinear', 'area', 'led'] as const, d.logoMethod),
    logoMethodOverrides: sanitizeOverrides(r.logoMethodOverrides),
    logoVariant: oneOf(r.logoVariant, ['dark', 'light'] as const, d.logoVariant),
    finalHoldMin: clampNum(r.finalHoldMin, 0, 600, d.finalHoldMin),
    brightness: clampNum(r.brightness, 0.1, 1, d.brightness),
    glow: typeof r.glow === 'boolean' ? r.glow : d.glow,
    glowAmount: clampNum(r.glowAmount, 0, 1, d.glowAmount),
    pixelGap: clampNum(r.pixelGap, 0, 0.6, d.pixelGap),
    pixelShape: oneOf(r.pixelShape, ['round', 'square'] as const, d.pixelShape),
    showSeams: typeof r.showSeams === 'boolean' ? r.showSeams : d.showSeams,
  };
}

function sanitizeOverrides(v: unknown): Record<string, ResizeMethod> {
  const out: Record<string, ResizeMethod> = {};
  if (typeof v === 'object' && v !== null)
    for (const [k, m] of Object.entries(v)) if (getTeam(k) && ['nearest', 'bilinear', 'area', 'led'].includes(m as string)) out[k] = m as ResizeMethod;
  return out;
}

export function getResolution(id: string): Resolution {
  return RESOLUTIONS.find((r) => r.id === id) ?? RESOLUTIONS[0];
}
