import type { Framebuffer } from '../core/framebuffer';

/**
 * A FrameSink is anything that can show a framebuffer: the browser simulator
 * canvas, a PNG file, or (future) a HUB75 LED matrix on a Raspberry Pi.
 * The engine never knows which one it is talking to.
 *
 * Wire format (see docs/FRAMEBUFFER_SPEC.md): width*height*3 bytes, RGB24,
 * row-major, origin top-left, sRGB values with no brightness/gamma applied.
 * Brightness, gamma and panel chaining are the sink's job, because they are
 * hardware properties (hzeller's library handles them via --led-brightness,
 * --led-pwm-bits, --led-chain, etc.).
 */
export interface FrameSink {
  readonly width: number;
  readonly height: number;
  /** Show one frame. Must not keep a reference to fb.data after returning. */
  show(fb: Framebuffer): void | Promise<void>;
  /** 0-100, mapped to the hardware's brightness control. */
  setBrightness?(percent: number): void;
  close?(): void | Promise<void>;
}

/** Header written before a raw frame stream so a reader can validate it. */
export const FRAME_MAGIC = 'NHLFB1';

/**
 * Encode a frame for a byte stream (stdin pipe, UNIX socket or WebSocket) to a
 * separate display process: 6-byte magic, uint16 width, uint16 height (big endian),
 * then width*height*3 RGB bytes.
 */
export function encodeFrame(fb: Framebuffer): Uint8Array {
  const out = new Uint8Array(10 + fb.data.length);
  for (let i = 0; i < 6; i++) out[i] = FRAME_MAGIC.charCodeAt(i);
  out[6] = fb.width >> 8;
  out[7] = fb.width & 255;
  out[8] = fb.height >> 8;
  out[9] = fb.height & 255;
  out.set(fb.data, 10);
  return out;
}

export function decodeFrameHeader(buf: Uint8Array): { width: number; height: number; length: number } | null {
  if (buf.length < 10) return null;
  for (let i = 0; i < 6; i++) if (buf[i] !== FRAME_MAGIC.charCodeAt(i)) return null;
  const width = (buf[6] << 8) | buf[7];
  const height = (buf[8] << 8) | buf[9];
  return { width, height, length: 10 + width * height * 3 };
}
