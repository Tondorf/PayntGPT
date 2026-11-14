# Art

Put PNG files with transparency here, named as below, and rebuild. Anything
missing falls back to the built-in placeholder drawing. A file with the wrong
size is ignored with a console warning.

Frames are stacked top to bottom.

| File | Frame size | Frames | File size | Notes |
|---|---|---|---|---|
| `background.png` | 640x448 | 1 | 640x448 | The floor |
| `hud.png` | 640x32 | 1 | 640x32 | Strip under the floor |
| `painter1.png` … `painter4.png` | 38x40 | 4 | 38x160 | Walk cycle |
| `painter_frozen.png` | 38x40 | 1 | 38x40 | Shown while frozen |
| `painter_jinxed.png` | 38x40 | 4 | 38x160 | Shown while jinxed |
| `brush1.png` … `brush4.png` | 32x32 | 1 | 32x32 | See below |
| `bigbrush1.png` … `bigbrush4.png` | 44x44 | 1 | 44x44 | Shape only |
| `splat1.png` … `splat4.png` | 220x220 | 1 | 220x220 | Shape only |
| `items.png` | 44x44 | 6 | 44x264 | Freeze, speed, splat, sprinkle, jinx, big brush |
| `roller.png` | 15x15 | 32 | 15x480 | 32 headings: east first, then counter-clockwise |
| `shadow.png` | 32x21 | 1 | 32x21 | Under each painter |
| `timer.png` | 16x16 | 2 | 16x32 | Time left, time spent |

The brush, big brush and splat images define the paint shapes: paint lands
wherever a pixel is more than half opaque. `brushN.png` also sets painter N's
paint colour, taken from the opaque pixel nearest its centre.
