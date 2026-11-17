import { useState } from 'react';
import { RESOLUTIONS, type Settings } from '../config/settings';
import { encodePNG, upscaleRGBA } from '../core/png';
import type { Framebuffer } from '../core/framebuffer';
import { RESIZE_METHODS } from '../core/resize';
import type { DemoController } from '../demo/demo';
import type { FrameInfo } from '../engine/engine';
import { LAYOUTS } from '../layouts/layouts';
import type { NhlClient } from '../nhl/client';
import type { DataSnapshot } from '../nhl/service';
import { statusText } from '../nhl/status';
import { browserTimeZone, formatDayLabel } from '../nhl/time';
import type { Game } from '../nhl/types';
import { TEAMS, getTeam } from '../teams/teams';

type Update = (p: Partial<Settings>) => void;

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="field" role="group" aria-label={label}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className={`toggle ${checked ? 'on' : ''}`} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <span className="knob" />
      <span>{label}</span>
    </button>
  );
}

export function TeamSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {TEAMS.map((t) => (
        <option key={t.abbrev} value={t.abbrev}>
          {t.abbrev} — {t.city} {t.name}
        </option>
      ))}
    </select>
  );
}

export function ControlsPanel({ settings, update, onTestGoal, onPin }: { settings: Settings; update: Update; onTestGoal: () => void; onPin: () => void }) {
  const fav = getTeam(settings.favorite);
  return (
    <div className="card">
      <h2>Scoreboard</h2>
      <Field label="Data">
        <Segmented
          value={settings.dataMode}
          options={[
            { id: 'demo', label: 'Demo' },
            { id: 'live', label: 'Live NHL' },
          ]}
          onChange={(v) => update({ dataMode: v })}
        />
      </Field>
      <Field label="What to show" hint={settings.dataMode === 'demo' ? 'Demo mode always shows the demo game.' : undefined}>
        <Segmented
          value={settings.gameMode}
          options={[
            { id: 'favorite', label: `${fav?.name ?? 'Favourite'} priority` },
            { id: 'rotate', label: 'Around the NHL' },
            { id: 'single', label: 'One game' },
          ]}
          onChange={(v) => update({ gameMode: v })}
        />
      </Field>
      <Field label="Favourite team">
        <TeamSelect value={settings.favorite} onChange={(v) => update({ favorite: v })} />
      </Field>
      <Field label="Layout">
        <select value={settings.layout} onChange={(e) => update({ layout: e.target.value as Settings['layout'] })}>
          <option value="auto">Automatic (by game state)</option>
          {LAYOUTS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.letter}: {l.label}
            </option>
          ))}
          <option value="goal">G: Goal celebration (loop)</option>
        </select>
      </Field>
      <Field label="Live game layout (automatic mode)">
        <Segmented
          value={settings.liveLayout}
          options={[
            { id: 'classic', label: 'A: Classic' },
            { id: 'big', label: 'B: Large score' },
          ]}
          onChange={(v) => update({ liveLayout: v })}
        />
      </Field>
      <div className="row">
        <Toggle
          checked={settings.rotation}
          onChange={(v) => {
            if (!v) onPin();
            update({ rotation: v });
          }}
          label="Rotate games"
        />
        <Field label={`Every ${settings.rotationSec}s`}>
          <input type="range" min={3} max={60} value={settings.rotationSec} onChange={(e) => update({ rotationSec: Number(e.target.value) })} />
        </Field>
      </div>
      <Field label="Goal celebrations">
        <Segmented
          value={settings.goalCelebrations}
          options={[
            { id: 'favorite', label: `${settings.favorite} goals` },
            { id: 'all', label: 'All goals' },
            { id: 'off', label: 'Off' },
          ]}
          onChange={(v) => update({ goalCelebrations: v })}
        />
      </Field>
      <button className="btn gold" onClick={onTestGoal}>
        Test goal animation
      </button>
    </div>
  );
}

