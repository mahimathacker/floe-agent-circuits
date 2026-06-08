// Worker agent - one specialized researcher in a multi-agent team.
//
// Workers A (product) and B (news) make REAL x402 calls through Floe's
// facilitator to verified-working endpoints from the directory:
//   - A: POST https://api.exa.ai/contents - extract company website ($0.001)
//   - B: POST https://api.exa.ai/search   - semantic search ($0.005)
//
// Worker C (price) stays simulated - Floe's x402 directory has no
// financial-data category yet, so there's no production endpoint to
// hit. This is itself a writeup-worthy gap (filed in docs/FINDINGS.md).

import type { AgentKit } from "@coinbase/agentkit";
import { Logger, invokeAction } from "../shared/utils.js";

export type Specialization = "product" | "news" | "price";

export interface WorkerConfig {
  name: string;
  specialization: Specialization;
  // Reported cost in raw USDC (6 decimals) - for budget accounting.
  // For real workers this is the directory-listed price; for the
  // simulated worker this is what the call *would* cost.
  costRaw: string;
}

export interface WorkerResult {
  worker: string;
  specialization: Specialization;
  ok: boolean;
  output: unknown;
  costRaw: string;
  realCall: boolean; // true if a real x402 call was made; false for simulated
  durationMs: number;
}

// Best-effort company → canonical URL mapping for worker A's Exa Contents
// call. Falls back to <name>.com (lowercased, no spaces).
const COMPANY_URLS: Record<string, string> = {
  Coinbase: "https://www.coinbase.com",
  "Floe Labs": "https://floelabs.xyz",
};

function companyHomepage(company: string): string {
  return (
    COMPANY_URLS[company] ??
    `https://${company.toLowerCase().replace(/\s+/g, "")}.com`
  );
}

async function callExaContents(
  agentkit: AgentKit,
  company: string,
): Promise<unknown> {
  return invokeAction(agentkit, "x402_fetch", {
    url: "https://api.exa.ai/contents",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      urls: [companyHomepage(company)],
      text: true,
    }),
  });
}

async function callExaSearch(
  agentkit: AgentKit,
  company: string,
): Promise<unknown> {
  return invokeAction(agentkit, "x402_fetch", {
    url: "https://api.exa.ai/search",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `${company} recent news and announcements`,
      type: "auto",
      numResults: 5,
    }),
  });
}

function simulatePriceWorker(company: string): unknown {
  return {
    company,
    feeds: { BTC: "$67,400", ETH: "$2,500", relevantTokens: ["BTC", "ETH"] },
    source:
      "simulated - Floe x402 directory has no financial-data category yet (see findings)",
  };
}

export async function runWorker(
  agentkit: AgentKit,
  cfg: WorkerConfig,
  company: string,
): Promise<WorkerResult> {
  const logger = new Logger(`Circuit-3/${cfg.name}`);
  const started = Date.now();
  logger.info(
    `Starting ${cfg.specialization} research on "${company}" (cost ${cfg.costRaw} raw USDC)`,
  );

  try {
    let output: unknown;
    let realCall = false;

    if (cfg.specialization === "product") {
      output = await callExaContents(agentkit, company);
      realCall = true;
    } else if (cfg.specialization === "news") {
      output = await callExaSearch(agentkit, company);
      realCall = true;
    } else {
      // price: simulated, with a small delay so the timing looks real
      await new Promise((r) => setTimeout(r, 200 + Math.random() * 400));
      output = simulatePriceWorker(company);
    }

    // The SDK returns errors as plain strings rather than throwing. Detect
    // common Floe / x402 error prefixes so the planner's `ok` count and
    // budget aggregation match reality.
    const isError =
      typeof output === "string" &&
      /^(Facilitator error|Insufficient credit|Error|Unauthorized)/i.test(
        output.trim(),
      );
    const ok = !isError;
    const realSucceeded = realCall && ok;
    const durationMs = Date.now() - started;

    if (ok) {
      logger.success(`Done in ${durationMs}ms (${realCall ? "real x402" : "simulated"})`);
    } else {
      logger.warn(
        `Got back error string after ${durationMs}ms: ${String(output).slice(0, 100)}`,
      );
    }

    return {
      worker: cfg.name,
      specialization: cfg.specialization,
      ok,
      output,
      costRaw: realSucceeded ? cfg.costRaw : "0",
      realCall: realSucceeded,
      durationMs,
    };
  } catch (e) {
    const durationMs = Date.now() - started;
    logger.error(`Failed: ${String(e)}`);
    return {
      worker: cfg.name,
      specialization: cfg.specialization,
      ok: false,
      output: { error: String(e) },
      costRaw: "0",
      realCall: false,
      durationMs,
    };
  }
}

export const WORKERS: WorkerConfig[] = [
  {
    name: "worker-A-product",
    specialization: "product",
    costRaw: "1000", // $0.001 - Exa Contents per directory
  },
  {
    name: "worker-B-news",
    specialization: "news",
    costRaw: "5000", // $0.005 - Exa Search per directory
  },
  {
    name: "worker-C-price",
    specialization: "price",
    costRaw: "0", // simulated, no real spend
  },
];
