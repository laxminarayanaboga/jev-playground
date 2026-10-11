// Play 2048 in a headed browser.
//
//   npm run 2048 -- --player jev-a --games 1 --seed 1 [--parallel 5]
//   players: random, heuristic, expectimax, jev-a, jev-b
//
// Game N uses seed + N - 1 for the tile RNG, so different players with the same
// --seed see the same tiles (until their moves make the boards diverge).

import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { expectimaxPlayer, heuristicPlayer, randomPlayer, type Legal, type Player } from "../../baselines/2048.ts";
import { Jev, RequestCapReached } from "../../jev/client.ts";
import { rng, shuffle } from "../../rng.ts";
import { legalMoves, maxTile, type Board, type Direction } from "./board.ts";
import { facts, words } from "./describe.ts";
import { Game2048 } from "./page.ts";
import { variantA, variantB, type BoardQuestion } from "./questions.ts";

const { values: args } = parseArgs({
  options: {
    player: { type: "string", default: "jev-a" },
    games: { type: "string", default: "1" },
    seed: { type: "string", default: "1" },
    parallel: { type: "string", default: "1" },
  },
});
const games = Number(args.games);
const seed = Number(args.seed);
const parallel = Number(args.parallel);

// Both Jev variants see the same state. The order of moves is shuffled every turn,
// in case position biases Jev.
function moveState(board: Board, legal: Legal, random: () => number) {
  const dirs = shuffle(Object.keys(legal) as Direction[], random);
  return { dirs, state: { moves: Object.fromEntries(dirs.map((d) => [d, words(facts(board, legal[d]!))])) } };
}

// ---- Jev variant A: one Score per legal move, take the highest -------------

function jevA(jev: Jev, seed: number): Player {
  const random = rng(seed);
  return {
    name: "jev-a",
    async choose(board, legal) {
      const { dirs, state } = moveState(board, legal, random);
      if (dirs.length === 1) return { dir: dirs[0]!, log: { state, forced: true } };
      const questions = variantA(dirs) as Record<string, BoardQuestion>;

      const { result, latencyMs, requestId } = await jev.ask({ state, questions });
      const scores = Object.fromEntries(dirs.map((d) => [d, result.answers[d]!.score]));
      // Highest score wins; ties go to the earlier (shuffled) move.
      const dir = dirs.reduce((best, d) => (scores[d]! > scores[best]! ? d : best));
      const top = Object.values(scores).sort((a, b) => b - a);
      const tie = top.length > 1 && top[0]! - top[1]! < 0.01;
      return { dir, log: { state, scores, tie, latencyMs: Math.round(latencyMs), requestId } };
    },
  };
}

// ---- Jev variant B: one Choice across the legal moves -----------------------

function jevB(jev: Jev, seed: number): Player {
  const random = rng(seed);
  return {
    name: "jev-b",
    async choose(board, legal) {
      const { dirs, state } = moveState(board, legal, random);
      if (dirs.length === 1) return { dir: dirs[0]!, log: { state, forced: true } };
      const { result, latencyMs, requestId } = await jev.ask({ state, questions: { move: variantB(dirs) } });
      const a = result.answers.move;
      return {
        dir: a.choice as Direction,
        log: { state, probabilities: a.probabilities, confidence: a.confidence, latencyMs: Math.round(latencyMs), requestId },
      };
    },
  };
}

// ---- Game loop ---------------------------------------------------------------

interface GameResult {
  seed: number;
  maxTile: number;
  score: number;
  moves: number;
  end: "game over" | "request cap";
}

async function playOne(player: Player, gameSeed: number, turns: unknown[]): Promise<GameResult> {
  const game = await Game2048.open(gameSeed);
  let moves = 0;
  let best = 0;
  let score = 0;
  try {
    for (;;) {
      const s = await game.read();
      score = s.score;
      if (s.over) return { seed: gameSeed, maxTile: best, score, moves, end: "game over" };

      best = Math.max(best, maxTile(s.board));
      const legal = legalMoves(s.board);
      const { dir, log } = await player.choose(s.board, legal);
      best = Math.max(best, maxTile(legal[dir]!.board));
      turns.push({ move: moves, board: s.board, dir, ...(log ? { jev: log } : {}) });
      await game.press(dir);
      moves++;
      if (moves % 100 === 0) console.log(`  seed ${gameSeed}: move ${moves}, score ${score}, best tile ${best}`);
    }
  } catch (e) {
    if (e instanceof RequestCapReached) return { seed: gameSeed, maxTile: best, score, moves, end: "request cap" };
    throw e;
  } finally {
    await game.close();
  }
}

const jev = args.player.startsWith("jev") ? new Jev() : undefined;
// One player per game, seeded by the game, so parallel games don't share an RNG.
const makePlayer = (gameSeed: number): Player =>
  args.player === "random" ? randomPlayer(gameSeed)
  : args.player === "heuristic" ? heuristicPlayer()
  : args.player === "expectimax" ? expectimaxPlayer()
  : args.player === "jev-a" ? jevA(jev!, gameSeed)
  : args.player === "jev-b" ? jevB(jev!, gameSeed)
  : (() => { throw new Error(`unknown --player ${args.player}`); })();
const player = makePlayer(seed);

// Run up to `parallel` games at once, each in its own browser. Results keep seed order.
const results: GameResult[] = new Array(games);
const turnsByGame: unknown[][] = new Array(games);
let nextGame = 0;
let capped = false;
async function worker() {
  while (!capped && nextGame < games) {
    const g = nextGame++;
    console.log(`game ${g + 1}/${games} (${player.name}, seed ${seed + g})`);
    const turns: unknown[] = [];
    const r = await playOne(makePlayer(seed + g), seed + g, turns);
    results[g] = r;
    turnsByGame[g] = turns;
    console.log(`  game ${g + 1} ${r.end}: best tile ${r.maxTile}, score ${r.score}, ${r.moves} moves`);
    if (r.end === "request cap") capped = true;
  }
}
await Promise.all(Array.from({ length: Math.min(parallel, games) }, worker));
const finished = results.filter(Boolean);

mkdirSync("runs", { recursive: true });
const file = `runs/2048-${player.name}-seed${seed}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(file, JSON.stringify({ player: player.name, seed, results: finished, jev: jev?.summary(), games: turnsByGame.filter(Boolean) }, null, 2));

console.log(`\n=== ${player.name}, ${finished.length} game(s) ===`);
console.table(finished);
const tiles = finished.map((r) => r.maxTile).sort((a, b) => a - b);
const scores = finished.map((r) => r.score);
console.log(`best tile: median ${tiles[Math.floor(tiles.length / 2)]}, max ${tiles.at(-1)}`);
console.log(`score:     mean ${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}`);
if (jev) console.log(jev.formatSummary());
console.log(`log: ${file}`);
