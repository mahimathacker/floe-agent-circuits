// Awareness smoke test — runs today, no chain funds required.
//
// Exercises only the x402 agent-awareness actions, which take identity
// from `facilitatorApiKey` (Bearer) rather than the wallet:
//   - get_credit_remaining
//   - get_loan_state
//   - get_spend_limit
//   - list_credit_thresholds
//
// Goal: prove the x402ActionProvider is correctly wired before
// Wednesday's funded run, so the only thing left to validate end-to-end
// is the on-chain borrow + x402_fetch.

import { AgentKit } from "@coinbase/agentkit";
import { x402ActionProvider } from "floe-agent";
import { Logger, Metrics, invokeAction } from "../shared/utils.js";
import { getWalletProvider } from "../shared/wallet.js";

const logger = new Logger("Circuit-1/Awareness");
const metrics = new Metrics();

async function run() {
  const floeAgentApiKey = process.env.FLOE_AGENT_API_KEY;
  if (!floeAgentApiKey) {
    throw new Error(
      "FLOE_AGENT_API_KEY missing — create an Agent at dev-dashboard.floelabs.xyz/agents",
    );
  }

  const walletProvider = await getWalletProvider("circuit-1");
  logger.success(`Wallet ready: ${walletProvider.getAddress()}`);

  const agentkit = await AgentKit.from({
    walletProvider,
    actionProviders: [
      x402ActionProvider({
        facilitatorUrl: "https://credit-api.floelabs.xyz/v1",
        facilitatorApiKey: floeAgentApiKey,
      }),
    ],
  });

  const readOnly = [
    "get_credit_remaining",
    "get_loan_state",
    "get_spend_limit",
    "list_credit_thresholds",
  ];

  for (const name of readOnly) {
    logger.info(`→ ${name}`);
    try {
      const out = await invokeAction(agentkit, name, {});
      const preview =
        typeof out === "string" ? out.slice(0, 300) : JSON.stringify(out).slice(0, 300);
      logger.success(`  ${preview}`);
      metrics.recordEvent(name, out);
    } catch (e) {
      logger.error(`  ${name} threw`, e);
      metrics.recordEvent(`${name}_error`, String(e));
    }
  }

  const date = new Date().toISOString().slice(0, 10);
  await metrics.saveToFile(
    `circuit-1-research-agent/results/awareness-${date}.json`,
  );
  logger.success(`Saved results to circuit-1-research-agent/results/awareness-${date}.json`);
}

run().catch((e) => {
  logger.error("Awareness smoke failed", e);
  process.exit(1);
});
