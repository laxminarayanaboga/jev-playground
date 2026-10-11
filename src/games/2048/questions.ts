// Every word Jev sees for 2048, and every threshold behind those words.
// Edit here; describe.ts and play.ts only plug values in.

import { choice, score, type ScoreQuestion } from "@typesafe-ai/sdk";
import type { Direction } from "./board.ts";

// ---- State wording ------------------------------------------------------

// Empty-cell buckets, checked top to bottom.
const SPACE_BUCKETS: { min: number; label: string }[] = [
  { min: 8, label: "plenty of space" },
  { min: 4, label: "some space" },
  { min: 2, label: "tight" },
  { min: 0, label: "nearly full" },
];

export function spaceWords(emptyCells: number): string {
  const label = SPACE_BUCKETS.find((b) => emptyCells >= b.min)!.label;
  return `${label} (${emptyCells} of 16 cells empty)`;
}

export const PLACE_WORDS = {
  corner: "in a corner",
  edge: "on an edge, not in a corner",
  middle: "in the middle of the board",
  leftCorner: "pushed out of its corner",
} as const;

// Indexed by MoveFacts.edgeOrder (0-4).
export const ORDER_WORDS = [
  "no: the biggest tile is not in a corner",
  "no: the tiles next to the biggest tile are not in order",
  "partly: the biggest tile and one neighbour along an edge are in order",
  "mostly: three tiles along an edge get smaller away from the biggest tile",
  "fully: a whole edge gets smaller away from the biggest tile",
] as const;

// Indexed by MoveFacts.merges, capped at 2.
export const MERGE_WORDS = [
  "no tiles merge",
  "one pair of tiles merges",
  "two or more pairs of tiles merge",
] as const;

// Indexed by MoveFacts.worstNextMoves: the fewest directions that could move next
// turn, over every new tile that could appear.
export const MOBILITY_WORDS = [
  "a new tile could leave no move at all: the game could end",
  "a new tile could leave only one direction able to move: risky",
  "whatever new tile appears, at least two directions can move",
  "whatever new tile appears, at least three directions can move",
  "whatever new tile appears, all four directions can move",
] as const;

export const CORNER_SAFE_WORDS = {
  yes: "yes: whatever new tile appears, a next move keeps the biggest tile in its corner",
  no: "no: a new tile could force the biggest tile out of its corner next turn",
  "n/a": "no: the biggest tile is not in a corner",
} as const;

// ---- Variant A: one Score question per legal move -------------------------

// Levels name the fields of the move being judged, e.g. `moves.up.space`.
function boardLevels(m: string) {
  return [
    `Close to losing: \`${m}.space\` is nearly full, \`${m}.biggestTile\` was pushed out of its corner, or \`${m}.nextTurn\` says a new tile could leave one direction or none.`,
    `Poor: \`${m}.space\` is tight and \`${m}.bigTilesInOrder\` is no, or \`${m}.cornerSafe\` is no.`,
    `Playable: there is some space, but \`${m}.biggestTile\` is not in a corner or \`${m}.bigTilesInOrder\` is no.`,
    `Good: \`${m}.biggestTile\` is in a corner, there is room to move, and \`${m}.bigTilesInOrder\` is at least partly.`,
    `Excellent: \`${m}.biggestTile\` is in a corner, \`${m}.bigTilesInOrder\` is mostly or fully, \`${m}.space\` is plenty, \`${m}.cornerSafe\` is yes, and \`${m}.nextTurn\` leaves at least three directions.`,
  ] as const;
}

export type BoardQuestion = ScoreQuestion<ReturnType<typeof boardLevels>>;

export function variantA(dirs: Direction[]): Partial<Record<Direction, BoardQuestion>> {
  const qs: Partial<Record<Direction, BoardQuestion>> = {};
  for (const d of dirs) {
    qs[d] = score(
      `In 2048 you want to keep the biggest tile in a corner, keep the big tiles in order ` +
        `along an edge, merge tiles to free space, and stay safe whatever new tile appears. How promising is the board after the move ` +
        `described in \`moves.${d}\`?`,
      boardLevels(`moves.${d}`),
    );
  }
  return qs;
}

// ---- Variant B: one Choice across the legal moves ---------------------------

// Option order follows `dirs`, which play.ts shuffles every turn (Jev leans to the first option).
export function variantB(dirs: Direction[]) {
  return choice(
    `In 2048 you want to keep the biggest tile in a corner, keep the big tiles in order ` +
      `along an edge, merge tiles to free space, and stay safe whatever new tile appears. ` +
      `Each entry in \`moves\` describes the board after one move. Which move leaves the most promising board?`,
    Object.fromEntries(dirs.map((d) => [d, `Make the move described in \`moves.${d}\`.`])),
  );
}
