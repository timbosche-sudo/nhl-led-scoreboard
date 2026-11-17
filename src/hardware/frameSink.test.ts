import { describe, expect, it } from 'vitest';
import { Framebuffer } from '../core/framebuffer';
import { decodeFrameHeader, encodeFrame } from './frameSink';

describe('frame wire format', () => {
  it('round-trips header and pixel bytes', () => {
    const fb = new Framebuffer(128, 32);
    fb.set(0, 0, [1, 2, 3]);
    fb.set(127, 31, [250, 251, 252]);
    const buf = encodeFrame(fb);
    expect(decodeFrameHeader(buf)).toEqual({ width: 128, height: 32, length: 10 + 128 * 32 * 3 });
    expect([...buf.slice(10, 13)]).toEqual([1, 2, 3]);
    expect([...buf.slice(-3)]).toEqual([250, 251, 252]);
    expect(decodeFrameHeader(new Uint8Array(20))).toBeNull();
  });
});
