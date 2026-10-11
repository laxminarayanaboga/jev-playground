// Play the Chrome dino game in a headed browser.
//
//   npm run dino -- --player if|jev|jev-plan --runs 3 [--max-seconds N] [--debug]   (default: no time cap)
//
// The Jev bot stops when MAX_REQUESTS is reached (default 2000, about 2-3 minutes of play).

import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { ifBot } from "../../baselines/dino.ts";
import { Jev, RequestCapReached } from "../../jev/client.ts";
import { rng, shuffle } from "../../rng.ts";
import { describe, leadFor, planState } from "./describe.ts";
import { DinoGame, type RawState } from "./page.ts";
import { actionQuestion, DINO, planQuestion, type Action, type Timing } from "./questions.ts";
import { nextObstacle, onGround, upcoming, type Kind, type Next } from "./state.ts";

const { values: args } = parseArgs({
  options: {
    player: { type: "string", default: "if" },
    runs: { type: "string", default: "1" },
    "max-seconds": { type: "string", default: "0" },
    debug: { type: "boolean", default: false },
  },
});
const runs = Number(args.runs);
const maxMs = Number(args["max-seconds"]) * 1000 || Infinity; // 0 = no cap

// Where the obstacle really was when an action was taken, against the window.
type Verdict = "early" | "in time" | "late";
function verdict(next: Next): Verdict {
  const lead = leadFor(next.kind);
  if (next.arrivalMs > lead + DINO.windowEarlyMs) return "early";
  if (next.arrivalMs < lead - DINO.windowLateMs) return "late";
  return "in time";
}

// ---- Players ---------------------------------------------------------------

interface Player {
  // Called on every state read; returns the action to take now, if any.
  tick(s: RawState, next: Next | undefined): Action | undefined;
  capped: boolean;
  log: unknown[];
}

function ifPlayer(): Player {
  return { capped: false, log: [], tick: (_s, next) => ifBot(next) };
}

interface Answer {
  seq: number;
  sentAt: number;
  latencyMs: number;
  arrivalAt: number; // absolute time (performance.now) the obstacle was due at the dino
  kind: string;
  timing: Timing;
  choice: Action;
  probabilities: Record<string, number>;
}

function jevPlayer(jev: Jev, seed: number): Player {
  const random = rng(seed);
  const latencies: number[] = [];
  const answers: Answer[] = [];
  let seq = 0;
  let lastSent = 0;
  let lastApplied = -1;

  const latencyEstimate = () => {
    if (!latencies.length) return DINO.initialLatencyMs;
    const recent = latencies.slice(-20).sort((a, b) => a - b);
    return recent[Math.floor(recent.length * DINO.latencyPercentile)]!;
  };

  const player: Player = {
    capped: false,
    log: [],
    tick(s, next) {
      const now = performance.now();

      // 1. Send a new request while the obstacle is close, every requestEveryMs.
      if (next && !player.capped && now - lastSent >= DINO.requestEveryMs) {
        const est = latencyEstimate();
        const projected = next.arrivalMs - est;
        if (projected <= leadFor(next.kind) + DINO.windowEarlyMs + DINO.requestHorizonMs) {
          lastSent = now;
          const mySeq = seq++;
          const { timing, state } = describe(next, est);
          const order = shuffle(["jump", "duck", "wait"] as const, random);
          jev
            .ask({ state, questions: { action: actionQuestion(order) } })
            .then(({ result, latencyMs }) => {
              latencies.push(latencyMs);
              const a = result.answers.action;
              answers.push({
                seq: mySeq, sentAt: now, latencyMs: Math.round(latencyMs), arrivalAt: now + next.arrivalMs,
                kind: next.kind, timing, choice: a.choice, probabilities: a.probabilities,
              });
            })
            .catch((e) => {
              if (e instanceof RequestCapReached) player.capped = true;
              else player.log.push({ seq: mySeq, error: String(e) });
            });
        }
      }

      // 2. Act on the newest answer that arrived, if it is still about the current obstacle.
      if (!answers.length) return undefined;
      const fresh = answers.splice(0).sort((a, b) => b.seq - a.seq);
      for (const old of fresh.slice(1)) player.log.push({ ...old, applied: "superseded" });
      const a = fresh[0]!;
      if (a.seq < lastApplied) {
        player.log.push({ ...a, applied: "superseded" });
        return undefined;
      }
      lastApplied = a.seq;
      const sameObstacle = next && Math.abs(now + next.arrivalMs - a.arrivalAt) < 100;
      if (!sameObstacle) {
        player.log.push({ ...a, applied: "stale" });
        return undefined;
      }
      const applied =
        a.choice === "wait" ? "wait"
        : a.choice === "jump" && !onGround(s) ? "in air"
        : a.choice === "duck" && s.trex.ducking ? "already ducking"
        : verdict(next);
      player.log.push({ ...a, applied, arrivalAtApplyMs: Math.round(next.arrivalMs) });
      return a.choice;
    },
  };
  return player;
}

