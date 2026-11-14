import { COS, SIN, Rng, angleTo, dist, norm, round, stepToward } from './math';
import { Mask, PaintField, circleMask, splatMask } from './paint';
import {
  BIG_BRUSH_SIZE,
  BRUSH_OFFSET_Y,
  BRUSH_SIZE,
  FIELD_H,
  FIELD_W,
  HOP_ARC,
  ITEM_SIZE,
  PAINT_INSET,
  PLAYER_H,
  PLAYER_W,
  RULES,
  SPLAT_SIZE,
} from './rules';

export const Ctl = { Human: 0, Cpu: 1, Off: 2 } as const;
export type Ctl = (typeof Ctl)[keyof typeof Ctl];

export const PState = {
  Normal: 0,
  /** Faster until bumped or hit by another item. */
  Speed: 1,
  /** Slow recovery after a bump. */
  Dazed: 2,
  Frozen: 3,
  /** Slower and unable to paint until bumped or hit by another item. */
  Jinxed: 4,
  BigBrush: 5,
  /** Airborne after a bump; no painting, no collisions. */
  Hop: 6,
} as const;
export type PState = (typeof PState)[keyof typeof PState];

export const Item = { None: 0, Freeze: 1, Speed: 2, Splat: 3, Sprinkle: 4, Jinx: 5, BigBrush: 6 } as const;
export type Item = (typeof Item)[keyof typeof Item];

export const Phase = { Countdown: 0, Play: 1, Pickup: 2, TimeUp: 3, Results: 4 } as const;
export type Phase = (typeof Phase)[keyof typeof Phase];

export type Mode = 'battle' | 'solo';

export type SimEvent =
  | { type: 'count'; n: number }
  | { type: 'go' }
  | { type: 'bump'; x: number; y: number }
  | { type: 'spawn'; x: number; y: number }
  | { type: 'pickup'; player: number; item: Item }
  | { type: 'apply'; player: number; item: Item; x: number; y: number }
  | { type: 'spark'; player: number; x: number; y: number }
  | { type: 'sprinkle'; x: number; y: number }
  | { type: 'timeup' };

/** Stamp shapes, one per painter slot. */
export interface Masks {
  brush: Mask[];
  bigBrush: Mask[];
  splat: Mask[];
}

export const defaultMasks = (): Masks => ({
  brush: Array(4).fill(circleMask(BRUSH_SIZE)),
  bigBrush: Array(4).fill(circleMask(BIG_BRUSH_SIZE)),
  splat: Array(4).fill(splatMask(SPLAT_SIZE)),
});

export interface GameConfig {
  mode: Mode;
  /** One entry per painter slot (4). Solo mode only uses slot 0. */
  controls: Ctl[];
  seed: number;
  masks?: Masks;
}

const MIN_X = 1;
const MAX_X = FIELD_W - 1 - PLAYER_W;
const MIN_Y = 1 - BRUSH_OFFSET_Y;
const MAX_Y = FIELD_H - 1 - PLAYER_H - BRUSH_OFFSET_Y;

export class Painter {
  /** Top-left corner of the sprite box. */
  x = 0;
  y = 0;
  speed = 0;
  angle = 0;
  state: PState = PState.Normal;
  /** Ticks spent in the current state. */
  stateTicks = 0;
  /** Height above the floor while hopping (drawing only). */
  hop = 0;
  /** Ticks of random sprinkles left. */
  sprinkle = 0;
  aiTurning = false;
  aiTarget = 0;
  aiDelay = 0;

  constructor(
    readonly index: number,
    readonly ctl: Ctl,
  ) {}

  get active(): boolean {
    return this.ctl !== Ctl.Off;
  }
  get cx(): number {
    return round(this.x) + (PLAYER_W >> 1);
  }
  get cy(): number {
    return round(this.y) + (PLAYER_H >> 1);
  }
  get owner(): number {
    return this.index + 1;
  }

  setState(s: PState, speed: number): void {
    this.state = s;
    this.stateTicks = 0;
    this.speed = speed;
  }

  setCentre(cx: number, cy: number): void {
    this.x = cx - (PLAYER_W >> 1);
    this.y = cy - (PLAYER_H >> 1);
  }

  move(): void {
    this.x += COS[this.angle] * this.speed;
    this.y -= SIN[this.angle] * this.speed;
  }

  clamp(): void {
    const x = round(this.x);
    if (x < MIN_X) this.x = MIN_X;
    else if (x > MAX_X) this.x = MAX_X;
    const y = round(this.y);
    if (y < MIN_Y) this.y = MIN_Y;
    else if (y > MAX_Y) this.y = MAX_Y;
  }
}

