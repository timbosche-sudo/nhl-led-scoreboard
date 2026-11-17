import { memo, useState } from 'react';
import { Framebuffer } from '../core/framebuffer';
import type { RGBAImage } from '../core/image';
import type { ResizeMethod } from '../core/resize';
import { drawLogo } from '../layouts/common';
import type { Settings } from '../config/settings';
import { RESIZE_METHODS } from '../core/resize';
import type { LogoCache } from '../logos/logoCache';
import { TEAMS, getTeam } from '../teams/teams';
import type { BrowserLogoLoader } from './browserLogos';
import { MiniLed } from './MiniLed';

/** Render a logo (or its labelled placeholder) exactly as the matrix would, via the core drawLogo. */
function logoFrame(cache: LogoCache, abbrev: string, w: number, h: number, method?: ResizeMethod): RGBAImage {
  const fb = new Framebuffer(w, h);
  const logos = { get: (a: string, mw: number, mh: number) => cache.get(a, mw, mh, method) };
  drawLogo({ fb, now: new Date(), t: 0, timeZone: 'UTC', logos, stale: false }, 'logo', abbrev, { x: 0, y: 0, w, h });
  return { width: w, height: h, data: fb.toRGBA() };
}

export const LogoGallery = memo(function LogoGallery({
  cache,
  loader,
  settings,
  update,
  showcase,
  setShowcase,
}: {
  cache: LogoCache;
  loader: BrowserLogoLoader;
  settings: Settings;
  update: (p: Partial<Settings>) => void;
  showcase: string | null;
  setShowcase: (a: string | null) => void;
  /** Bumped whenever a logo finishes loading, so the memoised gallery re-renders. */
  version: number;
}) {
  const [selected, setSelected] = useState<string>(settings.favorite);
  const [height, setHeight] = useState(30);
  const width = Math.round(height * 1.1);
  const team = getTeam(selected);
  const record = loader.records.get(selected);
  const override = settings.logoMethodOverrides[selected];
  const effective = override ?? settings.logoMethod;
  const setOverride = (m: ResizeMethod | null) => {
    const next = { ...settings.logoMethodOverrides };
    if (m === null || m === settings.logoMethod) delete next[selected];
    else next[selected] = m;
    update({ logoMethodOverrides: next });
  };
  const ready = TEAMS.filter((t) => cache.hasSource(t.abbrev)).length;

  return (
    <div className="gallery">
      <div className="card">
        <h2>Logo gallery</h2>
        <p className="muted">
          Every tile is the logo at real LED resolution ({width}×{height} box, one dot = one LED). {ready}/32 official logos loaded.
          {ready < 32 && ' Teams without a loaded logo show a dotted placeholder frame — never a substitute logo.'}
        </p>
        <div className="row wrap">
          <label className="field compact">
            <span className="field-label">Logo height {height}px</span>
            <input type="range" min={12} max={30} value={height} onChange={(e) => setHeight(Number(e.target.value))} />
          </label>
          <label className="field compact">
            <span className="field-label">Default resizing</span>
            <select value={settings.logoMethod} onChange={(e) => update({ logoMethod: e.target.value as Settings['logoMethod'] })}>
              {RESIZE_METHODS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field compact">
            <span className="field-label">NHL artwork</span>
            <select value={settings.logoVariant} onChange={(e) => update({ logoVariant: e.target.value as Settings['logoVariant'] })}>
              <option value="dark">For dark backgrounds</option>
              <option value="light">For light backgrounds</option>
            </select>
          </label>
        </div>
        <div className="logo-grid">
          {TEAMS.map((t) => {
            const st = cache.state(t.abbrev);
            return (
              <button key={t.abbrev} className={`logo-tile ${selected === t.abbrev ? 'selected' : ''}`} onClick={() => setSelected(t.abbrev)}>
                <MiniLed image={logoFrame(cache, t.abbrev, width, height)} cols={width} rows={height} pitch={3} label={`${t.abbrev} logo at LED resolution`} />
                <span className="logo-name">
                  {t.abbrev}
                  <small className={`ls ls-${st}`}>{st === 'ready' ? 'official' : st === 'loading' ? 'loading…' : 'placeholder'}</small>
                  {settings.logoMethodOverrides[t.abbrev] && <small className="ls">★</small>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="card">
        <h2>
          {team?.city} {team?.name}
        </h2>
        <p className="muted">
          Compare resizing techniques at {width}×{height}. Tap one to use it for {selected} only
          {override ? ` (currently: ${override}, overriding the default “${settings.logoMethod}”)` : ` (currently using the default “${settings.logoMethod}”)`}.
        </p>
        <div className="compare">
          {RESIZE_METHODS.map((m) => (
            <button key={m.id} className={`compare-cell ${effective === m.id ? 'selected' : ''}`} onClick={() => setOverride(m.id)} title={m.description}>
              <MiniLed image={logoFrame(cache, selected, width, height, m.id)} cols={width} rows={height} pitch={6} label={`${selected} ${m.label}`} />
              <b>{m.label}</b>
              <small>{m.description}</small>
            </button>
          ))}
        </div>
        <div className="row wrap">
          <button className="btn gold" onClick={() => setShowcase(showcase === selected ? null : selected)}>
            {showcase === selected ? 'Stop preview on main display' : 'Preview on main display'}
          </button>
          {override && (
            <button className="btn" onClick={() => setOverride(null)}>
              Use default method
            </button>
          )}
          <button className="btn" onClick={() => void loader.ensure(selected)}>
            Retry loading
          </button>
        </div>
        <h3>Source record</h3>
        {record?.url ? (
          <p className="small">
            Official NHL artwork loaded from <code>{record.url}</code>
            <br />
            via {record.sourceLabel}. NHL and team logos are trademarks of the NHL and its teams; used here for personal, non-commercial display.
          </p>
        ) : (
          <p className="small warn">
            Not loaded{record?.error ? `: ${record.error}` : '.'} Live logos need the same proxy as live data (Display → NHL proxy URL), or run
            the scoreboard from the Raspberry Pi / dev server.
          </p>
        )}
      </div>
    </div>
  );
});
