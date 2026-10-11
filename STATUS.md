# Status

Where the project is right now. Update this at the end of every working session.

Last updated: 11 Oct 2026

## Done

- `CLAUDE.md`, `JEV_NOTES.md`, `PLAN.md` written (in an earlier chat) and copied in.
- Signed up at console.typesafe.ai and have an API key (not yet in `.env`).
- Checked environment: Node v25.6.0, npm 11.8.0.
- Folder renamed to `jev-playground`; TypeSafe skill installed (plugin 0.5.7).
- **Scaffold (PLAN.md step 1):**
  - `package.json` (ESM, private). Deps: `@typesafe-ai/sdk` 0.6.0, `playwright` 1.64. Dev deps: `tsx`, `typescript` 7.0.2, `@types/node`.
  - Scripts: `hello`, `2048`, `dino`, `check`. `.env` is loaded with Node's `--env-file-if-exists=.env`, so there's no `dotenv`.
  - `tsconfig.json`: strict, `noUncheckedIndexedAccess`, nodenext, `noEmit`, imports use `.ts` extensions.
  - `.gitignore` (`node_modules/`, `.env`, `runs/`) and `.env.example`.
  - `src/jev/client.ts`: the `Jev` class. `ask()` times each request (including SDK retries), adds up input/output tokens and cost ($0.042/M input), stops at `MAX_REQUESTS` (default 2000, set in env) and returns the `requestId`. `summary()` / `formatSummary()` give requests, tokens, cost, median and p95 latency.
  - `src/hello.ts`: one choice, one noul and one score question on a small dino-like state. Prints the full response and the request ID, one line per run, then the summary. `npm run hello -- 10` runs it 10 times.
  - `npm run check` passes. `npm run hello` gets as far as the client and stops with "No API key was provided", as expected.
- Compared the SDK types with `JEV_NOTES.md`: nothing contradicts the notes. Extra details are now in the notes under "Checked against the installed SDK".
- Key in `.env`. `hello` works: the model alias `jev-latest` resolved to `jev-1.13.0`, 548 input tokens per request.
- Option-order check on the hello choice: answers held in 3 orders (close → jump, p=1.0; far → wait, p≥0.95).
- **2048, first half of PLAN.md section 2:**
  - Game source: gabrielecirulli/2048 in `vendor/2048` (gitignored), opened as `file://`. Chromium is installed for Playwright.
  - Page facts, checked on the real page: `localStorage.gameState` holds the exact grid (`cells[col][row]`) and is written in the keydown handler. On game over it is cleared and `.game-message.game-over` appears one animation frame later. Reaching 2048 pauses the game until "Keep going" is clicked.
  - `board.ts`: pure move simulation. `npm test` runs the assertions in `board.test.ts`. The reader matched the simulator on 60 live moves, score included.
  - `page.ts` (an extra file, not in the CLAUDE.md layout): the `Game2048` class. It seeds `Math.random` so every player gets the same tiles for a given seed.
  - `describe.ts` works out the facts. `questions.ts` holds all wording and thresholds: space buckets, corner words, edge-order words, and variant A's score levels.
  - `src/baselines/2048.ts` has the random and heuristic players. `src/rng.ts` is the seeded RNG.
  - `play.ts`: `npm run 2048 -- --player random|heuristic|jev-a --games N --seed S`. It writes `runs/2048-*.json` with every turn, and for Jev the state, scores and request ID.

- **2048, second half of PLAN.md section 2:**
  - Added facts for Jev: `merges` and `nextTurn` (directions that can move next turn). Ties in A dropped from 24% to 19% of asked turns.
  - Variant B (one Choice across moves, options shuffled each turn) and an `expectimax` baseline (depth 2, snake weights, raw board).
  - The heuristic now ranks every fact Jev gets. Its first 10-game run lacked `merges`/`nextTurn`, which wasn't fair.
  - Fixed a race: the game starts inside `requestAnimationFrame`, so `open()` now waits for the first `gameState`.
  - `npm run report:2048` prints the table, agreement rates and 5 turns where Jev and the heuristic disagree.

- **2048, lookahead facts:** code now tries every new tile (a 2 or 4 in each empty cell) after each move. `nextTurn` is the worst-case number of open directions, and `cornerSafe` says whether some next move always keeps the biggest tile in its corner. The heuristic ranks the same facts. Added `--parallel N` to `play.ts`: 10 games at 5 in parallel takes about 11 s for the heuristic and about 10 min for Jev.