export function DemoPanel({ demo, onChange, onCelebrate }: { demo: DemoController; tick: number; onChange: () => void; onCelebrate: () => void }) {
  const s = demo.state;
  const act = (fn: () => void) => () => {
    fn();
    onChange();
  };
  const g = demo.game();
  return (
    <div className="card demo-card">
      <h2>
        Demo controls <span className="badge demo small">DEMO</span>
      </h2>
      <p className="muted">Simulated St. Louis Blues at Chicago Blackhawks. Nothing here is real NHL data.</p>
      <div className="demo-score">
        <span className="stl">STL {g.away.score}</span>
        <span className="sep">–</span>
        <span className="chi">{g.home.score} CHI</span>
        <span className="demo-status">{statusText(g, new Date(), 'America/Chicago')}</span>
      </div>
      <div className="btn-grid">
        <button className="btn blue" onClick={act(() => demo.addGoal('away'))}>+ Blues goal</button>
        <button className="btn red" onClick={act(() => demo.addGoal('home'))}>+ Blackhawks goal</button>
        <button className="btn" onClick={act(() => demo.toggleClock(Date.now()))} disabled={s.final}>
          {s.running ? 'Pause clock' : 'Start clock'}
        </button>
        <button className="btn" onClick={act(() => demo.startIntermission())} disabled={s.final}>Intermission</button>
        <button className="btn" onClick={act(() => demo.prevPeriod())}>◀ Period</button>
        <button className="btn" onClick={act(() => demo.nextPeriod())} disabled={s.final}>Period ▶</button>
        <button className="btn" onClick={act(() => demo.removeGoal('away'))}>− Blues goal</button>
        <button className="btn" onClick={act(() => demo.removeGoal('home'))}>− Blackhawks goal</button>
        <button className="btn" onClick={act(() => demo.endGame())} disabled={s.final}>End game</button>
        <button className="btn gold" onClick={onCelebrate}>Goal celebration</button>
        <button className="btn ghost wide" onClick={act(() => demo.reset())}>Reset demo</button>
      </div>
    </div>
  );
}

function GameRow({ g, tz, selected, onSelect }: { g: Game; tz: string; selected: boolean; onSelect?: () => void }) {
  const live = g.status === 'live' || g.status === 'intermission';
  return (
    <button className={`game-row ${selected ? 'selected' : ''} ${live ? 'is-live' : ''}`} onClick={onSelect}>
      <span className="teams">
        <span className="t">
          <i style={{ background: getTeam(g.away.abbrev)?.primary }} />
          {g.away.abbrev}
          <b>{g.away.score ?? ''}</b>
        </span>
        <span className="t">
          <i style={{ background: getTeam(g.home.abbrev)?.primary }} />
          {g.home.abbrev}
          <b>{g.home.score ?? ''}</b>
        </span>
      </span>
      <span className={`st st-${g.status}`}>
        {g.status === 'scheduled' && g.startTimeUTC ? `${formatDayLabel(g.startTimeUTC, new Date(), tz)} ` : ''}
        {statusText(g, new Date(), tz)}
        {g.source === 'demo' && <em> · demo</em>}
      </span>
    </button>
  );
}

export function GamesPanel({
  snapshot,
  timeZone,
  selectedId,
  onSelect,
  compact,
  demo,
}: {
  snapshot: DataSnapshot;
  timeZone: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  compact?: boolean;
  demo?: boolean;
}) {
  const order = { live: 0, intermission: 0, pregame: 1, scheduled: 2, final: 3 } as Record<string, number>;
  const games = [...snapshot.games].sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4) || (a.startTimeUTC ?? '').localeCompare(b.startTimeUTC ?? ''));
  return (
    <div className="card">
      <h2>{demo ? 'Demo game' : `Games ${snapshot.date ? `· ${snapshot.date}` : ''}`}</h2>
      {!demo && snapshot.status === 'error' && <p className="warn">Could not reach NHL data: showing {snapshot.games.length ? 'last known (stale) results' : 'nothing'}. See Diagnostics.</p>}
      {!demo && snapshot.stale && snapshot.status !== 'error' && <p className="warn">Showing last saved data until a fresh update arrives.</p>}
      {!demo && snapshot.status === 'loading' && !snapshot.games.length && <p className="muted">Loading today's games…</p>}
      {!demo && snapshot.status === 'ok' && !snapshot.games.length && <p className="muted">No NHL games on this date.</p>}
      <div className="game-list">
        {games.map((g) => (
          <GameRow key={g.id} g={g} tz={timeZone} selected={g.id === selectedId} onSelect={() => onSelect(g.id)} />
        ))}
      </div>
      {!compact && !demo && snapshot.upcoming.length > 0 && (
        <>
          <h3>Upcoming</h3>
          <div className="game-list">
            {snapshot.upcoming.slice(0, 24).map((g) => (
              <GameRow key={g.id} g={g} tz={timeZone} selected={g.id === selectedId} onSelect={() => onSelect(g.id)} />
            ))}
          </div>
        </>
      )}
      {!demo && <p className="muted small">Tap a game to show it on the scoreboard (switches to “One game”).</p>}
    </div>
  );
}

