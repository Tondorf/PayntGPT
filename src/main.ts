import { Ctl, Game, Mode, Phase } from './sim/game';
import { TICK_MS } from './sim/rules';
import { Assets, loadAssets } from './ui/assets';
import { Sfx } from './ui/audio';
import { Input, KEY_LABELS } from './ui/input';
import { Renderer } from './ui/render';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLDivElement;
// Touches anywhere in the window steer, so the bars around the game work too.
const input = new Input(document.body);
const sfx = new Sfx();

const settings: { mode: Mode; controls: Ctl[] } = {
  mode: 'battle',
  controls: [Ctl.Human, Ctl.Cpu, Ctl.Cpu, Ctl.Cpu],
};

let assets: Assets;
let renderer: Renderer;
let game: Game | null = null;
let paused = false;
let acc = 0;
let last = 0;
let frame = 0;

// ---- small DOM helpers ------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) e.className = cls;
  Object.assign(e, rest);
  e.append(...children);
  return e;
}

function show(...nodes: Node[]): void {
  overlay.replaceChildren(...nodes);
}

function choice<T>(options: [T, string][], value: T, onPick: (v: T) => void): HTMLElement {
  return el(
    'div',
    { class: 'seg' },
    ...options.map(([v, label]) =>
      el('button', { class: v === value ? 'on' : '', textContent: label, onclick: () => onPick(v) }),
    ),
  );
}

// ---- screens ----------------------------------------------------------------

function menu(): void {
  game = null;
  const solo = settings.mode === 'solo';
  const rows = [0, 1, 2, 3].map((i) => {
    const dot = el('span', { class: 'dot' });
    dot.style.background = assets.colors[i];
    const off = solo && i > 0;
    const row = el(
      'div',
      { class: 'row' },
      el('span', { class: 'name' }, dot, `Painter ${i + 1}`),
      off
        ? el('span', { class: 'keys', textContent: 'not in solo' })
        : choice<Ctl>(
            solo
              ? [
                  [Ctl.Human, 'Human'],
                  [Ctl.Cpu, 'CPU'],
                ]
              : [
                  [Ctl.Human, 'Human'],
                  [Ctl.Cpu, 'CPU'],
                  [Ctl.Off, 'Off'],
                ],
            settings.controls[i],
            (v) => {
              settings.controls[i] = v;
              menu();
            },
          ),
      off ? '' : el('span', { class: 'keys', textContent: settings.controls[i] === Ctl.Human ? KEY_LABELS[i] : '' }),
    );
    return row;
  });

  const active = settings.controls.filter((c) => c !== Ctl.Off).length;
  const start = el('button', { class: 'primary', textContent: 'Start', onclick: startGame });
  start.disabled = !solo && active < 1;

  show(
    el(
      'div',
      { class: 'panel' },
      el('h1', {}, 'Paynt', el('span', {}, 'GPT')),
      el('p', {
        textContent:
          'Cover more floor than anyone else before the clock runs out. You never stop moving: steer left and right, grab items, and bump rivals to knock their power-ups off.',
      }),
      el(
        'div',
        { class: 'row' },
        choice<Mode>(
          [
            ['battle', 'Battle (88 s)'],
            ['solo', 'Solo (66 s)'],
          ],
          settings.mode,
          (v) => {
            settings.mode = v;
            if (v === 'solo' && settings.controls[0] === Ctl.Off) settings.controls[0] = Ctl.Human;
            menu();
          },
        ),
      ),
      ...rows,
      el('p', { textContent: 'Gamepads steer with the stick or d-pad. On a phone, touch the left or right half of the screen. P pauses, M mutes, Esc quits.' }),
      el('div', { class: 'actions' }, start),
    ),
  );
  start.focus();
}

