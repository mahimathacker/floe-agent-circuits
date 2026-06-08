// Planner agent - coordinates the research team and tracks the budget.
//
// Sets the session spend limit on the Floe credit line, dispatches the
// workers in parallel, aggregates their outputs into a single report,
// and compares total simulated spend against credit available.

import type { AgentKit } from "@coinbase/agentkit";
import { Logger, type Metrics, invokeAction } from "../shared/utils.js";
import {
  runWorker,
  type WorkerConfig,
  type WorkerResult,
} from "./worker-agent.js";

const logger = new Logger("Circuit-3/Planner");

export interface PlannerOptions {
  agentkit: AgentKit;
  workers: WorkerConfig[];
  company: string;
  sessionSpendLimitRaw: string; // raw USDC, 6 decimals
  metrics?: Metrics;
}

export interface PlannerReport {
  company: string;
  workersDispatched: number;
  workersCompleted: number;
  totalSpendRaw: string;
  realSpendRaw: string;
  simulatedSpendRaw: string;
  creditBefore: unknown;
  creditAfter: unknown;
  spendLimitRaw: string;
  withinBudget: boolean;
  results: WorkerResult[];
  durationMs: number;
}

function sumRaw(values: string[]): string {
  return values.reduce((sum, v) => sum + BigInt(v), 0n).toString();
}

export async function runPlanner(opts: PlannerOptions): Promise<PlannerReport> {
  const { agentkit, workers, company, sessionSpendLimitRaw, metrics } = opts;
  const started = Date.now();

  logger.info(`Researching "${company}" with ${workers.length} workers`);

  // 1. Snapshot credit state before
  const creditBefore = await invokeAction(agentkit, "get_credit_remaining", {});
  logger.info("Credit before:", creditBefore);
  metrics?.recordEvent("credit_before", creditBefore);

  // 2. Set session spend limit (real Floe primitive)
  const limitResp = await invokeAction(agentkit, "set_spend_limit", {
    limitRaw: sessionSpendLimitRaw,
  });
  logger.info(`Spend limit set to ${sessionSpendLimitRaw} raw USDC`);
  metrics?.recordEvent("spend_limit_set", limitResp);

  // 3. Dispatch workers sequentially.
  //
  // Initially designed to run in parallel via Promise.all - but Floe's
  // auto-borrow serializes on the same credit line: two concurrent x402
  // calls trigger an `auto_borrow_in_progress` race where only one gets
  // credit. Running sequentially serializes the borrows cleanly. True
  // parallel dispatch would require one Floe Agent per worker (see
  // finding in docs/FINDINGS.md).
  logger.info(`Dispatching ${workers.length} workers sequentially…`);
  const results: WorkerResult[] = [];
  for (const w of workers) {
    results.push(await runWorker(agentkit, w, company));
  }
  metrics?.recordEvent("worker_results", results);

  // 4. Snapshot credit state after
  const creditAfter = await invokeAction(agentkit, "get_credit_remaining", {});
  logger.info("Credit after:", creditAfter);
  metrics?.recordEvent("credit_after", creditAfter);

  // 5. Aggregate budget - split real x402 spend from simulated counterfactual
  const ok = results.filter((r) => r.ok);
  const realSpendRaw = sumRaw(ok.filter((r) => r.realCall).map((r) => r.costRaw));
  const simulatedSpendRaw = sumRaw(
    ok.filter((r) => !r.realCall).map((r) => r.costRaw),
  );
  const totalSpendRaw = sumRaw([realSpendRaw, simulatedSpendRaw]);
  const withinBudget =
    BigInt(totalSpendRaw) <= BigInt(sessionSpendLimitRaw);

  const durationMs = Date.now() - started;
  return {
    company,
    workersDispatched: workers.length,
    workersCompleted: ok.length,
    totalSpendRaw,
    realSpendRaw,
    simulatedSpendRaw,
    creditBefore,
    creditAfter,
    spendLimitRaw: sessionSpendLimitRaw,
    withinBudget,
    results,
    durationMs,
  };
}

export function renderReport(report: PlannerReport): string {
  const lines: string[] = [];
  lines.push(`# Research report - ${report.company}`);
  lines.push("");
  lines.push(
    `Workers dispatched: ${report.workersDispatched} | completed: ${report.workersCompleted} | duration: ${report.durationMs}ms`,
  );
  lines.push(
    `Real x402 spend: ${report.realSpendRaw} raw USDC | simulated counterfactual: ${report.simulatedSpendRaw} raw USDC | session cap: ${report.spendLimitRaw} | within budget: ${report.withinBudget}`,
  );
  lines.push("");
  for (const r of report.results) {
    lines.push(
      `## ${r.worker} (${r.specialization}) - ${r.ok ? "ok" : "failed"} in ${r.durationMs}ms, cost ${r.costRaw} raw USDC (${r.realCall ? "real x402" : "simulated"})`,
    );
    lines.push("```json");
    lines.push(JSON.stringify(r.output, null, 2));
    lines.push("```");
    lines.push("");
  }
  return lines.join("\n");
}
