/** A straight (non-premultiplied) RGBA image, independent of any DOM API. */
export interface RGBAImage {
  width: number;
  height: number;
  /** width * height * 4 bytes, row-major, top-left origin. */
  data: Uint8ClampedArray;
}

export function createImage(width: number, height: number): RGBAImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}
