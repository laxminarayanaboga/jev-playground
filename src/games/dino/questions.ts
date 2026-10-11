// Every threshold behind the dino bots, and every word Jev sees.

import { choice } from "@typesafe-ai/sdk";

export const DINO = {
  // Jump when the next obstacle is this many ms from the dino's front.
  jumpLeadMs: 150,
  // Start ducking under a mid-height bird this many ms before it arrives.
  duckLeadMs: 150,
  // The window runs from lead + windowEarlyMs down to lead - windowLateMs.
  // Lopsided because jumping early lands on wide cacti; a little late still clears.
  windowEarlyMs: 30,
  windowLateMs: 60,
  // "approaching" covers this many ms before the window; anything earlier is "far".
  approachMs: 250,

  // Jev bot: send a request this often while an obstacle is close ...
  requestEveryMs: 40,
  // ... where "close" means its projected arrival is within the window plus this margin.
  requestHorizonMs: 400,
  // Latency estimate before any answers come back (hello x10 median) ...
  initialLatencyMs: 230,
  // ... then this percentile of the last 20. Low on purpose: an answer slower than the
  // estimate only makes the action later (safer); a faster one would make it early.
  latencyPercentile: 0.25,
};

// ---- Timing words --------------------------------------------------------

export type Timing = "far" | "approaching" | "window" | "late";

export const TIMING_WORDS: Record<Timing, string> = {
  far: "far: well over half a second away, nothing to do yet",
  approaching: "approaching: close, but acting now would be too early",
  window: "in the window: acting now clears it",
  late: "past the window: act immediately or it hits",
};

// `projectedMs` is when the obstacle will reach the dino, measured from when the answer lands.
export function timingOf(projectedMs: number, leadMs: number): Timing {
  if (projectedMs > leadMs + DINO.windowEarlyMs + DINO.approachMs) return "far";
  if (projectedMs > leadMs + DINO.windowEarlyMs) return "approaching";
  if (projectedMs >= leadMs - DINO.windowLateMs) return "window";
  return "late";
}

// ---- The question ----------------------------------------------------------

const ACTIONS = {
  jump: "`obstacle.kind` is a cactus or a low bird, and `obstacle.timing` is in the window or past it.",
  duck: "`obstacle.kind` is a mid-height bird, and `obstacle.timing` is in the window or past it.",
  wait: "`obstacle.timing` is far or approaching, or `obstacle.kind` is a high bird that the dino runs under.",
} as const;

export type Action = keyof typeof ACTIONS;

// Option order is passed in shuffled for every request (Jev leans to the first option).
export function actionQuestion(order: readonly Action[]) {
  return choice(
    "What should the running dino do right now about `obstacle`?",
    Object.fromEntries(order.map((a) => [a, ACTIONS[a]])) as typeof ACTIONS,
  );
}

// ---- jev-plan: decide once per obstacle, code times the action ----------------

// Labels match `Action` so code can execute the plan directly.
const PLAN_ACTIONS = {
  jump: "`obstacle` is on the ground or flying low at the dino's feet, so jumping over it clears it.",
  duck: "`obstacle` is flying at the height of the dino's head, so ducking under it avoids it.",
  wait: "`obstacle` is flying above the dino's head, so the dino keeps running under it.",
} as const satisfies Record<Action, string>;

// Option order is passed in shuffled for every request.
export function planQuestion(order: readonly Action[]) {
  return choice(
    "The dino is running towards `obstacle`. What should it do when the obstacle reaches it?",
    Object.fromEntries(order.map((a) => [a, PLAN_ACTIONS[a]])) as typeof PLAN_ACTIONS,
  );
}
