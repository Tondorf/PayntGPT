import { describe, expect, it } from 'vitest';
import { Ctl, Game, Item, PState, Phase } from '../src/sim/game';
import { RULES } from '../src/sim/rules';

const cpu = [Ctl.Cpu, Ctl.Cpu, Ctl.Cpu, Ctl.Cpu];

function run(g: Game, max = 10000): number {
  let n = 0;
  while (g.phase !== Phase.Results && n < max) {
    g.step([0, 0, 0, 0]);
    n++;
  }
  return n;
}

describe('simulation', () => {
  it('is deterministic for a given seed', () => {
    const a = new Game({ mode: 'battle', controls: cpu, seed: 7 });
    const b = new Game({ mode: 'battle', controls: cpu, seed: 7 });
    run(a);
    run(b);
    expect(Array.from(a.field.counts)).toEqual(Array.from(b.field.counts));
    const c = new Game({ mode: 'battle', controls: cpu, seed: 8 });
    run(c);
    expect(Array.from(c.field.counts)).not.toEqual(Array.from(a.field.counts));
  });

  it('keeps running counts equal to a full scan', () => {
    const g = new Game({ mode: 'battle', controls: cpu, seed: 3 });
    run(g);
    const scan = [0, 0, 0, 0, 0];
    for (const c of g.field.cells) scan[c]++;
    for (let o = 1; o <= 4; o++) expect(g.field.counts[o]).toBe(scan[o]);
    expect(g.field.counts.reduce((a, b) => a + b)).toBe(g.field.area);
    expect(g.shares().every((s) => s > 0.02)).toBe(true);
  });

  it('ends a battle after the play time plus pauses', () => {
    const g = new Game({ mode: 'battle', controls: cpu, seed: 1 });
    const n = run(g);
    expect(g.phase).toBe(Phase.Results);
    expect(n).toBeGreaterThanOrEqual(RULES.countdownTicks + RULES.battleTicks + RULES.timeUpTicks);
    expect(g.itemsSpawned).toBe(3);
  });

  it('solo mode uses one painter and no opponent items', () => {
    const g = new Game({ mode: 'solo', controls: [Ctl.Cpu], seed: 5 });
    const seen = new Set<number>();
    while (g.phase !== Phase.Results) {
      g.step([0]);
      seen.add(g.item.type);
    }
    expect(g.painters.filter((p) => p.active).length).toBe(1);
    expect(seen.has(Item.Freeze) || seen.has(Item.Jinx)).toBe(false);
    expect(g.itemsSpawned).toBe(2);
  });

  it('swaps headings and hops when two painters collide', () => {
    const g = new Game({ mode: 'battle', controls: [Ctl.Human, Ctl.Human, Ctl.Off, Ctl.Off], seed: 1 });
    const [a, b] = g.painters;
    a.setCentre(200, 200);
    a.angle = 0;
    b.setCentre(260, 200);
    b.angle = 0x80;
    while (g.phase !== Phase.Play) g.step([0, 0]);
    for (let i = 0; i < 10 && a.state !== PState.Hop; i++) g.step([0, 0]);
    expect(a.state).toBe(PState.Hop);
    expect(b.state).toBe(PState.Hop);
    expect(a.angle).toBe(0x80);
    expect(b.angle).toBe(0);
    for (let i = 0; i < RULES.hopTicks; i++) g.step([0, 0]);
    expect(a.state).toBe(PState.Dazed);
    expect(a.hop).toBe(0);
  });

  it('turns human painters by the turn step', () => {
    const g = new Game({ mode: 'solo', controls: [Ctl.Human], seed: 1 });
    while (g.phase !== Phase.Play) g.step([0]);
    const a = g.painters[0].angle;
    g.step([1]);
    expect(g.painters[0].angle).toBe(a + RULES.turnStep);
    g.step([-1]);
    g.step([-1]);
    expect(g.painters[0].angle).toBe(a - RULES.turnStep);
  });
});
