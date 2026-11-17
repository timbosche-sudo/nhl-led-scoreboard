import { describe, expect, it } from 'vitest';
import { GoalDetector } from './goalDetector';
import { game } from '../test/helpers';

const g = (a: number, h: number, extra: Parameters<typeof game>[0] = {}) => game({ awayScore: a, homeScore: h, ...extra });

describe('GoalDetector', () => {
  it('does not fire on first sight (app start / reload)', () => {
    const d = new GoalDetector();
    expect(d.update([g(2, 1)])).toEqual([]);
  });
  it('fires once for a real score increase', () => {
    const d = new GoalDetector();
    d.update([g(2, 1)]);
    const ev = d.update([g(3, 1)]);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ team: 'STL', side: 'away', newScore: 3 });
    expect(d.update([g(3, 1)])).toEqual([]); // same data refreshed again
  });
  it('detects both teams scoring between polls', () => {
    const d = new GoalDetector();
    d.update([g(2, 1)]);
    expect(d.update([g(3, 2)]).map((e) => e.team).sort()).toEqual(['CHI', 'STL']);
  });
  it('does not fire after recovering from stale data', () => {
    const d = new GoalDetector();
    d.update([g(2, 1)]);
    d.markStale();
    expect(d.update([g(4, 1)])).toEqual([]);
    expect(d.update([g(5, 1)])).toHaveLength(1);
  });
  it('overturned goal then re-scored to the same total is not replayed', () => {
    const d = new GoalDetector();
    d.update([g(2, 1)]);
    expect(d.update([g(3, 1)])).toHaveLength(1);
    expect(d.update([g(2, 1)])).toEqual([]);
    expect(d.update([g(3, 1)])).toEqual([]);
  });
  it('ignores score changes on games not in progress', () => {
    const d = new GoalDetector();
    d.update([g(2, 1, { gameState: 'OFF' })]);
    expect(d.update([g(3, 1, { gameState: 'OFF' })])).toEqual([]);
  });
  it('ignores null scores', () => {
    const d = new GoalDetector();
    d.update([game({ gameState: 'LIVE' })]);
    expect(d.update([g(1, 0)])).toEqual([]);
  });
});
