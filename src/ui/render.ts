import { Game, Item, PState, Painter, Phase, SimEvent } from '../sim/game';
import { COS, SIN, round } from '../sim/math';
import {
  BRUSH_OFFSET_Y,
  FIELD_H,
  FIELD_W,
  ITEM_SIZE,
  PLAYER_H,
  PLAYER_W,
  RULES,
  SCREEN_H,
  SCREEN_W,
} from '../sim/rules';
import { AssetName, Assets, Sheet } from './assets';

const ITEM_NAMES = ['', 'FREEZE!', 'SPEED!', 'SPLAT!', 'SPRINKLE!', 'JINX!', 'BIG BRUSH!'];
const ITEM_GLYPHS = ['', '❄', '»', '✹', '∴', '?', '●'];
const ITEM_TINTS = ['', '#7dd3fc', '#fb923c', '#f472b6', '#a3e635', '#c084fc', '#fde047'];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

function rgba(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  // ImageData is RGBA in memory, which is ABGR as a little-endian 32-bit value.
  return (0xff << 24) | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16);
}

export class Renderer {
  private g: CanvasRenderingContext2D;
  private paintCanvas = document.createElement('canvas');
  private paintCtx: CanvasRenderingContext2D;
  private paintImage: ImageData;
  private paintWords: Uint32Array;
  private palette: Uint32Array;
  private background: HTMLCanvasElement;
  private particles: Particle[] = [];
  private flash = 0;
  private flashColor = '#fff';
  /** Painter positions at the previous tick, for smooth drawing between ticks. */
  private prev: { x: number; y: number; hop: number }[] = [];

  constructor(
    canvas: HTMLCanvasElement,
    private assets: Assets,
  ) {
    this.g = canvas.getContext('2d')!;
    this.g.imageSmoothingEnabled = false;
    this.paintCanvas.width = FIELD_W;
    this.paintCanvas.height = FIELD_H;
    this.paintCtx = this.paintCanvas.getContext('2d')!;
    this.paintImage = this.paintCtx.createImageData(FIELD_W, FIELD_H);
    this.paintWords = new Uint32Array(this.paintImage.data.buffer);
    this.palette = Uint32Array.from([0, ...assets.colors.map(rgba)]);
    this.background = this.makeBackground();
  }

  private sheet(name: AssetName): Sheet | undefined {
    return this.assets.sheets[name];
  }

