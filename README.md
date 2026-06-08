# Floe Agent Circuits - DevRel Assignment

**Author:** Mahima Thacker
**Date:** May - June 2026
**Assignment:** Run 2-5 agentic working capital circuits on Floe Labs

## Overview

Four circuits + one merchant-side server, each exercising a different part of Floe's stack for AI agents on Base mainnet. Built over a few weeks of testing, with 21 DevRel findings filed along the way (several of which Floe has since resolved).

| Circuit | What it demonstrates | End-to-end |
|---|---|---|
| [**1 - Research Agent**](circuit-1-research-agent/) | Credit-line quickstart - agent makes a real x402-paid call using Floe's auto-borrow credit line. Headline product flow. | ✅ Working - $0.02 round trip 2026-06-08 |
| [**2 - Image Agent**](circuit-2-image-agent/) | Manual-loan path with adaptive rate-ceiling - agent raises its preferred ceiling on rate-driven rejection. | ✅ Code complete, validated to insufficient-balance (CDP wallet was not funded) |
| [**3 - Multi-Agent Team**](circuit-3-multi-agent/) | One planner + three specialist workers (product / news / price) sharing one credit line. Two workers make real x402 calls to Exa. | ✅ Working - real Exa data, mixed result captures Finding #20 contention live |
| [**4 - MCP Integration**](circuit-4-mcp-Integrations/) | Agent calls Floe's MCP server's `get_markets` tool. Read-only, no payment. | ✅ Working - <1 second, structured response |
| [**x402-image-stub**](x402-image-stub/) | Merchant-side x402 server (Hono). Demonstrates I understand both sides of the protocol. | ✅ Working with canonical base64 PAYMENT-REQUIRED + PAYMENT-RESPONSE |

## Findings

21 DevRel findings filed across the assignment in [docs/FINDINGS.md](docs/FINDINGS.md). Status breakdown:

- **Resolved by Floe** (5): #1, #2, #3, #14, #18
- **Updated upstream** (2): #7, #13
- **Still open** (14): #4, #5, #6, #8, #9, #10, #11, #12, #15, #16, #17, #19, #20, #21

I filed most of these during onboarding and as I hit each blocker. Several got fixed by Floe along the way - big thanks to Alex Christian for the two same-day hot-fixes (the v2 base64 parser shipped while I was still investigating). The later findings (#19-21) come from actually completing the end-to-end x402 round trip and writing the merchant-side server from scratch.

## Quick Start

```bash
# 1. Install dependencies
npm install --legacy-peer-deps

# 2. Configure environment
cp .env.example .env
# Edit .env with your CDP credentials + FLOE_AGENT_API_KEY (created at dev-dashboard.floelabs.xyz/agents)

# 3. Setup wallet (creates / fetches a CDP wallet for signing)
npm run setup

# 4. Fund the agent wallet with USDC on Base mainnet via the dashboard's
#    "Buy with card" flow, or send USDC directly to the agent's address.

# 5. Sanity check the credit line is open
npm run circuit-1:awareness

# 6. Run circuits
npm run circuit-1      # credit-line quickstart
npm run circuit-3      # multi-agent research (real Exa calls)
npm run circuit-4      # MCP read

# 7. (Advanced) Manual-loan variants - need WETH + ETH on the CDP wallet
npm run x402-server    # in terminal 1
ngrok http 8787        # in terminal 2 (point X402_FETCH_URL at the URL)
npm run circuit-1      # paid round-trip through the local stub
```

See each circuit's README for prerequisites + step-by-step run instructions.

## Project Structure

```
floe-agent-circuits/
├── README.md                  (this file)
├── docs/
│   ├── FINDINGS.md            21 DevRel findings
│   └── ...
├── circuit-1-research-agent/  Credit-line quickstart
├── circuit-2-image-agent/     Manual-loan path with adaptive ceiling
├── circuit-3-multi-agent/     Planner + 3 specialist workers
├── circuit-4-mcp-Integrations/ MCP get_markets read
├── x402-image-stub/           Merchant-side x402 server (Hono)
├── shared/                    Shared CDP wallet + auth + utils
└── scripts/                   Helpers (faucet, wrap-eth, balance, etc.)
```

## Wallets / identities used

| Wallet | Address | Role | Funded with |
|---|---|---|---|
| CDP wallet (`floe-main`) | `0x2cEC5e692DA29Bf9E822dC8B114F9Ed8845c5FF1` | Signs SDK actions for the manual-loan flow (circuit 2's `manual_match_credit`) | Empty - would need WETH + ETH for circuit 2 to fully run |
| Floe Agent (Privy) | `0xca89a98d057869394a84ac1ae265b6bd06d50b9d` | Holds the credit line for x402 calls (circuits 1, 3) | $2 USDC sent by Alex (thanks!) |
| Personal wallet | `0x4b2E6be2C27E7F49F06f851C8630E95aC326677c` | Authenticates the dashboard; `payTo` for the x402-image-stub | n/a |

The shared CDP wallet covers circuits 1 / 2 / 3 / 4's signing needs. The Agent wallet's credit line is what circuit 1's `x402_fetch` and circuit 3's worker calls actually draw from.

## What worked and what didn't

Worked end-to-end:
- Circuit 1's first real x402 round trip ([results/quickstart-2026-06-08.json](circuit-1-research-agent/results/quickstart-2026-06-08.json))
- Circuit 3's worker A (real Exa Contents call returning real Coinbase.com data) ([results/run-2026-06-08.json](circuit-3-multi-agent/results/run-2026-06-08.json))
- Circuit 4 (MCP) ([results/image.png](circuit-4-mcp-Integrations/results/image.png))
- Awareness probe ([results/awareness-2026-06-05.json](circuit-1-research-agent/results/awareness-2026-06-05.json))
- The merchant-side x402 stub (canonical base64 + PAYMENT-SIGNATURE / PAYMENT-RESPONSE)

Didn't run end-to-end:
- Circuit 2's actual loan-open + image loop, because I didn't fund the CDP wallet with WETH. Code is structurally complete and stops cleanly on the funding check.
- Circuit 3's worker B in my most recent run - it hit `auto_borrow_in_progress` because worker A had just consumed the available credit and the next auto-borrow hadn't settled yet. Exactly the contention pattern in [Finding #20](docs/FINDINGS.md).

Neither of these failures was a code bug - the first is a funding gap on my side, the second is the known auto-borrow contention I'd already documented in Finding #20.