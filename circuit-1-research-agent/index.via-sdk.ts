// Circuit 1 - SDK version (hybrid: REST discovery + SDK signed actions).
//
// Why hybrid: floe-agent's `request_credit` scans 2M blocks of logs in one
// call, which most free RPCs reject. See Finding #9. The SDK's signed
// actions (manual_match_credit, check_credit_status, repay_credit) don't
// have this problem — they read one piece of contract state or send a
// transaction. So we discover offers via REST and use the SDK for the
// on-chain steps.
//
// Flow:
//   1. GET /v1/credit/offers (REST)            — pick a lend intent
//   2. manual_match_credit (SDK)               — open the loan on-chain
//   3. check_credit_status (SDK)               — read loan state
//   4. repay_credit (SDK)                      — close the loan on-chain
//
// Floe is mainnet-only (Finding #7), so .env needs NETWORK_ID=base-mainnet.
// Steps 2-4 require a funded mainnet wallet.

import { AgentKit } from "@coinbase/agentkit";
import { floeActionProvider, x402ActionProvider } from "floe-agent";
import { Logger, Metrics, invokeAction } from "../shared/utils.js";
import { getWalletProvider } from "../shared/wallet.js";
import { runResearchLoop } from "./agent.js";

const MARKET_ID =
  "0xfe92656527bae8e6d37a9e0bb785383fbb33f1f0c7e29fdd733f5af7390c2930"; // USDC/WETH on Base mainnet

const BORROW_AMOUNT = "5000000"; // 5 USDC
const COLLATERAL_AMOUNT = "20000000000000000"; // 0.02 WETH
const MAX_INTEREST_RATE_BPS = "1000"; // 10% APR cap
const MIN_LTV_BPS = "1";
const DURATION_SECONDS = "2592000"; // 30 days

// Spend cap the agent enforces on itself per session (raw USDC, 6 decimals).
const SPEND_LIMIT_RAW = "1000000"; // $1 of the $5 borrowed

// x402-paywalled URLs the "research agent" will fetch.
// Swap in real x402 endpoints for production runs.
const RESEARCH_QUERIES = [
  "https://minifetch.xyz/?url=https://example.com",
  "https://minifetch.xyz/?url=https://news.ycombinator.com",
  "https://minifetch.xyz/?url=https://en.wikipedia.org/wiki/Stablecoin",
];

const logger = new Logger("Circuit-1");
const metrics = new Metrics();

interface RestOffer {
  offerHash: string;
  remainingAmount: string;
  minInterestRateBps: string;
  maxLtvBps: string;
  minDuration: string;
  maxDuration: string;
  expiry: string;
}

async function pickLendIntent(): Promise<RestOffer> {
  const url = `https://credit-api.floelabs.xyz/v1/credit/offers?marketId=${MARKET_ID}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Offers fetch failed: ${res.status} ${await res.text()}`);
  }
  const { offers } = (await res.json()) as { offers: RestOffer[] };

  const now = BigInt(Math.floor(Date.now() / 1000));
  const fit = offers.filter((o) => {
    return (
      BigInt(o.remainingAmount) >= BigInt(BORROW_AMOUNT) &&
      BigInt(o.minInterestRateBps) <= BigInt(MAX_INTEREST_RATE_BPS) &&
      BigInt(o.minDuration) <= BigInt(DURATION_SECONDS) &&
      BigInt(o.maxDuration) >= BigInt(DURATION_SECONDS) &&
      BigInt(o.expiry) > now
    );
  });

  if (fit.length === 0) {
    throw new Error(
      `No matching offers for market ${MARKET_ID}. Got ${offers.length} total.`,
    );
  }

  fit.sort(
    (a, b) => Number(BigInt(a.minInterestRateBps) - BigInt(b.minInterestRateBps)),
  );
  return fit[0]!;
}

async function runCircuit1ViaSdk() {
  try {
    logger.info("Starting Circuit 1 (hybrid: REST discovery + SDK signed actions)");

    const walletProvider = await getWalletProvider("circuit-1");
    const address = walletProvider.getAddress();
    logger.success(`Wallet ready: ${address}`);

    logger.info("Fetching open lend offers via REST...");
    const offer = await pickLendIntent();
    logger.success(
      `Picked offer ${offer.offerHash.slice(0, 10)}… at ${offer.minInterestRateBps} bps`,
    );
    metrics.recordEvent("offer_picked", offer);

    const floeApiKey = process.env.FLOE_API_KEY;
    if (!floeApiKey) {
      throw new Error(
        "FLOE_API_KEY missing — needed for x402ActionProvider (agent awareness + x402_fetch).",
      );
    }

    const agentkit = await AgentKit.from({
      walletProvider,
      actionProviders: [
        floeActionProvider(),
        x402ActionProvider({
          facilitatorUrl: "https://credit-api.floelabs.xyz/v1",
          facilitatorApiKey: floeApiKey,
        }),
      ],
    });

    logger.info("Opening credit facility via manual_match_credit (SDK)...");
    const matchRaw = await invokeAction<unknown>(agentkit, "manual_match_credit", {
      lendIntentHash: offer.offerHash,
      marketId: MARKET_ID,
      borrowAmount: BORROW_AMOUNT,
      collateralAmount: COLLATERAL_AMOUNT,
      maxInterestRateBps: MAX_INTEREST_RATE_BPS,
      minLtvBps: MIN_LTV_BPS,
      duration: DURATION_SECONDS,
      // Schema defaults aren't applied via AgentKit's invoke — pass them
      // explicitly or BigInt(undefined) will throw inside the SDK. See
      // Finding #10.
      expirySeconds: "300",
      matcherCommissionBps: "50",
    });
    logger.info("manual_match_credit raw response:", matchRaw);
    metrics.recordEvent("match_credit_raw", matchRaw);

    // The SDK returns errors as plain markdown strings instead of throwing.
    // Detect that so we don't cascade undefined into the next steps.
    if (typeof matchRaw === "string" && /^error/i.test(matchRaw.trim())) {
      throw new Error(`manual_match_credit failed: ${matchRaw}`);
    }
    const loan = matchRaw as { loanId: string };
    if (!loan.loanId) {
      throw new Error(
        `manual_match_credit returned no loanId. Raw: ${JSON.stringify(matchRaw).slice(0, 500)}`,
      );
    }
    logger.success(`Loan opened: ${loan.loanId}`);

    await runResearchLoop(agentkit, {
      spendLimitRaw: SPEND_LIMIT_RAW,
      queries: RESEARCH_QUERIES,
      metrics,
    });

    const status = await invokeAction(agentkit, "check_credit_status", {
      loanId: loan.loanId,
    });
    logger.info("Loan status:", status);
    metrics.recordEvent("loan_status", status);

    logger.info("Repaying loan...");
    const repay = await invokeAction(agentkit, "repay_credit", {
      loanId: loan.loanId,
    });
    logger.info("repay_credit raw response:", repay);
    metrics.recordEvent("repay_raw", repay);

    await metrics.saveToFile(
      `circuit-1-research-agent/results/run-sdk-${Date.now()}.json`,
    );
    logger.success("Circuit 1 complete (hybrid SDK)");
  } catch (error) {
    logger.error("Circuit 1 (hybrid SDK) failed", error);
    await metrics.saveToFile(
      `circuit-1-research-agent/results/run-sdk-${Date.now()}-failed.json`,
    );
    process.exit(1);
  }
}

runCircuit1ViaSdk();
