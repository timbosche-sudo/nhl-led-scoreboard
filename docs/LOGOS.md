# Team logos: sources and attribution

* **Source:** official NHL artwork from `https://assets.nhle.com/logos/nhl/svg/{TEAM}_{dark|light}.svg`
  (the same URLs the NHL API returns in `logo` / `darkLogo`). The scoreboard uses the
  `_dark` variants by default because they are designed for dark backgrounds.
* **Licence:** NHL and team logos are trademarks of the NHL and its member clubs.
  They are **not** stored in this repository. The app loads them at runtime from the
  NHL CDN (through the proxy), or from a local cache you create on your own device
  with `npm run fetch-logos` (git-ignored, with a `sources.json` record of every URL).
* **No substitutes:** if a logo can't be retrieved the scoreboard draws a dotted
  placeholder frame with the team abbreviation. It never draws an imitation logo.
* **In the app:** Logos tab → select a team → *Source record* shows exactly which URL
  each logo was loaded from.

## LED resizing

Logos are rasterised once at 384 px (SVG viewBox aspect preserved), transparent
margins are trimmed, and then they are downsampled in pure TypeScript
(`src/core/resize.ts`) to fit the logo box (32×30 at 128×32):

| Method | What it does |
| --- | --- |
| Nearest neighbour | One source pixel per LED. Crisp and saturated, can lose thin details. |
| Bilinear | Blends 4 neighbours. Smooth, but skips detail at big reductions. |
| Area average | Averages every covered source pixel (high-quality downsampling). |
| LED optimised (default) | Area average + mild sharpen, hard alpha edges, near-black outlines left unlit, dark brand colours lifted. |

The default can be overridden per team in the Logos tab (★ marks an override),
e.g. if nearest-neighbour keeps a busy logo like Chicago's more recognisable.
