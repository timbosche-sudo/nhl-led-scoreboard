import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Framebuffer } from '../core/framebuffer';
import { getResolution, type Settings } from '../config/settings';
import { DemoController } from '../demo/demo';
import { ScoreboardEngine, type EngineSettings, type FrameInfo } from '../engine/engine';
import { renderLogoShowcase } from '../layouts/showcase';
import { LogoCache } from '../logos/logoCache';
import { NhlClient, buildEndpoints } from '../nhl/client';
import { NhlDataService, type DataSnapshot } from '../nhl/service';
import { browserTimeZone } from '../nhl/time';
import { TEAMS } from '../teams/teams';
import { BrowserLogoLoader } from './browserLogos';
import { LedCanvas, type LedCanvasHandle } from './LedCanvas';
import { ControlsPanel, DemoPanel, DiagnosticsPanel, DisplayPanel, GamesPanel } from './Panels';
import { LogoGallery } from './LogoGallery';
import { loadLastLive, loadSettings, saveLastLive, saveSettings } from './storage';

type Tab = 'controls' | 'games' | 'logos' | 'display' | 'diagnostics';
const TABS: { id: Tab; label: string }[] = [
  { id: 'controls', label: 'Scoreboard' },
  { id: 'games', label: 'Games' },
  { id: 'logos', label: 'Logos' },
  { id: 'display', label: 'Display' },
  { id: 'diagnostics', label: 'Diagnostics' },
];