export class Game {
  readonly mode: Mode;
  readonly rng: Rng;
  readonly field = new PaintField();
  readonly painters: Painter[];
  readonly masks: Masks;
  readonly totalTicks: number;

  phase: Phase = Phase.Countdown;
  /** Ticks spent in the current phase. */
  phaseTicks = 0;
  ticksLeft: number;
  segment: number;
  itemsSpawned = 0;
  item: { type: Item; x: number; y: number } = { type: Item.None, x: 0, y: 0 };
  /** Who is holding the item during the pickup pause. */
  picker = -1;
  private itemDue = false;
  /** Things that happened during the last `step`, for sound and effects. */
  events: SimEvent[] = [];

  constructor(cfg: GameConfig) {
    this.mode = cfg.mode;
    this.rng = new Rng(cfg.seed);
    this.masks = cfg.masks ?? defaultMasks();
    const solo = cfg.mode === 'solo';
    this.painters = [0, 1, 2, 3].map(
      (i) => new Painter(i, solo && i > 0 ? Ctl.Off : (cfg.controls[i] ?? Ctl.Off)),
    );
    this.totalTicks = solo ? RULES.soloTicks : RULES.battleTicks;
    this.ticksLeft = this.totalTicks;
    this.segment = this.currentSegment();

    if (solo) {
      const p = this.painters[0];
      p.angle = 0x40;
      p.setCentre(FIELD_W / 2, FIELD_H / 2);
      p.setState(PState.Normal, RULES.speedNormal);
    } else {
      const headings = [0x60, 0x20, 0xa0, 0xe0];
      for (const p of this.painters) {
        p.angle = headings[p.index];
        p.setCentre(FIELD_W / 2, FIELD_H / 2 - 12);
        p.speed = RULES.startPush;
        p.move();
        p.setState(PState.Normal, RULES.speedNormal);
      }
    }
    for (const p of this.painters) this.paint(p);
  }

  private currentSegment(): number {
    return Math.floor((RULES.battleTicks - this.ticksLeft) / RULES.ticksPerSegment);
  }

  /** Advance one tick. `turns[i]` is -1 (right), 0 or 1 (left) for human painter i. */
  step(turns: readonly number[]): void {
    this.events = [];
    const t = this.phaseTicks;
    switch (this.phase) {
      case Phase.Countdown:
        if (t % 20 === 0 && t < 60) this.events.push({ type: 'count', n: 3 - t / 20 });
        if (t === 60) this.events.push({ type: 'go' });
        if (t + 1 >= RULES.countdownTicks) this.enter(Phase.Play);
        else this.phaseTicks++;
        return;
      case Phase.Play:
        this.playTick(turns);
        return;
      case Phase.Pickup:
        if (t === RULES.pickupPauseTicks - 1) {
          this.applyItem(this.painters[this.picker]);
          this.picker = -1;
        }
        if (t + 1 >= RULES.pickupPauseTicks) this.enter(Phase.Play);
        else this.phaseTicks++;
        return;
      case Phase.TimeUp:
        if (t + 1 >= RULES.timeUpTicks) this.enter(Phase.Results);
        else this.phaseTicks++;
        return;
    }
  }

  private enter(p: Phase): void {
    this.phase = p;
    this.phaseTicks = 0;
  }

  private playTick(turns: readonly number[]): void {
    const t = this.phaseTicks;
    for (const p of this.painters) {
      if (p.ctl !== Ctl.Human) continue;
      const turn = turns[p.index] ?? 0;
      if (turn) p.angle = norm(p.angle + Math.sign(turn) * RULES.turnStep);
    }
    for (const p of this.painters) {
      if (!p.active) continue;
      if (p.ctl === Ctl.Cpu) this.steer(p, t);
      p.move();
      this.tickState(p);
      p.clamp();
      this.bump(p);
    }
    if (this.itemDue) {
      this.itemDue = false;
      this.spawnItem();
    }
    let picker = -1;
    for (const p of this.painters) if (this.touchesItem(p)) picker = p.index;
    for (const p of this.painters) this.paint(p);
    this.phaseTicks++;

    if (picker >= 0) {
      this.picker = picker;
      this.events.push({ type: 'pickup', player: picker, item: this.item.type });
      this.enter(Phase.Pickup);
      return;
    }
    if (this.ticksLeft > 0) this.ticksLeft--;
    const seg = this.currentSegment();
    if (seg > this.segment && seg % RULES.itemEverySegments === 0 && this.ticksLeft > 0) {
      this.itemDue = true;
    }
    this.segment = seg;
    if (this.ticksLeft === 0) {
      this.events.push({ type: 'timeup' });
      this.enter(Phase.TimeUp);
    }
  }