// ---- jev-plan: one request per obstacle when it appears; code times the action -------

// What the if bot would do, to score Jev's plans against.
const EXPECTED: Record<Kind, Action> = {
  "small cactus": "jump",
  "large cactus": "jump",
  "low bird": "jump",
  "mid bird": "duck",
  "high bird": "wait",
};

interface Tracked {
  id: number;
  seq: number;
  kind: Kind;
  arrivalAt: number; // absolute time the obstacle is due at the dino; refreshed every tick
  arrivalAtSendMs: number;
  plan?: Action;
  probabilities?: Record<string, number>;
  latencyMs?: number;
  marginMs?: number; // time left before the obstacle arrived when the answer landed
  // Set when the obstacle reaches its lead time: the plan as it stood then (an answer
  // arriving later is not used). `null` means no answer had arrived.
  locked?: Action | null;
}

function jevPlanPlayer(jev: Jev, seed: number): Player {
  const random = rng(seed);
  const tracked: Tracked[] = [];
  let seq = 0;

  const player: Player = {
    capped: false,
    log: [],
    tick(s) {
      const now = performance.now();
      const ups = upcoming(s);
      // Forget obstacles that have long passed.
      while (tracked.length && tracked[0]!.arrivalAt < now - 2000) tracked.shift();

      // 1. Match each visible obstacle to one we know (by its page id); ask Jev about new ones.
      const current: (Tracked | undefined)[] = ups.map((u) => {
        const at = now + u.arrivalMs;
        let t = tracked.find((x) => x.id === u.id);
        if (t) t.arrivalAt = at;
        else if (u.arrivalMs > 0 && !player.capped) {
          t = { id: u.id, seq: seq++, kind: u.kind, arrivalAt: at, arrivalAtSendMs: Math.round(u.arrivalMs) };
          tracked.push(t);
          const order = shuffle(["jump", "duck", "wait"] as const, random);
          const sentAt = now;
          const mine = t;
          jev
            .ask({ state: planState(u.kind), questions: { action: planQuestion(order) } })
            .then(({ result, latencyMs }) => {
              const a = result.answers.action;
              Object.assign(mine, {
                plan: a.choice, probabilities: a.probabilities, latencyMs: Math.round(latencyMs),
                marginMs: Math.round(mine.arrivalAt - (sentAt + latencyMs)),
              });
            })
            .catch((e) => {
              if (e instanceof RequestCapReached) player.capped = true;
              else player.log.push({ seq: mine.seq, error: String(e) });
            });
        }
        return t;
      });

      // 2. When the nearest obstacle reaches its lead time, carry out Jev's plan.
      // Keep returning the plan on every read until the obstacle passes, like the if bot,
      // so a jump that was blocked (dino still in the air) happens as soon as it lands.
      const next = ups[0];
      const t = current[0];
      if (!next || !t) return undefined;
      const lead = t.plan === "duck" ? DINO.duckLeadMs : DINO.jumpLeadMs;
      if (next.arrivalMs > lead) return undefined;
      if (t.locked === undefined) {
        t.locked = t.plan ?? null;
        const { locked: _, arrivalAt: __, ...entry } = t;
        player.log.push({ ...entry, expected: EXPECTED[t.kind], outcome: t.plan ? "acted" : "no answer in time" });
      }
      return t.locked ?? undefined;
    },
  };
  return player;
}

// ---- Game loop -------------------------------------------------------------------

interface RunResult {
  run: number;
  score: number;
  seconds: number;
  end: string;
}

const jev = args.player.startsWith("jev") ? new Jev() : undefined;
const game = await DinoGame.open();
const results: RunResult[] = [];
const logs: unknown[][] = [];
let reads = 0;

