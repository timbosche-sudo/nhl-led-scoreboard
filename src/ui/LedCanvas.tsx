import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { Framebuffer } from '../core/framebuffer';

export interface LedAppearance {
  brightness: number;
  glow: boolean;
  glowAmount: number;
  pixelGap: number;
  pixelShape: 'round' | 'square';
  showSeams: boolean;
  panelWidth: number;
  panelHeight: number;
}

export interface LedCanvasHandle {
  draw(fb: Framebuffer, force?: boolean): void;
}

/**
 * Browser LED simulator. It only *displays* the framebuffer: every lit dot is
 * one framebuffer pixel, enlarged with nearest-neighbour geometry. Glow is a
 * separate blurred layer composited on top after the real frame is drawn, and
 * can be switched off to see the raw pixels.
 */
export const LedCanvas = forwardRef<LedCanvasHandle, { appearance: LedAppearance; width: number; height: number; maxCssHeight?: number }>(
  function LedCanvas({ appearance, width, height, maxCssHeight }, ref) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const dotRef = useRef<HTMLCanvasElement>(null);
    const glowRef = useRef<HTMLCanvasElement>(null);
    const lastHash = useRef<number>(-1);
    const lastFb = useRef<Framebuffer | null>(null);
    const geom = useRef({ pitch: 8, dpr: 1 });
    const appRef = useRef(appearance);
    appRef.current = appearance;

    const paint = (fb: Framebuffer) => {
      const dot = dotRef.current;
      const glow = glowRef.current;
      if (!dot || !glow) return;
      const { pitch } = geom.current;
      const a = appRef.current;
      const W = fb.width, H = fb.height;
      const ctx = dot.getContext('2d')!;
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, dot.width, dot.height);
      const size = Math.max(1, pitch * (1 - a.pixelGap));
      const off = (pitch - size) / 2;
      const r = size / 2;
      const round = a.pixelShape === 'round' && size >= 3;
      const b = a.brightness;
      const d = fb.data;
      // unlit LEDs: very dark dots so the matrix structure is visible
      ctx.fillStyle = '#141414';
      ctx.beginPath();
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 3;
          if (d[i] | d[i + 1] | d[i + 2]) continue;
          if (round) {
            ctx.moveTo(x * pitch + off + size, y * pitch + off + r);
            ctx.arc(x * pitch + off + r, y * pitch + off + r, r, 0, Math.PI * 2);
          } else ctx.rect(x * pitch + off, y * pitch + off, size, size);
        }
      ctx.fill();
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 3;
          if (!(d[i] | d[i + 1] | d[i + 2])) continue;
          ctx.fillStyle = `rgb(${Math.round(d[i] * b)},${Math.round(d[i + 1] * b)},${Math.round(d[i + 2] * b)})`;
          if (round) {
            ctx.beginPath();
            ctx.arc(x * pitch + off + r, y * pitch + off + r, r, 0, Math.PI * 2);
            ctx.fill();
          } else ctx.fillRect(x * pitch + off, y * pitch + off, size, size);
        }
      if (a.showSeams) {
        ctx.save();
        ctx.strokeStyle = 'rgba(80,170,255,0.85)';
        ctx.lineWidth = Math.max(1, geom.current.dpr);
        ctx.setLineDash([pitch / 2, pitch / 2]);
        for (let px = a.panelWidth; px < W; px += a.panelWidth) {
          ctx.beginPath();
          ctx.moveTo(px * pitch, 0);
          ctx.lineTo(px * pitch, H * pitch);
          ctx.stroke();
        }
        for (let py = a.panelHeight; py < H; py += a.panelHeight) {
          ctx.beginPath();
          ctx.moveTo(0, py * pitch);
          ctx.lineTo(W * pitch, py * pitch);
          ctx.stroke();
        }
        ctx.restore();
      }
      // Glow layer: the same framebuffer at 1 px per LED, upscaled by CSS and blurred.
      const g = glow.getContext('2d')!;
      if (glow.width !== W || glow.height !== H) {
        glow.width = W;
        glow.height = H;
      }
      const img = g.createImageData(W, H);
      for (let p = 0, q = 0; p < d.length; p += 3, q += 4) {
        img.data[q] = d[p] * b;
        img.data[q + 1] = d[p + 1] * b;
        img.data[q + 2] = d[p + 2] * b;
        img.data[q + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    };

    const layout = () => {
      const wrap = wrapRef.current;
      const dot = dotRef.current;
      if (!wrap || !dot) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let cssW = wrap.clientWidth;
      if (maxCssHeight && (cssW * height) / width > maxCssHeight) cssW = (maxCssHeight * width) / height;
      const pitch = Math.max(2, Math.floor((cssW * dpr) / width));
      geom.current = { pitch, dpr };
      dot.width = pitch * width;
      dot.height = pitch * height;
      dot.style.width = `${dot.width / dpr}px`;
      dot.style.height = `${dot.height / dpr}px`;
      const glow = glowRef.current!;
      glow.style.width = dot.style.width;
      glow.style.height = dot.style.height;
      if (lastFb.current) paint(lastFb.current);
    };

    useEffect(() => {
      layout();
      const ro = new ResizeObserver(() => layout());
      if (wrapRef.current) ro.observe(wrapRef.current);
      return () => ro.disconnect();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [width, height, maxCssHeight]);

    useEffect(() => {
      if (lastFb.current) paint(lastFb.current);
    }, [appearance]);

    useImperativeHandle(ref, () => ({
      draw(fb: Framebuffer, force = false) {
        const h = fb.hash();
        if (!force && h === lastHash.current && lastFb.current === fb) return;
        lastHash.current = h;
        lastFb.current = fb;
        paint(fb);
      },
    }));

    const blurPx = Math.max(2, (geom.current.pitch / geom.current.dpr) * 0.9);
    return (
      <div className="led-wrap" ref={wrapRef}>
        <div className="led-stack">
          <canvas ref={dotRef} className="led-dots" aria-label={`Simulated ${width}×${height} LED matrix`} role="img" />
          <canvas
            ref={glowRef}
            className="led-glow"
            style={{ opacity: appearance.glow ? appearance.glowAmount : 0, filter: `blur(${blurPx}px)` }}
            aria-hidden
          />
        </div>
      </div>
    );
  },
);
