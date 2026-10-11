// Pure 2048 move simulation. A board is board[row][col], row 0 at the top, 0 = empty.
// Matches the original game: tiles slide as far as they can, and each tile merges
// at most once per move.

export type Board = number[][];
export type Direction = "up" | "down" | "left" | "right";
export const DIRECTIONS: readonly Direction[] = ["up", "down", "left", "right"];

export interface MoveResult {
  board: Board;
  moved: boolean;
  scoreGained: number;
  merges: number;
}

// Slide one line towards index 0 and merge equal neighbours once.
function slideLine(line: number[]): { line: number[]; scoreGained: number; merges: number } {
  const tiles = line.filter((v) => v !== 0);
  const out: number[] = [];
  let scoreGained = 0;
  let merges = 0;
  for (let i = 0; i < tiles.length; i++) {
    const v = tiles[i]!;
    if (tiles[i + 1] === v) {
      out.push(v * 2);
      scoreGained += v * 2;
      merges++;
      i++;
    } else {
      out.push(v);
    }
  }
  while (out.length < line.length) out.push(0);
  return { line: out, scoreGained, merges };
}

const transpose = (b: Board): Board => b[0]!.map((_, c) => b.map((row) => row[c]!));
const reverseRows = (b: Board): Board => b.map((row) => [...row].reverse());

// Rotate the board so the move becomes "left", slide, then rotate back.
const toLeft: Record<Direction, (b: Board) => Board> = {
  left: (b) => b,
  right: reverseRows,
  up: transpose,
  down: (b) => reverseRows(transpose(b)),
};
const fromLeft: Record<Direction, (b: Board) => Board> = {
  left: (b) => b,
  right: reverseRows,
  up: transpose,
  down: (b) => transpose(reverseRows(b)),
};

export function move(board: Board, dir: Direction): MoveResult {
  let scoreGained = 0;
  let merges = 0;
  const slid = toLeft[dir](board).map((row) => {
    const r = slideLine(row);
    scoreGained += r.scoreGained;
    merges += r.merges;
    return r.line;
  });
  const next = fromLeft[dir](slid);
  return { board: next, moved: !equal(board, next), scoreGained, merges };
}

export function legalMoves(board: Board): Partial<Record<Direction, MoveResult>> {
  const out: Partial<Record<Direction, MoveResult>> = {};
  for (const dir of DIRECTIONS) {
    const r = move(board, dir);
    if (r.moved) out[dir] = r;
  }
  return out;
}

export const equal = (a: Board, b: Board): boolean =>
  a.every((row, r) => row.every((v, c) => v === b[r]![c]));

export const emptyCount = (b: Board): number => b.flat().filter((v) => v === 0).length;

export const maxTile = (b: Board): number => Math.max(...b.flat());

export function format(b: Board): string {
  return b.map((row) => row.map((v) => String(v || ".").padStart(5)).join("")).join("\n");
}
