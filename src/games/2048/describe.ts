// Turns a simulated move into facts (numbers, for code) and words (for Jev).
// All counting and geometry happens here; Jev only sees the words.

import { emptyCount, legalMoves, maxTile, type Board, type MoveResult } from "./board.ts";
import { CORNER_SAFE_WORDS, MERGE_WORDS, MOBILITY_WORDS, ORDER_WORDS, PLACE_WORDS, spaceWords } from "./questions.ts";

export type Place = "corner" | "edge" | "middle";

export interface MoveFacts {
  emptyCells: number;
  scoreGained: number;
  merges: number;
  // Lookahead over every new tile (a 2 or 4 in each empty cell):
  // the fewest directions that could move next turn (0-4) ...
  worstNextMoves: number;
  // ... and whether, whatever the tile, some next move keeps the biggest tile in a corner.
  cornerSafe: "yes" | "no" | "n/a";
  maxTile: number;
  maxPlace: Place;
  // The biggest tile was in a corner before the move and is not after it.
  leftCorner: boolean;
  // From the biggest tile's corner, how many cells along the better edge are filled
  // and never increase (e.g. 64 32 16 8 = 4). 0 if the biggest tile is not in a corner.
  edgeOrder: number;
}

const N = 4;
const CORNERS = [
  [0, 0],
  [0, N - 1],
  [N - 1, 0],
  [N - 1, N - 1],
] as const;

function placeOf(r: number, c: number): Place {
  const rEdge = r === 0 || r === N - 1;
  const cEdge = c === 0 || c === N - 1;
  if (rEdge && cEdge) return "corner";
  if (rEdge || cEdge) return "edge";
  return "middle";
}

function maxPlace(b: Board): Place {
  const m = maxTile(b);
  let best: Place = "middle";
  b.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v !== m) return;
      const p = placeOf(r, c);
      if (p === "corner" || (p === "edge" && best === "middle")) best = p;
    }),
  );
  return best;
}

// Length of the non-increasing run starting at a corner, along a row or column.
function runFrom(b: Board, r: number, c: number, dr: number, dc: number): number {
  let len = 0;
  let prev = Infinity;
  for (let i = 0; i < N; i++) {
    const v = b[r + dr * i]![c + dc * i]!;
    if (v === 0 || v > prev) break;
    len++;
    prev = v;
  }
  return len;
}

function edgeOrder(b: Board): number {
  const m = maxTile(b);
  let best = 0;
  for (const [r, c] of CORNERS) {
    if (b[r]![c] !== m) continue;
    const dr = r === 0 ? 1 : -1;
    const dc = c === 0 ? 1 : -1;
    best = Math.max(best, runFrom(b, r, c, 0, dc), runFrom(b, r, c, dr, 0));
  }
  return best;
}

function lookahead(after: Board): Pick<MoveFacts, "worstNextMoves" | "cornerSafe"> {
  const inCorner = maxPlace(after) === "corner";
  let worstNextMoves = 4;
  let cornerSafe = true;
  after.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v !== 0) return;
      for (const tile of [2, 4]) {
        const next = after.map((x) => [...x]);
        next[r]![c] = tile;
        const replies = Object.values(legalMoves(next));
        worstNextMoves = Math.min(worstNextMoves, replies.length);
        if (inCorner && !replies.some((m) => maxPlace(m.board) === "corner")) cornerSafe = false;
      }
    }),
  );
  return { worstNextMoves, cornerSafe: !inCorner ? "n/a" : cornerSafe ? "yes" : "no" };
}

export function facts(before: Board, result: MoveResult): MoveFacts {
  const after = result.board;
  const placeAfter = maxPlace(after);
  return {
    emptyCells: emptyCount(after),
    scoreGained: result.scoreGained,
    merges: result.merges,
    ...lookahead(after),
    maxTile: maxTile(after),
    maxPlace: placeAfter,
    leftCorner: maxPlace(before) === "corner" && placeAfter !== "corner",
    edgeOrder: edgeOrder(after),
  };
}

// The words Jev sees for one move. Field names here are what questions.ts refers to.
// A type alias, not an interface, so it fits the SDK's JSON state type.
export type MoveWords = {
  space: string;
  biggestTile: string;
  bigTilesInOrder: string;
  merges: string;
  nextTurn: string;
  cornerSafe: string;
};

export function words(f: MoveFacts): MoveWords {
  return {
    space: spaceWords(f.emptyCells),
    biggestTile: f.leftCorner ? PLACE_WORDS.leftCorner : PLACE_WORDS[f.maxPlace],
    bigTilesInOrder: ORDER_WORDS[Math.min(f.edgeOrder, 4) as 0 | 1 | 2 | 3 | 4],
    merges: MERGE_WORDS[Math.min(f.merges, 2) as 0 | 1 | 2],
    nextTurn: MOBILITY_WORDS[f.worstNextMoves as 0 | 1 | 2 | 3 | 4],
    cornerSafe: CORNER_SAFE_WORDS[f.cornerSafe],
  };
}
