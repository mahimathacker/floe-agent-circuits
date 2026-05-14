// Worker agent — one specialized researcher in a multi-agent team.
//
// Each worker has a specialization (product / news / price) and produces
// a small chunk of the final research report. In production, the worker
// would call a paid x402 endpoint to do its real job; here the research
// step is simulated locally because real x402 calls are blocked by
// Finding #14. The Floe primitives we exercise (set_spend_limit,
// get_credit_remaining at session boundary) still run for real.

import { Logger } from "../shared/utils.js";

export type Specialization = "product" | "news" | "price";

export interface WorkerConfig {
  name: string;
  specialization: Specialization;
  simulatedCostRaw: string; // raw USDC, 6 decimals
}

export interface WorkerResult {
  worker: string;
  specialization: Specialization;
  ok: boolean;
  output: unknown;
  simulatedCostRaw: string;
  durationMs: number;
}

// Mock x402 endpoints per specialization — these are the Floe-directory
// URLs the agent *would* hit if Finding #14 weren't blocking.
const ENDPOINTS: Record<Specialization, { url: string; price: string }> = {
  product: { url: "https://api.firecrawl.dev/v1/x402/scrape", price: "30000" }, // $0.03
  news: { url: "https://api.exa.ai/x402/search", price: "50000" },              // $0.05
  price: { url: "https://api.myceliasignal.com/v1/price", price: "1000" },     // $0.001
};

function simulateResearch(spec: Specialization, company: string): unknown {
  switch (spec) {
    case "product":
      return {
        company,
        products: [
          `${company} Exchange — primary spot/derivatives venue`,
          `${company} Wallet — self-custody mobile/extension wallet`,
          `${company} Earn — staking + yield products`,
        ],
        source: "simulated scrape of company website",
      };
    case "news":
      return {
        company,
        headlines: [
          `${company} reports Q1 earnings beat`,
          `${company} announces new institutional product line`,
          `${company} expands to two additional jurisdictions`,
        ],
        source: "simulated news search",
      };
    case "price":
      return {
        company,
        feeds: { BTC: "$67,400", ETH: "$2,500", relevantTokens: ["BTC", "ETH"] },
        source: "simulated price oracle",
      };
  }
}

export async function runWorker(
  cfg: WorkerConfig,
  company: string,
): Promise<WorkerResult> {
  const logger = new Logger(`Circuit-3/${cfg.name}`);
  const started = Date.now();
  logger.info(
    `Starting ${cfg.specialization} research on "${company}" (simulated, would-cost ${cfg.simulatedCostRaw} raw USDC)`,
  );

  // Simulated network latency so the parallel coordination feels real.
  await new Promise((r) => setTimeout(r, 200 + Math.random() * 400));

  const output = simulateResearch(cfg.specialization, company);
  const durationMs = Date.now() - started;
  logger.success(`Done in ${durationMs}ms`);

  return {
    worker: cfg.name,
    specialization: cfg.specialization,
    ok: true,
    output,
    simulatedCostRaw: cfg.simulatedCostRaw,
    durationMs,
  };
}

export const WORKERS: WorkerConfig[] = [
  {
    name: "worker-A-product",
    specialization: "product",
    simulatedCostRaw: ENDPOINTS.product.price,
  },
  {
    name: "worker-B-news",
    specialization: "news",
    simulatedCostRaw: ENDPOINTS.news.price,
  },
  {
    name: "worker-C-price",
    specialization: "price",
    simulatedCostRaw: ENDPOINTS.price.price,
  },
];
