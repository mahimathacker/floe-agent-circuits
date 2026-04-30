# Floe Agent Circuits - DevRel Assignment

**Author:** Mahima Thacker
**Date:** May 2026  
**Assignment:** Run 2-5 agentic working capital circuits on Floe Labs

## Overview

This repository contains 3 circuits demonstrating Floe's credit layer for AI agents on Base:

1. **Research Agent** - Auto-borrows when wallet runs low
2. **Image Agent** - Tests interest rate ceiling limits
3. **Multi-Agent Team** - 3 agents sharing one credit line

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your CDP credentials

# 3. Setup wallet
npm run setup

# 4. Fund wallet with testnet USDC
# Visit: https://faucet.circle.com

# 5. Run circuits
npm run circuit-1
npm run circuit-2
npm run circuit-3

# Or run all at once
npm run all
```

## Project Structure