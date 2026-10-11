// Turns the next obstacle into the small state Jev sees.

import { DINO, TIMING_WORDS, timingOf, type Timing } from "./questions.ts";
import type { Kind, Next } from "./state.ts";

const KIND_WORDS: Record<Kind, string> = {
  "small cactus": "small cactus on the ground",
  "large cactus": "large cactus on the ground",
  "low bird": "low bird, flying at the dino's feet",
  "mid bird": "mid-height bird, flying at the dino's head",
  "high bird": "high bird, flying above the dino's head",
};

export const leadFor = (kind: Kind) => (kind === "mid bird" ? DINO.duckLeadMs : DINO.jumpLeadMs);

export function describe(next: Next, latencyMs: number): { timing: Timing; state: { obstacle: { kind: string; timing: string } } } {
  const timing = timingOf(next.arrivalMs - latencyMs, leadFor(next.kind));
  return { timing, state: { obstacle: { kind: KIND_WORDS[next.kind], timing: TIMING_WORDS[timing] } } };
}

// jev-plan sees only what the obstacle is; code handles when to act.
export const planState = (kind: Kind) => ({ obstacle: KIND_WORDS[kind] });
