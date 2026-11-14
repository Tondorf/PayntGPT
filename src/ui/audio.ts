import { Item, SimEvent } from '../sim/game';

/** Tiny synthesised sound set; no audio files needed. */
export class Sfx {
  private ctx: AudioContext | null = null;
  muted = false;

  /** Browsers only allow sound after a click or key press. */
  unlock(): void {
    try {
      this.ctx ??= new AudioContext();
      void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.08, delay = 0, slide = 0): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur);
  }

  play(e: SimEvent): void {
    switch (e.type) {
      case 'count':
        this.tone(440, 0.15);
        break;
      case 'go':
        this.tone(880, 0.4);
        break;
      case 'bump':
        this.tone(160, 0.25, 'sawtooth', 0.12, 0, -110);
        break;
      case 'spawn':
        this.tone(660, 0.08, 'triangle', 0.1);
        this.tone(990, 0.12, 'triangle', 0.1, 0.08);
        break;
      case 'pickup':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.1, 'square', 0.07, i * 0.07));
        break;
      case 'apply':
        if (e.item === Item.Splat) this.tone(220, 0.4, 'sawtooth', 0.12, 0, -180);
        else if (e.item === Item.Freeze) this.tone(1400, 0.5, 'sine', 0.1, 0, -900);
        else this.tone(700, 0.2, 'triangle', 0.1, 0, 500);
        break;
      case 'sprinkle':
        this.tone(900 + Math.random() * 500, 0.04, 'triangle', 0.04);
        break;
      case 'timeup':
        this.tone(330, 0.2);
        this.tone(220, 0.5, 'square', 0.08, 0.2);
        break;
    }
  }
}
