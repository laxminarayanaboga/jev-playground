# Jev notes

Checked against TypeSafe's docs on 9 Oct 2026. Jev launched on 15 Sept 2026 and details are still moving, so if this file disagrees with https://docs.typesafe.ai the docs win.

## What Jev is

A hosted model from TypeSafe AI that makes decisions and never writes text. You send a **state** (the facts) and one or more **questions** (each with a fixed set of possible answers). It returns a typed answer plus probabilities for each question. Your code decides what to do with the answer.

It is one model version, `jev-1.13.0`, behind the alias `jev-latest`.

## Access and cost

- **Not downloadable.** Jev is proprietary and only served from TypeSafe's API. There are no weights to pull and run locally.
- **No subscription.** You pay per use: $0.042 per million input tokens, output free.
- **Sign up** at https://console.typesafe.ai. The Playground there lets you try requests in the browser with no code.
- **Waitlist and free credit: reports conflict.** A hands-on write-up dated 21 Sept says the waitlist is gone and new accounts get $5 of credit. Other guides from the same week still describe a waitlist and no free credit. You will find out when you sign up.
- **If you can't get a key:** third-party guides say OpenRouter (`typesafe/jev-latest`, beta), Vercel AI Gateway (`typesafe-ai/jev`) and Cloudflare AI Gateway serve Jev without the waitlist. These use their own endpoints and their own credits. I have not checked those details against the gateways' docs.

Rough cost of these experiments (my estimates, assuming the token counts shown):

| Run | Assumption | Cost |
|---|---|---|
| One 2048 game | 1,000 moves x 600 tokens | about $0.03 |
| One minute of dino | 5 decisions/sec x 300 tokens | under $0.01 |
| $5 of credit | at $0.042 per million | about 119 million tokens |

## The API on one page

```
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer $TYPESAFE_API_KEY
Content-Type: application/json
```

Request body: `state`, `model`, `questions`. State can be a string, a JSON object or an array. Each question has an ID you choose, a `type`, `instructions`, and (for choice and score) `criteria`.

```json
{
  "model": "jev-latest",
  "state": {
    "obstacle": "large cactus on the ground",
    "proximity": "inside the jump window",
    "dino": "running on the ground"
  },
  "questions": {
    "action": {
      "type": "choice",
      "instructions": "What should the dino do right now to avoid `obstacle`?",
      "criteria": {
        "jump": "The obstacle is on the ground and close enough that jumping now clears it.",
        "duck": "The obstacle is a bird at head height and is close.",
        "wait": "The obstacle is still far away, or there is no obstacle."
      }
    },
    "is_dangerous": {
      "type": "noul",
      "instructions": "`obstacle` will hit the dino if it does nothing."
    }
  }
}
```

Response: `model` (the exact version that answered), `answers` keyed by your question IDs, and `usage` with `input_tokens` and `output_tokens`.

| Type | Use for | Answer fields |
|---|---|---|
| `choice` | pick one of your options | `choice`, `probabilities`, `confidence` |
| `score` | place on an ordered scale you describe (levels start at 0) | `score`, `legend`, `probabilities`, `confidence` |
| `noul` | yes or no | `noul`, the probability of yes, 0 to 1 |

A `noul` near 0.5 means "can't tell", not "medium". A `score` can land between two levels.

Questions in one request all see the same state, run in parallel, and cannot see each other's answers. Extra questions add almost no latency. If question B needs the answer to A, that is a second request made by your code.

### TypeScript SDK

```sh
npm install @typesafe-ai/sdk
```

The client reads `TYPESAFE_API_KEY` from the environment and defaults to `jev-latest`.

```ts
import { choice, noul, score, TypeSafeClient } from "@typesafe-ai/sdk";

const client = new TypeSafeClient();

const response = await client.systemOne({
  state,
  questions: {
    action: choice("What should the dino do right now to avoid `obstacle`?", {
      jump: "The obstacle is on the ground and close enough that jumping now clears it.",
      duck: "The obstacle is a bird at head height and is close.",
      wait: "The obstacle is still far away, or there is no obstacle.",
    }),
    isDangerous: noul("`obstacle` will hit the dino if it does nothing."),
    boardQuality: score("How promising is the board in `after_move`?", [
      "Cramped, big tiles scattered, likely to lose soon.",
      "Playable but disorganised.",
      "Open, with the biggest tiles together in a corner.",
    ]),
  },
});

response.answers.action.choice;        // "jump" | "duck" | "wait"
response.answers.action.probabilities; // per option
response.answers.isDangerous.noul;     // 0..1
response.answers.boardQuality.score;   // 0..2, may be fractional
response.usage.input_tokens;
```

