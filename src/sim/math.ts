const STEP = (Math.PI * 2) / 256;

export const norm = (a: number): number => ((a % 256) + 256) % 256;

const table = (f: (x: number) => number) =>
  Float64Array.from({ length: 256 }, (_, i) => Math.round(f(i * STEP) * 1e5) / 1e5);

export const COS = table(Math.cos);
export const SIN = table(Math.sin);

/** Round half away from zero. */
export const round = (x: number): number => (x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5));

/** Heading (0..255) that points from (x1,y1) towards (x2,y2) in screen space. */
export function angleTo(x1: number, y1: number, x2: number, y2: number): number {
  let r = Math.atan2(y1 - y2, x2 - x1);
  if (r < 0) r += Math.PI * 2;
  return norm(Math.floor(r / STEP + 0.5));
}

export const dist = (x1: number, y1: number, x2: number, y2: number): number =>
  Math.hypot(x1 - x2, y1 - y2);

/** Turn `a` by `step` towards `target` along the shorter arc. */
export function stepToward(a: number, target: number, step: number): number {
  if (a === target) return a;
  const ccw = norm(target - a);
  return norm(ccw < 256 - ccw ? a + step : a - step);
}

/** Small deterministic generator (mulberry32) so rounds can be replayed from a seed. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  /** Integer in [0, n). */
  int(n: number): number {
    if (n <= 0) return 0;
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) % n;
  }
}
