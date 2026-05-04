// Circuit 1 - SDK reference version (via floe-agent + AgentKit).
//
// This is what the same circuit looks like when you go through the
// `floe-agent` AgentKit action provider instead of calling the REST API
// directly. Side-by-side with `index.ts` (the REST version).
//
// CURRENTLY NOT RUNNABLE.
// `floe-agent@0.2.0` depends on `@floe/credit-sdk` via a `file:` path that
// is not on npm and not on this machine. Importing `floeActionProvider`
// triggers the missing-package error at load time. See Finding #1 in
// docs/FINDINGS.md.
//
// Once that dependency is fixed, this file should run. It also depends on
// the testnet matcher having markets and offers, since this path talks to
// the chain directly rather than the mainnet-only REST API. See Finding #7.

import { AgentKit } from "@coinbase/agentkit";
import { floeActionProvider } from "floe-agent";
import { Logger, Metrics, invokeAction } from "../shared/utils.js";
import { getWalletProvider } from "../shared/wallet.js";

const logger = new Logger("Circuit-1");
const metrics = new Metrics();

async function runCircuit1ViaSdk() {
  try {
    logger.info("Starting Circuit 1 (SDK version)");

    const walletProvider = await getWalletProvider("circuit-1");
    const address = walletProvider.getAddress();
    logger.success(`Wallet ready: ${address}`);

    const agentkit = await AgentKit.from({
      walletProvider,
      actionProviders: [floeActionProvider({ rpcUrl: "https://sepolia.base.org" })],
    });

    logger.info("Borrowing from Floe...");
    const loan = await invokeAction<{ loanId: string }>(agentkit, "instant_borrow", {
      marketId: "0xfe92656527bae8e6d37a9e0bb785383fbb33f1f0c7e29fdd733f5af7390c2930",
      borrowAmount: "5000000",
      collateralAmount: "20000000000000000",
      maxInterestRateBps: "1000",
      duration: "2592000",
      minLtvBps: "1",
    });

    logger.success(`Loan created: ${loan.loanId}`);
    metrics.recordEvent("loan_created", loan);

    // TODO: x402 calls (Firecrawl, Exa, etc.) using the borrowed USDC.

    const status = await invokeAction(agentkit, "check_credit_status", {
      loanId: loan.loanId,
    });
    logger.info("Loan status:", status);
    metrics.recordEvent("loan_status", status);

    logger.info("Repaying loan...");
    await invokeAction(agentkit, "repay_credit", {
      loanId: loan.loanId,
    });
    logger.success("Loan repaid");

    metrics.saveToFile(`circuit-1-research-agent/results/run-sdk-${Date.now()}.json`);
    logger.success("Circuit 1 complete (SDK)");
  } catch (error) {
    logger.error("Circuit 1 (SDK) failed", error);
    process.exit(1);
  }
}

runCircuit1ViaSdk();