- **Dino, PLAN.md section 3 (in progress):**
  - Page facts, checked live on Chromium 156: `goto("chrome://dino")` rejects with `ERR_INTERNET_DISCONNECTED`, but the game loads on `chrome-error://chromewebdata/`. There is no `window.Runner` (the game is an ES module, and only `RunnerClasses`/`RunnerSounds`/`RunnerEvents` constants are global). An init script that wraps `addEventListener` catches the instance, because the game registers itself as a listener. Readable fields: `currentSpeed` (px/frame, 6 → 13), `crashed`, `playing`, `distanceRan`, `distanceMeter.getActualDistance()` (equals the on-screen digits), `tRex.{xPos,yPos,jumping,ducking}`, and `horizon.obstacles[].{typeConfig.type,xPos,yPos,width,speedOffset}`.
  - Gotcha: tsx injects a `__name` helper that breaks functions passed to `page.evaluate`, so dino in-page code is passed as strings.
  - Files: `page.ts`, `state.ts` (next obstacle, arrival ms), `questions.ts`, `describe.ts`, `play.ts` (`--player if|jev --runs N [--max-seconds N] [--debug]`, no time cap by default), and `src/baselines/dino.ts`.
  - The `if` bot (jump at ≤150 ms; duck for mid birds) scored 700, then passed **15,000 in 13+ minutes** at top speed. My first reporting confused this: the script restarted the game itself after run 1 crashed, and I killed run 2 without printing it. The output now says when each run starts.
  - The Jev bucket bot (`--player jev`) crashed at 102 and 51. Jev answered every request correctly; the timing failed. See notes.
  - **`jev-plan`**: one Jev request per obstacle as soon as it appears on screen ("jump, duck or keep running when it reaches you?"). Code carries out the plan at the same 150 ms lead as the `if` bot. Obstacles are tracked by an ID stamped on the game's obstacle objects (`__id`). Matching by due time lost track of an obstacle once and caused a crash.
  - Two execution bugs fixed along the way. A blocked jump (dino still in the air) was never retried; the plan is now carried out on every read until the obstacle passes. Ducking is now held until the obstacle it was for has passed, instead of depending on code's bird classification.

## In progress

- Nothing running except the `if` bot baseline from the first diagnostic run, left going at the user's request (56,778 after 49 minutes, still at top speed).

## Next

