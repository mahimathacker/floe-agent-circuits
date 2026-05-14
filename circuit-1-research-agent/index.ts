// Circuit 1 — Credit-Line Quickstart.
//
// The simplest possible Floe demo: an agent makes one x402-paid call
// using nothing but its Floe credit line. No manual loan, no collateral,
// no gas. The agent starts with $0 USDC; if Floe's auto-credit works as
// advertised, the call should succeed and credit gets drawn down.
//
// This is intentionally minimal. The point of circuit 1 is to measure
// the *onboarding DX* of Floe's headline product flow — the experience
// of the first 5 minutes a new developer has with Floe. The deep
// notes live in circuit-1-research-agent/README.md.
//
// For the power-user manual-loan flow (collateral, rate-ceiling logic,
// CDP wallet borrow signing), see `index.loan-rest.ts` and
// `index.loan-sdk.ts`.

import { AgentKit } from "@coinbase/agentkit";
import { x402ActionProvider } from "floe-agent";
import { Logger, Metrics, invokeAction } from "../shared/utils.js";
import { getWalletProvider } from "../shared/wallet.js";

const logger = new Logger("Circuit-1");
const metrics = new Metrics();

// $1 session cap. Tight on purpose — the test is "credit works", not
// "spend a lot". Plenty for one x402 call.
const SPEND_LIMIT_RAW = "1000000";

// One x402-paid call. Defaults to our local stub (`x402-image-stub`) —
// swap to any Floe-verified endpoint via env to demo against a real
// service. Examples from Floe's directory:
//   - Firecrawl scrape:  https://api.firecrawl.dev/v1/x402/scrape
//   - Soundside image:   https://api.soundside.ai/v1/generate
const FETCH_URL =
  (process.env.X402_IMAGE_STUB_URL ?? "http://localhost:8787") + "/image";

async function run() {
  logger.info("Starting Circuit 1 (credit-line quickstart)");

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

  // ── The whole demo in 5 calls ──────────────────────────────────────────
  const before = await invokeAction(agentkit, "get_credit_remaining", {});
  logger.info("Credit before:", before);
  metrics.recordEvent("credit_before", before);

  const limitResp = await invokeAction(agentkit, "set_spend_limit", {
    limitRaw: SPEND_LIMIT_RAW,
  });
  logger.info("Spend limit set:", limitResp);
  metrics.recordEvent("spend_limit_set", limitResp);

  logger.info(`Fetching: POST ${FETCH_URL}`);
  const fetched = await invokeAction(agentkit, "x402_fetch", {
    url: FETCH_URL,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "hello, floe credit line" }),
  });
  logger.info("Fetched:", fetched);
  metrics.recordEvent("x402_fetch", fetched);

  const after = await invokeAction(agentkit, "get_credit_remaining", {});
  logger.info("Credit after:", after);
  metrics.recordEvent("credit_after", after);
  // ───────────────────────────────────────────────────────────────────────

  const date = new Date().toISOString().slice(0, 10);
  await metrics.saveToFile(
    `circuit-1-research-agent/results/quickstart-${date}.json`,
  );
  logger.success("Circuit 1 complete");
}

run().catch(async (err) => {
  logger.error("Circuit 1 failed", err);
  await metrics.saveToFile(
    `circuit-1-research-agent/results/quickstart-${Date.now()}-failed.json`,
  );
  process.exit(1);
});
