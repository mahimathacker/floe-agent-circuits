# Circuit 1 — Credit-Line Quickstart

The simplest possible Floe demo: an agent uses its Floe credit line to make one x402-paid call. No manual loan, no collateral, no gas — just the headline product flow.

## Current state

| Step | Status |
|---|---|
| Create agent → mint API key → read credit state | ✅ Works end-to-end (`npm run circuit-1:awareness`) |
| Set spend limit | ✅ Works |
| Make a paid x402 call | ❌ Blocked — see [Findings #13 and #14](../docs/FINDINGS.md) |

The awareness probe demonstrates Floe's credit-line setup end-to-end (real data, real agent, real on-chain delegation). The paid x402 call is blocked by an undocumented 402-response format that Floe's facilitator expects from upstream servers — we documented this with reproducible evidence in Finding #14.

## Files

| File | What it is |
|---|---|
| [index.ts](index.ts) | **Main**. Credit-line quickstart. ~5 SDK calls. |
| [awareness-smoke.ts](awareness-smoke.ts) | Read-only probe of credit state. No spending. |
| [index.loan-rest.ts](index.loan-rest.ts) | Power-user manual-loan flow via REST `/v1/credit/instant-borrow`. |
| [index.loan-sdk.ts](index.loan-sdk.ts) | Power-user manual-loan flow via SDK `manual_match_credit`. Needs ETH + WETH on the CDP wallet. |
| [agent.ts](agent.ts) | Shared research-loop helper used by the loan-SDK variant. |

## How to run

### Prerequisites

1. Create an Agent at [dev-dashboard.floelabs.xyz/agents](https://dev-dashboard.floelabs.xyz/agents).
2. Mint an API key for the agent. Set `FLOE_AGENT_API_KEY` in `.env`.

### Awareness probe (works today, no funds needed)

```bash
npm run circuit-1:awareness
```

Returns the agent's credit limit, available balance, utilization, and registered thresholds. Useful for verifying the API key + delegation are configured correctly.

Sample output saved to [results/awareness-2026-05-14.json](results/awareness-2026-05-14.json).

### Paid quickstart (currently blocked — see Finding #14)

```bash
npm run x402-server     # terminal 1 — local stub server (exposed via ngrok)
npm run circuit-1       # terminal 2 — agent makes one paid call
```

You can also swap `X402_FETCH_URL` in `.env` to point at any URL in [Floe's verified directory](https://floe-labs.gitbook.io/docs/developers/x402-directory) — but per Finding #13, none of the 9 endpoints we tested actually return parseable 402 responses. Either way, `Failed to parse PAYMENT-REQUIRED header` is the expected outcome until Floe documents the format.

### Power-user manual-loan variants

These open an explicit USDC loan against WETH collateral. Need ETH for gas + WETH for collateral on the CDP wallet:

```bash
npm run circuit-1:loan-rest   # REST baseline via /v1/credit/instant-borrow
npm run circuit-1:loan-sdk    # SDK via manual_match_credit
```

The SDK variant additionally tries `request_credit` for offer browsing — see [Finding #9](../docs/FINDINGS.md) for why that requires a paid RPC tier.

## What the quickstart code does

1. Reads agent's current credit state (`get_credit_remaining`).
2. Sets a `$1` session spend limit (`set_spend_limit`).
3. Makes one POST to a paid x402 endpoint (`x402_fetch`).
4. Reads credit state again — should show the call's cost deducted.
5. Saves results to `results/quickstart-{date}.json`.

Today: steps 1, 2, and 5 succeed. Step 3 hits Finding #14.

## Related findings

| # | Finding |
|---|---|
| 9 | `request_credit` (offer browsing) requires paid RPC tier |
| 10 | Schema defaults in `floe-agent` actions silently dropped |
| 11 | x402 SDK requires dashboard-created Agent (not in quickstart docs) |
| 12 | Floe facilitator URL is payer-only — docs don't say so |
| 13 | "x402 directory" advertises endpoints that don't actually return 402 (0/9 worked) |
| 14 | Floe facilitator can't parse any standard 402 format; expected dialect undocumented |
| 15 | `/v1/proxy/check` only sends GET — can't verify POST-only x402 endpoints |
| 16 | Docs example uses `$FLOE_API_KEY` but the runtime key is `floe_*` (agent key), not `floe_live_*` |

Full details in [docs/FINDINGS.md](../docs/FINDINGS.md).
