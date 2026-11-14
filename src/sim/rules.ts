// All tunable numbers of the simulation live here.
// One tick is TICK_MS milliseconds; angles are 0..255 (0 = east, counter-clockwise).

export const TICK_MS = 40;

export const SCREEN_W = 640;
export const SCREEN_H = 480;
export const FIELD_W = 640;
export const FIELD_H = 448;
/** Paint never reaches closer than this to the field edge. */
export const PAINT_INSET = 5;

export const PLAYER_W = 38;
export const PLAYER_H = 40;
export const BRUSH_SIZE = 32;
export const BIG_BRUSH_SIZE = 44;
export const SPLAT_SIZE = 220;
export const ITEM_SIZE = 44;
/** The brush touches the floor this far below the painter's centre. */
export const BRUSH_OFFSET_Y = 14;

export const RULES = {
  battleTicks: 2200,
  soloTicks: 1650,
  timerSegments: 20,
  ticksPerSegment: 110,
  /** An item appears whenever the timer reaches a segment divisible by this. */
  itemEverySegments: 5,
  itemMinDistance: 140,

  countdownTicks: 80,
  pickupPauseTicks: 20,
  timeUpTicks: 30,

  turnStep: 4,
  speedNormal: 4,
  speedFast: 6,
  speedDazed: 2,
  speedJinxed: 3,
  startPush: 40,

  hopTicks: 34,
  dazedTicks: 110,
  frozenTicks: 385,
  sprinkleTicks: 56,
  jinxAiDelay: 80,

  bumpDistance: 32,
  pickupDistance: 34,

  aiNearRange: 80,
  aiConeRange: 130,
  aiCone: 0x20,
  aiEvadeTurn: 12,
  aiDeadZone: 10,
} as const;

/** Height of the hop arc, one entry per tick going up; mirrored on the way down. */
export const HOP_ARC = [8, 7, 6, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 1, 0];