function startGame(): void {
  sfx.unlock();
  game = new Game({
    mode: settings.mode,
    controls: settings.controls,
    seed: (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0,
    masks: assets.masks,
  });
  renderer = new Renderer(canvas, assets);
  renderer.remember(game);
  paused = false;
  acc = 0;
  show();
}

const BEST_KEY = 'payntgpt.solo.best';

function loadBest(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(BEST_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((n) => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

function saveBest(list: number[]): void {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(list));
  } catch {
    // Storage can be unavailable (private window); the list just won't persist.
  }
}

const pct = (share: number) => `${(share * 100).toFixed(1)} %`;

function results(g: Game): void {
  const shares = g.shares();
  const ranked = g.painters.filter((p) => p.active).sort((a, b) => shares[b.index] - shares[a.index]);
  const top = shares[ranked[0].index] || 1;
  const rows = ranked.map((p) => {
    const dot = el('span', { class: 'dot' });
    dot.style.background = assets.colors[p.index];
    const fill = el('i');
    fill.style.width = `${(shares[p.index] / top) * 100}%`;
    fill.style.background = assets.colors[p.index];
    return el(
      'div',
      { class: 'row' },
      el('span', { class: 'name' }, dot, `Painter ${p.index + 1}`),
      el('div', { class: 'bar' }, fill),
      el('span', { class: 'pct', textContent: pct(shares[p.index]) }),
    );
  });

  let title = `Painter ${ranked[0].index + 1} wins`;
  const extra: Node[] = [];
  if (g.mode === 'solo') {
    const mine = shares[0];
    title = `You covered ${pct(mine)}`;
    const best = [...loadBest(), mine].sort((a, b) => b - a).slice(0, 5);
    saveBest(best);
    let marked = false;
    extra.push(
      el('p', { textContent: 'Best solo rounds on this device:' }),
      el(
        'ol',
        { class: 'best' },
        ...best.map((s) => {
          const me = !marked && s === mine;
          if (me) marked = true;
          return el('li', { class: me ? 'me' : '', textContent: pct(s) });
        }),
      ),
    );
  } else if (ranked.length > 1 && shares[ranked[0].index] === shares[ranked[1].index]) {
    title = 'Draw';
  }

  const again = el('button', { class: 'primary', textContent: 'Play again', onclick: startGame });
  show(el('div', { class: 'panel' }, el('h2', { textContent: title }), ...rows, ...extra, el('div', { class: 'actions' }, again, el('button', { textContent: 'Menu', onclick: menu }))));
  again.focus();
}

// ---- main loop --------------------------------------------------------------

addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') sfx.muted = !sfx.muted;
  if (!game || game.phase === Phase.Results) return;
  if (e.code === 'Escape') menu();
  if (e.code === 'KeyP') {
    paused = !paused;
    show(...(paused ? [el('div', { class: 'panel' }, el('h2', { textContent: 'Paused' }), el('p', { textContent: 'Press P to continue.' }))] : []));
  }
});

/** A function call so TypeScript re-reads the phase after each step. */
const over = (g: Game): boolean => g.phase === Phase.Results;

function loop(now: number): void {
  requestAnimationFrame(loop);
  const dt = Math.min(now - last, 250);
  last = now;
  if (!game) return;
  if (!paused && !over(game)) {
    acc += dt;
    while (acc >= TICK_MS && !over(game)) {
      acc -= TICK_MS;
      renderer.remember(game);
      game.step(input.turns());
      for (const e of game.events) sfx.play(e);
      renderer.onEvents(game.events);
      frame++;
      if (over(game)) results(game);
    }
  }
  renderer.draw(game, paused ? 1 : Math.min(acc / TICK_MS, 1), frame);
}

async function boot(): Promise<void> {
  assets = await loadAssets();
  renderer = new Renderer(canvas, assets);
  // Show an idle all-CPU round behind the menu.
  const demo = new Game({ mode: 'battle', controls: [Ctl.Cpu, Ctl.Cpu, Ctl.Cpu, Ctl.Cpu], seed: 1, masks: assets.masks });
  renderer.remember(demo);
  renderer.draw(demo, 1, 0);
  menu();
  last = performance.now();
  requestAnimationFrame(loop);
}

// Handy for debugging and automated checks from the browser console.
Object.assign(window, { payntgpt: { get game() { return game; }, settings, startGame } });

void boot();
