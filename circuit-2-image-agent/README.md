# Circuit 2 - Image Agent with Rate-Ceiling Test

A price-conscious image agent. The agent wants to generate 5 images via x402, but it won't open a loan above 6% APR. If Floe rejects the borrow because no lender is offering a low-enough rate, the agent raises its ceiling by 1% and retries, up to a hard cap of 15% (matching the Agent's dashboard-configured max rate).

This is the **manual-loan path** - different from circuit 1's auto-borrow credit line. Here the agent explicitly picks a lender, sets its own rate ceiling, posts WETH as collateral, opens a loan, spends from it, and repays at the end. Use this when you want explicit control over rate/term/collateral; use circuit 1's credit-line flow when you just want to spend.

## Current state

| Step | Status |
|---|---|
| Code (adaptive ceiling logic, REST offer discovery, SDK loan open, image loop, repay) | ✅ Complete |
| Structural validation (runs cleanly to the on-chain signing step) | ✅ Validates to `Insufficient balance to execute the transaction` |
| End-to-end run (real loan + 5 images + repay) | ❌ Not run - CDP wallet was never funded with WETH + ETH (see below) |

The two flows in this repo use different on-chain identities:
- **Circuit 1 / 3 / 4 (credit-line flow)** signs via the Agent's Privy wallet (`0xca89a98d…`), funded with USDC. That's where Alex's $2 USDC landed.
- **Circuit 2 (manual-loan flow)** signs via the CDP wallet (`0x2cEC5e69…`), which would need WETH for collateral + ETH for gas. I focused funding on the credit-line path because it's Floe's headline product, so the CDP wallet is still empty.

So circuit 2 is shippable code that runs all the way to the chain submission and stops cleanly on the funding check. To complete an end-to-end run, fund `0x2cEC5e69…` with ~0.02 WETH + a small amount of ETH on Base mainnet.

## Files

| File | What it is |
|---|---|
| [index.ts](index.ts) | Wires AgentKit + x402ActionProvider, runs the agent loop. |
| [agent.ts](agent.ts) | `tryBorrowWithAdaptiveCeiling` (raises ceiling on rate-driven rejection) + `runImageAgent` (set spend limit, borrow, x402_fetch loop, repay). |

## How to run

### Prerequisites

1. Floe Agent created at [dev-dashboard.floelabs.xyz/agents](https://dev-dashboard.floelabs.xyz/agents). Set `FLOE_AGENT_API_KEY` in `.env`.
2. (For the x402 image calls) Run the local x402 stub server and expose it via ngrok:
   ```bash
   npm run x402-server
   ngrok http 8787
   # set X402_IMAGE_STUB_URL=https://<ngrok>.ngrok-free.app in .env
   ```
3. (For the actual loan to open) Fund the CDP wallet `0x2cEC5e692DA29Bf9E822dC8B114F9Ed8845c5FF1` with ~0.02 WETH (collateral) and a small amount of ETH (gas) on Base mainnet. Without this, the script will dispatch correctly but the on-chain `manual_match_credit` will fail with `Insufficient balance`.

### Run

```bash
npm run circuit-2
```

What you should see:
- Agent fetches lend offers via REST.
- Agent tries `manual_match_credit` at 6% (`600 bps`). If Floe rejects for rate reasons, agent raises ceiling by 1% and retries, up to 15%.
- Once a loan opens (real run), agent loops over 5 prompts and makes one `x402_fetch` per prompt against the stub URL.
- At the end, `repay_credit` closes the loan.
- Final summary shows: initial ceiling preference, ceiling actually used, whether the preferred ceiling held, images generated, borrow attempts.

## Adaptive ceiling logic

The interesting bit is in [agent.ts](agent.ts)'s `tryBorrowWithAdaptiveCeiling`:
- Starts at the agent's preferred ceiling (6%).
- On rejection, classifies the reason - "rate too low" gets a retry with raised ceiling; "LTV / duration / expiry" failures don't (raising the rate wouldn't fix them).
- Stops at the configured max ceiling (15%) - if Floe still won't match, the agent gives up gracefully.

So the run produces a real signal: did the agent's preferred ceiling hold, or did it have to compromise? Useful for testing how strict Floe's matcher is and how lender supply moves over time.

## Related findings

| # | Finding |
|---|---|
| 3 | API error messages were too generic - **RESOLVED** (now `primaryReason`, `suggestion`, `rejectionsByCode`) |
| 4 | `minLtvBps` blocked my first borrow and I couldn't tell why |
| 5 | SDK and REST disagree on what's valid (e.g. minLtvBps range) |
| 9 | `request_credit` (SDK offer browsing) needs paid RPC tier - that's why circuit-2 uses REST `/v1/credit/offers` for offer discovery instead of the SDK |
| 10 | Schema defaults in `floe-agent` actions silently dropped (e.g. `expirySeconds` / `matcherCommissionBps`) - I pass them explicitly |
| 13 | "x402 directory" - original entries broken, new directory has working endpoints |

Full details in [docs/FINDINGS.md](../docs/FINDINGS.md).
