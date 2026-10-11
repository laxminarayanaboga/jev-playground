// Plain-code 2048 players to compare Jev against. Both see only legal moves.

import { legalMoves, type Board, type Direction, type MoveResult } from "../games/2048/board.ts";
import { facts } from "../games/2048/describe.ts";
import { rng } from "../rng.ts";

export type Legal = Partial<Record<Direction, MoveResult>>;

export interface Player {
  name: string;
  // `log` is anything worth keeping in the run file for this turn.
  choose(board: Board, legal: Legal): Promise<{ dir: Direction; log?: unknown }>;
}

export function randomPlayer(seed: number): Player {
  const random = rng(seed);
  return {
    name: "random",
    async choose(_board, legal) {
      const dirs = Object.keys(legal) as Direction[];
      return { dir: dirs[Math.floor(random() * dirs.length)]! };
    },
  };
}

// Uses the same facts Jev gets, ranked in a fixed order:
// keep the biggest tile in its corner, then a corner at all, then empty cells,
// then worst-case directions open next turn (bucketed: at least two), then corner
// safety, then empty cells, then worst-case directions, then edge order, merges, points.
export function heuristicPlayer(): Player {
  return {
    name: "heuristic",
    async choose(board, legal) {
      const ranked = (Object.entries(legal) as [Direction, MoveResult][])
        .map(([dir, r]) => {
          const f = facts(board, r);
          const key = [f.leftCorner ? 0 : 1, f.maxPlace === "corner" ? 1 : 0, f.worstNextMoves >= 2 ? 1 : 0, f.cornerSafe === "yes" ? 1 : 0, f.emptyCells, f.worstNextMoves, f.edgeOrder, f.merges, f.scoreGained];
          return { dir, key };
        })
        .sort((a, b) => {
          for (let i = 0; i < a.key.length; i++) if (a.key[i] !== b.key[i]) return b.key[i]! - a.key[i]!;
          return 0;
        });
      return { dir: ranked[0]!.dir };
    },
  };
}

// A stronger plain bot: expectimax to depth 2 (my move, new tile, my next move),
// scoring boards with the usual "snake" weights that pull big tiles into the top-left
// corner and along the top row. No Jev, no description: it sees the raw board.
const SNAKE = [
  [65536, 32768, 16384, 8192],
  [512, 1024, 2048, 4096],
  [256, 128, 64, 32],
  [2, 4, 8, 16],
];

function evaluate(b: Board): number {
  let total = 0;
  b.forEach((row, r) => row.forEach((v, c) => (total += v * SNAKE[r]![c]!)));
  return total;
}

// Average over every empty cell getting a 2 (90%) or a 4 (10%), then my best reply.
function chance(b: Board): number {
  const empties: [number, number][] = [];
  b.forEach((row, r) => row.forEach((v, c) => v === 0 && empties.push([r, c])));
  if (empties.length === 0) return evaluate(b);
  let sum = 0;
  for (const [r, c] of empties) {
    for (const [tile, p] of [[2, 0.9], [4, 0.1]] as const) {
      const next = b.map((row) => [...row]);
      next[r]![c] = tile;
      const replies = Object.values(legalMoves(next));
      const best = replies.length ? Math.max(...replies.map((m) => evaluate(m.board))) : 0;
      sum += p * best;
    }
  }
  return sum / empties.length;
}

export function expectimaxPlayer(): Player {
  return {
    name: "expectimax",
    async choose(_board, legal) {
      let bestDir: Direction | undefined;
      let bestValue = -Infinity;
      for (const [dir, r] of Object.entries(legal) as [Direction, MoveResult][]) {
        const value = chance(r.board);
        if (value > bestValue) [bestDir, bestValue] = [dir, value];
      }
      return { dir: bestDir! };
    },
  };
}