The SDK retries rate-limited requests with backoff by default. There is also a Python SDK (`pip install typesafe-sdk`).

### Checked against the installed SDK (`@typesafe-ai/sdk` 0.6.0, 11 Oct 2026)

Everything above matches. These are extra details or corrections from the SDK types and the API reference page:

- **Noul can take criteria too.** `noul(instructions, { true: "...", false: "..." })` describes what yes and no mean. Both are optional.
- **Limits on options.** Choice allows up to 255 options, and a description can be `null`. Score needs 2 to 10 levels.
- **Instructions and criteria don't have to be strings.** They can also be a JSON object or array, which helps keep a definition apart from its examples.
- **Retries are broader than rate limits.** The default is 2 retries with backoff (starting at 500 ms, up to 5 s) on 408, 429 and every 5xx, including TypeSafe's 529 "overloaded". It also retries on timeouts and connection errors. Measured latency includes any retries.
- **The timeout is 10 s per attempt** by default. You can set it with `timeout` on the client or on a single call.
- **Request ID.** `client.systemOne(...).withResponse()` returns `{ data, response, requestId }`. `requestId` comes from the `x-typesafe-request-id` header and is worth logging.
- **Env vars.** `TYPESAFE_API_KEY` (required), plus optional `TYPESAFE_BASE_URL`, `TYPESAFE_DEFAULT_MODEL` and `TYPESAFE_LOG_LEVEL` (`debug` logs request bodies).
- **`client.models.list()`** returns the models your account can use.
- **Error classes**, all subclasses of `TypeSafeError`: `AuthenticationError` (401), `UnprocessableEntityError` (422), `RateLimitError` (429), `InternalServerError` (5xx), `APIConnectionError` and `APITimeoutError`.
- **Node.** The SDK needs Node 20 or newer.

### Claude Code skill

TypeSafe publishes a skill that teaches coding agents the API and its patterns. Install it once, before asking Claude Code to write Jev code:

```sh
claude plugin marketplace add typesafe-ai/skills
claude plugin install typesafe@typesafe-ai
```

Then say "use the TypeSafe skill" in a prompt, or invoke `/typesafe:typesafe-ai`.

## Limits (Jev 1.13, subject to change)

| | |
|---|---|
| Price | $0.042 per million input tokens, output free |
| Rate limits | 100K tokens/sec and 80 requests/sec; TypeSafe says these can change without notice |
| Context | 64K tokens per request; 32K for the state plus the longest question |
| Input | text only: no images, audio or video |
| Latency | TypeSafe reports 70 to 500 ms end to end. Measure your own from London. |
| Language | English is strongest |

## Known weak spots

From TypeSafe's own limitations page for Jev 1.13:

- **Reads literally.** It answers the words you wrote, not what you meant. Spell out the exact condition and the boundary cases.
- **Bad at numbers.** Arithmetic, counting and "is this number close to that one" are unreliable. Compute in code and pass the result or a named bucket.
- **Dates and times** are read as text, not compared as quantities.
- **Indirection.** Double negatives and multi-hop questions lose accuracy.
- **Noisy state.** Irrelevant detail in the state lowers accuracy.
- **Option order.** It can lean towards the first Choice option.
- **No generation.** It cannot write text.

What that means for games: Jev cannot see the screen, cannot work out a 2048 merge, and cannot judge pixel distances. The code has to read the game, do the maths, and describe the situation in words. Jev's job is the judgment at the end.

## Hype check

Speed and cost multiples ("193x faster, 444x cheaper") are TypeSafe's own figures from workloads that suit Jev. The viral game clips come from individual posts and I could not check how they were built. Treat your own measurements as the truth.

## Links

- Docs index for agents: https://docs.typesafe.ai/llms.txt
- Quick start: https://docs.typesafe.ai/introduction/quickstart
- Question types: https://docs.typesafe.ai/primitives
- Jev with coding agents: https://docs.typesafe.ai/introduction/coding-agents
- Agent skill: https://docs.typesafe.ai/agent-skill
- Models, pricing, limits: https://docs.typesafe.ai/models
- Limitations: https://docs.typesafe.ai/model-jaggedness/jev-1.13
- JavaScript SDK: https://docs.typesafe.ai/sdk/javascript
- Small TypeScript demo repo: https://github.com/gopinav/jev-demo
- Walkthrough with signup steps: https://www.builder.io/blog/what-is-jev
