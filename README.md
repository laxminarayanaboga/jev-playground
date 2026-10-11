# jev-playground

A learning project: make [TypeSafe AI](https://typesafe.ai)'s **Jev** model play browser games by driving the browser with Playwright, and measure honestly how it does against plain-code bots.

Jev is a decision model, not a chat model: you send it a small **state** and typed **questions** (choice, yes/no, score), and it returns typed answers with probabilities in about 230 ms. The rule this repo follows throughout: **code reads the game, does every bit of arithmetic and geometry, and describes the situation in words; Jev only makes the judgment.**

## What's here

| Game | Players | Headline |
|---|---|---|
| **2048** (the original open-source game, run locally) | random, heuristic, expectimax, Jev A (Score per move), Jev B (one Choice) | Given the same facts, Jev matches a hand-written heuristic. Given lookahead facts, Jev A beats it (7/10 games reached 512 vs 3/10). Expectimax search wins by far (median 2048). |
| **Chrome dino** (`chrome://dino`) | `if` bot, Jev with timing buckets, Jev planning each obstacle ahead | Asking Jev "jump *now*?" fails: latency varies ~120 ms, the jump window is ~90 ms. Asking "what to do when this obstacle arrives?" as soon as it appears works: 1,998/1,998 correct decisions, a run of 29,787 in 26 minutes, for $0.035. |

Full numbers, every bug found along the way, and open questions are in [`STATUS.md`](STATUS.md). The Jev API notes and limits are in [`JEV_NOTES.md`](JEV_NOTES.md), and the order of work in [`PLAN.md`](PLAN.md).

## Setup

Needs Node.js 22+ and a TypeSafe API key ([console.typesafe.ai](https://console.typesafe.ai)).

```sh
npm install
npm run setup            # installs Chromium for Playwright and clones 2048 (pinned commit) into vendor/
cp .env.example .env     # then put your TYPESAFE_API_KEY in .env
```

## Commands

```sh
npm run hello -- 10                                    # 10 identical Jev requests: response, latency, tokens
npm test                                               # 2048 board simulation assertions
npm run 2048 -- --player jev-a --games 10 --seed 1 --parallel 5
                                                       # players: random, heuristic, expectimax, jev-a, jev-b
npm run report:2048                                    # table across players + examples where Jev disagrees
npm run dino -- --player jev-plan --runs 3             # players: if, jev, jev-plan
npm run check                                          # tsc --noEmit
```

Games always run headed: the point is to watch them play. Every Jev run stops at `MAX_REQUESTS` (default 2000, set in `.env`) and ends by printing requests, tokens, estimated cost, median and p95 latency and the result. Each run writes a JSON log of every decision to `runs/`.

## Layout

```
src/
  jev/client.ts        the one wrapper around the SDK: latency, tokens, cost, request cap
  games/2048/          board.ts (pure move simulation), page.ts, describe.ts, questions.ts, play.ts, report.ts
  games/dino/          page.ts, state.ts, describe.ts, questions.ts, play.ts
  baselines/           plain-code bots to compare Jev against
  hello.ts             first request
```

All the wording Jev sees, and every threshold behind it, lives in each game's `questions.ts`.

## Notes

- `chrome://dino` has no global `Runner` in recent Chromium (the game is an ES module); `src/games/dino/page.ts` explains how the instance is found.
- 2048 is © Gabriele Cirulli, MIT licensed, and is cloned by `npm run setup` rather than copied into this repo.
- Costs are tiny: all the 2048 and dino experiments in this repo together came to under $1 at $0.042 per million input tokens.
