import { getFloeAuthHeaders } from "../shared/auth.js";
import { Logger, Metrics } from "../shared/utils.js";

const logger = new Logger("Circuit-1");

async function runCircuit1() {
  try {
    logger.info("🚀 Starting Circuit 1: Research Agent");

    // 1. Get auth headers
    const authHeaders = await getFloeAuthHeaders("circuit-1");
    logger.success(`Authenticated as: ${authHeaders["X-Wallet-Address"]}`);

    // 2. Call Floe API to borrow
    const response = await fetch(
      "https://credit-api.floelabs.xyz/v1/credit/instant-borrow",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          marketId: "0xfe92656527bae8e6d37a9e0bb785383fbb33f1f0c7e29fdd733f5af7390c2930",
          borrowAmount: "5000000", // $5 USDC
          collateralAmount: "10000000000000000", // 0.008 WETH
          maxInterestRateBps: "600", // 4% APR cap
          duration: "2592000", // 30 days
          minLtvBps: "1000", // Floor on borrower's accepted LTV. API validation: rejects "0", and rejects values greater than maxLtvBps (cross-field constraint).
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Floe API error: ${response.status} - ${error}`);
    }

    const loan = await response.json();
    logger.success("Loan created!");
    logger.info("Loan details:", loan);

    // 3. Save results
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const fs = await import("fs");
    fs.writeFileSync(
      `circuit-1-research-agent/results/run-${timestamp}.json`,
      JSON.stringify(loan, null, 2)
    );

    logger.success("Circuit 1 complete! ✨");
  } catch (error) {
    logger.error("Circuit 1 failed", error);
    process.exit(1);
  }
}

runCircuit1();