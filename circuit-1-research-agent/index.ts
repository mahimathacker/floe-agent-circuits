// import { AgentKit } from "@coinbase/agentkit";
// import { CdpEvmWalletProvider } from "@coinbase/agentkit";
// import { floeActionProvider } from "floe-agent";
// import { config } from "../shared/config.js";
// import { Logger, Metrics, invokeAction } from "../shared/utils.js";

// const logger = new Logger("Circuit-1");
// const metrics = new Metrics();

// async function runCircuit1() {
//   try {
//     logger.info("Starting Circuit 1: Research Agent");

//     logger.info("Setting up AgentKit...");
//     const walletProvider = await CdpEvmWalletProvider.configureWithWallet({
//       apiKeyId: config.cdp.apiKeyId,
//       apiKeySecret: config.cdp.apiKeySecret,
//       walletSecret: config.cdp.walletSecret,
//       networkId: config.network.id,
//     });

//     const address = walletProvider.getAddress();
//     logger.success(`Wallet ready: ${address}`);

//     const agentkit = await AgentKit.from({
//       walletProvider,
//       actionProviders: [floeActionProvider({ rpcUrl: "https://sepolia.base.org" })],
//     });

//     // 2. Check initial balance
//     logger.info("Checking USDC balance...");
//     // TODO: Add balance check

//     // 3. Borrow from Floe
//     logger.info("Borrowing from Floe...");
//     const loan = await invokeAction<{ loanId: string }>(agentkit, "instant_borrow", {
//       borrowAmount: "10000000", // $10 USDC
//       collateralAmount: "10000000000000000", // 0.01 WETH (~$25)
//       maxInterestRateBps: "1200", // 12% APR
//       duration: "604800", // 7 days
//     });

//     logger.success(`Loan created: ${loan.loanId}`);
//     metrics.recordEvent("loan_created", loan);

//     // 4. Make x402 API calls
//     logger.info("Making x402 API calls...");
//     // TODO: Add x402 calls to Firecrawl, Exa, etc.

//     // 5. Check loan status
//     const status = await invokeAction(agentkit, "check_credit_status", {
//       loanId: loan.loanId,
//     });
//     logger.info("Loan status:", status);
//     metrics.recordEvent("loan_status", status);

//     // 6. Repay loan
//     logger.info("Repaying loan...");
//     await invokeAction(agentkit, "repay_credit", {
//       loanId: loan.loanId,
//     });
//     logger.success("Loan repaid!");

//     // 7. Save results
//     metrics.saveToFile("circuit-1-research-agent/results/run-" + Date.now() + ".json");
//     logger.success("Circuit 1 complete! ✨");
    
//   } catch (error) {
//     logger.error("Circuit 1 failed", error);
//     process.exit(1);
//   }
// }

// runCircuit1();


// circuit-1-research-agent/index.ts
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
          marketId: "0xbd0fb0e71705bfb3cc5c5552d9276e6617761b37353bd9e1b37bb65c3af2d7f7",
          borrowAmount: "5000000", // $5 USDC
          collateralAmount: "8000000000000000", // 0.008 WETH
          maxInterestRateBps: "400", // 4% APR cap
          duration: "2592000", // 30 days
          minLtvBps: "1", // Floor on borrower's accepted LTV. API validation: rejects "0", and rejects values greater than maxLtvBps (cross-field constraint).
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