for (let run = 1; run <= runs; run++) {
  // After a crash the game ignores restarts for ~1.2 s; after a time cap, reload instead.
  if (run > 1) await (results.at(-1)!.end === "crashed" ? game.waitMs(1500) : game.reload());
  await game.start();
  console.log(`run ${run}/${runs} starting`);
  const player =
    args.player === "jev" ? jevPlayer(jev!, run)
    : args.player === "jev-plan" ? jevPlanPlayer(jev!, run)
    : ifPlayer();
  let duckUntil = 0;
  let last: Next | undefined;
  const t0 = performance.now();
  let lastDebug = 0;
  let lastProgress = t0;

  const finish = (s: RawState, end: string, note = "") => {
    results.push({ run, score: s.score, seconds: Math.round((performance.now() - t0) / 1000), end });
    console.log(`run ${run}: score ${s.score}, ${end}${note}`);
  };

  for (;;) {
    const s = await game.read();
    reads++;
    const now = performance.now();
    if (now - lastProgress > 30000) {
      console.log(`  run ${run}: ${Math.round((now - t0) / 1000)} s, score ${s.score}, speed ${s.speed.toFixed(1)}`);
      lastProgress = now;
    }
    if (args.debug && now - lastDebug > 2000) {
      lastDebug = now;
      console.log(`[debug ${Math.round((now - t0) / 1000)}s]`, JSON.stringify(await game.debug()));
    }
    if (s.crashed) {
      await game.duck(false);
      const on = last ? ` on ${last.kind}, ${Math.round(last.arrivalMs)} ms away, speed ${s.speed.toFixed(1)}` : "";
      finish(s, "crashed", on);
      break;
    }
    if (now - t0 > maxMs) { await game.duck(false); finish(s, "time cap"); break; }
    if (player.capped) { await game.duck(false); finish(s, "request cap"); break; }

    const next = nextObstacle(s);
    last = next;
    const action = player.tick(s, next);
    if (action === "jump" && onGround(s)) await game.jump();
    // Hold duck from the decision until the obstacle it was for has passed.
    if (action === "duck" && next) duckUntil = now + next.clearMs + 30;
    await game.duck(now < duckUntil);
  }
  logs.push(player.log);
  if (results.at(-1)!.end === "request cap") break;
}

// ---- Summary -------------------------------------------------------------------------

mkdirSync("runs", { recursive: true });
const file = `runs/dino-${args.player}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(file, JSON.stringify({ player: args.player, config: DINO, results, jev: jev?.summary(), logs }, null, 2));

console.log(`\n=== dino, ${args.player}, ${results.length} run(s) ===`);
console.table(results);
const scores = results.map((r) => r.score).sort((a, b) => a - b);
console.log(`score: median ${scores[Math.floor(scores.length / 2)]}, max ${scores.at(-1)}`);
const seconds = results.reduce((a, r) => a + r.seconds, 0);
console.log(`state reads: ${Math.round(reads / seconds)}/s`);
if (jev) {
  console.log(jev.formatSummary());
  console.log(`decisions     ${(jev.requests / seconds).toFixed(1)}/s`);
  if (args.player === "jev") {
    const entries = logs.flat() as { applied?: string }[];
    const count = (k: string) => entries.filter((e) => e.applied === k).length;
    console.log(
      `answers       acted in time ${count("in time")}, early ${count("early")}, late ${count("late")}; ` +
        `ignored (in air / already ducking) ${count("in air") + count("already ducking")}; wait ${count("wait")}; dropped: stale ${count("stale")}, superseded ${count("superseded")}`,
    );
  } else {
    const entries = logs.flat() as { outcome?: string; plan?: string; expected?: string; marginMs?: number }[];
    const acted = entries.filter((e) => e.outcome === "acted");
    const margins = acted.map((e) => e.marginMs!).sort((a, b) => a - b);
    console.log(
      `obstacles     ${entries.length}: answered in time ${acted.length}, too late ${entries.length - acted.length}; ` +
        `plan differs from the if rule ${acted.filter((e) => e.plan !== e.expected).length}`,
    );
    if (margins.length) console.log(`answer margin min ${margins[0]} ms, median ${margins[Math.floor(margins.length / 2)]} ms before arrival`);
  }
}
console.log(`log: ${file}`);
await game.close();
