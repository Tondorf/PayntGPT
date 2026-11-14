import { FIELD_H, FIELD_W, PAINT_INSET } from './rules';

/** A stamp shape: 1 where paint lands. */
export interface Mask {
  w: number;
  h: number;
  data: Uint8Array;
}

export function circleMask(size: number): Mask {
  const data = new Uint8Array(size * size);
  const r = size / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if ((x + 0.5 - r) ** 2 + (y + 0.5 - r) ** 2 <= r * r) data[y * size + x] = 1;
  return { w: size, h: size, data };
}

/** Round blob with a wobbly edge and a few satellite drops. */
export function splatMask(size: number): Mask {
  const data = new Uint8Array(size * size);
  const c = size / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const a = Math.atan2(dy, dx);
      const edge = c * (0.7 + 0.12 * Math.sin(a * 5) + 0.08 * Math.sin(a * 9 + 1) + 0.06 * Math.sin(a * 14 + 2));
      if (dx * dx + dy * dy <= edge * edge) data[y * size + x] = 1;
    }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const d = c * 0.9;
    const r = c * (0.05 + 0.03 * (i % 3));
    const cx = c + Math.cos(a) * d;
    const cy = c + Math.sin(a) * d;
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(size, cy + r); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(size, cx + r); x++)
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) data[y * size + x] = 1;
  }
  return { w: size, h: size, data };
}

/** The floor: one byte per pixel holding 0 (bare) or the owner's number (1..4). */
export class PaintField {
  readonly w = FIELD_W;
  readonly h = FIELD_H;
  readonly cells = new Uint8Array(FIELD_W * FIELD_H);
  /** Pixels owned, indexed by owner number; kept current by `stamp`. */
  readonly counts = new Int32Array(5);
  readonly area = (FIELD_W - 2 * PAINT_INSET) * (FIELD_H - 2 * PAINT_INSET);

  constructor() {
    this.counts[0] = this.area;
  }

  /** Stamp `mask` with its top-left corner at (left, top). */
  stamp(mask: Mask, left: number, top: number, owner: number): void {
    const x0 = Math.max(left, PAINT_INSET);
    const y0 = Math.max(top, PAINT_INSET);
    const x1 = Math.min(left + mask.w, this.w - PAINT_INSET);
    const y1 = Math.min(top + mask.h, this.h - PAINT_INSET);
    const { cells, counts } = this;
    for (let y = y0; y < y1; y++) {
      let m = (y - top) * mask.w + (x0 - left);
      let c = y * this.w + x0;
      for (let x = x0; x < x1; x++, m++, c++) {
        if (!mask.data[m]) continue;
        const old = cells[c];
        if (old === owner) continue;
        counts[old]--;
        counts[owner]++;
        cells[c] = owner;
      }
    }
  }

  /** Share of the paintable floor owned by `owner`, 0..1. */
  share(owner: number): number {
    return this.counts[owner] / this.area;
  }
}
