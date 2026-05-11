// Research agent loop.
//
// Given an AgentKit instance with both `floeActionProvider` and
// `x402ActionProvider` registered, this loop:
//   1. Caps how much the agent can spend in this session.
//   2. For each URL: estimates cost, checks remaining budget, then fetches
//      via x402 (which auto-pays from the agent's credit line).
// The SDK enforces the spend limit, so the loop doesn't have to parse
// markdown budget responses — `x402_fetch` will refuse once exhausted.

import type { AgentKit } from "@coinbase/agentkit";
import { Logger, type Metrics, invokeAction } from "../shared/utils.js";

const logger = new Logger("Circuit-1/Agent");

export interface ResearchLoopOptions {
  spendLimitRaw: string;
  queries: string[];
  metrics?: Metrics;
}

export async function runResearchLoop(
  agentkit: AgentKit,
  { spendLimitRaw, queries, metrics }: ResearchLoopOptions,
): Promise<void> {
  logger.info(`Setting session spend limit to ${spendLimitRaw} raw USDC`);
  const limitResp = await invokeAction(agentkit, "set_spend_limit", {
    limitRaw: spendLimitRaw,
  });
  metrics?.recordEvent("spend_limit_set", limitResp);

  for (const url of queries) {
    logger.info(`Researching: ${url}`);

    const estimate = await invokeAction<string>(agentkit, "estimate_x402_cost", {
      url,
    });
    logger.info("Estimated cost:", estimate);
    metrics?.recordEvent("x402_cost_estimate", { url, estimate });

    const remaining = await invokeAction<string>(
      agentkit,
      "get_credit_remaining",
      {},
    );
    logger.info("Credit remaining:", remaining);
    metrics?.recordEvent("credit_remaining", { url, remaining });

    const fetched = await invokeAction(agentkit, "x402_fetch", { url });
    const preview =
      typeof fetched === "string"
        ? fetched.slice(0, 200)
        : JSON.stringify(fetched).slice(0, 200);
    logger.info(`Fetched (preview): ${preview}`);
    metrics?.recordEvent("x402_fetch", { url, preview });
  }
}