1. Hedge `jev-plan` against tail latency: send 2 requests per obstacle and use the first answer. Cost doubles, which is still about $0.07 per 25 minutes. Or fall back to the `if` rule when no answer has arrived, but that hands the decision to code.
2. Plan experiment: rawer descriptions (for example the bird's height in px instead of "mid-height bird") to see where Jev starts failing. This deliberately breaks CLAUDE.md rule 2 as a test.
3. No git until the user says so.

## Measurements

| What | Value |
|---|---|
| Jev median latency (hello x10) | 221 ms (p95 350 ms; the first request of a run is about 350 ms) |
| 2048 Jev A request size | about 1,360 input tokens (2 to 4 Score questions) |

### 2048, 10 games each, seeds 1–10 (same tiles for every player)

| Player | Best tile (median / max) | Reached 512 | Reached 1024 | Mean score | Mean moves | Requests | Tokens/req | Cost | Latency p50 / p95 |
|---|---|---|---|---|---|---|---|---|---|
| random | 128 / 256 | 0 | 0 | 1258 | 129 | - | - | - | - |
| heuristic (same facts as Jev) | 256 / 512 | 4 | 0 | 4819 | 360 | - | - | - | - |
| expectimax | 2048 / 4096 | 10 | 9 | 33354 | 1693 | - | - | - | - |
| jev-a (Score per move) | 256 / 512 | 4 | 0 | 4707 | 350 | 3496 | 1605 | $0.236 | 230 / 317 ms |
| jev-b (one Choice) | 256 / 512 | 4 | 0 | 3971 | 300 | 2993 | 735 | $0.092 | 227 / 292 ms |

#### Same, with lookahead facts (`nextTurn` worst case, `cornerSafe`)

| Player | Best tile (median / max) | Reached 512 | Mean score | Mean moves | Requests | Tokens/req | Cost | Latency p50 / p95 |
|---|---|---|---|---|---|---|---|---|
| heuristic | 256 / 512 | 3 | 4932 | 361 | - | - | - | - |
| **jev-a** | **512 / 512** | **7** | **5887** | 419 | 4188 | 1791 | $0.315 | 229 / 280 ms |
| jev-b | 256 / 512 | 4 | 4741 | 353 | 3531 | 836 | $0.124 | 225 / 272 ms |

Agreement (lookahead run): jev-a matches the heuristic on 70% of turns and expectimax on 36%; jev-b matches them on 81% and 30%.

Agreement on the boards Jev faced (first run): jev-a matches the heuristic on 72% of turns and expectimax on 30%; jev-b matches them on 79% and 36%.

### Dino

| Player | Runs | Scores | Requests | Cost | Latency p50 / p95 | Notes |
|---|---|---|---|---|---|---|
| `if` bot | 2 (+1 killed) | 700; 56,778+ still alive after 49 min | - | - | - | The earlier run 2 was also past 10,000 when I killed it |
| `jev` (bucket timing) | 2 | 102, 51 | 118 + 21 | $0.003 | 224 / 301 ms | Jev was right on every answer; the timing failed |
| **`jev-plan`** | 4 | 462*, 712*, 4,336, **29,787 (alive at the 2000-request cap, 26 min)** | 2000 | $0.035 | 242 / 361 ms (p99 474, max 605) | 1,998/1,998 plans correct; *before the bug fixes |

## Open questions / notes

- **Dino: let Jev decide *what*, and code decide *when*.** Asking once per obstacle, about 600–800 ms ahead, makes latency irrelevant except in the tail. Jev classified all 1,998 obstacles correctly (cacti → jump, low bird → jump, mid bird → duck, high bird → keep running), at about 1 request per second and $0.035 for 26 minutes. That's close to PLAN.md's "nearly a lookup" expectation: it matches the `if` bot's decisions exactly and doesn't beat them.
- **The latency tail is what kills dino runs.** In run 1, one answer in 2000 didn't arrive within about 585 ms, and the dino crashed on that cactus. p99 latency is 474 ms and the slowest answer took 605 ms. A real-time use needs hedging (duplicate requests) or a fallback.

- **Dino: answer-on-arrival timing fails because of latency jitter, not Jev.** Jev's latency ranged from 192 to 316 ms (the first requests are slowest), while a safe jump window is about 90 ms wide. Code can't predict when an answer lands closely enough to tell Jev "in the window". In both crashes the dino jumped about 100 ms early onto the cactus. Jev itself mapped far/approaching → wait and window/late → jump on 100% of answers, with p ≥ 0.93.

- **2048 verdict:** given the same described facts, Jev plays at the level of a hand-written rule (same median, same count reaching 512) and well below expectimax. The limit is the information it gets, one move ahead in coarse words, not Jev. Expectimax wins by searching the exact board, which is code's job.
- **Where Jev and the heuristic disagree, Jev is usually defensible.** It keeps the corner and edge order over a merge (game 1, move 4), and keeps three directions open over one extra empty cell (game 2, move 300, where expectimax agreed). It weighs the facts together instead of in a fixed order.
- **When moves have identical descriptions, Jev's scores are noise** (for example 2.42–2.78 across four identical moves), and so is the pick. Only facts that tell moves apart can fix that.
- **B costs less than half of A for the same result** (735 vs 1605 tokens per request, because there is one question instead of up to four). Latency is the same, about 230 ms. Option-order bias wasn't measured directly: B's options are shuffled every turn.
- **Lookahead facts helped Jev A, not the heuristic or Jev B.** jev-a went from 4 to 7 of 10 games reaching 512, and its mean score from 4707 to 5887. The heuristic (4819 → 4932) and jev-b (3971 → 4741, still below the heuristic) moved less. This is a first sign that Jev weighing several facts together beats a fixed priority order once the facts are informative. It's still only 10 games, and none reached 1024; expectimax remains far ahead.
- **Why A and not B? Not checked yet.** One guess: Score asks Jev to judge each move on its own against the level descriptions, while Choice asks it to compare 2–4 near-identical descriptions in one go, which is harder for it.
- **Early-game artefact:** at move 0 every move says `cornerSafe: no`, because a new 4 would become the biggest tile. Harmless, but the wording is misleading while the biggest tile is a 2 or 4.

- Free credit vs waitlist: reports conflicted (see JEV_NOTES.md). Record what actually happened at signup here.