  private makeBackground(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = FIELD_W;
    c.height = FIELD_H;
    const g = c.getContext('2d')!;
    const s = this.sheet('background');
    if (s) {
      g.drawImage(s.img, 0, 0);
      return c;
    }
    g.fillStyle = '#ece8df';
    g.fillRect(0, 0, FIELD_W, FIELD_H);
    g.strokeStyle = '#ddd8cc';
    g.lineWidth = 1;
    for (let x = 0.5; x < FIELD_W; x += 32) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, FIELD_H);
      g.stroke();
    }
    for (let y = 0.5; y < FIELD_H; y += 32) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(FIELD_W, y);
      g.stroke();
    }
    g.strokeStyle = '#8a8474';
    g.lineWidth = 4;
    g.strokeRect(2, 2, FIELD_W - 4, FIELD_H - 4);
    return c;
  }

  /** Call before each simulation tick. */
  remember(game: Game): void {
    this.prev = game.painters.map((p) => ({ x: p.x, y: p.y, hop: p.hop }));
  }

  /** Call after each simulation tick with the events it produced. */
  onEvents(events: SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'bump') this.burst(e.x, e.y, '#ffffff', 14, 3);
      else if (e.type === 'spark') this.burst(e.x, e.y + BRUSH_OFFSET_Y, this.assets.colors[e.player], 2, 1.5);
      else if (e.type === 'sprinkle') this.burst(e.x, e.y, '#ffffff', 3, 2);
      else if (e.type === 'spawn') this.burst(e.x, e.y, '#fde047', 12, 2.5);
      else if (e.type === 'apply') {
        this.burst(e.x, e.y, this.assets.colors[e.player], 24, 4);
        if (e.item === Item.Freeze || e.item === Item.Jinx) {
          this.flash = 8;
          this.flashColor = ITEM_TINTS[e.item];
        }
      }
    }
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life--;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.flash > 0) this.flash--;
  }

  private burst(x: number, y: number, color: string, n: number, speed: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      const max = 8 + Math.floor(Math.random() * 10);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: max, max, color, size: 2 + Math.random() * 3 });
    }
  }

  /** `alpha` is how far we are between the previous tick (0) and the current one (1). */
  draw(game: Game, alpha: number, frame: number): void {
    const g = this.g;
    g.drawImage(this.background, 0, 0);

    const cells = game.field.cells;
    const words = this.paintWords;
    const pal = this.palette;
    for (let i = 0; i < cells.length; i++) words[i] = pal[cells[i]];
    this.paintCtx.putImageData(this.paintImage, 0, 0);
    g.drawImage(this.paintCanvas, 0, 0);

    if (game.item.type !== Item.None && game.phase !== Phase.Pickup) this.drawItem(game, frame);

    const order = game.painters.filter((p) => p.active).sort((a, b) => a.y - b.y);
    for (const p of order) this.drawPainter(game, p, alpha, frame);

    for (const p of this.particles) {
      g.globalAlpha = p.life / p.max;
      g.fillStyle = p.color;
      g.fillRect(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2), Math.ceil(p.size), Math.ceil(p.size));
    }
    g.globalAlpha = 1;

    if (this.flash > 0) {
      g.globalAlpha = (this.flash / 8) * 0.35;
      g.fillStyle = this.flashColor;
      g.fillRect(0, 0, FIELD_W, FIELD_H);
      g.globalAlpha = 1;
    }

    this.drawHud(game);
    this.drawBanner(game);
  }

  private drawItem(game: Game, frame: number): void {
    const g = this.g;
    const { x, y, type } = game.item;
    const bob = Math.round(Math.sin(frame / 10) * 3);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    g.ellipse(x + ITEM_SIZE / 2, y + ITEM_SIZE - 4, 14, 5, 0, 0, Math.PI * 2);
    g.fill();
    const s = this.sheet('items');
    if (s) {
      g.drawImage(s.img, 0, (type - 1) * s.h, s.w, s.h, x, y + bob - 4, s.w, s.h);
      return;
    }
    const cx = x + ITEM_SIZE / 2;
    const cy = y + ITEM_SIZE / 2 + bob - 4;
    g.fillStyle = ITEM_TINTS[type];
    g.strokeStyle = '#1b1b1b';
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(cx - 17, cy - 17, 34, 34, 8);
    g.fill();
    g.stroke();
    g.fillStyle = '#1b1b1b';
    g.font = 'bold 22px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ITEM_GLYPHS[type], cx, cy + 1);
  }

  private drawPainter(game: Game, p: Painter, alpha: number, frame: number): void {
    const g = this.g;
    const q = this.prev[p.index] ?? p;
    const x = round(q.x + (p.x - q.x) * alpha);
    const y = round(q.y + (p.y - q.y) * alpha);
    const hop = Math.round(q.hop + (p.hop - q.hop) * alpha);
    const cx = x + (PLAYER_W >> 1);
    const cy = y + (PLAYER_H >> 1);
    const color = this.assets.colors[p.index];
    const moving = game.phase === Phase.Play && p.speed > 0;

    // Shadow on the floor where the brush touches.
    const shadow = this.sheet('shadow');
    if (shadow) g.drawImage(shadow.img, cx - (shadow.w >> 1), cy + BRUSH_OFFSET_Y - (shadow.h >> 1) + 4);
    else {
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.beginPath();
      g.ellipse(cx, cy + BRUSH_OFFSET_Y + 4, 15, 6, 0, 0, Math.PI * 2);
      g.fill();
    }

    // Roller held out in front, showing the heading.
    const rx = cx + round(COS[p.angle] * 20);
    const ry = cy - round(SIN[p.angle] * 20) - hop;
    const behind = SIN[p.angle] > 0;
    const drawRoller = () => {
      const s = this.sheet('roller');
      if (s) {
        const f = Math.round(p.angle / 8) % 32;
        g.drawImage(s.img, 0, f * s.h, s.w, s.h, rx - (s.w >> 1), ry - (s.h >> 1), s.w, s.h);
        return;
      }
      g.save();
      g.translate(rx, ry);
      g.rotate((-p.angle / 256) * Math.PI * 2);
      g.fillStyle = '#1b1b1b';
      g.fillRect(-4, -8, 7, 16);
      g.fillStyle = p.state === PState.Jinxed ? '#888' : color;
      g.fillRect(-3, -7, 5, 14);
      g.restore();
    };
    if (behind) drawRoller();

    const tick = moving ? Math.floor(frame / 4) % 4 : 0;
    let name: AssetName = `painter${p.index + 1}` as AssetName;
    if (p.state === PState.Frozen && this.sheet('painter_frozen')) name = 'painter_frozen';
    if (p.state === PState.Jinxed && this.sheet('painter_jinxed')) name = 'painter_jinxed';
    const s = this.sheet(name);
    if (s) {
      g.drawImage(s.img, 0, (tick % s.frames) * s.h, s.w, s.h, x, y - hop, s.w, s.h);
    } else {
      const bob = tick === 1 || tick === 3 ? 1 : 0;
      const by = cy - hop - bob;
      g.lineWidth = 3;
      g.strokeStyle = '#1b1b1b';
      g.fillStyle = p.state === PState.Frozen ? '#bfe8ff' : color;
      g.beginPath();
      g.arc(cx, by, 15, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      // Eyes look where the painter is heading.
      const ex = COS[p.angle] * 5;
      const ey = -SIN[p.angle] * 4;
      for (const side of [-1, 1]) {
        const px = cx + ex + side * 5 * Math.abs(SIN[p.angle]) + side * 2;
        const py = by - 3 + ey;
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(px, py, 4, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#1b1b1b';
        g.beginPath();
        g.arc(px + ex * 0.3, py + ey * 0.3, 2, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (!behind) drawRoller();

    // Status marker above the head.
    const mark =
      p.state === PState.Dazed ? '✶' : p.state === PState.Jinxed ? '?' : p.state === PState.Frozen ? '❄' : p.state === PState.Speed ? '»' : p.state === PState.BigBrush ? '●' : '';
    if (mark) {
      g.font = 'bold 14px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const wob = p.state === PState.Dazed ? Math.round(Math.sin(frame / 3) * 6) : 0;
      g.lineWidth = 3;
      g.strokeStyle = '#1b1b1b';
      g.strokeText(mark, cx + wob, cy - hop - 24);
      g.fillStyle = '#fff';
      g.fillText(mark, cx + wob, cy - hop - 24);
    }
  }

  private drawHud(game: Game): void {
    const g = this.g;
    const top = FIELD_H;
    const hud = this.sheet('hud');
    if (hud) g.drawImage(hud.img, 0, top);
    else {
      g.fillStyle = '#17181c';
      g.fillRect(0, top, SCREEN_W, SCREEN_H - top);
      g.fillStyle = '#3a3d46';
      g.fillRect(0, top, SCREEN_W, 1);
    }

    // Timer: one cell per segment, emptying from the left.
    const used = game.segment;
    const cell = this.sheet('timer');
    for (let i = 0; i < RULES.timerSegments; i++) {
      const x = 152 + i * 17;
      const spent = i < used;
      if (cell) g.drawImage(cell.img, 0, spent ? cell.h : 0, cell.w, cell.h, x, top + 8, cell.w, cell.h);
      else {
        g.fillStyle = spent ? '#2a2c33' : i % RULES.itemEverySegments === 0 && i > 0 ? '#f5c400' : '#f1f1ee';
        g.fillRect(x, top + 9, 14, 14);
      }
    }

    // Live share of the floor per painter.
    g.font = 'bold 13px ui-monospace, Menlo, Consolas, monospace';
    g.textBaseline = 'middle';
    const slots = [8, 78, 500, 570];
    const shares = game.shares();
    for (const p of game.painters) {
      if (!p.active) continue;
      const x = slots[p.index];
      g.fillStyle = '#1b1b1b';
      g.fillRect(x, top + 9, 14, 14);
      g.fillStyle = this.assets.colors[p.index];
      g.fillRect(x + 1, top + 10, 12, 12);
      g.fillStyle = '#f1f1ee';
      g.textAlign = 'left';
      g.fillText(`${Math.round(shares[p.index] * 100)}%`.padStart(3, ' '), x + 19, top + 17);
    }
  }

  private banner(text: string, color = '#fff', size = 64): void {
    const g = this.g;
    g.font = `900 ${size}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = Math.max(6, size / 7);
    g.strokeStyle = '#1b1b1b';
    g.strokeText(text, FIELD_W / 2, FIELD_H / 2);
    g.fillStyle = color;
    g.fillText(text, FIELD_W / 2, FIELD_H / 2);
  }

  private drawBanner(game: Game): void {
    const t = game.phaseTicks;
    if (game.phase === Phase.Countdown) {
      this.banner(t < 60 ? String(3 - Math.floor(t / 20)) : 'GO!', '#f5c400', 96);
    } else if (game.phase === Phase.Pickup) {
      const type = game.item.type;
      if (type !== Item.None) this.banner(ITEM_NAMES[type], this.assets.colors[game.picker] ?? '#fff', 56);
    } else if (game.phase === Phase.TimeUp) {
      this.banner('TIME UP', '#fff', 72);
    }
  }
}
