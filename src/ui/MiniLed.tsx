import { useEffect, useRef } from 'react';
import type { RGBAImage } from '../core/image';

/** Small static LED rendering of an image at true LED resolution (one dot per pixel). */
export function MiniLed({ image, cols, rows, pitch = 5, label }: { image: RGBAImage | null; cols: number; rows: number; pitch?: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const p = pitch * dpr;
    c.width = cols * p;
    c.height = rows * p;
    c.style.width = `${cols * pitch}px`;
    c.style.height = `${rows * pitch}px`;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, c.width, c.height);
    const ox = image ? Math.floor((cols - image.width) / 2) : 0;
    const oy = image ? Math.floor((rows - image.height) / 2) : 0;
    const r = p * 0.36;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        let col = '#141414';
        const ix = x - ox, iy = y - oy;
        if (image && ix >= 0 && iy >= 0 && ix < image.width && iy < image.height) {
          const i = (iy * image.width + ix) * 4;
          const a = image.data[i + 3] / 255;
          if (a > 0.02 && (image.data[i] | image.data[i + 1] | image.data[i + 2])) col = `rgb(${Math.round(image.data[i] * a)},${Math.round(image.data[i + 1] * a)},${Math.round(image.data[i + 2] * a)})`;
        }
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x * p + p / 2, y * p + p / 2, r, 0, Math.PI * 2);
        ctx.fill();
      }
  }, [image, cols, rows, pitch]);
  return <canvas ref={ref} className="mini-led" role="img" aria-label={label} />;
}
