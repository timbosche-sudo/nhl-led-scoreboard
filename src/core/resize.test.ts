import { describe, expect, it } from 'vitest';
import { alphaBounds, fitLogo, fitSize, resize, type ResizeMethod } from './resize';
import { createImage } from './image';
import { syntheticLogo } from '../test/helpers';
import { LogoCache } from '../logos/logoCache';
import { encodePNG, crc32 } from './png';
import { inflateSync } from 'node:zlib';

describe('resizing', () => {
  it('fitSize preserves aspect ratio', () => {
    expect(fitSize(200, 100, 32, 30)).toEqual({ width: 32, height: 16 });
    expect(fitSize(100, 200, 32, 30)).toEqual({ width: 15, height: 30 });
    expect(fitSize(1, 1000, 32, 30)).toEqual({ width: 1, height: 30 });
  });
  it('trims transparent margins before fitting', () => {
    const img = createImage(100, 100);
    for (let y = 40; y < 60; y++) for (let x = 20; x < 80; x++) img.data.set([255, 0, 0, 255], (y * 100 + x) * 4);
    expect(alphaBounds(img)).toEqual({ x: 20, y: 40, w: 60, h: 20 });
    const out = fitLogo(img, 30, 30, 'area')!;
    expect(out.width).toBe(30);
    expect(out.height).toBe(10);
  });
  it.each(['nearest', 'bilinear', 'area', 'led'] as ResizeMethod[])('%s keeps colours and transparency', (m) => {
    const out = fitLogo(syntheticLogo(), 32, 30, m)!;
    expect(out.width).toBeLessThanOrEqual(32);
    expect(out.height).toBeLessThanOrEqual(30);
    // centre of the disc is the white stripe; edge pixels outside the disc stay transparent
    const c = ((out.height >> 1) * out.width + (out.width >> 1)) * 4;
    expect(out.data[c]).toBeGreaterThan(200);
    expect(out.data[3]).toBe(0);
    // somewhere there is Blues blue
    let blue = false;
    for (let i = 0; i < out.data.length; i += 4) if (out.data[i + 3] > 200 && out.data[i + 2] > out.data[i] + 60) blue = true;
    expect(blue).toBe(true);
  });
  it('led method produces only fully opaque or fully transparent pixels', () => {
    const out = resize(syntheticLogo(), 30, 24, 'led');
    for (let i = 3; i < out.data.length; i += 4) expect([0, 255]).toContain(out.data[i]);
  });
  it('empty images yield null (=> placeholder, never an invented logo)', () => {
    expect(fitLogo(createImage(10, 10), 30, 30, 'led')).toBeNull();
    const cache = new LogoCache();
    expect(cache.get('STL', 30, 30)).toBeNull();
    cache.setSource('STL', syntheticLogo());
    expect(cache.get('STL', 30, 30)).not.toBeNull();
    expect(cache.state('STL')).toBe('ready');
  });
});

describe('PNG export', () => {
  it('writes a valid PNG that round-trips', () => {
    const rgba = new Uint8Array(4 * 4 * 2).map((_, i) => (i * 37) & 255);
    const png = encodePNG(4, 2, rgba);
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    // IDAT payload inflates back to the filtered scanlines
    const idatLen = new DataView(png.buffer).getUint32(33);
    const idat = png.slice(41, 41 + idatLen);
    const raw = inflateSync(Buffer.from(idat));
    expect(raw.length).toBe(2 * (4 * 4 + 1));
    expect(crc32(new TextEncoder().encode('IEND'))).toBe(0xae426082);
  });
});

describe('SVG intrinsic size (NHL SVGs only have a viewBox)', async () => {
  const { withIntrinsicSize } = await import('../ui/browserLogos');
  it('adds width/height from the viewBox, preserving aspect ratio', () => {
    expect(withIntrinsicSize('<svg fill="none" viewBox="0 0 960 640" xmlns="http://www.w3.org/2000/svg"><path/></svg>')).toBe(
      '<svg fill="none" viewBox="0 0 960 640" xmlns="http://www.w3.org/2000/svg" width="384" height="256"><path/></svg>',
    );
  });
  it('leaves SVGs with explicit size alone', () => {
    const s = '<svg width="10" height="20" viewBox="0 0 1 2"></svg>';
    expect(withIntrinsicSize(s)).toBe(s);
  });
});
