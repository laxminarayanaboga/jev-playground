# Plan

Order: hello, then 2048, then dino. 2048 comes first because it is turn-based, so Jev's latency doesn't matter and you can concentrate on how to word state and questions. Dino is a reflex game, so it is mostly a latency experiment.

Each step has a prompt to paste into Claude Code.

## 0. Before you sit down (works on the phone)

1. Sign up at https://console.typesafe.ai.
2. Open the Playground, paste any sentence as the state, add a yes/no question, run it. Add a choice question and a score question and run again.
3. Create an API key under API Keys and keep it somewhere safe.

If signup puts you on a waitlist, see "Access and cost" in `JEV_NOTES.md` for the gateway routes.

## 1. Set up on the Mac

```sh
mkdir jev-playground && cd jev-playground
# copy CLAUDE.md, JEV_NOTES.md and PLAN.md into this folder
claude plugin marketplace add typesafe-ai/skills
claude plugin install typesafe@typesafe-ai
claude
```

Prompt:

```
Read CLAUDE.md, JEV_NOTES.md and PLAN.md. Use the TypeSafe skill.
Scaffold the project as described in CLAUDE.md: package.json, tsconfig, .gitignore,
.env.example, the Jev client wrapper, and src/hello.ts. hello.ts should send one
request with a choice, a noul and a score question, print the full response, the
latency and the token usage. Check the notes against the installed SDK types and
tell me anything that differs. Show me the plan before writing files.
```

Then put the key in `.env` and run `npm run hello` ten times. Note the median latency. That number shapes the dino design.

## 2. 2048

**Game source.** Use the original open-source 2048 (github.com/gabrielecirulli/2048, MIT) cloned and served locally. A local copy has a stable page and no ads or network dependency. Claude Code should inspect the page to find how tiles and score are exposed before writing any selectors.

**Design.**

1. Playwright reads the 4x4 board.
2. `board.ts` simulates all four moves as pure functions and drops the illegal ones.
3. `describe.ts` turns each resulting board into a few plain facts: empty cells, merges made, where the biggest tile ends up, whether the big tiles are lined up.
4. One Jev request per turn, with one question per legal move.
5. Code picks the winner and presses the arrow key.

**Two variants to compare.** Jev's limitations page says Score values are fine for thresholds but weak as exact numbers, so it is not obvious that comparing four scores will rank moves well. Test both:

- A: one Score question per legal move ("how promising is `moves.up`?"), take the highest.
- B: one Choice question across the legal moves.

**Baselines.** Random legal move, and a plain heuristic (keep the biggest tile in a corner, prefer more empty cells).

**Measure** over 10 games each: highest tile, score, moves, cost, latency.

Prompt:

```
Use the TypeSafe skill. Build the 2048 player from PLAN.md section 2.
Start with board.ts as pure functions with a few assertions I can run, then the
page reader, then the two baselines, then Jev variant A. Stop after each piece
and show it running. Keep every question and threshold in questions.ts.
```

Follow-up:

```
Add Jev variant B. Run 10 games each for random, heuristic, A and B, and give me
a table of the results. Then show me 5 turns where A and B disagreed, with the
state that was sent, so we can improve the wording.
```

## 3. Chrome dino

**Game source.** Chrome's built-in dino at `chrome://dino`. Claude Code should first check whether Playwright's Chromium opens that address directly. If not, the alternatives are putting the browser context offline and loading any page, or a local open-source clone of the game.

**Reading state.** The game keeps its state in a JavaScript object on the page (historically called `Runner`), including the obstacles, the current speed and whether the dino has crashed. The exact property names have changed between Chrome versions, so inspect the live page rather than trusting a blog post.

**The latency problem.** A jump has to be issued within a short window. If a Jev round trip takes 300 ms, a decision made "now" lands 300 ms late. So:

1. Code computes the time until the next obstacle arrives.
2. Code subtracts the measured Jev latency.
3. Code turns that into a bucket: "far", "approaching", "inside the jump window", "too late".
4. Jev chooses jump, duck or wait from the obstacle type and the bucket.

**Honest expectation.** With buckets computed in code, this decision is nearly a lookup, and a three-line `if` will beat Jev on speed. That is fine. The useful experiments are:

- How far does Jev survive as the game speeds up, compared with the `if` baseline?
- Remove the bucket and give Jev rawer descriptions. Where does it start failing?
- Fire several requests ahead of time for the next few obstacles, in parallel.

**Measure:** score per run, decisions per second, median and p95 latency, decisions that arrived too late.

Prompt:

```
Use the TypeSafe skill. Build the dino player from PLAN.md section 3.
First open the game in headed Chromium and report what state you can read from
the page and how. Then build the plain-code baseline bot. Then the Jev bot using
the bucket design. Log every decision with its latency and whether it arrived in
time. Stop after each piece and show it running.
```

## 4. Stretch ideas

- **Many games at once.** The viral clip showed 50 games in parallel. Try 10 dino tabs driven from one loop and watch the rate limits.
- **Confidence gating.** When Jev's confidence on a 2048 move is low, fall back to the heuristic. Does the combined player beat both?
- **A work-shaped use.** Feed Jev a failed test's error and log excerpt and ask a Choice question: product bug, flaky test, environment problem, or test needs updating. Send low-confidence cases to a person.

## Things to learn about Claude Code along the way

- `CLAUDE.md` is read at the start of every session in this folder. When Claude Code gets something wrong twice, add a line to it.
- The TypeSafe plugin is a first example of a skill. Once comfortable, ask Claude Code how to write a small skill of your own for this project.
- Ask for a plan before code on each step, and correct the plan rather than the code.
