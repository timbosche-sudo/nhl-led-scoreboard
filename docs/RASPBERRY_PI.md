# Raspberry Pi plan (phase 2 — not built or tested yet)

> **Status:** No Raspberry Pi or LED hardware has been tested. Everything here is
> a researched plan. The software architecture is ready for it: all rendering is
> DOM-free and already runs headless under Node (`npm run render`).

## Recommended hardware

| Part | Notes |
| --- | --- |
| Raspberry Pi 4 (2 GB+ is plenty) | Officially supported by hzeller's library. Pi 5 support exists but the README says it is "not officially supported as of 2025/11". |
| 2 × 64×32 P2.5 HUB75 panels | Check the panel's scan rate (usually 1/16 for 64×32). Some newer panels use FM6126A/FM6127 driver chips and need `--led-panel-type=FM6126A`. |
| Adafruit RGB Matrix Bonnet (#3211) or HAT | Level-shifts the Pi's 3.3 V signals. Use `--led-gpio-mapping=adafruit-hat`. Optional solder jumper GPIO4↔GPIO18 + `adafruit-hat-pwm` reduces flicker. |
| 5 V power supply, 8 A or more | A 64×32 P2.5 panel can draw ~3–4 A at full white. Scoreboards are mostly black, but size for the worst case. Power the panels directly, not through the Pi. |
| HUB75 ribbon (panel 1 OUT → panel 2 IN) | Chain the two panels. |

## Software architecture on the Pi

```
               ┌───────────────────────── Raspberry Pi 4 ─────────────────────────┐
 iPad Safari ──┤ server/server.mjs  :8080  (web control panel = this app, NHL proxy) │
               │        │ settings (planned: /api/settings)                          │
               │        ▼                                                            │
               │ display runner (Node, planned)                                      │
               │   NhlDataService ─► ScoreboardEngine ─► Framebuffer (RGB24)         │
               │        logos: SVG → @resvg/resvg-js → LogoCache (same pipeline)     │
               │        │  frames via stdin: "NHLFB1" + w + h + RGB bytes            │
               │        ▼                                                            │
               │ matrix bridge (Python, hzeller rpi-rgb-led-matrix bindings, root)   │
               │   SetImage(PIL.Image.frombytes('RGB', (w, h), data)); SwapOnVSync  │
               └──────────────────────────────────────────────────────────────────┘
```

Why this split:

* The **same TypeScript engine** renders the browser simulator and the Pi, so
  layouts can't drift apart.
* Node on the Pi can call `api-web.nhle.com` directly (CORS is a browser-only
  restriction), so no Cloudflare proxy is needed at home.
* hzeller's library needs root and real-time care; isolating it in a tiny
  bridge process keeps the rest unprivileged.

## Pi setup checklist (to be validated on real hardware)

1. Raspberry Pi OS Lite (64-bit), Wi-Fi configured in Raspberry Pi Imager, SSH on.
2. `/boot/firmware/config.txt`: `dtparam=audio=off`; blacklist `snd_bcm2835`
   (the library refuses to run while it is loaded).
3. Optional: `isolcpus=3` in `/boot/firmware/cmdline.txt` to dedicate a core to refresh.
4. Build hzeller's library and Python bindings:
   `pip install git+https://github.com/hzeller/rpi-rgb-led-matrix`.
5. First light test with the library's own demo:
   `sudo ./demo -D0 --led-rows=32 --led-cols=64 --led-chain=2 --led-gpio-mapping=adafruit-hat --led-slowdown-gpio=2`
   Increase `--led-slowdown-gpio` (2–4) if you see glitches on a Pi 4.
6. Install Node 22, `npm ci && npm run build && npm run fetch-logos`.
7. systemd services (auto-start on boot, restart on failure):
   `nhl-web.service` (server.mjs) and `nhl-matrix.service` (runner | bridge).
8. Overnight dimming / shut-off: a schedule in settings mapped to
   `--led-brightness` (bridge) or blank frames; `systemctl stop` for full off.
9. Clean shutdown: the bridge clears the panel on SIGTERM; a GPIO button can
   trigger `shutdown -h now`.

## Matrix flags for this project (expected)

```
--led-rows=32 --led-cols=64 --led-chain=2 --led-gpio-mapping=adafruit-hat
--led-slowdown-gpio=2 --led-brightness=60 --led-pwm-bits=11
```

None of this is claimed to work until it has been tried on the real panels.
