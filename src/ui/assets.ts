import { Masks, defaultMasks } from '../sim/game';
import { Mask } from '../sim/paint';
import {
  BIG_BRUSH_SIZE,
  BRUSH_SIZE,
  FIELD_H,
  FIELD_W,
  ITEM_SIZE,
  PLAYER_H,
  PLAYER_W,
  SCREEN_W,
  SPLAT_SIZE,
} from '../sim/rules';

/** An image holding one or more frames stacked top to bottom. */
export interface Sheet {
  img: CanvasImageSource;
  w: number;
  h: number;
  frames: number;
}

/**
 * Every image the game can use: [frame width, frame height, frames].
 * Drop `<name>.png` into `src/assets/` to replace the built-in drawing.
 * Frames are stacked top to bottom, so the file is `width` x `height * frames`.
 */
export const SPECS = {
  background: [FIELD_W, FIELD_H, 1],
  hud: [SCREEN_W, 32, 1],
  painter1: [PLAYER_W, PLAYER_H, 4],
  painter2: [PLAYER_W, PLAYER_H, 4],
  painter3: [PLAYER_W, PLAYER_H, 4],
  painter4: [PLAYER_W, PLAYER_H, 4],
  painter_frozen: [PLAYER_W, PLAYER_H, 1],
  painter_jinxed: [PLAYER_W, PLAYER_H, 4],
  brush1: [BRUSH_SIZE, BRUSH_SIZE, 1],
  brush2: [BRUSH_SIZE, BRUSH_SIZE, 1],
  brush3: [BRUSH_SIZE, BRUSH_SIZE, 1],
  brush4: [BRUSH_SIZE, BRUSH_SIZE, 1],
  bigbrush1: [BIG_BRUSH_SIZE, BIG_BRUSH_SIZE, 1],
  bigbrush2: [BIG_BRUSH_SIZE, BIG_BRUSH_SIZE, 1],
  bigbrush3: [BIG_BRUSH_SIZE, BIG_BRUSH_SIZE, 1],
  bigbrush4: [BIG_BRUSH_SIZE, BIG_BRUSH_SIZE, 1],
  splat1: [SPLAT_SIZE, SPLAT_SIZE, 1],
  splat2: [SPLAT_SIZE, SPLAT_SIZE, 1],
  splat3: [SPLAT_SIZE, SPLAT_SIZE, 1],
  splat4: [SPLAT_SIZE, SPLAT_SIZE, 1],
  /** Frame order: freeze, speed, splat, sprinkle, jinx, big brush. */
  items: [ITEM_SIZE, ITEM_SIZE, 6],
  /** 32 headings, starting east and going counter-clockwise. */
  roller: [15, 15, 32],
  shadow: [32, 21, 1],
  timer: [16, 16, 2],
} as const satisfies Record<string, readonly [number, number, number]>;

export type AssetName = keyof typeof SPECS;

export const DEFAULT_COLORS = ['#e5484d', '#3b82f6', '#f2b705', '#30a46c'];

export interface Assets {
  /** Only the images that were actually supplied as files. */
  sheets: Partial<Record<AssetName, Sheet>>;
  masks: Masks;
  /** Paint colour per painter slot. */
  colors: string[];
}

/** Image files present in `src/assets/` at build time, by file name without extension. */
const FILES: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob('../assets/*.png', { eager: true, query: '?url', import: 'default' })).map(
    ([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url as string],
  ),
);

function loadImage(url: string | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function pixels(img: HTMLImageElement, w: number, h: number): Uint8ClampedArray {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, w, h).data;
}

/** Paint lands wherever the image is more than half opaque. */
function maskOf(px: Uint8ClampedArray, w: number, h: number): Mask {
  const data = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) data[i] = px[i * 4 + 3] > 127 ? 1 : 0;
  return { w, h, data };
}

/** Colour of the opaque pixel nearest the middle of the image. */
function centreColor(px: Uint8ClampedArray, w: number, h: number): string | null {
  let best = -1;
  let bestD = Infinity;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (px[i * 4 + 3] <= 127) continue;
      const d = (x - w / 2) ** 2 + (y - h / 2) ** 2;
      if (d < bestD) [best, bestD] = [i, d];
    }
  if (best < 0) return null;
  const [r, g, b] = [px[best * 4], px[best * 4 + 1], px[best * 4 + 2]];
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export async function loadAssets(): Promise<Assets> {
  const names = Object.keys(SPECS) as AssetName[];
  const imgs = await Promise.all(names.map((n) => loadImage(FILES[n])));
  const out: Assets = { sheets: {}, masks: defaultMasks(), colors: [...DEFAULT_COLORS] };
  // Copy the arrays so one painter's custom shape does not leak to the others.
  out.masks = { brush: [...out.masks.brush], bigBrush: [...out.masks.bigBrush], splat: [...out.masks.splat] };

  names.forEach((name, i) => {
    const img = imgs[i];
    if (!img) return;
    const [w, h, frames] = SPECS[name];
    if (img.naturalWidth !== w || img.naturalHeight !== h * frames) {
      console.warn(`src/assets/${name}.png is ${img.naturalWidth}x${img.naturalHeight}, expected ${w}x${h * frames}; ignored`);
      return;
    }
    out.sheets[name] = { img, w, h, frames };
    const m = /^(brush|bigbrush|splat)([1-4])$/.exec(name);
    if (!m) return;
    const slot = Number(m[2]) - 1;
    const px = pixels(img, w, h);
    const key = m[1] === 'bigbrush' ? 'bigBrush' : (m[1] as 'brush' | 'splat');
    out.masks[key][slot] = maskOf(px, w, h);
    if (m[1] === 'brush') out.colors[slot] = centreColor(px, w, h) ?? out.colors[slot];
  });
  return out;
}
