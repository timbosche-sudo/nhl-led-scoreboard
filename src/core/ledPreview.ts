import type { Framebuffer } from './framebuffer';

/**
 * DOM-free LED-style preview: every framebuffer pixel becomes a round dot on a
 * black background (nearest-neighbour, no glow). Used for docs/screenshots and
 * by headless tools; the browser simulator does the same on a canvas.
 */
export function renderLedPreview(fb: Framebuffer, pitch = 8, gap = 0.25): { width: number; height: number; data: Uint8ClampedArray } {
  const W = fb.width * pitch;
  const H = fb.height * pitch;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  const r = (pitch * (1 - gap)) / 2;
  const c = pitch / 2;
  // precompute dot mask with simple 4x supersampled anti-aliasing
  const mask = new Float32Array(pitch * pitch);
  for (let y = 0; y < pitch; y++)
    for (let x = 0; x < pitch; x++) {
      let hit = 0;
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const dx = x + (sx + 0.5) / 4 - c;
          const dy = y + (sy + 0.5) / 4 - c;
          if (dx * dx + dy * dy <= r * r) hit++;
        }
      mask[y * pitch + x] = hit / 16;
    }
  for (let py = 0; py < fb.height; py++)
    for (let px = 0; px < fb.width; px++) {
      const i = (py * fb.width + px) * 3;
      let R = fb.data[i], G = fb.data[i + 1], B = fb.data[i + 2];
      if (!(R | G | B)) R = G = B = 20; // unlit LED
      for (let y = 0; y < pitch; y++)
        for (let x = 0; x < pitch; x++) {
          const m = mask[y * pitch + x];
          if (!m) continue;
          const o = ((py * pitch + y) * W + px * pitch + x) * 4;
          out[o] = R * m;
          out[o + 1] = G * m;
          out[o + 2] = B * m;
        }
    }
  return { width: W, height: H, data: out };
}
