// Circuit 2 — Image Agent (full agent behavior, SDK path).
//
// Story: an AI image agent has a goal (N images) and a rate preference
// (won't pay above 6%). It borrows, generates images via x402, and
// repays. If the borrow is rejected for rate reasons, it raises its
// ceiling by 1% and tries again, up to a hard cap (matches the Agent's
// dashboard-configured max rate of 15%). Reports whether the agent's
// preferred ceiling held over the session.
//
// Discovery: REST `/v1/credit/offers` (no log scan needed — see Finding #9).
// Borrow:    SDK `manual_match_credit` (signed by CDP wallet).
// Spend:     SDK `x402_fetch` (auto-pays from the Agent's credit line).
// Repay:     SDK `repay_credit`.

import { AgentKit } from "@coinbase/agentkit";
import { floeActionProvider, x402ActionProvider } from "floe-agent";
import { Logger, Metrics } from "../shared/utils.js";
import { getWalletProvider } from "../shared/wallet.js";
import { runImageAgent, type BorrowParams, type ImageRequest } from "./agent.js";

const logger = new Logger("Circuit-2");
const metrics = new Metrics();

const MARKET_ID =
  "0xfe92656527bae8e6d37a9e0bb785383fbb33f1f0c7e29fdd733f5af7390c2930"; // USDC/WETH on Base mainnet

const TARGET_IMAGES = 5;
const SPEND_LIMIT_RAW = "2000000"; // $2 cap on x402 spend this session

const BORROW_AMOUNT = "2000000"; // $2 USDC — covers 5 images + slack
const COLLATERAL_AMOUNT = "20000000000000000"; // 0.02 WETH
const DURATION_SECONDS = "1296000"; // 15 days — fits current offers' maxDuration
const MIN_LTV_BPS = "1000";

const INITIAL_CEILING_BPS = "600"; // 6% — agent's preference
const MAX_ACCEPTABLE_CEILING_BPS = "1500"; // 15% — matches dashboard Agent cap
const CEILING_RAISE_BPS = 100; // raise by 1% per rate-rejection

// Points at our own x402-paywalled image stub server (see x402-image-stub/).
// On Wednesday: run `npm run x402-server` + `ngrok http 8787`, then set
// X402_IMAGE_STUB_URL in .env to the ngrok public URL.
//
// Fallback — verified Floe-compatible image-gen endpoints from the Floe
// docs (https://floe-labs.gitbook.io/docs/developers/x402-directory/media-generation).
// Swap one in if our own stub has issues:
//   - Spraay     POST https://api.spraay.ai/v1/run          $0.02 USDC
//   - Soundside  POST https://api.soundside.ai/v1/generate  $0.02 USDC
//   - Freepik    POST https://api.freepik.com/v1/x402/generate $0.02 USDC
//   - Imference  POST https://api.imference.com/v1/generate $0.05 USDC
//   - Kodo       POST https://api.kodo.ai/v1/create         $0.05 USDC
const IMAGE_STUB_URL =
  process.env.X402_IMAGE_STUB_URL ?? "http://localhost:8787";

const PROMPTS = [
  "a cat astronaut",
  "a vaporwave skyline",
  "a serene mountain lake at dawn",
  "a robot tending a garden",
  "abstract neon geometry",
];

const IMAGE_REQUESTS: ImageRequest[] = PROMPTS.map((prompt, i) => ({
  label: `image ${i + 1} — "${prompt}"`,
  url: `${IMAGE_STUB_URL}/image`,
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt }),
}));

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

async function run() {
  try {
    logger.info("Starting Circuit 2 (SDK image agent, full behavior loop)");

    const floeAgentApiKey = process.env.FLOE_AGENT_API_KEY;
    if (!floeAgentApiKey) {
      throw new Error(
        "FLOE_AGENT_API_KEY missing — create an Agent at dev-dashboard.floelabs.xyz/agents",
      );
    }

    const walletProvider = await getWalletProvider("circuit-2");
    logger.success(`Wallet ready: ${walletProvider.getAddress()}`);

    logger.info("Fetching lend offers via REST...");
    const offer = await pickLendIntent();
    logger.success(
      `Picked offer ${offer.offerHash.slice(0, 10)}… at ${offer.minInterestRateBps} bps`,
    );
    metrics.recordEvent("offer_picked", offer);

    const agentkit = await AgentKit.from({
      walletProvider,
      actionProviders: [
        floeActionProvider(),
        x402ActionProvider({
          facilitatorUrl: "https://credit-api.floelabs.xyz/v1",
          facilitatorApiKey: floeAgentApiKey,
        }),
      ],
    });

    const borrowParams: BorrowParams = {
      lendIntentHash: offer.offerHash,
      marketId: MARKET_ID,
      borrowAmount: BORROW_AMOUNT,
      collateralAmount: COLLATERAL_AMOUNT,
      minLtvBps: MIN_LTV_BPS,
      duration: DURATION_SECONDS,
      // maxLtvBps is on the offer side; we don't pass it to manual_match_credit
    };

    const report = await runImageAgent({
      agentkit,
      imageRequests: IMAGE_REQUESTS,
      targetImages: TARGET_IMAGES,
      spendLimitRaw: SPEND_LIMIT_RAW,
      borrowParams,
      adaptive: {
        startingCeilingBps: INITIAL_CEILING_BPS,
        maxAcceptableCeilingBps: MAX_ACCEPTABLE_CEILING_BPS,
        ceilingRaiseBps: CEILING_RAISE_BPS,
      },
      metrics,
    });

    metrics.recordEvent("agent_report", report);

    logger.info("──────── Summary ────────");
    logger.info(`Initial ceiling preference: ${report.initialCeilingBps} bps`);
    logger.info(`Final ceiling used:         ${report.finalCeilingBps} bps`);
    logger.info(`Ceiling held at preferred:  ${report.ceilingHeldAtPreferred}`);
    logger.info(`Borrow succeeded:           ${report.borrow.success}`);
    logger.info(`Images generated:           ${report.imagesGenerated}/${TARGET_IMAGES}`);
    logger.info(`Borrow attempts:`);
    for (const a of report.borrow.attempts) {
      logger.info(
        `  ${a.ceilingBps.padStart(5)} bps  ${a.outcome.padEnd(9)}  ${a.detail.slice(0, 80)}`,
      );
    }

    const date = new Date().toISOString().slice(0, 10);
    await metrics.saveToFile(
      `circuit-2-image-agent/results/agent-${date}.json`,
    );
    logger.success("Circuit 2 (SDK) complete");
  } catch (error) {
    logger.error("Circuit 2 (SDK) failed", error);
    await metrics.saveToFile(
      `circuit-2-image-agent/results/agent-${Date.now()}-failed.json`,
    );
    process.exit(1);
  }
}

run();
