// Pure geometry on the raw game state. All the pixel and timing maths lives here.

import type { RawObstacle, RawState } from "./page.ts";

export type Kind = "small cactus" | "large cactus" | "low bird" | "mid bird" | "high bird";

export interface Next {
  id: number;
  kind: Kind;
  // Gap between the dino's front and the obstacle's front, in px (negative once overlapping).
  gapPx: number;
  // Time until the obstacle reaches the dino's front at the current speed, in ms.
  arrivalMs: number;
  // Time until the obstacle's back has passed the dino's back, in ms.
  clearMs: number;
}

// Bird heights seen in the game's source and on the live page: 100 low, 75 mid, 50 high.
function kindOf(o: RawObstacle): Kind {
  if (o.type === "cactusSmall") return "small cactus";
  if (o.type === "cactusLarge") return "large cactus";
  if (o.y >= 90) return "low bird";
  if (o.y >= 60) return "mid bird";
  return "high bird";
}

// Obstacles move left by (speed + speedOffset) px per frame.
const pxPerMs = (s: RawState, o: RawObstacle) => (s.speed + o.speedOffset) / s.msPerFrame;

// Every obstacle that has not yet passed the dino, nearest first.
export function upcoming(s: RawState): Next[] {
  const front = s.trex.x + s.trex.width;
  return s.obstacles
    .filter((o) => o.x + o.width > s.trex.x)
    .map((o) => {
      const v = pxPerMs(s, o);
      return {
        id: o.id,
        kind: kindOf(o),
        gapPx: o.x - front,
        arrivalMs: (o.x - front) / v,
        clearMs: (o.x + o.width - s.trex.x) / v,
      };
    });
}

export const nextObstacle = (s: RawState): Next | undefined => upcoming(s)[0];

export const onGround = (s: RawState) => !s.trex.jumping && s.trex.y >= s.trex.groundY;
