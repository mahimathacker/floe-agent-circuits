# Circuit 3 - Multi-Agent Research Team

One planner + three specialized workers (product / news / price) share one Floe credit line to research a target company. Demonstrates the multi-agent coordination pattern on top of Floe's credit primitives, with two of the three workers making real x402 calls to external endpoints.

## What runs

- **Planner** ([planner-agent.ts](planner-agent.ts)): reads credit state, sets the session spend limit, dispatches workers sequentially, aggregates outputs, compares total cost vs budget.
- **Workers** ([worker-agent.ts](worker-agent.ts)): three specializations:
  - `worker-A-product` → POST `https://api.exa.ai/contents` ($0.001) - real x402 call, extracts company website content
  - `worker-B-news` → POST `https://api.exa.ai/search` ($0.005) - real x402 call, semantic search for company news
  - `worker-C-price` → simulated locally - Floe's x402 directory has no financial-data category yet
- **Runner** ([index.ts](index.ts)): wires AgentKit + x402ActionProvider, invokes the planner, saves results.

## What's real vs simulated

| Step | Real Floe call? |
|---|---|
| Read credit state before | ✅ `get_credit_remaining` against live facilitator |
| Set session spend limit | ✅ `set_spend_limit` against live facilitator |
| Worker A - Exa Contents | ✅ Real x402 paid call when credit is available |
| Worker B - Exa Search | ✅ Real x402 paid call when credit is available |
| Worker C - price feed | ❌ Simulated (no Floe-directory price endpoint exists) |
| Read credit state after | ✅ `get_credit_remaining` against live facilitator |
| Aggregate spend vs cap | ✅ Real budget math against the real Floe-reported state |

Workers run sequentially (not in parallel) because Floe's auto-borrow serializes on the same credit line - two concurrent x402 calls hit `auto_borrow_in_progress` races. See [Finding #20](../docs/FINDINGS.md). Sequential dispatch keeps the multi-agent story while avoiding the race.

## How to run

### Prerequisites

1. Floe Agent created at [dev-dashboard.floelabs.xyz/agents](https://dev-dashboard.floelabs.xyz/agents).
2. `FLOE_AGENT_API_KEY` in `.env`.
3. Some USDC funded into the agent's wallet so the credit line has collateral.
4. The working capital line matched (`State: idle`, `Available > 0`) - check via `npm run circuit-1:awareness`.

### Run

```bash
npm run circuit-3
```

Override the target company:

```bash
RESEARCH_COMPANY="Floe Labs" npm run circuit-3
```

### Output

- **Console** - per-worker log with timing + cost + real-vs-simulated tag
- **`results/run-{date}.json`** - full metrics including credit-before/after snapshots and worker outputs
- **`results/report-{date}.md`** - assembled markdown research report

## Real run from 2026-06-08

Saved artifacts: [`results/run-2026-06-08.json`](results/run-2026-06-08.json), [`results/report-2026-06-08.md`](results/report-2026-06-08.md).

Summary:
- **Workers**: 2/3 completed in 16080ms
- **Real x402 spend**: 1000 raw USDC ($0.001), tracked server-side by Floe (`Headroom: 99.98 → 99.979 USDC`)
- **Within budget**: yes

Per-worker breakdown:

| Worker | Result | Notes |
|---|---|---|
| `worker-A-product` | ✅ Real x402, $0.001, 3.75s | Genuine Exa Contents scrape of `www.coinbase.com` - real product copy, FINRA disclaimers, the whole homepage |
| `worker-B-news` | ❌ `auto_borrow_in_progress` after 8.5s | Worker A's borrow ate the available credit; B triggered a new auto-borrow that didn't settle in time. Exactly the contention pattern in [Finding #20](../docs/FINDINGS.md). |
| `worker-C-price` | ✅ Simulated, 0.5s | Filler (no Floe-directory price endpoint) |

So this run is itself a mixed real + failure outcome - worker A demonstrating a real x402 round trip through Floe to an external provider, worker B demonstrating the documented auto-borrow contention.

## Insights this surfaces

1. **Real x402 calls work end-to-end through Floe.** Worker A's scrape of `coinbase.com` was paid for via the credit line, settled on-chain, and the response came back with real page content. The whole protocol stack functions.
2. **`set_spend_limit` is durable across calls.** The "Credit after" snapshot reflects spend (`Session Cap: 0.10 → 0.099 USDC remaining`).
3. **Auto-borrow latency is the practical bottleneck.** Even sequential workers can hit `auto_borrow_in_progress` if the previous borrow hasn't settled before the next call. See Finding #20 and #19.
4. **`get_credit_remaining` is the natural pre-flight gate.** Reading credit state at the start tells the planner what budget it has - useful for "should I attempt this research" decisions.

## What's missing

- A consistent way to ensure all sequential workers get credit. Currently if the first worker consumes the entire `Available` balance, the second has to wait for a new auto-borrow to match - which can fail with `auto_borrow_in_progress`. Pre-borrowing a larger chunk upfront would smooth this out.
- One Floe Agent per worker would give each its own credit line and remove the contention entirely. Today the demo uses one shared agent (which is what the multi-agent-sharing-one-credit-line story actually demonstrates).
- A Floe x402 directory endpoint for financial / price data (worker C is stubbed for this reason).
