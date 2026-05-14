# Circuit 1 — Credit-Line Quickstart

The simplest possible Floe demo. An agent makes one x402-paid call using its Floe credit line. No manual loan, no collateral, no gas — just the headline product flow.

## Files

| File | What it is |
|---|---|
| [index.ts](index.ts) | **Main**. Credit-line quickstart. ~5 SDK calls. |
| [awareness-smoke.ts](awareness-smoke.ts) | Read-only probe of credit state. No spending. |
| [index.loan-rest.ts](index.loan-rest.ts) | Power-user manual-loan flow via REST `/v1/credit/instant-borrow`. |
| [index.loan-sdk.ts](index.loan-sdk.ts) | Power-user manual-loan flow via SDK `manual_match_credit`. Needs ETH + WETH. |
| [agent.ts](agent.ts) | Shared research-loop helper used by the loan-SDK variant. |

## How to run

### Prerequisites

1. Create an Agent at [dev-dashboard.floelabs.xyz/agents](https://dev-dashboard.floelabs.xyz/agents).
2. Generate an API key for the agent.
3. Set `FLOE_AGENT_API_KEY` in `.env`.

### Run the quickstart

If pointing at the local x402 stub (default):

```bash
npm run x402-server     # terminal 1 — starts the paywalled endpoint
npm run circuit-1       # terminal 2 — agent makes one paid call
```

Or point `X402_IMAGE_STUB_URL` at any Floe-verified x402 endpoint (Firecrawl, Soundside, etc.) in `.env`, and skip the stub server.

### Run the awareness probe (no spending)

```bash
npm run circuit-1:awareness
```

Returns the agent's current credit limit, available balance, utilization, and any registered thresholds. Useful for verifying the API key works without making a paid call.

### Run the power-user manual-loan variants

These need ETH + WETH on the CDP wallet for gas and collateral:

```bash
npm run circuit-1:loan-rest   # REST baseline
npm run circuit-1:loan-sdk    # SDK with manual_match_credit
```

## What the quickstart does

1. Reads the agent's current credit state.
2. Sets a `$1` session spend limit.
3. Makes one POST to a paid x402 endpoint.
4. Reads credit state again — you should see the call's cost deducted.
5. Saves results to `results/quickstart-{date}.json`.
