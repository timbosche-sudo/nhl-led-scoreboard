/**
 * Minimal PNG encoder (RGBA8, zlib "stored" blocks, no compression).
 * Dependency-free so it runs in the browser, Node tests and on a Raspberry Pi.
 * Framebuffers are tiny (128x32 = 16 KB), so skipping compression is fine.
 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1, b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function u32(n: number): number[] {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typed = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) typed[i] = type.charCodeAt(i);
  typed.set(data, 4);
  const out = new Uint8Array(12 + data.length);
  out.set(u32(data.length), 0);
  out.set(typed, 4);
  out.set(u32(crc32(typed)), 8 + data.length);
  return out;
}

/**
 * @param deflate optional zlib compressor (e.g. Node's zlib.deflateSync). Without it the
 * image is stored uncompressed, which is fine for 1:1 framebuffers (a few KB).
 */
export function encodePNG(width: number, height: number, rgba: Uint8Array | Uint8ClampedArray, deflate?: (raw: Uint8Array) => Uint8Array): Uint8Array {
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  if (deflate) return assemble(width, height, deflate(raw));
  const blocks: number[] = [0x78, 0x01];
  const MAX = 65535;
  for (let off = 0; off < raw.length || off === 0; off += MAX) {
    const len = Math.min(MAX, raw.length - off);
    const final = off + len >= raw.length ? 1 : 0;
    blocks.push(final, len & 255, len >> 8, ~len & 255, (~len >> 8) & 255);
    for (let i = 0; i < len; i++) blocks.push(raw[off + i]);
    if (final) break;
  }
  blocks.push(...u32(adler32(raw)));
  return assemble(width, height, new Uint8Array(blocks));
}

function assemble(width: number, height: number, idat: Uint8Array): Uint8Array {
  const ihdr = new Uint8Array([...u32(width), ...u32(height), 8, 6, 0, 0, 0]);
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array())];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Nearest-neighbour upscale of RGBA data, e.g. for a viewable 8x PNG preview. */
export function upscaleRGBA(w: number, h: number, rgba: Uint8ClampedArray, f: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * f * h * f * 4);
  for (let y = 0; y < h * f; y++)
    for (let x = 0; x < w * f; x++) {
      const s = (Math.floor(y / f) * w + Math.floor(x / f)) * 4;
      const d = (y * w * f + x) * 4;
      out[d] = rgba[s]; out[d + 1] = rgba[s + 1]; out[d + 2] = rgba[s + 2]; out[d + 3] = rgba[s + 3];
    }
  return out;
}
