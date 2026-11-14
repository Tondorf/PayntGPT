# PayntGPT

A browser game for one to four painters. Everyone rolls paint across the same
floor and whoever covers the most when the clock runs out wins.

## Play

```bash
npm install
```

```bash
npm run dev
```

Then open the address Vite prints.

| Painter | Left / right |
|---|---|
| 1 | Arrow keys, or touch the left / right half of the screen |
| 2 | Z / X |
| 3 | N / M |
| 4 | 4 / 6 (number row or numpad) |

Gamepad N steers painter N with the stick or d-pad. `P` pauses, `M` mutes,
`Esc` returns to the menu.

## Rules

- Painters never stop; you only steer. Paint lands under the roller every tick.
- **Battle** lasts 88 seconds with up to four painters, human or computer.
  **Solo** lasts 66 seconds and keeps your five best results on the device.
- Running into another painter swaps your headings, sends you both hopping
  (no paint while airborne) and leaves you slow for a few seconds.
- An item appears every 22 seconds:

| Item | Effect |
|---|---|
| Freeze | Everyone else stands still for about 15 seconds |
| Speed | You move 50 % faster |
| Splat | A big blot of your colour where the item lay |
| Sprinkle | A couple of seconds of your colour raining across the floor |
| Jinx | Everyone else slows down and cannot paint |
| Big brush | Your stripe gets wider |

  Speed, jinx and big brush last until the painter is bumped or hit by another
  item. Freeze and jinx only appear in battles.

## Code

- `src/sim/` is the whole game with no browser dependencies: a fixed 40 ms
  tick, 256-step headings, a seeded random generator, and a byte-per-pixel
  floor that keeps a running pixel count per painter. The same seed and inputs
  always give the same round. Tunable numbers are in `src/sim/rules.ts`.
- `src/ui/` draws it, reads keyboard, gamepad and touch, and makes the sounds.
- `src/assets/` takes your own art; see the README there for names and sizes.

```bash
npm test
```

```bash
npm run build
```

The build in `dist/` is static and uses relative paths, so it can be hosted
anywhere. The included workflow publishes it to GitHub Pages on every push to
`main`, once Pages is set to "GitHub Actions" in the repository settings.
