// Run with: npm test
import assert from "node:assert/strict";
import { emptyCount, legalMoves, maxTile, move, type Board } from "./board.ts";

const b: Board = [
  [2, 2, 2, 2],
  [4, 0, 4, 8],
  [0, 0, 0, 0],
  [2, 0, 0, 2],
];

// Each tile merges once: 2 2 2 2 -> 4 4, not 8.
let r = move(b, "left");
assert.deepEqual(r.board, [
  [4, 4, 0, 0],
  [8, 8, 0, 0],
  [0, 0, 0, 0],
  [4, 0, 0, 0],
]);
assert.equal(r.scoreGained, 4 + 4 + 8 + 4);
assert.equal(r.merges, 4);
assert.ok(r.moved);

// Merges happen from the side you move towards: 2 2 2 . right -> . . 2 4
assert.deepEqual(move([[2, 2, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], "right").board[0], [0, 0, 2, 4]);

// A merged tile does not merge again in the same move: 4 4 8 -> 8 8, not 16.
assert.deepEqual(move([[4, 4, 8, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], "left").board[0], [8, 8, 0, 0]);

// Up and down work on columns.
r = move(b, "up");
assert.deepEqual(r.board, [
  [2, 2, 2, 2],
  [4, 0, 4, 8],
  [2, 0, 0, 2],
  [0, 0, 0, 0],
]);
r = move(b, "down");
assert.deepEqual(r.board, [
  [0, 0, 0, 0],
  [2, 0, 0, 2],
  [4, 0, 2, 8],
  [2, 2, 4, 2],
]);

// Illegal moves are dropped.
const stuckLeft: Board = [
  [2, 4, 0, 0],
  [8, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
];
assert.deepEqual(Object.keys(legalMoves(stuckLeft)).sort(), ["down", "right"]);

// Full board with no merges: no legal moves.
const dead: Board = [
  [2, 4, 2, 4],
  [4, 2, 4, 2],
  [2, 4, 2, 4],
  [4, 2, 4, 2],
];
assert.deepEqual(legalMoves(dead), {});

assert.equal(emptyCount(b), 7);
assert.equal(maxTile(b), 8);
console.log("board.ts: all assertions passed");
