// Rate-ceiling sweep helper.
//
// Tries to borrow at a series of `maxInterestRateBps` values and reports
// which were accepted vs rejected. Used by the REST and SDK variants of
// circuit 2 to test whether Floe respects the borrower's stated ceiling.

import { Logger } from "../shared/utils.js";

const logger = new Logger("Circuit-2/Sweep");

export interface SweepAttempt {
  ceilingBps: string;
  outcome: "accepted" | "rejected";
  detail: string;
  raw?: unknown;
}

export interface SweepReport {
  attempts: SweepAttempt[];
  rejectionThresholdBps: string | null;
  acceptedAtBps: string | null;
}

export async function rateCeilingSweep(opts: {
  ceilingsBps: string[];
  attempt: (ceilingBps: string) => Promise<{
    accepted: boolean;
    detail: string;
    raw?: unknown;
  }>;
}): Promise<SweepReport> {
  const attempts: SweepAttempt[] = [];
  let rejectionThresholdBps: string | null = null;
  let acceptedAtBps: string | null = null;

  for (const ceilingBps of opts.ceilingsBps) {
    logger.info(`Attempting borrow at ceiling ${ceilingBps} bps`);
    const result = await opts.attempt(ceilingBps);
    const outcome: SweepAttempt["outcome"] = result.accepted
      ? "accepted"
      : "rejected";

    attempts.push({
      ceilingBps,
      outcome,
      detail: result.detail,
      raw: result.raw,
    });

    if (result.accepted && acceptedAtBps === null) {
      acceptedAtBps = ceilingBps;
      logger.success(`Accepted at ${ceilingBps} bps`);
    } else if (!result.accepted) {
      rejectionThresholdBps = ceilingBps;
      logger.warn(
        `Rejected at ${ceilingBps} bps — ${result.detail.slice(0, 100)}`,
      );
    }
  }

  return { attempts, rejectionThresholdBps, acceptedAtBps };
}
