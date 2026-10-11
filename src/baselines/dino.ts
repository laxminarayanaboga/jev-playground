// The plain-code dino bot: a few ifs on the time until the next obstacle arrives.

import type { Next } from "../games/dino/state.ts";
import { DINO, type Action } from "../games/dino/questions.ts";

export function ifBot(next: Next | undefined): Action {
  if (!next) return "wait";
  if (next.kind === "high bird") return "wait"; // the dino runs under it
  if (next.kind === "mid bird") return next.arrivalMs <= DINO.duckLeadMs ? "duck" : "wait";
  return next.arrivalMs <= DINO.jumpLeadMs ? "jump" : "wait";
}
