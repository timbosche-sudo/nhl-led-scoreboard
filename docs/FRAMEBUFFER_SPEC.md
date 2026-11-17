# Framebuffer specification

The browser simulator and the future Raspberry Pi driver display **the same bytes**.
Every layout, logo, digit and animation is drawn by `src/` code into a
`Framebuffer` (`src/core/framebuffer.ts`). Nothing is drawn at a higher
resolution and scaled down afterwards.

## Pixel data

| Property | Value |
| --- | --- |
| Default size | 128 × 32 (two 64×32 HUB75 panels side by side) |
| Other supported sizes | 192 × 32 (three panels), 128 × 64 (two 64×64 panels) |
| Format | RGB24, 3 bytes per pixel: R, G, B (0–255) |
| Order | Row-major. Pixel (x, y) is at byte `(y * width + x) * 3` |
| Origin | Top-left |
| Colour | sRGB values as designed. **No** brightness, gamma or colour correction is applied |
| Size | `width * height * 3` bytes (12,288 bytes for 128×32) |

Brightness, gamma/PWM bits and panel chaining belong to the display ("sink"),
not the framebuffer, because they are hardware properties:

* **Browser simulator** (`src/ui/LedCanvas.tsx`): multiplies by the brightness
  slider, draws one dot per pixel with nearest-neighbour geometry, then adds
  optional glow as a separate blurred layer *after* the frame is drawn.
* **Raspberry Pi** (planned): hzeller's `rpi-rgb-led-matrix` applies
  `--led-brightness`, `--led-pwm-bits` and its own gamma table.

## Panel mapping for 128×32

```
x:  0 ............ 63 | 64 ........... 127
    [ panel 1 (64x32) ] [ panel 2 (64x32) ]   <- the "seam" overlay in the simulator
```

With two chained 64×32 panels, hzeller's library presents one 128×32 canvas
(`--led-rows=32 --led-cols=64 --led-chain=2`), so framebuffer pixel (x, y)
maps directly to canvas pixel (x, y). If the panels are mounted so that the
data input is on the right, set `--led-pixel-mapper="Rotate:180"` or swap
the chain order; the framebuffer itself never changes.

## Stream format between processes

`src/hardware/frameSink.ts` defines a minimal wire format for sending frames
to a separate display process (stdin pipe, UNIX socket or WebSocket):

```
offset 0  : "NHLFB1" (6 ASCII bytes, magic)
offset 6  : uint16 big-endian width
offset 8  : uint16 big-endian height
offset 10 : width*height*3 bytes RGB24 (as above)
```

## Exporting / inspecting frames

* **In the app:** Diagnostics → *PNG 1:1*, *PNG 8×*, *Raw RGB (.rgb)*, *Inspect bytes*.
* **Headless (Node, no browser):** `npm run render` writes every layout at every
  resolution to `docs/frames/` (`*.png` = 1:1 framebuffer, `*.led.png` = dot preview).
* **Raw file → image:** `ffmpeg -f rawvideo -pix_fmt rgb24 -s 128x32 -i frame.rgb frame.png`
