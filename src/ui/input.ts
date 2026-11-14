/** Left/right keys per painter slot (KeyboardEvent.code). */
export const KEYS: [string[], string[]][] = [
  [['ArrowLeft'], ['ArrowRight']],
  [['KeyZ', 'KeyY'], ['KeyX']],
  [['KeyN'], ['KeyM']],
  [['Numpad4', 'Digit4'], ['Numpad6', 'Digit6']],
];

export const KEY_LABELS = ['← →', 'Z X', 'N M', '4 6'];

export class Input {
  private down = new Set<string>();
  /** -1, 0 or 1 from touch, applied to the first painter. */
  private touch = 0;

  constructor(target: HTMLElement) {
    addEventListener('keydown', (e) => {
      this.down.add(e.code);
      if (e.code.startsWith('Arrow')) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());

    const pointers = new Map<number, number>();
    const update = () => {
      let t = 0;
      for (const v of pointers.values()) t += v;
      this.touch = Math.sign(t);
    };
    target.addEventListener('pointerdown', (e) => {
      const r = target.getBoundingClientRect();
      pointers.set(e.pointerId, e.clientX - r.left < r.width / 2 ? 1 : -1);
      update();
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const)
      target.addEventListener(ev, (e) => {
        pointers.delete(e.pointerId);
        update();
      });
  }

  /** Turn per painter slot: 1 = left, -1 = right. */
  turns(): number[] {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    return KEYS.map(([l, r], i) => {
      let left = l.some((k) => this.down.has(k));
      let right = r.some((k) => this.down.has(k));
      const pad = pads[i];
      if (pad) {
        const ax = pad.axes[0] ?? 0;
        left ||= ax < -0.4 || !!pad.buttons[14]?.pressed;
        right ||= ax > 0.4 || !!pad.buttons[15]?.pressed;
      }
      if (i === 0) {
        left ||= this.touch > 0;
        right ||= this.touch < 0;
      }
      return (left ? 1 : 0) - (right ? 1 : 0);
    });
  }
}