const ZONES = ['America/Chicago', 'America/New_York', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'Europe/London', 'Europe/Stockholm', 'Europe/Helsinki', 'UTC'];

export function DisplayPanel({ settings, update, effectiveTz }: { settings: Settings; update: Update; effectiveTz: string }) {
  const [proxyDraft, setProxyDraft] = useState(settings.proxyUrl);
  return (
    <div className="grid2">
      <div className="card">
        <h2>LED matrix</h2>
        <Field label="Resolution" hint="Changing resolution re-renders every layout for that panel size.">
          <Segmented value={settings.resolutionId} options={RESOLUTIONS.map((r) => ({ id: r.id, label: r.id.replace('x', '×') }))} onChange={(v) => update({ resolutionId: v })} />
        </Field>
        <Field label={`Brightness ${Math.round(settings.brightness * 100)}%`}>
          <input type="range" min={10} max={100} value={Math.round(settings.brightness * 100)} onChange={(e) => update({ brightness: Number(e.target.value) / 100 })} />
        </Field>
        <Field label={`Pixel spacing ${Math.round(settings.pixelGap * 100)}%`}>
          <input type="range" min={0} max={60} value={Math.round(settings.pixelGap * 100)} onChange={(e) => update({ pixelGap: Number(e.target.value) / 100 })} />
        </Field>
        <div className="row">
          <Toggle checked={settings.glow} onChange={(v) => update({ glow: v })} label="Pixel glow" />
          <Field label={`Glow ${Math.round(settings.glowAmount * 100)}%`}>
            <input type="range" min={0} max={100} disabled={!settings.glow} value={Math.round(settings.glowAmount * 100)} onChange={(e) => update({ glowAmount: Number(e.target.value) / 100 })} />
          </Field>
        </div>
        <div className="row">
          <Toggle checked={settings.showSeams} onChange={(v) => update({ showSeams: v })} label="Show panel seams" />
          <Segmented
            value={settings.pixelShape}
            options={[
              { id: 'round', label: 'Round LEDs' },
              { id: 'square', label: 'Square' },
            ]}
            onChange={(v) => update({ pixelShape: v })}
          />
        </div>
        <Field label="Logo resizing">
          <select value={settings.logoMethod} onChange={(e) => update({ logoMethod: e.target.value as Settings['logoMethod'] })}>
            {RESIZE_METHODS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="card">
        <h2>Data & time</h2>
        <Field label="Time zone" hint={`Showing times in ${effectiveTz}`}>
          <select value={settings.timeZone} onChange={(e) => update({ timeZone: e.target.value })}>
            <option value="auto">Browser setting ({browserTimeZone()})</option>
            {ZONES.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Live refresh every ${settings.liveIntervalSec}s`} hint="While games are live or about to start.">
          <input type="range" min={10} max={120} step={5} value={settings.liveIntervalSec} onChange={(e) => update({ liveIntervalSec: Number(e.target.value) })} />
        </Field>
        <Field label={`Idle refresh every ${Math.round(settings.idleIntervalSec / 60)} min`} hint="When no games are in progress.">
          <input type="range" min={60} max={1800} step={60} value={settings.idleIntervalSec} onChange={(e) => update({ idleIntervalSec: Number(e.target.value) })} />
        </Field>
        <Field label={`Keep showing ${settings.favorite} final for ${settings.finalHoldMin} min`}>
          <input type="range" min={0} max={240} step={15} value={settings.finalHoldMin} onChange={(e) => update({ finalHoldMin: Number(e.target.value) })} />
        </Field>
        <Field
          label="NHL proxy URL"
          hint="The NHL API blocks direct browser requests (CORS). Paste your Cloudflare Worker URL (see README → “Live data on GitHub Pages”). Leave blank when using the Pi/dev server."
        >
          <div className="inline">
            <input type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="https://nhl-proxy.yourname.workers.dev" value={proxyDraft} onChange={(e) => setProxyDraft(e.target.value)} />
            <button className="btn" onClick={() => update({ proxyUrl: proxyDraft.trim() })}>
              Save
            </button>
          </div>
        </Field>
      </div>
    </div>
  );
}

function download(name: string, data: Uint8Array | string, type: string) {
  const blob = new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const fmtTime = (t: number | null) => (t ? new Date(t).toLocaleTimeString() : '—');

export function DiagnosticsPanel({
  settings,
  snapshot,
  client,
  frame,
  fb,
  onRefresh,
}: {
  settings: Settings;
  snapshot: DataSnapshot;
  client: NhlClient;
  frame: FrameInfo | null;
  fb: () => Framebuffer;
  onRefresh: () => void;
}) {
  const [hex, setHex] = useState<string | null>(null);
  const f = fb();
  const d = client.diagnostics;
  const rows: [string, string][] = [
    ['Mode', settings.dataMode === 'demo' ? 'DEMO (simulated data)' : 'LIVE (NHL web API)'],
    ['Framebuffer', `${f.width}×${f.height} RGB24 · ${f.width * f.height * 3} bytes`],
    ['Current layout', frame ? `${frame.layout}${frame.celebrating ? ' (celebrating)' : ''}` : '—'],
    ['Selection', frame?.selection ? `${frame.selection.reason} ${frame.selection.total > 1 ? `(${frame.selection.index + 1}/${frame.selection.total})` : ''}` : '—'],
    ['Out-of-bounds pixel writes', String(frame?.clipCount ?? 0)],
    ['Data source', settings.dataMode === 'demo' ? 'Demo simulation' : d.activeEndpoint ?? 'none reachable'],
    ['Connection', settings.dataMode === 'demo' ? 'n/a' : snapshot.status + (snapshot.stale ? ' (stale)' : '')],
    ['Hockey date', snapshot.date ?? '—'],
    ['Last successful update', fmtTime(snapshot.lastSuccessAt)],
    ['Last attempt', fmtTime(snapshot.lastAttemptAt)],
    ['Games today / upcoming', `${snapshot.games.length} / ${snapshot.upcoming.length}`],
    ['Unparseable game entries', String(snapshot.rejected)],
    ['HTTP requests / failed polls', `${d.requests} / ${d.failures}`],
    ['Proxy URL', settings.proxyUrl || '(none)'],
  ];
  const exportPng = (scale: number) => {
    const rgba = scale === 1 ? f.toRGBA() : upscaleRGBA(f.width, f.height, f.toRGBA(), scale);
    download(`scoreboard-${f.width}x${f.height}${scale > 1 ? `@${scale}x` : ''}.png`, encodePNG(f.width * scale, f.height * scale, rgba), 'image/png');
  };
  const exportRaw = () => download(`scoreboard-${f.width}x${f.height}.rgb`, f.toRawRGB(), 'application/octet-stream');
  const inspect = () => {
    const raw = f.toRawRGB();
    const lines: string[] = [];
    for (let y = 0; y < Math.min(f.height, 4); y++) {
      const row = raw.subarray(y * f.width * 3, y * f.width * 3 + 16 * 3);
      lines.push(`row ${y}: ` + [...row].map((b) => b.toString(16).padStart(2, '0')).join(' ') + ' …');
    }
    setHex(lines.join('\n'));
  };
  return (
    <div className="grid2">
      <div className="card">
        <h2>Diagnostics</h2>
        <table className="diag">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <th>{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {settings.dataMode === 'live' && (
          <button className="btn" onClick={onRefresh}>
            Refresh now
          </button>
        )}
        {(snapshot.error || d.lastError) && settings.dataMode === 'live' && (
          <>
            <h3>Last API error</h3>
            <pre className="err">{snapshot.error ?? d.lastError}</pre>
          </>
        )}
      </div>
      <div className="card">
        <h2>Framebuffer export</h2>
        <p className="muted">Exactly the bytes a hardware driver would receive: row-major, top-left origin, 3 bytes (R,G,B) per LED.</p>
        <div className="btn-grid">
          <button className="btn" onClick={() => exportPng(1)}>PNG 1:1</button>
          <button className="btn" onClick={() => exportPng(8)}>PNG 8× (nearest)</button>
          <button className="btn" onClick={exportRaw}>Raw RGB (.rgb)</button>
          <button className="btn" onClick={inspect}>Inspect bytes</button>
        </div>
        {hex && <pre className="hex">{hex}</pre>}
      </div>
    </div>
  );
}
