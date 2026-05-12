// Circuit 2 helpers.
// - tryBorrowWithAdaptiveCeiling: real agent behavior — raise ceiling on
//   rate-driven rejection, give up otherwise
// - runImageAgent: full session loop — borrow, x402 spend per image, repay

import type { AgentKit } from "@coinbase/agentkit";
import { Logger, type Metrics, invokeAction } from "../shared/utils.js";

const agentLogger = new Logger("Circuit-2/Agent");

export interface BorrowParams {
  lendIntentHash: string;
  marketId: string;
  borrowAmount: string;
  collateralAmount: string;
  minLtvBps: string;
  duration: string;
  matcherCommissionBps?: string;
  expirySeconds?: string;
  onBehalfOf?: string;
}

export interface AdaptiveBorrowOptions {
  startingCeilingBps: string;
  maxAcceptableCeilingBps: string;
  ceilingRaiseBps: number;
}

export interface BorrowAttempt {
  ceilingBps: string;
  outcome: "accepted" | "rejected";
  detail: string;
  reasonClassified: "rate" | "non_rate" | "n/a";
}

export interface AdaptiveBorrowResult {
  success: boolean;
  loanId: string | null;
  finalCeilingBps: string;
  attempts: BorrowAttempt[];
}

function classifyRejection(raw: string): "rate" | "non_rate" {
  // Floe's `suggestion` strongly signals when a rate raise would help.
  // Anything else (LTV, duration, expiry, etc.) we can't fix by raising rate.
  return /maxInterestRateBps|cheapest open offer|RATE_TOO_HIGH/i.test(raw)
    ? "rate"
    : "non_rate";
}

function extractLoanId(markdown: string): string | null {
  const m = markdown.match(/\*\*Loan ID\*\*:\s*(\d+)/);
  return m ? m[1]! : null;
}

export async function tryBorrowWithAdaptiveCeiling(
  agentkit: AgentKit,
  params: BorrowParams,
  opts: AdaptiveBorrowOptions,
): Promise<AdaptiveBorrowResult> {
  let current = BigInt(opts.startingCeilingBps);
  const max = BigInt(opts.maxAcceptableCeilingBps);
  const raise = BigInt(opts.ceilingRaiseBps);
  const attempts: BorrowAttempt[] = [];

  while (current <= max) {
    const ceilingBps = current.toString();
    agentLogger.info(`Attempting borrow at ceiling ${ceilingBps} bps`);

    const raw = await invokeAction<unknown>(agentkit, "manual_match_credit", {
      ...params,
      maxInterestRateBps: ceilingBps,
      // Schema defaults are silently dropped (Finding #10) — pass explicitly.
      matcherCommissionBps: params.matcherCommissionBps ?? "50",
      expirySeconds: params.expirySeconds ?? "300",
    });

    const text = typeof raw === "string" ? raw : JSON.stringify(raw);

    if (/^error/i.test(text.trim())) {
      const reasonClassified = classifyRejection(text);
      attempts.push({
        ceilingBps,
        outcome: "rejected",
        detail: text.slice(0, 200),
        reasonClassified,
      });

      if (reasonClassified === "rate" && current + raise <= max) {
        agentLogger.warn(
          `Rejected at ${ceilingBps} bps for rate reason — raising by ${raise} bps`,
        );
        current += raise;
        continue;
      }

      agentLogger.error(
        reasonClassified === "rate"
          ? `Rejected at ${ceilingBps} bps — reached max acceptable ceiling, giving up`
          : `Rejected at ${ceilingBps} bps — non-rate reason, can't fix by raising`,
      );
      return {
        success: false,
        loanId: null,
        finalCeilingBps: ceilingBps,
        attempts,
      };
    }

    const loanId = extractLoanId(text);
    attempts.push({
      ceilingBps,
      outcome: "accepted",
      detail: loanId ? `loan opened (id ${loanId})` : "loan opened (no id parsed)",
      reasonClassified: "n/a",
    });
    agentLogger.success(`Borrow accepted at ${ceilingBps} bps (loan ${loanId ?? "?"})`);
    return { success: true, loanId, finalCeilingBps: ceilingBps, attempts };
  }

  return {
    success: false,
    loanId: null,
    finalCeilingBps: current.toString(),
    attempts,
  };
}

export interface ImageAgentOptions {
  agentkit: AgentKit;
  imageUrls: string[];
  targetImages: number;
  spendLimitRaw: string;
  borrowParams: BorrowParams;
  adaptive: AdaptiveBorrowOptions;
  metrics?: Metrics;
}

export interface ImageAgentReport {
  imagesGenerated: number;
  imagesAttempted: number;
  initialCeilingBps: string;
  finalCeilingBps: string;
  ceilingHeldAtPreferred: boolean;
  borrow: AdaptiveBorrowResult;
  spendEvents: { url: string; ok: boolean; preview: string }[];
  repayResult?: unknown;
}

export async function runImageAgent(
  opts: ImageAgentOptions,
): Promise<ImageAgentReport> {
  const { agentkit, imageUrls, targetImages, spendLimitRaw, borrowParams, adaptive, metrics } = opts;

  agentLogger.info(`Setting session spend limit to ${spendLimitRaw} raw USDC`);
  const limitResp = await invokeAction(agentkit, "set_spend_limit", {
    limitRaw: spendLimitRaw,
  });
  metrics?.recordEvent("spend_limit_set", limitResp);

  const borrow = await tryBorrowWithAdaptiveCeiling(
    agentkit,
    borrowParams,
    adaptive,
  );
  metrics?.recordEvent("borrow_result", borrow);

  const spendEvents: ImageAgentReport["spendEvents"] = [];
  let imagesGenerated = 0;

  if (borrow.success) {
    for (let i = 0; i < imageUrls.length && imagesGenerated < targetImages; i++) {
      const url = imageUrls[i]!;
      agentLogger.info(`Generating image ${i + 1}/${targetImages}: ${url}`);

      try {
        const fetched = await invokeAction(agentkit, "x402_fetch", { url });
        const text = typeof fetched === "string" ? fetched : JSON.stringify(fetched);
        const ok = !/^error/i.test(text.trim());
        const preview = text.slice(0, 200);
        spendEvents.push({ url, ok, preview });
        metrics?.recordEvent("x402_fetch", { url, ok, preview });
        if (ok) imagesGenerated++;
        else agentLogger.warn(`x402_fetch failed: ${preview}`);
      } catch (e) {
        spendEvents.push({ url, ok: false, preview: String(e) });
        agentLogger.error(`x402_fetch threw for ${url}`, e);
      }
    }
  } else {
    agentLogger.warn("Skipping image generation — borrow did not succeed");
  }

  let repayResult: unknown;
  if (borrow.success && borrow.loanId) {
    agentLogger.info(`Repaying loan ${borrow.loanId}`);
    repayResult = await invokeAction(agentkit, "repay_credit", {
      loanId: borrow.loanId,
    });
    metrics?.recordEvent("repay_result", repayResult);
  }

  return {
    imagesGenerated,
    imagesAttempted: spendEvents.length,
    initialCeilingBps: adaptive.startingCeilingBps,
    finalCeilingBps: borrow.finalCeilingBps,
    ceilingHeldAtPreferred:
      borrow.finalCeilingBps === adaptive.startingCeilingBps,
    borrow,
    spendEvents,
    repayResult,
  };
}
