// Summarise the latest run of each 2048 player and show turns where Jev and the
// heuristic (which ranks the same facts Jev sees) disagree.
//
//   npm run report:2048 -- [--examples 5] [--variant jev-a]

import { readdirSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { expectimaxPlayer, heuristicPlayer } from "../../baselines/2048.ts";
import type { JevSummary } from "../../jev/client.ts";
import { format, legalMoves, type Board, type Direction } from "./board.ts";

const { values: args } = parseArgs({
  options: {
    examples: { type: "string", default: "5" },
    variant: { type: "string", default: "jev-a" },
  },
});

const PLAYERS = ["random", "heuristic", "expectimax", "jev-a", "jev-b"];

interface Turn {
  move: number;
  board: Board;
  dir: Direction;
  jev?: { state: unknown; scores?: Record<string, number>; probabilities?: Record<string, number>; forced?: boolean; tie?: boolean };
}
interface Run {
  player: string;
  results: { maxTile: number; score: number; moves: number; end: string }[];
  jev?: JevSummary;
  games: Turn[][];
}

function latest(player: string): Run | undefined {
  const files = readdirSync("runs")
    .filter((f) => f.startsWith(`2048-${player}-`))
    .sort();
  // Prefer the newest multi-game run.
  for (const f of files.reverse()) {
    const run = JSON.parse(readFileSync(`runs/${f}`, "utf8")) as Run;
    if (run.results.length > 1) return run;
  }
  return undefined;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const mean = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

const rows = [];
const runs: Record<string, Run> = {};
for (const p of PLAYERS) {
  const run = latest(p);
  if (!run) continue;
  runs[p] = run;
  const tiles = run.results.map((r) => r.maxTile);
  const asked = run.games.flat().filter((t) => t.jev && !t.jev.forced);
  rows.push({
    player: p,
    games: run.results.length,
    "best tile (median)": median(tiles),
    "best tile (max)": Math.max(...tiles),
    "≥512": tiles.filter((t) => t >= 512).length,
    "≥1024": tiles.filter((t) => t >= 1024).length,
    "score (mean)": mean(run.results.map((r) => r.score)),
    "moves (mean)": mean(run.results.map((r) => r.moves)),
    requests: run.jev?.requests ?? "-",
    "tokens/req": run.jev ? Math.round(run.jev.inputTokens / run.jev.requests) : "-",
    "cost $": run.jev ? run.jev.costUsd.toFixed(4) : "-",
    "p50 ms": run.jev ? Math.round(run.jev.medianMs) : "-",
    "p95 ms": run.jev ? Math.round(run.jev.p95Ms) : "-",
    "ties %": p === "jev-a" ? Math.round((100 * asked.filter((t) => t.jev!.tie).length) / asked.length) : "-",
  });
}
console.table(rows);

// ---- Agreement with the baselines on the boards Jev actually faced -------------

const heuristic = heuristicPlayer();
const expectimax = expectimaxPlayer();

for (const v of ["jev-a", "jev-b"]) {
  const run = runs[v];
  if (!run) continue;
  let n = 0, withH = 0, withE = 0;
  for (const t of run.games.flat()) {
    if (!t.jev || t.jev.forced) continue;
    const legal = legalMoves(t.board);
    n++;
    if ((await heuristic.choose(t.board, legal)).dir === t.dir) withH++;
    if ((await expectimax.choose(t.board, legal)).dir === t.dir) withE++;
  }
  console.log(`${v}: agrees with heuristic on ${Math.round((100 * withH) / n)}% of ${n} asked turns, with expectimax on ${Math.round((100 * withE) / n)}%`);
}

// ---- Example disagreements --------------------------------------------------

const run = runs[args.variant];
if (run) {
  const disagreements: { game: number; t: Turn; h: Direction; e: Direction }[] = [];
  for (const [g, turns] of run.games.entries()) {
    for (const t of turns) {
      if (!t.jev || t.jev.forced) continue;
      const legal = legalMoves(t.board);
      const h = (await heuristic.choose(t.board, legal)).dir;
      if (h !== t.dir) disagreements.push({ game: g + 1, t, h, e: (await expectimax.choose(t.board, legal)).dir });
    }
  }
  // Spread the examples evenly over all disagreements.
  const k = Number(args.examples);
  const step = Math.max(1, Math.floor(disagreements.length / k));
  console.log(`\n${disagreements.length} turns where ${args.variant} and the heuristic disagree; ${k} examples:`);
  for (const { game, t, h, e } of disagreements.filter((_, i) => i % step === 0).slice(0, k)) {
    console.log(`\n--- game ${game}, move ${t.move}: ${args.variant} → ${t.dir}, heuristic → ${h}, expectimax → ${e}`);
    console.log(format(t.board));
    console.log(JSON.stringify(t.jev!.state, null, 1));
    console.log("jev:", JSON.stringify(t.jev!.scores ?? t.jev!.probabilities));
  }
}
