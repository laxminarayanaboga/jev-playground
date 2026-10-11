# jev-playground

A personal learning project: make TypeSafe AI's Jev model play browser games (2048, then Chrome dino) by driving the browser with Playwright. The goal is to learn how Jev behaves, not to ship anything.

Read `JEV_NOTES.md` before writing any Jev code, and `PLAN.md` for the order of work.
Read `STATUS.md` at the start of every session to see where things stand, and update it at the end of each step.

## About the person you're working with

Very experienced with Playwright, TypeScript and test automation. New to Jev. Skip Playwright basics; do explain Jev concepts and why a question is worded the way it is.

## Stack

- Node.js 22+, TypeScript, ES modules, run with `tsx`
- Playwright, Chromium, headed (the point is to watch it play)
- `@typesafe-ai/sdk` for Jev
- No framework, no bundler, no database

## Layout

```
src/
  jev/client.ts        one wrapper around the SDK: logs latency, tokens, running cost
  games/2048/          board.ts (pure move simulation), describe.ts, questions.ts, play.ts
  games/dino/          state.ts, describe.ts, questions.ts, play.ts
  baselines/           plain-code bots to compare Jev against
  hello.ts             first request, prints the full response
runs/                  one JSON log per game run (gitignored)
```

## Commands

- `npm run setup` install Chromium and clone 2048 into `vendor/`
- `npm run hello` first Jev request
- `npm run 2048` play 2048 with Jev
- `npm run dino` play the dino game with Jev
- `npm run check` `tsc --noEmit`
- `npm test` 2048 board assertions
- `npm run report:2048` compare the latest 2048 runs

Run `npm run check` after every change, and run the script you changed.

## Rules for Jev code

1. Do not guess SDK fields. Use the installed SDK's types and the TypeSafe skill. If they disagree with `JEV_NOTES.md`, they win; say so and update the notes.
2. Code does all arithmetic, counting and geometry. Jev only gets the result, in words or named buckets ("close", "7 of 16 cells empty"), never raw pixel or grid maths to work out.
3. One small judgment per question. Put every question about the same state into one request.
4. Keep the state small. Send only what the question needs.
5. Every Choice option and Score level gets a one-line description. Refer to state fields by path in backticks, e.g. `moves.up`.
6. All questions and thresholds for a game live in that game's `questions.ts` so they are easy to review and edit.
7. Jev leans towards the first Choice option. When testing a question, shuffle the option order and confirm the answer holds.
8. Every game has a plain-code baseline. Report Jev against it; do not assume Jev is better.

## Safety rails

- API key is `TYPESAFE_API_KEY` in `.env`. Never print it, log it or commit it. `.env` and `runs/` go in `.gitignore`.
- Every play script takes a `MAX_REQUESTS` cap (default 2000) and stops when it is hit.
- At the end of each run print: requests, input tokens, estimated cost, median and p95 latency, game result.

## How to work

- Plan before coding, and show the plan for anything larger than one file.
- Small steps. After each one, run it and show the output.
- Before writing selectors or reading game state, open the real page and inspect it. Do not rely on memory of how a game's page is built.
- If something in the notes or the plan turns out to be wrong, stop and say so.

## Don't

- Don't use Jev to generate text or to do maths.
- Don't run headless unless asked.
- Don't add dependencies beyond the stack above without asking.
