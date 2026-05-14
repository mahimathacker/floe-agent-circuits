// Circuit 3 — Multi-Agent Research Team.
//
// One planner + three specialized workers (product / news / price) all
// sharing one Floe credit line. Demonstrates the multi-agent coordination
// pattern on top of Floe's credit primitives.
//
// Real Floe primitives exercised (against the live facilitator):
//   - get_credit_remaining (before + after)
//   - set_spend_limit (session-scoped cap)
//
// Worker research calls are simulated locally because real x402 paid
// calls are blocked by Finding #14. The coordination, budget tracking,
// and report aggregation are real.

import { AgentKit } from "@coinbase/agentkit";
import { x402ActionProvider } from "floe-agent";
import { Logger, Metrics } from "../shared/utils.js";
import { getWalletProvider } from "../shared/wallet.js";
import { runPlanner, renderReport } from "./planner-agent.js";
import { WORKERS } from "./worker-agent.js";

const logger = new Logger("Circuit-3");
const metrics = new Metrics();

// Target company. Override via env to research someone else.
const COMPANY = process.env.RESEARCH_COMPANY ?? "Coinbase";

// Session spend cap. Total simulated worker spend should stay under this.
// Set to $0.10 — generous over the workers' simulated $0.081 total.
const SESSION_SPEND_LIMIT_RAW = "100000";

async function run() {
  try {
    logger.info(`Starting Circuit 3 (multi-agent research on "${COMPANY}")`);

    const floeAgentApiKey = process.env.FLOE_AGENT_API_KEY;
    if (!floeAgentApiKey) {
      throw new Error(
        "FLOE_AGENT_API_KEY missing — create an Agent at dev-dashboard.floelabs.xyz/agents",
      );
    }

    const walletProvider = await getWalletProvider("circuit-3");
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

    const report = await runPlanner({
      agentkit,
      workers: WORKERS,
      company: COMPANY,
      sessionSpendLimitRaw: SESSION_SPEND_LIMIT_RAW,
      metrics,
    });

    logger.info("──────── Summary ────────");
    logger.info(`Company:            ${report.company}`);
    logger.info(
      `Workers:            ${report.workersCompleted}/${report.workersDispatched} completed in ${report.durationMs}ms`,
    );
    logger.info(
      `Simulated spend:    ${report.totalSimulatedSpendRaw} raw USDC`,
    );
    logger.info(`Session cap:        ${report.spendLimitRaw} raw USDC`);
    logger.info(`Within budget:      ${report.withinBudget}`);

    const date = new Date().toISOString().slice(0, 10);
    const json = `circuit-3-multi-agent/results/run-${date}.json`;
    const md = `circuit-3-multi-agent/results/report-${date}.md`;

    await metrics.saveToFile(json);

    const fs = await import("node:fs");
    fs.writeFileSync(md, renderReport(report));
    logger.success(`Saved metrics → ${json}`);
    logger.success(`Saved report  → ${md}`);
    logger.success("Circuit 3 complete");
  } catch (error) {
    logger.error("Circuit 3 failed", error);
    process.exit(1);
  }
}

run();
