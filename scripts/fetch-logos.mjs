#!/usr/bin/env node
/*
 * Download the official NHL team logo SVGs from assets.nhle.com into public/logos/nhl/
 * so the scoreboard works without depending on the CDN at runtime (e.g. on the Raspberry Pi).
 *
 * These files are trademarks of the NHL and its teams. They are cached locally for
 * personal use and are git-ignored on purpose: do not commit or redistribute them.
 * A source record (sources.json) is written next to them.
 *
 *   npm run fetch-logos            # dark-background variants (default)
 *   npm run fetch-logos -- light   # light-background variants
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const TEAMS = 'ANA BOS BUF CGY CAR CHI COL CBJ DAL DET EDM FLA LAK MIN MTL NSH NJD NYI NYR OTT PHI PIT SJS SEA STL TBL TOR UTA VAN VGK WSH WPG'.split(' ');
const variants = process.argv.slice(2).filter((v) => v === 'dark' || v === 'light');
const VARIANTS = variants.length ? variants : ['dark'];
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'logos', 'nhl');

await mkdir(outDir, { recursive: true });
const record = { fetchedAt: new Date().toISOString(), source: 'https://assets.nhle.com/logos/nhl/svg/', license: 'NHL and team logos are trademarks of the NHL and its teams. Cached for personal, non-commercial use; not for redistribution.', files: {} };
let ok = 0, failed = 0;
for (const v of VARIANTS) {
  for (const t of TEAMS) {
    const url = `https://assets.nhle.com/logos/nhl/svg/${t}_${v}.svg`;
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'nhl-led-scoreboard/0.1 (personal scoreboard)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text.includes('<svg')) throw new Error('not an SVG');
      await writeFile(join(outDir, `${t}_${v}.svg`), text);
      record.files[`${t}_${v}.svg`] = { url, bytes: text.length };
      ok++;
    } catch (e) {
      console.error(`✗ ${t}_${v}: ${e.message}`);
      record.files[`${t}_${v}.svg`] = { url, error: e.message };
      failed++;
    }
  }
}
await writeFile(join(outDir, 'sources.json'), JSON.stringify(record, null, 2));
console.log(`Saved ${ok} logos to ${outDir}${failed ? ` (${failed} failed — those teams will show placeholders)` : ''}.`);
console.log('Rebuild (npm run build) so the cached logos are included in dist/.');
