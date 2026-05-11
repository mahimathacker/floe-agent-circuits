// Circuit 2 — Image Agent Rate-Ceiling Test (REST baseline).
//
// Story: an AI image agent borrows USDC to pay for image generation, but
// it's price-conscious — it won't take a loan above a stated ceiling.
// We test if Floe's REST `/v1/credit/instant-borrow` enforces that
// ceiling correctly.
//
// Test: adaptive sweep of `maxInterestRateBps` values. For each ceiling,
// log accept/reject + the error shape. The output answers: at what bps
// does Floe start rejecting? Are the rejection messages clear about why?

import { getFloeAuthHeaders } from "../shared/auth.js";
import { Logger, Metrics } from "../shared/utils.js";
import { rateCeilingSweep, type SweepReport } from "./agent.js";

const logger = new Logger("Circuit-2");
const metrics = new Metrics();

const MARKET_ID =
  "0xfe92656527bae8e6d37a9e0bb785383fbb33f1f0c7e29fdd733f5af7390c2930"; // USDC/WETH on Base mainnet

// Sweep from very tight (below any offer's min rate) to very loose.
// Real offers in this market today sit around 50-500 bps, so this
// brackets both rejection-on-too-tight and acceptance regions.
const CEILINGS_BPS = ["10", "50", "100", "300", "600", "1000", "1500"];

const REQUEST = {
  marketId: MARKET_ID,
  borrowAmount: "5000000", // 5 USDC
  collateralAmount: "20000000000000000", // 0.02 WETH
  duration: "2592000", // 30 days
  minLtvBps: "1000",
  // Must be ≤ cheapest offer's maxLtvBps (7000 today). The API returns
  // an explicit `suggestion` field when this is wrong — see Finding #3.
  maxLtvBps: "7000",
};

async function attemptBorrow(ceilingBps: string) {
  const authHeaders = await getFloeAuthHeaders("circuit-2");
  const res = await fetch(
    "https://credit-api.floelabs.xyz/v1/credit/instant-borrow",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ ...REQUEST, maxInterestRateBps: ceilingBps }),
    },
  );

  const body = await res.text();
  let parsed: unknown = body;
  try {
    parsed = JSON.parse(body);
  } catch {
    /* keep as string */
  }

  if (res.ok) {
    // /v1/credit/instant-borrow returns prepared (unsigned) transactions,
    // not a loan. The caller must still sign and submit them on-chain.
    const txCount = Array.isArray(
      (parsed as { transactions?: unknown[] }).transactions,
    )
      ? (parsed as { transactions: unknown[] }).transactions.length
      : 0;
    return {
      accepted: true,
      detail: `prepared ${txCount} transactions for submission`,
      raw: parsed,
    };
  }
  const detail =
    typeof parsed === "object" && parsed && "error" in parsed
      ? `${(parsed as { error: string }).error}: ${
          (parsed as { message?: string }).message ?? ""
        }`
      : body;
  return { accepted: false, detail, raw: parsed };
}

async function run() {
  try {
    logger.info("Starting Circuit 2: rate-ceiling sweep via REST");
    logger.info(`Ceilings to test (bps): ${CEILINGS_BPS.join(", ")}`);

    const report: SweepReport = await rateCeilingSweep({
      ceilingsBps: CEILINGS_BPS,
      attempt: attemptBorrow,
    });

    metrics.recordEvent("sweep_report", report);

    logger.info("──────── Summary ────────");
    logger.info(
      `First-accepted ceiling: ${report.acceptedAtBps ?? "(none)"}`,
    );
    logger.info(
      `Highest-rejected ceiling: ${report.rejectionThresholdBps ?? "(none)"}`,
    );
    for (const a of report.attempts) {
      logger.info(`  ${a.ceilingBps.padStart(5)} bps  ${a.outcome.padEnd(9)}  ${a.detail.slice(0, 120)}`);
    }

    const date = new Date().toISOString().slice(0, 10);
    await metrics.saveToFile(
      `circuit-2-image-agent/results/sweep-${date}.json`,
    );
    logger.success("Circuit 2 complete");
  } catch (error) {
    logger.error("Circuit 2 failed", error);
    process.exit(1);
  }
}

run();
