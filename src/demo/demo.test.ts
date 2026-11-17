import { describe, expect, it } from 'vitest';
import { DemoController, DEMO_GAME_ID } from './demo';
import { statusText } from '../nhl/status';
import { ScoreboardEngine } from '../engine/engine';
import { NO_LOGOS } from '../logos/logoCache';

const now = new Date('2026-11-17T23:00:00Z');
const st = (d: DemoController) => statusText(d.game(), now, 'America/Chicago');

describe('demo mode', () => {
  it('starts as STL 2 - 1 CHI, 3RD 12:41, clearly labelled as demo', () => {
    const d = new DemoController();
    const g = d.game();
    expect(g.source).toBe('demo');
    expect(g.id).toBe(DEMO_GAME_ID);
    expect([g.away.abbrev, g.away.score, g.home.abbrev, g.home.score]).toEqual(['STL', 2, 'CHI', 1]);
    expect(st(d)).toBe('3RD 12:41');
  });
  it('clock runs and pauses', () => {
    const d = new DemoController();
    d.toggleClock(0);
    d.tick(0);
    d.tick(61_000);
    expect(st(d)).toBe('3RD 11:40');
    d.toggleClock(61_000);
    d.tick(200_000);
    expect(st(d)).toBe('3RD 11:40');
  });
  it('clock stops at 0:00 and shows END', () => {
    const d = new DemoController();
    d.toggleClock(0);
    d.tick(1);
    d.tick(10_000_000);
    expect(d.state.running).toBe(false);
    expect(st(d)).toBe('END 3RD');
  });
  it('goals, periods, intermission, OT, SO and final', () => {
    const d = new DemoController();
    d.addGoal('home');
    expect(d.game().home.score).toBe(2);
    d.startIntermission();
    expect(d.game().status).toBe('intermission');
    d.nextPeriod();
    expect(st(d)).toBe('OT 5:00');
    d.addGoal('away'); // sudden death
    expect(st(d)).toBe('FINAL/OT');
    d.reset();
    d.nextPeriod();
    d.nextPeriod();
    expect(st(d)).toBe('SO');
    d.endGame();
    expect(st(d)).toBe('FINAL/SO');
    d.reset();
    d.endGame();
    expect(st(d)).toBe('FINAL');
  });
  it('a Blues goal triggers exactly one celebration via the normal detection path', () => {
    const d = new DemoController();
    const engine = new ScoreboardEngine(128, 32, NO_LOGOS, {
      gameMode: 'favorite', favorite: 'STL', selectedGameId: null, rotation: true, rotationSec: 10, layout: 'auto', liveLayout: 'classic', goalCelebrations: 'favorite', timeZone: 'America/Chicago', finalHoldMin: 60,
    });
    const push = () => engine.setData({ games: [d.game()], upcoming: [], stale: false, status: 'ok', source: 'demo' });
    push();
    expect(engine.render(1000).celebrating).toBe(false);
    d.addGoal('home'); // Blackhawks goal, favourite is STL => no celebration
    push();
    expect(engine.render(2000).celebrating).toBe(false);
    d.addGoal('away');
    push();
    push();
    expect(engine.render(3000).celebrating).toBe(true);
    expect(engine.render(3000 + 7100).celebrating).toBe(false); // finished, returns to scoreboard
    expect(engine.render(3000 + 7200).layout).toBe('classic');
  });
});
