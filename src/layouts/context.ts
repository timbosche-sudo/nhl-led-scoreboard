import type { Framebuffer } from '../core/framebuffer';
import type { LogoSource } from '../logos/logoCache';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedElement extends Box {
  name: string;
}

export interface RenderContext {
  fb: Framebuffer;
  /** Wall-clock time used for status text (time zones, countdowns). */
  now: Date;
  /** Monotonic-ish ms timestamp used for blinking/animation. */
  t: number;
  timeZone: string;
  logos: LogoSource;
  /** Data is the last known copy and could not be refreshed. */
  stale: boolean;
  /** Collects element boxes so tests can check bounds/overlaps. */
  placed?: PlacedElement[];
}

export function place(ctx: RenderContext, name: string, box: Box): Box {
  ctx.placed?.push({ name, ...box });
  return box;
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