  // ---- painting -------------------------------------------------------------

  private paint(p: Painter): void {
    if (!p.active || p.state === PState.Hop || p.state === PState.Jinxed) return;
    const m = (p.state === PState.BigBrush ? this.masks.bigBrush : this.masks.brush)[p.index];
    this.field.stamp(m, p.cx - (m.w >> 1), p.cy + BRUSH_OFFSET_Y - (m.h >> 1), p.owner);
  }

  // ---- per-painter state ----------------------------------------------------

  private tickState(p: Painter): void {
    const c = p.stateTicks;
    switch (p.state) {
      case PState.Hop:
        p.hop += c < HOP_ARC.length ? HOP_ARC[c] : -HOP_ARC[RULES.hopTicks - 1 - c];
        if (++p.stateTicks >= RULES.hopTicks) {
          p.hop = 0;
          p.setState(PState.Dazed, RULES.speedDazed);
        }
        break;
      case PState.Dazed:
        if (++p.stateTicks >= RULES.dazedTicks) p.setState(PState.Normal, RULES.speedNormal);
        break;
      case PState.Frozen:
        if (++p.stateTicks >= RULES.frozenTicks) p.setState(PState.Normal, RULES.speedNormal);
        break;
      case PState.Speed:
        if (++p.stateTicks % 4 === 0) this.events.push({ type: 'spark', player: p.index, x: p.cx, y: p.cy });
        break;
      case PState.BigBrush:
        if (++p.stateTicks % 6 === 0) this.events.push({ type: 'spark', player: p.index, x: p.cx, y: p.cy });
        break;
      case PState.Jinxed:
        p.stateTicks++;
        break;
    }
    if (p.sprinkle > 0) {
      const m = this.masks.brush[p.index];
      const lo = PAINT_INSET;
      const x = lo + this.rng.int(FIELD_W - PAINT_INSET + 1 - m.w - lo);
      const y = lo + this.rng.int(FIELD_H - PAINT_INSET + 1 - m.h - lo);
      this.field.stamp(m, x, y, p.owner);
      this.events.push({ type: 'sprinkle', x: x + (m.w >> 1), y: y + (m.h >> 1) });
      p.sprinkle--;
    }
  }

  private bump(p: Painter): void {
    if (!p.active || p.state === PState.Hop) return;
    for (const o of this.painters) {
      if (o === p || !o.active || o.state === PState.Hop) continue;
      if (dist(p.cx, p.cy, o.cx, o.cy) >= RULES.bumpDistance) continue;
      const a = p.angle;
      p.angle = o.angle;
      o.angle = a;
      for (const q of [p, o]) {
        q.hop = 0;
        q.setState(PState.Hop, RULES.speedNormal);
      }
      this.events.push({ type: 'bump', x: (p.cx + o.cx) >> 1, y: (p.cy + o.cy) >> 1 });
      return;
    }
  }

  // ---- items ----------------------------------------------------------------

