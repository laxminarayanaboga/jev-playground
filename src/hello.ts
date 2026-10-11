// First contact with Jev: one request holding a choice, a noul and a score
// question about the same small state. Prints the full response, latency and usage.
//
//   npm run hello          one request
//   npm run hello -- 10    ten identical requests, then median/p95 latency

import { choice, noul, score } from "@typesafe-ai/sdk";
import { Jev } from "./jev/client.ts";

const runs = Number(process.argv[2] ?? 1);

// Already bucketed by "code": Jev gets words, not pixels.
const state = {
  dino: "running on the ground",
  obstacle: { kind: "small cactus", position: "on the ground", distance: "close" },
};

const questions = {
  action: choice("What should the dino do right now to get past `obstacle`?", {
    jump: "`obstacle` is on the ground and `obstacle.distance` is close, so jumping now clears it.",
    duck: "`obstacle` is a bird at head height and `obstacle.distance` is close.",
    wait: "`obstacle.distance` is far, or there is no obstacle.",
  }),
  willHit: noul("If the dino keeps running and does nothing, `obstacle` will hit it."),
  urgency: score("How soon does the dino need to act because of `obstacle`?", [
    "No action needed yet: `obstacle.distance` is far or there is no obstacle.",
    "Act soon: `obstacle.distance` is medium.",
    "Act now: `obstacle.distance` is close.",
  ]),
};

const jev = new Jev();
console.log(`model alias: ${jev.model}\n`);

for (let i = 1; i <= runs; i++) {
  const { result, latencyMs, requestId } = await jev.ask({ state, questions });

  if (i === 1) {
    console.log("full response:");
    console.log(JSON.stringify(result, null, 2));
    console.log(`request id: ${requestId ?? "(none)"}\n`);
  }

  const a = result.answers;
  console.log(
    `#${i}  ${latencyMs.toFixed(0).padStart(5)} ms  ` +
      `action=${a.action.choice} (${a.action.confidence.toFixed(2)})  ` +
      `willHit=${a.willHit.noul.toFixed(2)}  urgency=${a.urgency.score.toFixed(2)}  ` +
      `tokens=${result.usage.input_tokens}`,
  );
}

console.log(`\n${jev.formatSummary()}`);
