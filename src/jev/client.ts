// The one place that talks to Jev. Every request goes through `Jev.ask`, which
// times it, counts tokens and cost, and enforces the MAX_REQUESTS cap.

import {
  TypeSafeClient,
  type Questions,
  type SystemOneRequest,
  type SystemOneResult,
} from "@typesafe-ai/sdk";

// Jev 1.13 price from docs.typesafe.ai/models: input only, output is free.
const USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;

export class RequestCapReached extends Error {
  constructor(cap: number) {
    super(`MAX_REQUESTS cap of ${cap} reached`);
  }
}

export interface AskResult<Q extends Questions> {
  result: SystemOneResult<Q>;
  latencyMs: number;
  requestId: string | undefined;
}

export interface JevSummary {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  medianMs: number;
  p95Ms: number;
}

export class Jev {
  readonly maxRequests: number;
  #client: TypeSafeClient;
  #latencies: number[] = [];
  #inputTokens = 0;
  #outputTokens = 0;

  constructor(options: { maxRequests?: number } = {}) {
    // Reads TYPESAFE_API_KEY from the environment; throws if it is missing.
    this.#client = new TypeSafeClient();
    this.maxRequests = options.maxRequests ?? Number(process.env.MAX_REQUESTS ?? 2000);
  }

  get model(): string {
    return this.#client.defaultModel;
  }

  get requests(): number {
    return this.#latencies.length;
  }

  async ask<const Q extends Questions>(request: SystemOneRequest<Q>): Promise<AskResult<Q>> {
    if (this.requests >= this.maxRequests) throw new RequestCapReached(this.maxRequests);

    // Wall-clock time includes any SDK retries (429/5xx, up to 2 by default).
    const start = performance.now();
    const { data, requestId } = await this.#client.systemOne(request).withResponse();
    const latencyMs = performance.now() - start;

    this.#latencies.push(latencyMs);
    this.#inputTokens += data.usage.input_tokens;
    this.#outputTokens += data.usage.output_tokens;
    return { result: data, latencyMs, requestId };
  }

  summary(): JevSummary {
    const sorted = [...this.#latencies].sort((a, b) => a - b);
    return {
      requests: sorted.length,
      inputTokens: this.#inputTokens,
      outputTokens: this.#outputTokens,
      costUsd: this.#inputTokens * USD_PER_INPUT_TOKEN,
      medianMs: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
    };
  }

  formatSummary(): string {
    const s = this.summary();
    return [
      `requests      ${s.requests}`,
      `input tokens  ${s.inputTokens} (output ${s.outputTokens})`,
      `est. cost     $${s.costUsd.toFixed(6)}`,
      `latency       median ${s.medianMs.toFixed(0)} ms, p95 ${s.p95Ms.toFixed(0)} ms`,
    ].join("\n");
  }
}

// Nearest-rank percentile of an already sorted array.
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const rank = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)]!;
}