  private spawnItem(): void {
    const pool =
      this.mode === 'solo'
        ? [Item.Speed, Item.BigBrush, Item.Splat, Item.Sprinkle]
        : [Item.Speed, Item.BigBrush, Item.Splat, Item.Sprinkle, Item.Jinx, Item.Freeze];
    this.itemsSpawned++;
    // The freeze only shows up early in a battle.
    const n = this.mode === 'battle' && this.itemsSpawned >= 3 ? pool.length - 1 : pool.length;
    const type = pool[this.rng.int(n)];
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 500; tries++) {
      x = 1 + this.rng.int(FIELD_W - 2 - ITEM_SIZE);
      y = 1 + this.rng.int(FIELD_H - 2 - ITEM_SIZE);
      const cx = x + ITEM_SIZE / 2;
      const cy = y + ITEM_SIZE / 2;
      if (this.painters.every((p) => !p.active || dist(cx, cy, p.cx, p.cy) > RULES.itemMinDistance)) break;
    }
    this.item = { type, x, y };
    this.events.push({ type: 'spawn', x: x + ITEM_SIZE / 2, y: y + ITEM_SIZE / 2 });
    for (const p of this.painters) p.aiDelay = 5 + this.rng.int(25);
  }

  get itemCx(): number {
    return this.item.x + ITEM_SIZE / 2;
  }
  get itemCy(): number {
    return this.item.y + ITEM_SIZE / 2;
  }

  private touchesItem(p: Painter): boolean {
    if (!p.active || p.state === PState.Hop || p.state === PState.Frozen) return false;
    if (this.item.type === Item.None) return false;
    return dist(p.cx, p.cy, this.itemCx, this.itemCy) < RULES.pickupDistance;
  }

  private applyItem(p: Painter): void {
    const type = this.item.type;
    const others = this.painters.filter((o) => o !== p && o.active && o.state !== PState.Hop);
    switch (type) {
      case Item.Freeze:
        for (const o of others) o.setState(PState.Frozen, 0);
        break;
      case Item.Speed:
        p.setState(PState.Speed, RULES.speedFast);
        break;
      case Item.Splat: {
        const m = this.masks.splat[p.index];
        this.field.stamp(m, this.itemCx - (m.w >> 1), this.itemCy - (m.h >> 1), p.owner);
        break;
      }
      case Item.Sprinkle:
        p.sprinkle = RULES.sprinkleTicks;
        break;
      case Item.Jinx:
        for (const o of others) {
          o.setState(PState.Jinxed, RULES.speedJinxed);
          o.aiDelay = this.rng.int(RULES.jinxAiDelay);
        }
        break;
      case Item.BigBrush:
        p.setState(PState.BigBrush, RULES.speedNormal);
        break;
    }
    this.events.push({ type: 'apply', player: p.index, item: type, x: this.itemCx, y: this.itemCy });
    this.item = { type: Item.None, x: 0, y: 0 };
  }

  // ---- computer painters ----------------------------------------------------

  private steer(p: Painter, tick: number): void {
    const left = () => (p.angle = norm(p.angle + RULES.turnStep));
    const right = () => (p.angle = norm(p.angle - RULES.turnStep));

    if (p.aiTurning) {
      p.angle = stepToward(p.angle, p.aiTarget, RULES.turnStep);
      if (Math.abs(p.angle - p.aiTarget) <= 2) p.aiTurning = false;
      return;
    }

    // Swerve away from anyone close enough to bump into.
    if (p.state !== PState.Jinxed) {
      const near = this.threat(p);
      if (near) {
        const d = norm(angleTo(p.cx, p.cy, near.cx, near.cy) - p.angle);
        p.aiTurning = true;
        p.aiTarget = norm(p.angle + (d > 0x80 ? RULES.aiEvadeTurn : -RULES.aiEvadeTurn));
      }
    }
    if (p.aiDelay > 0) p.aiDelay--;

    const chase = (tx: number, ty: number) => {
      const d = norm(angleTo(p.cx, p.cy, tx, ty) - p.angle);
      if (d > RULES.aiDeadZone && d <= 0x80) left();
      else if (d > 0x80 && d < 256 - RULES.aiDeadZone) right();
    };

    if (this.item.type !== Item.None && p.aiDelay <= 0) {
      chase(this.itemCx, this.itemCy);
      return;
    }
    if (p.state === PState.Jinxed && p.aiDelay <= 0) {
      // Nothing to paint with, so go and knock someone over.
      let best: Painter | null = null;
      let bestD = Infinity;
      for (const o of this.painters) {
        if (o === p || !o.active) continue;
        const d = dist(p.cx, p.cy, o.cx, o.cy);
        if (d < bestD) [best, bestD] = [o, d];
      }
      if (best) chase(best.cx, best.cy);
      return;
    }

    const x = round(p.x);
    const y = round(p.y);
    const jitter = () => this.rng.int(5) * 4 - 8;
    if ((x <= MIN_X || x >= MAX_X) && p.angle !== 0x40 && p.angle !== 0xc0) {
      p.aiTurning = true;
      p.aiTarget = norm(0x80 - p.angle + jitter());
      return;
    }
    if ((y <= MIN_Y || y >= MAX_Y) && p.angle !== 0x80 && p.angle !== 0) {
      p.aiTurning = true;
      p.aiTarget = norm(-p.angle + jitter());
      return;
    }
    // Otherwise weave gently so the stripe is wider than the brush.
    const k = Math.floor(tick / 6) & 3;
    if (k === 0 || k === 3) left();
    else right();
  }

  private threat(p: Painter): Painter | null {
    let best: Painter | null = null;
    let bestD = Infinity;
    for (const o of this.painters) {
      if (o === p || !o.active) continue;
      const d = dist(p.cx, p.cy, o.cx, o.cy);
      if (d >= bestD) continue;
      if (d < RULES.aiNearRange) {
        [best, bestD] = [o, d];
        continue;
      }
      if (d > RULES.aiConeRange) continue;
      const off = norm(angleTo(p.cx, p.cy, o.cx, o.cy) - p.angle);
      if (off <= RULES.aiCone || off >= 256 - RULES.aiCone) [best, bestD] = [o, d];
    }
    return best;
  }

  // ---- results --------------------------------------------------------------

  /** Share of the floor per painter slot, 0..1. */
  shares(): number[] {
    return this.painters.map((p) => (p.active ? this.field.share(p.owner) : 0));
  }
}
