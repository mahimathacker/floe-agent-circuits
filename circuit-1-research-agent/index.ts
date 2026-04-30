import { AgentKit } from "@coinbase/agentkit";
import { CdpEvmWalletProvider } from "@coinbase/agentkit";
import { floeActionProvider } from "floe-agent";
import { config } from "../shared/config.js";
import { Logger, Metrics, invokeAction } from "../shared/utils.js";

const logger = new Logger("Circuit-1");
const metrics = new Metrics();

async function runCircuit1() {
  try {
    logger.info("Starting Circuit 1: Research Agent");

    logger.info("Setting up AgentKit...");
    const walletProvider = await CdpEvmWalletProvider.configureWithWallet({
      apiKeyId: config.cdp.apiKeyId,
      apiKeySecret: config.cdp.apiKeySecret,
      walletSecret: config.cdp.walletSecret,
      networkId: config.network.id,
    });

    const address = walletProvider.getAddress();
    logger.success(`Wallet ready: ${address}`);

    const agentkit = await AgentKit.from({
      walletProvider,
      actionProviders: [floeActionProvider({ rpcUrl: "https://sepolia.base.org" })],
    });

    // 2. Check initial balance
    logger.info("Checking USDC balance...");
    // TODO: Add balance check

    // 3. Borrow from Floe
    logger.info("Borrowing from Floe...");
    const loan = await invokeAction<{ loanId: string }>(agentkit, "instant_borrow", {
      borrowAmount: "10000000", // $10 USDC
      collateralAmount: "10000000000000000", // 0.01 WETH (~$25)
      maxInterestRateBps: "1200", // 12% APR
      duration: "604800", // 7 days
    });

    logger.success(`Loan created: ${loan.loanId}`);
    metrics.recordEvent("loan_created", loan);

    // 4. Make x402 API calls
    logger.info("Making x402 API calls...");
    // TODO: Add x402 calls to Firecrawl, Exa, etc.

    // 5. Check loan status
    const status = await invokeAction(agentkit, "check_credit_status", {
      loanId: loan.loanId,
    });
    logger.info("Loan status:", status);
    metrics.recordEvent("loan_status", status);

    // 6. Repay loan
    logger.info("Repaying loan...");
    await invokeAction(agentkit, "repay_credit", {
      loanId: loan.loanId,
    });
    logger.success("Loan repaid!");

    // 7. Save results
    metrics.saveToFile("circuit-1-research-agent/results/run-" + Date.now() + ".json");
    logger.success("Circuit 1 complete! ✨");
    
  } catch (error) {
    logger.error("Circuit 1 failed", error);
    process.exit(1);
  }
}

runCircuit1();