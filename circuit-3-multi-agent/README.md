# Circuit 3 — Multi-Agent Research Team

One planner + three specialized workers (product / news / price) share one Floe credit line to research a target company in parallel. Demonstrates the multi-agent coordination pattern on top of Floe's credit primitives.

## What runs

- **Planner** ([planner-agent.ts](planner-agent.ts)): reads credit state, sets the session spend limit, dispatches workers in parallel, aggregates outputs, compares total cost vs budget.
- **Workers** ([worker-agent.ts](worker-agent.ts)): three specializations, each with its own simulated x402 endpoint price:
  - `worker-A-product` → product info (would call Firecrawl, $0.03)
  - `worker-B-news` → recent news (would call Exa, $0.05)
  - `worker-C-price` → relevant token prices (would call Mycelia, $0.001)
- **Runner** ([index.ts](index.ts)): wires AgentKit + x402ActionProvider, invokes the planner, saves results.

## What's real vs simulated

| Step | Real Floe call? |
|---|---|
| Read credit state before | ✅ `get_credit_remaining` against live facilitator |
| Set session spend limit | ✅ `set_spend_limit` against live facilitator |
| Workers do "research" | ❌ Simulated locally — see Finding #14 |
| Read credit state after | ✅ `get_credit_remaining` against live facilitator |
| Aggregate spend vs cap | ✅ Real budget math against the real Floe-reported state |

The simulation is deliberate: real x402 paid calls hit [Finding #14](../docs/FINDINGS.md) (Floe's facilitator can't parse standard `@x402/hono` 402 responses, and the verified directory entries are non-functional per Finding #13). Rather than block circuit 3 on someone else's bug, we stubbed the research step and kept everything *around* it real — the coordination, budget tracking, and Floe primitive calls all run for real.

## How to run

### Prerequisites

1. Floe Agent created at [dev-dashboard.floelabs.xyz/agents](https://dev-dashboard.floelabs.xyz/agents).
2. `FLOE_AGENT_API_KEY` in `.env`.

### Run

```bash
npm run circuit-3
```

Optionally override the target company:

```bash
RESEARCH_COMPANY="Floe Labs" npm run circuit-3
```

### Output

- **Console** — full per-worker log with timing + simulated cost
- **`results/run-{date}.json`** — full metrics including credit-before/after snapshots
- **`results/report-{date}.md`** — markdown research report

## Sample output (Coinbase, 3 parallel workers)

Saved artifacts from a real run:
- [`results/run-2026-05-14.json`](results/run-2026-05-14.json) — full metrics (credit-before/after, worker timing, simulated spend)
- [`results/report-2026-05-14.md`](results/report-2026-05-14.md) — assembled markdown report

The aggregated report (`report-2026-05-14.md`):

```markdown
# Research report — Coinbase

Workers dispatched: 3 | completed: 3 | duration: 3487ms
Simulated spend: 81000 raw USDC | session cap: 100000 | within budget: true

## worker-A-product (product) — ok in 470ms, would-cost 30000 raw USDC
{
  "company": "Coinbase",
  "products": [
    "Coinbase Exchange — primary spot/derivatives venue",
    "Coinbase Wallet — self-custody mobile/extension wallet",
    "Coinbase Earn — staking + yield products"
  ],
  "source": "simulated scrape of company website"
}

## worker-B-news (news) — ok in 550ms, would-cost 50000 raw USDC
{
  "company": "Coinbase",
  "headlines": [
    "Coinbase reports Q1 earnings beat",
    "Coinbase announces new institutional product line",
    "Coinbase expands to two additional jurisdictions"
  ],
  "source": "simulated news search"
}

## worker-C-price (price) — ok in 549ms, would-cost 1000 raw USDC
{
  "company": "Coinbase",
  "feeds": {
    "BTC": "$67,400",
    "ETH": "$2,500",
    "relevantTokens": ["BTC", "ETH"]
  },
  "source": "simulated price oracle"
}
```

## Insights this surfaces

1. **`set_spend_limit` is durable across calls.** The "Credit after" snapshot still shows our `0.10 USDC` session cap — Floe persists the limit, agents can't accidentally exceed by misremembering.
2. **Parallel coordination has near-zero overhead.** Three workers ran fully in parallel; total wall-clock was driven by the slowest worker, not the sum.
3. **Per-worker cost ladders cleanly into a budget.** A coordinating planner can pre-compute total spend ($0.081) before workers start, compare against the cap ($0.10), and decide whether to launch.
4. **`get_credit_remaining` is the natural pre-flight gate.** Reading credit state at the start of a session tells the planner what budget it actually has — useful for "should I even attempt this research" decisions.

## What's missing (Wednesday's funded run would fix)

- Real `x402_fetch` per worker → real credit utilization → real per-worker spend tracked by Floe (not simulated by us). Blocked on [Finding #14](../docs/FINDINGS.md).
- Multiple actual Floe Agents (one per worker) → per-worker spend caps enforced server-side by Floe. Today we have one Agent with one session cap covering all workers.