const EMPTY_SNAPSHOT: DataSnapshot = { games: [], upcoming: [], date: null, lastSuccessAt: null, lastAttemptAt: null, stale: false, status: 'idle', error: null, rejected: 0 };

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [tab, setTab] = useState<Tab>('controls');
  const [snapshot, setSnapshot] = useState<DataSnapshot>(EMPTY_SNAPSHOT);
  const [frame, setFrame] = useState<FrameInfo | null>(null);
  const [showcase, setShowcase] = useState<string | null>(null);
  const [logoTick, setLogoTick] = useState(0);
  const [demoTick, setDemoTick] = useState(0);

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  useEffect(() => saveSettings(settings), [settings]);

  const res = getResolution(settings.resolutionId);
  const tz = settings.timeZone === 'auto' ? browserTimeZone() : settings.timeZone;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // --- long-lived objects -------------------------------------------------
  const logoCache = useMemo(() => new LogoCache(settings.logoMethod), []); // eslint-disable-line react-hooks/exhaustive-deps
  const client = useMemo(() => new NhlClient({ endpoints: buildEndpoints(settings.proxyUrl) }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const loader = useMemo(
    () =>
      new BrowserLogoLoader(
        logoCache,
        () => buildEndpoints(settingsRef.current.proxyUrl),
        () => settingsRef.current.logoVariant,
        () => setLogoTick((n) => n + 1),
      ),
    [logoCache],
  );
  const demo = useMemo(() => new DemoController(), []);
  const engineSettings = (s: Settings): EngineSettings => ({
    gameMode: s.dataMode === 'demo' ? 'single' : s.gameMode,
    favorite: s.favorite,
    selectedGameId: s.dataMode === 'demo' ? 'DEMO-STL-CHI' : s.selectedGameId,
    rotation: s.rotation,
    rotationSec: s.rotationSec,
    layout: s.layout,
    liveLayout: s.liveLayout,
    goalCelebrations: s.goalCelebrations,
    timeZone: s.timeZone === 'auto' ? browserTimeZone() : s.timeZone,
    finalHoldMin: s.finalHoldMin,
  });
  const engine = useMemo(() => new ScoreboardEngine(res.width, res.height, logoCache, engineSettings(settings)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const showcaseFb = useRef<Framebuffer | null>(null);
  const ledRef = useRef<LedCanvasHandle>(null);
  const serviceRef = useRef<NhlDataService | null>(null);
  const showcaseRef = useRef<string | null>(null);
  showcaseRef.current = showcase;

  useEffect(() => {
    engine.settings = engineSettings(settings);
    engine.setResolution(res.width, res.height);
    logoCache.setMethod(settings.logoMethod);
    logoCache.setOverrides(settings.logoMethodOverrides);
    setLogoTick((n) => n + 1);
  }, [settings, res.width, res.height]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    client.setEndpoints(buildEndpoints(settings.proxyUrl));
    loader.reset();
  }, [settings.proxyUrl, client, loader]);

  useEffect(() => {
    loader.reset();
  }, [settings.logoVariant, loader]);

  // --- data: demo or live ---------------------------------------------------
  const demoKey = useRef('');
  useEffect(() => {
    if (settings.dataMode !== 'live') {
      demoKey.current = '';
      return;
    }
    const svc = new NhlDataService({
      client,
      timeZone: () => (settingsRef.current.timeZone === 'auto' ? browserTimeZone() : settingsRef.current.timeZone),
      liveIntervalMs: () => settingsRef.current.liveIntervalSec * 1000,
      idleIntervalMs: () => settingsRef.current.idleIntervalSec * 1000,
      onUpdate: (s) => {
        setSnapshot(s);
        engine.setData({ games: s.games, upcoming: s.upcoming, stale: s.stale, status: s.status, source: 'live' });
        if (s.status === 'ok') saveLastLive({ games: s.games, upcoming: s.upcoming, date: s.date, lastSuccessAt: s.lastSuccessAt });
      },
    });
    // Clear demo data immediately so it can never be shown while in live mode.
    engine.setData({ games: [], upcoming: [], stale: false, status: 'loading', source: 'live' });
    setSnapshot(EMPTY_SNAPSHOT);
    const last = loadLastLive();
    if (last) svc.seed(last);
    svc.start();
    serviceRef.current = svc;
    return () => {
      svc.stop();
      serviceRef.current = null;
    };
  }, [settings.dataMode, client, engine]);

  // load logos for teams on screen / in the list
  const gamesForLogos = settings.dataMode === 'demo' ? [demo.game()] : [...snapshot.games, ...snapshot.upcoming.slice(0, 8)];
  const logoKey = gamesForLogos.map((g) => g.away.abbrev + g.home.abbrev).join() + settings.favorite + settings.logoVariant + settings.proxyUrl;
  useEffect(() => {
    loader.ensureAll([settings.favorite, ...gamesForLogos.flatMap((g) => [g.away.abbrev, g.home.abbrev])]);
    if (tab === 'logos') loader.ensureAll(TEAMS.map((t) => t.abbrev));
  }, [logoKey, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- render loop ------------------------------------------------------------
  useEffect(() => {
    let raf = 0;
    let lastInfo = 0;
    let lastStaleCheck = 0;
    const loop = () => {
      const now = Date.now();
      const s = settingsRef.current;
      if (s.dataMode === 'demo') {
        demo.tick(now);
        const { lastTickAt: _ignored, ...st } = demo.state;
        const key = JSON.stringify(st);
        if (key !== demoKey.current) {
          demoKey.current = key;
          engine.setData({ games: [demo.game()], upcoming: [], stale: false, status: 'ok', source: 'demo' }, now);
          setDemoTick((n) => n + 1);
        }
      } else if (now - lastStaleCheck > 1000) {
        // Age-based staleness: data older than 3 poll intervals is flagged even without an error.
        lastStaleCheck = now;
        const svc = serviceRef.current;
        const snap = svc?.snapshot;
        if (snap?.lastSuccessAt && !snap.stale) {
          const live = snap.games.some((g) => g.status === 'live' || g.status === 'intermission');
          const limit = 3 * (live ? s.liveIntervalSec : s.idleIntervalSec) * 1000 + 15_000;
          if (now - snap.lastSuccessAt > limit) engine.setData({ games: snap.games, upcoming: snap.upcoming, stale: true, status: snap.status, source: 'live' });
        }
      }
      let info: FrameInfo | null = null;
      let fb = engine.fb;
      const sc = showcaseRef.current;
      if (sc) {
        const r = getResolution(s.resolutionId);
        if (!showcaseFb.current || showcaseFb.current.width !== r.width || showcaseFb.current.height !== r.height) showcaseFb.current = new Framebuffer(r.width, r.height);
        fb = showcaseFb.current;
        fb.clear();
        renderLogoShowcase({ fb, now: new Date(now), t: now, timeZone: tz, logos: logoCache, stale: false }, sc, logoCache.hasSource(sc) ? logoCache.methodFor(sc) : 'placeholder');
      } else {
        info = engine.render(now);
      }
      ledRef.current?.draw(fb);
      if (info && now - lastInfo > 250) {
        lastInfo = now;
        setFrame(info);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine, demo, logoCache, tz]);

  const isDemo = settings.dataMode === 'demo';
  const staleNow = !isDemo && (snapshot.stale || snapshot.status === 'error');
  const appearance = useMemo(
    () => ({
      brightness: settings.brightness,
      glow: settings.glow,
      glowAmount: settings.glowAmount,
      pixelGap: settings.pixelGap,
      pixelShape: settings.pixelShape,
      showSeams: settings.showSeams,
      panelWidth: 64,
      panelHeight: res.height >= 64 ? 64 : 32,
    }),
    [settings.brightness, settings.glow, settings.glowAmount, settings.pixelGap, settings.pixelShape, settings.showSeams, res.height],
  );
  const currentGame = frame?.gameId ? [...(isDemo ? [demo.game()] : snapshot.games), ...snapshot.upcoming].find((g) => g.id === frame.gameId) : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="puck" aria-hidden />
          <div>
            <h1>NHL LED Scoreboard</h1>
            <p className="sub">Pixel-accurate {res.width}×{res.height} simulator</p>
          </div>
        </div>
        <div className="badges">
          {isDemo ? <span className="badge demo">DEMO DATA</span> : <span className={`badge ${staleNow ? 'stale' : 'live'}`}>{staleNow ? 'LIVE · STALE' : snapshot.status === 'ok' ? 'LIVE NHL DATA' : 'LIVE · CONNECTING'}</span>}
          {showcase && (
            <button className="badge showcase" onClick={() => setShowcase(null)}>
              LOGO PREVIEW ✕
            </button>
          )}
        </div>
      </header>

      <section className="stage" aria-label="LED scoreboard preview">
        <div className={`bezel ${isDemo ? 'is-demo' : ''}`}>
          <LedCanvas ref={ledRef} appearance={appearance} width={res.width} height={res.height} maxCssHeight={res.height >= 64 ? 520 : 360} />
        </div>
        <div className="nowbar">
          <span>
            <b>{showcase ? `Logo: ${showcase}` : currentGame ? `${currentGame.away.abbrev} @ ${currentGame.home.abbrev}` : 'No game'}</b>
          </span>
          <span>Layout: {showcase ? 'logo preview' : frame?.layout ?? '—'}</span>
          {frame?.selection && frame.selection.total > 1 && (
            <span>
              Rotation {frame.selection.index + 1}/{frame.selection.total}
            </span>
          )}
          <span>{res.panels}</span>
          <span>{isDemo ? 'Source: demo simulation' : `Source: ${client.diagnostics.activeEndpoint ?? 'not connected'}`}</span>
        </div>
      </section>

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <main className="panel-area">
        {tab === 'controls' && (
          <div className="grid2">
            <ControlsPanel settings={settings} update={update} onTestGoal={() => engine.triggerGoal()} onPin={() => engine.pinCurrent(Date.now())} />
            {isDemo ? (
              <DemoPanel demo={demo} tick={demoTick} onChange={() => setDemoTick((n) => n + 1)} onCelebrate={() => engine.triggerGoal('STL', 'DEMO-STL-CHI')} />
            ) : (
              <GamesPanel snapshot={snapshot} timeZone={tz} selectedId={frame?.gameId ?? null} compact onSelect={(id) => update({ gameMode: 'single', selectedGameId: id })} />
            )}
          </div>
        )}
        {tab === 'games' && (
          <GamesPanel
            snapshot={isDemo ? { ...snapshot, games: [demo.game()], upcoming: [] } : snapshot}
            timeZone={tz}
            selectedId={frame?.gameId ?? null}
            demo={isDemo}
            onSelect={(id) => update(isDemo ? {} : { gameMode: 'single', selectedGameId: id })}
          />
        )}
        {tab === 'logos' && (
          <LogoGallery
            cache={logoCache}
            loader={loader}
            settings={settings}
            update={update}
            showcase={showcase}
            setShowcase={setShowcase}
            version={logoTick}
          />
        )}
        {tab === 'display' && <DisplayPanel settings={settings} update={update} effectiveTz={tz} />}
        {tab === 'diagnostics' && (
          <DiagnosticsPanel
            settings={settings}
            snapshot={snapshot}
            client={client}
            frame={frame}
            fb={() => (showcase && showcaseFb.current ? showcaseFb.current : engine.fb)}
            onRefresh={() => serviceRef.current?.refreshNow()}
          />
        )}
      </main>
      <footer className="foot">
        Unofficial fan project. NHL data from the public NHL web API; team names and logos are trademarks of the NHL and its teams.
      </footer>
    </div>
  );
}
