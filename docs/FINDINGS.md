## FINDING #1: floe-agent package has broken dependencies - RESOLVED in 0.3.0
**Severity:** Critical - Blocked AgentKit integration
**Status:** Resolved upstream in `floe-agent@0.3.0` (verified 2026-05-11).

**Original issue (0.2.0):**
- `floe-agent@0.2.0` declared `@floe/credit-sdk` as a `file:../floe-monorepo/...` dependency
- That package was not on npm and not on developer machines, so importing `floeActionProvider` crashed at load time with `Cannot find package '@floe/credit-sdk'`

**What 0.3.0 changed:**
- The `@floe/credit-sdk` dependency is gone entirely. `floe-agent@0.3.0` no longer requires it; the package installs and `floeActionProvider` loads cleanly.

**Verification:**
- Upgraded with `npm install floe-agent@0.3.0 --legacy-peer-deps` and ran [circuit-1-research-agent/index.via-sdk.ts](../circuit-1-research-agent/index.via-sdk.ts). The provider initializes and the wallet connects. (The script still errors later, but for unrelated reasons noted below.)

**Caveats discovered while verifying the fix:**

1. **`@coinbase/agentkit` has an undeclared `graphql` peer.** Its Superfluid action provider eagerly imports `graphql-request`, which throws `Cannot find module 'graphql'` if `graphql` isn't installed. Worked around with `npm install graphql`. Not Floe's bug, but anyone running the SDK quickstart will hit it.

2. **Peer-dep mismatch still present.** `floe-agent@0.3.0` declares `@coinbase/agentkit@^0.2.0` as a peer, while the current AgentKit is `0.10.x`. `npm install` still needs `--legacy-peer-deps`. The peer range should be widened or updated.

3. **Breaking action-name changes in 0.3.0.** `instant_borrow` no longer exists. The action surface is now `get_markets`, `get_loan`, `post_lend_intent`, `post_borrow_intent`, `match_intents`, `request_credit`, `check_credit_status`, `repay_credit`, etc. Any code or docs that referenced the 0.2.0 names needs to be updated.

## Finding #2: API Key "Label" input lost focus after every keystroke - RESOLVED

**Severity:** Medium. Fixed since I originally reported.

When creating an API key in the developer dashboard, the "Label (optional)" input lost focus after every single character I typed - I had to click back into the field for each letter. Looked like the parent component was re-rendering on every onChange. Fixed now.

**Environment:** Brave, macOS, `dev-dashboard.floelabs.xyz`, originally observed April 30, 2026. Screenshot: `images/api-key-focus-bug.png`.


## Finding #3: API Error Messages Could Be More Specific - RESOLVED

**Status:** Resolved as of 2026-05-11. The error response now includes `primaryReason`, `suggestion`, `rejectionsByCode`, and richer `closestOffers` (with `maxLtvBps`, `minDuration`, `maxDuration`, `minFillAmount`). Original finding kept below as historical record.

**Original issue (kept for history):** `NoLiquidityError` didn't say *why* lenders rejected my borrow. I tried to borrow $10 USDC for 7 days and got back a generic "no matching lend intents" with a list of closest offers. To figure out the real reason (the 7-day duration was below the lenders' 21-day minimum), I had to query `/v1/credit/offers` separately and manually compare parameters against each offer's constraints. This added a lot of debugging time.

**Now (2026-05-11):** The error response includes `primaryReason`, `suggestion`, `rejectionsByCode`, and richer `closestOffers` fields - exactly the kind of structured "why did it fail" data I was hoping for. Much faster to debug now.


## Finding #4: I could not figure out what `minLtvBps` does, and it kept blocking my borrow

**Severity:** High. This was the main thing that blocked my first borrow.

**What I saw:**

1. **The docs give a default but do not say what the field does.** The gitbook page for `/v1/credit/instant-borrow` lists the field as `"minLtvBps  string  No  Min LTV (default: 8000 = 80%)"`. That is all. The page does not say if it is a floor or a ceiling, if it applies to the borrower or the lender, or how it relates to the lender's `maxLtvBps`.

2. **Leaving `minLtvBps` out gives `NoLiquidityError` even when offers look like they should match.** With `minLtvBps` not set (so it uses the default of `8000`), this request was rejected:
   ```json
   POST /v1/credit/instant-borrow
   {
     "marketId": "0xfe92...2930",
     "borrowAmount":     "10000000",
     "collateralAmount": "20000000000000000",
     "maxInterestRateBps": "600",
     "duration": "2592000"
   }
   ```
   Response:
   ```json
   {
     "error": "NoLiquidityError",
     "closestOffers": [
       { "rate": 50,  "available": 5000000 },
       { "rate": 290, "available": 1000000000 },
       { "rate": 500, "available": 990000000 }
     ]
   }
   ```
   At least one of the closest offers (990 USDC at rate 500) is big enough, cheap enough, and long enough. So the failure is some other reason, probably LTV.

3. **Setting `minLtvBps` low did not help.** I tried `minLtvBps: "1"` (the lowest value the API accepts, since `"0"` is rejected). The same `NoLiquidityError` came back with the same close offers.

4. **The error does not say which rule failed.** `NoLiquidityError` plus a list of close offers reads like "there is no money to lend." It does not say if the failure was on size, rate, duration, borrower LTV, lender LTV, oracle price, or something else. A developer cannot tell which knob to turn next.

5. **Where the default comes from in the SDK:** `node_modules/floe-agent/dist/schemas.js`
   ```js
   minLtvBps: z.string().default("8000")
     .describe("Minimum LTV in basis points (default: 8000 = 80%).")
   ```
   The SDK only repeats the same short label as the docs.

**Workaround in the code:** [circuit-1-research-agent/index.ts](circuit-1-research-agent/index.ts:101-107) sends `minLtvBps: "1"`. This avoids the 400 from `"0"` but does not by itself produce a successful borrow.

**Open questions for Floe:**
1. Is there a minimum collateral value in USD I'm missing?
2. Can I get the oracle price the matcher uses? (To verify my LTV calculation)
3. Is there a way to see WHY each offer was rejected in the error response?
4. Why is minLtvBps defaulting to 8000 in the SDK? (Seems to reject most 
   natural over-collateralized positions)

**Environment:**
- Network: Base mainnet
- Wallet: `0x8F669B63B3111C8C680Ddd87ea75518cEb860593` (`floe-circuit-1`)
- floe-agent version: 0.2.0
- Date: 2026-05-01


## Finding #5: The SDK and the REST API do not agree on what is valid

**Severity:** Medium. Easy to run into, slow to debug.

**Issue:** The rules in the `floe-agent` SDK and the rules the REST API enforces are not the same. A request that the SDK says is fine can still be rejected by the server.

**Examples I saw in this assignment:**

1. **`minLtvBps`: the SDK accepts any string, the API only accepts 1 to 10000.**
   - SDK: `minLtvBps: z.string().default("8000")` (no minimum, no maximum). See `node_modules/floe-agent/dist/schemas.js`.
   - API: returns `400 Invalid request body` with `"Must be between 1 and 10000"` when the request includes `"0"`.
   - So the SDK let me build a request with `"0"`. I sent it. The server for REST API returned an error

2. **The rule `maxLtvBps >= minLtvBps` is checked by the API but not by the SDK.**
   - Sending `minLtvBps: "10000"` without setting `maxLtvBps` returns `400 Invalid request body` with `"maxLtvBps must be >= minLtvBps"`.
   - The SDK does not check the two fields against each other, so a request that passes the SDK's type check can still fail once it reaches the server.

3. **The valid range and the cross-field rule are not in the public docs.** The gitbook page for `/v1/credit/instant-borrow` documents the default for `minLtvBps` (`"Min LTV (default: 8000 = 80%)"`) but does not list the valid range (`1` to `10000`) and does not mention the rule that `maxLtvBps` must be at least `minLtvBps`. The only way I learned these was by sending a request and reading the 400 response. Other fields probably have the same problem; I did not check them all.

**Why this matters:**

- A developer trusts the SDK types. Getting a 400 from the API after the SDK said the request was fine is confusing and slow to debug.
- Anyone who generates typed clients from the SDK (or from an OpenAPI spec, if Floe has one) will end up with clients that lie about what the API accepts.
- Rules that only show up in 400 responses are easy to miss until you trip over them, which slows down onboarding.

**Open questions for Floe:**
- Are there other cross-field rules (besides `maxLtvBps >= minLtvBps`) that the SDK does not check?
- Is there a single source of truth (OpenAPI spec, JSON schema, internal definition) that both the SDK and the API are meant to follow?

**Environment:**
- API: `credit-api.floelabs.xyz`
- SDK: `floe-agent` 0.2.0
- Date: 2026-05-01


## Finding #6: `floe-agent` npm package has no repository link

**Severity:** Low. Easy to fix, but it makes the package harder to trust and harder to file issues against.

The npm metadata for `floe-agent@0.2.0` does not include `repository`, `homepage`, or `bugs` fields. The published tarball is still visible on the npm "Code" tab, but there is no link to the canonical source repo (e.g. GitHub), no "Repository" or "Issues" entry in the npm sidebar, and `npm repo floe-agent` and `npm bugs floe-agent` do not work.

Adding `"repository"` and `"bugs"` blocks to `package.json` is a small change and would let users get to the source history, file issues, and contribute fixes.

**Environment:**
- Package: `floe-agent` 0.2.0 on npm
- Date: 2026-05-01


## Finding #7: There is no public REST API for Base Sepolia (Update: Floe supports base mainnet only)

**Severity:** High. Blocks anyone trying to run the quickstart on testnet.

The only documented Credit API URL is `https://credit-api.floelabs.xyz`. Calling `/v1/markets` returns markets whose token addresses are Base mainnet (USDC `0x833589...02913`, cbBTC `0xcbB7C0...33Bf`). There is no `/sepolia` path, no `X-Network` header, and no separate testnet host listed in the docs. So a developer with a funded Base Sepolia wallet cannot complete a borrow through the REST API, even though Floe deploys testnet contracts (matcher `0xF351...1B2E`, oracle `0x7102...03a5`).

Either a testnet REST endpoint should exist (and be documented), or the docs should clearly say the REST API is mainnet-only and point testnet users at on-chain calls.

**Environment:**
- API: `credit-api.floelabs.xyz`
- Date: 2026-05-01


## Finding #8: MCP server docs snippet does not compile against current `@modelcontextprotocol/sdk`

**Severity:** Low. Code copied straight from the docs fails to type-check.

The custom-agent example on https://floe-labs.gitbook.io/docs/developers/mcp-server uses an older shape of the MCP client SDK. Two issues against the current `@modelcontextprotocol/sdk`:

1. **`Client` constructor is missing `version`.** Docs show `new Client({ name: "my-defi-agent" })`, but the SDK's `Implementation` type requires both `name` and `version`. Result: `Property 'version' is missing in type '{ name: string; }'`.

2. **`callTool` is shown with positional args.** Docs show `client.callTool("get_markets", {})`, but the current SDK takes a single object: `client.callTool({ name: "get_markets", arguments: {} })`. Result: `Argument of type 'string' is not assignable to parameter of type '{ name: string; ... }'`.

Fix in the docs to:
```ts
const client = new Client({ name: "my-defi-agent", version: "1.0.0" });
const markets = await client.callTool({ name: "get_markets", arguments: {} });
```

**Environment:**
- Package: `@modelcontextprotocol/sdk` (latest at install time)
- Date: 2026-05-04


## Finding #9: `request_credit` asks the RPC for too many blocks at once

**Severity:** High. It is the first read action in the quickstart, and it fails for most new developers.

**What the SDK does:** When you call `request_credit`, the SDK asks the RPC for every "lend offer posted" event from the day the matcher contract was deployed until now. That is one big call, with no splitting.

**Evidence in the SDK source:**

```js
// node_modules/floe-agent/dist/floeActionProvider.js
const logs = await this.publicClient.getContractEvents({
  address: this.matcherAddress,
  ...
  fromBlock: MATCHER_DEPLOYMENT_BLOCK,   // fixed start block
  toBlock: "latest",
});
```

```js
// node_modules/floe-agent/dist/constants.js:532
export const MATCHER_DEPLOYMENT_BLOCK = 40499040n;
```

```ts
// node_modules/floe-agent/dist/types.d.ts
interface FloeConfig {
  lendingIntentMatcherAddress: Address;
  lendingViewsAddress: Address;
  knownMarketIds: Bytes32[];
  rpcUrl?: string;
}
// No option to change the start block or split the call.
```

Today the start block is ~40.5M and the latest block is ~42.5M. That is about 2 million blocks of history in one call.

**Why this fails:** Most RPC providers cap how many blocks one log call can cover. The SDK asks for far more than the free tiers allow:

| RPC | Free-tier limit per log call |
|---|---|
| `https://mainnet.base.org` (public) | 10,000 blocks |
| Alchemy free tier | 10 blocks |
| QuickNode free tier | ~10,000 blocks |
| Paid tiers | No real limit |

So a new developer following the quickstart with a free RPC always sees an error on the first call. The error comes back as plain text inside the action's response, so it looks like a config mistake instead of a design choice in the SDK.

**Repro:**
```ts
const agentkit = await AgentKit.from({
  walletProvider, // Base mainnet
  actionProviders: [floeActionProvider({ rpcUrl: "https://mainnet.base.org" })],
});
// returns text containing:
// "Error browsing credit offers: eth_getLogs is limited to a 10,000 range"
await agentkit.getActions()
  .find((a) => a.name.endsWith("_request_credit"))!
  .invoke({ marketId: "0xfe92...2930" });
```

**Other SDK actions are fine.** `get_markets`, `manual_match_credit`, `check_credit_status`, `repay_credit`, and `get_credit_remaining` all read one piece of contract state or send a transaction. None of them scan logs. The wall is only on offer discovery.

**Workaround used in circuit-1:** Get the list of lend offers from the MCP server (`get_open_lend_intents`) or the REST API (`/v1/credit/offers`). Both use Floe's own server-side index, so no log scan and no RPC limit. Pass the offer hash into the SDK's `manual_match_credit` for the signed step.

**Suggested fixes, in order of preference:**
1. **Split the call.** Walk the block range in small chunks (e.g. 10,000 blocks at a time) and join the results. Free RPCs would then work.
2. **Let developers set a start block.** Add a `fromBlock` option to `FloeConfig` so they can ask only for recent history.
3. **Add a built-in indexer fallback.** A `useIndexer: true` option that gets offers from Floe's REST/MCP server. Signed actions still go straight to the chain.
4. At minimum, **say in the docs that a paid RPC is needed** so new developers know what to set up before their first call.

**Environment:**
- Package: `floe-agent@0.3.0` + `@coinbase/agentkit@0.10.4`
- RPCs tested: `https://mainnet.base.org`, Alchemy free tier
- Date: 2026-05-11


## Finding #10: Schema defaults in `floe-agent` actions are silently dropped when called through AgentKit

**Severity:** Medium. Causes confusing crashes deep inside the SDK on first use.

The `floe-agent` action schemas declare default values, for example in `manual_match_credit`:

```ts
// node_modules/floe-agent/dist/schemas.js
matcherCommissionBps: z.string().default("50"),
expirySeconds: z.string().default("300"),
```

A developer reading the schema (or the docs that describe these as optional with defaults) reasonably leaves them out of the call. But when the action runs, those fields are `undefined`, and the SDK does:

```js
// node_modules/floe-agent/dist/floeActionProvider.js
const expiry = now + BigInt(args.expirySeconds);   // BigInt(undefined) throws
```

The result is a generic crash returned as a plain string:

> `Error opening credit facility: Cannot convert undefined to a BigInt`

The error doesn't say which field was missing or that a default should have been applied. The developer has to read the SDK source to figure out which "optional" field they actually had to pass.

**Root cause:** AgentKit's `invoke(args)` passes the raw object straight to the action handler. It doesn't run `args` through the Zod schema's `parse`, so `.default(...)` is never evaluated. Every "optional with default" field becomes effectively required.

**Workaround:** pass every defaulted field explicitly, even the ones the schema says are optional. In circuit-1's `manual_match_credit` call we now pass `expirySeconds: "300"` and `matcherCommissionBps: "50"` even though both are documented as defaults.

**Suggested fixes:**
1. **Run args through the schema inside each action handler** so `.default(...)` actually takes effect. One-line change per action: `args = Schema.parse(args)`.
2. OR remove `.default(...)` from the schemas and document those fields as required.
3. Make error messages name the missing field - `Cannot convert undefined to a BigInt` plus a stack trace pointing to user code would have saved an hour.

**Environment:**
- Package: `floe-agent@0.3.0` + `@coinbase/agentkit@0.10.4`
- Date: 2026-05-11


## Finding #11: x402 SDK quietly requires a dashboard-created "Agent" before any call works

**Severity:** High. Every x402 action returns `Unauthorized` until the developer finds and completes an undocumented setup step in the dashboard.

**What the SDK quickstart says:** The [AgentKit TypeScript quickstart](https://floe-labs.gitbook.io/docs/frameworks/agentkit/agentkit-typescript) shows this snippet for x402 setup:

```ts
const x402 = x402ActionProvider({
  facilitatorUrl: "https://credit-api.floelabs.xyz/v1",
  facilitatorApiKey: process.env.FLOE_AGENT_API_KEY,
});
```

It doesn't say where `FLOE_AGENT_API_KEY` comes from. A reasonable assumption is that it's the same key you got from the "API Keys" page in the dashboard - the one used for MCP. It isn't.

**What's actually required:** A separate "Agent" must first be created from a different page of the dashboard: `dev-dashboard.floelabs.xyz/agents` → **Create agent** → fill in name, borrow limit, max rate, expiry. The dashboard provisions a Privy wallet server-side and submits an on-chain `setOperator` delegation. Only then does the Agent receive its own API key, which is what `FLOE_AGENT_API_KEY` must hold.

Without this step, every x402 action call (`get_credit_remaining`, `set_spend_limit`, `estimate_x402_cost`, `x402_fetch`, etc.) returns:

```
## Credit Remaining (or any other action)
Error: Unauthorized
```

The error doesn't say what's missing or where to fix it. A developer with a valid MCP key reasonably assumes their setup is complete and spends time debugging code or env wiring instead of looking for an additional dashboard step.

**How we figured it out:** Only after the `Unauthorized` errors persisted across re-keying, re-running, and verifying the env var did a screenshot of the dashboard's "Agents" tab make it obvious that the credentials live somewhere else entirely.

**Suggested fixes:**
1. **Add the Agent-creation step to the SDK quickstart.** One paragraph + a screenshot of the dashboard page is enough.
2. **Make the error message actionable.** Replace `Error: Unauthorized` with `Error: No Agent associated with this API key. Create one at dev-dashboard.floelabs.xyz/agents`.
3. **Distinguish the two key types in the dashboard UI and env conventions.** Side-by-side in `.env.example`:
   ```
   FLOE_API_KEY=...        # for MCP server access
   FLOE_AGENT_API_KEY=...  # for x402 actions; requires a dashboard-created Agent
   ```

**Validation after fix:** After creating an agent with Borrow Limit 100 USDC, Max Rate 15%, Expiry 30 days, the same smoke test (`npm run circuit-1:awareness`) returns real data - see [circuit-1-research-agent/results/awareness-2026-05-11.json](../circuit-1-research-agent/results/awareness-2026-05-11.json).

**Environment:**
- Package: `floe-agent@0.3.0` + `@coinbase/agentkit@0.10.4`
- Dashboard: `dev-dashboard.floelabs.xyz`
- Date: 2026-05-11


## Finding #12: Docs don't say Floe's facilitator URL is payer-only

**Severity:** Low.

`https://credit-api.floelabs.xyz` works for *paying* (Bearer-auth via `FLOE_AGENT_API_KEY`), but `@x402/hono`'s `HTTPFacilitatorClient` can't use it on the server side - gets `401 Missing required auth headers`. Server-side x402 verification needs a different facilitator (e.g. `https://facilitator.openx402.ai`).

This is fine as architecture (Floe layers credit on top of vanilla x402, doesn't compete with merchant-side facilitators), but the x402 docs page doesn't say it. A developer building both sides wastes time trying the same URL on both.

**Fix:** One line on the x402 component page: *"Floe is the payer-side facilitator. Server-side x402 verification uses any standard facilitator (e.g. OpenX402)."*

**Environment:** `@x402/hono@2.11.0`, `floe-agent@0.3.0`, 2026-05-12


## Finding #13: Floe's "x402 directory" advertised endpoints that didn't work - DIRECTORY OVERHAULED

**Status (2026-06-05):** Floe reorganized the directory into new categories (Compute, Voice, Image, Text, Search, Browser, Agent Tools). I tested the new entries and several actually work - Exa Contents (`api.exa.ai/contents`), Exa Search (`api.exa.ai/search`), and Tavily Search (`x402.tavily.com/search`) all return canonical x402 402 responses and successfully complete through Floe's facilitator. The originally-broken media-gen URLs (Spraay, Imference, Genbase, Kodo) are no longer listed. Big improvement.

Two smaller things still worth flagging from the rewritten directory:
- Some providers (Firecrawl on the Text page, Venice AI on Compute) appear in the listing but I couldn't get x402 working - Firecrawl returned a 401 expecting its own bearer token, and Venice's 402 advertised a $10 upfront authorization which is too high for most testing.
- The SDK-level error masking - `x402_fetch` still returns just `Facilitator error: blocked_destination` rather than the structured `reason` field (dns_failure, tls_error, status_code) that `/v1/proxy/check` already exposes. Worth piping through.

**Original issue (kept for history):** Initially probed 9 endpoints from across the (then-current) directory and **0 of 9** returned HTTP 402:
- DNS doesn't resolve: `api.spraay.ai`, `api.imference.com`
- TLS broken: `api.genbase.ai`, `api.kodo.ai`
- Wrong path / 404 on POST: `api.firecrawl.dev/v1/x402/scrape`, `api.exa.ai/x402/search`, `api.soundside.ai/v1/generate`
- Reachable but not x402, returns own 401: `api.freepik.com/v1/x402/generate`, `api.firecrawl.dev/v1/x402/search`

A developer trusting the "Floe compatible: Yes" badge would have hit a wall on their first paid call. The directory rewrite addresses this for most of the new entries.

**Suggestion:** Audit the directory in CI against `/v1/proxy/check` (it would catch Firecrawl/Venice-style misalignment) and pipe the real `reason` field through to `x402_fetch` errors.

**Environment:** `floe-agent@0.3.0`, originally observed 2026-05-14; new directory verified 2026-06-05.


## Finding #14: Floe's facilitator couldn't parse standard x402 402-response format - RESOLVED

**Status (2026-06-08):** Alex shipped a v2 facilitator update on 2026-05-14 that improved the parse error (`invalid_base64` with `detail` field), which let me pin the exact mismatch: my `@x402/hono` output was URL-encoded JSON, Floe expects canonical base64 per the Coinbase x402 spec. I updated my own stub (`x402-image-stub/server.ts`) to emit base64, and the full payment round-trip now completes - circuit-1 successfully drew $0.02 from the credit line via the local stub end-to-end (see `circuit-1-research-agent/results/quickstart-2026-06-08.json`).

**Severity (original):** Critical. The official x402-foundation server reference libraries weren't immediately compatible, and the original error message didn't say why.

**Method:** Stood up a custom x402 server (this repo's `x402-image-stub/`), exposed it via `ngrok`, logged every incoming request, and tried four reasonable 402-response formats against Floe's `/v1/proxy/fetch`. Confirmed via server logs that Floe reaches the server every time and returns a parse error.

| Attempt | Format of 402 response | Floe's reply to the agent |
|---|---|---|
| 1 | `@x402/hono` default - base64 JSON in `payment-required` header | `Failed to parse PAYMENT-REQUIRED header` |
| 2 | No header - JSON requirements in response body only | `402 response missing PAYMENT-REQUIRED header` |
| 3 | Raw `JSON.stringify(...)` literal in `payment-required` header | `Failed to parse PAYMENT-REQUIRED header` |
| 4 | URL-encoded JSON in `payment-required` header | `Failed to parse PAYMENT-REQUIRED header` |

**Conclusions:**
- Floe absolutely requires a `payment-required` header (attempt 2 proves it).
- None of the three obvious JSON encodings work (1, 3, 4).
- The exact encoding/schema Floe expects isn't documented on the [x402 facilitator page](https://floe-labs.gitbook.io/docs/components/x402) or any of the developer pages I could find.
- The error message itself doesn't say which part failed (header name? encoding? schema?) - so trial-and-error has no signal beyond "still wrong."

This means any developer trying to build a Floe-compatible x402 server faces an undocumented black-box format. The official `@x402/*` libraries (Coinbase's reference impl) don't work.

**Fix, in priority order:**
1. **Document the exact 402-response wire format** Floe expects: header name (`payment-required` capitalization), encoding (base64? URL-encoded? raw? structured-fields?), schema (field names, scheme values).
2. **Make the error message actionable** - `Failed to parse PAYMENT-REQUIRED header` should at least say *what* failed (e.g. *"Expected base64-encoded JSON conforming to schema X; got base64 decode error"* or *"Unknown scheme: exact"*).
3. **Publish a minimal reference x402 server** in Floe's GitHub that demonstrates the correct format. Even 30 lines of Hono/Express that Floe testers verify works.
4. **Contribute to `@x402/*` upstream** if Floe's format is the canonical one, or accept the `@x402/*` format if not.

**Environment:** `@x402/hono@2.11.0`, `floe-agent@0.3.0`, 2026-05-14. Server logs and the four stub variants are committed under `x402-image-stub/` for repro.

**Update 2026-05-14 (post Alex's v2 fix on credit-api):** The error message is now actionable - suggested fix #2 above is shipped. New response:

```json
{
  "error": "Failed to parse PAYMENT-REQUIRED header",
  "code": "invalid_base64",
  "detail": "PAYMENT-REQUIRED header is not valid base64"
}
```

With this we can confirm the exact mismatch: Floe's facilitator decodes the `PAYMENT-REQUIRED` header as base64. Our default `@x402/hono` output was URL-encoded JSON. Per Coinbase's [x402 FAQ](https://docs.cdp.coinbase.com/x402/support/faq) the canonical spec is:

> *"Parse the PAYMENT-REQUIRED header (base64-encoded payment requirements)."*

So **Floe is spec-correct** and `@x402/hono` is non-compliant for our use. Resolution path: replaced `@x402/hono`'s middleware in `x402-image-stub/server.ts` with a hand-rolled response that base64-encodes the header per the Coinbase spec. The remaining open work is a separate, upstream finding against the `@x402/*` reference libraries (out of scope here).


## Finding #15: `/v1/proxy/check` only sends GET, can't verify POST-only x402 endpoints

**Severity:** Medium. The documented debugging endpoint can't validate the majority of real x402 APIs.

Almost every paid x402 endpoint in the wild requires POST (image gen, search, scraping, data submission). Floe's `/v1/proxy/check` probes the URL with GET - POST-only endpoints return 404 or 405, and the probe wrongly reports `"x402": false`.

Repro:
```bash
# Our own stub returns proper 402 on POST, 404 on GET - yet:
curl "https://credit-api.floelabs.xyz/v1/proxy/check?url=https://<ngrok-url>/image"
# → {"x402":false,"status":404,"message":"This URL does not require x402 payment"}
```

**Fix:** Accept a `method` query param on `/v1/proxy/check` (default GET), or run an OPTIONS probe to discover allowed methods first.

**Environment:** Floe Credit API, 2026-05-14


## Finding #16: Docs use `FLOE_API_KEY` for examples that actually require the agent runtime key

**Severity:** Low (naming/docs). High confusion factor.

Two distinct keys exist with different scopes:
- `floe_live_*` - developer / dashboard-level key, used for managing agents
- `floe_*` - per-agent runtime key, used for x402 calls

The docs' curl examples (e.g. on the Media Generation directory page) show:
```
curl -X POST https://credit-api.floelabs.xyz/v1/proxy/fetch \
  -H "Authorization: Bearer $FLOE_API_KEY" ...
```

But `floe_live_*` fails on `/v1/proxy/fetch` with `Missing or invalid Authorization header`. Only `floe_*` (the runtime key) works. The variable name `$FLOE_API_KEY` suggests "the API key" - most developers will plug in the obvious one from the dashboard's API Keys page and hit confusion.

**Fix:** Rename the variable in docs to `$FLOE_AGENT_API_KEY` (or `$FLOE_RUNTIME_KEY`), and add a one-line note distinguishing the two key types on the API Keys docs page.

**Environment:** Floe docs (`developers/x402-directory/*` and similar), 2026-05-14


## Finding #17: Onramp "100+ countries supported" claim doesn't match Coinbase's actual coverage

**Severity:** Medium. Locks developers out of the documented funding path silently, with no soft-landing.

Floe's [Fiat on/off-ramp docs](https://floe-labs.gitbook.io/docs/components/onramp) state:

> *"Coverage: Visa, Mastercard, Apple Pay, Google Pay - ACH and SEPA bank transfers - 100+ countries supported"*

In practice clicking **"Buy USDC & deposit"** in the dashboard hands the user off to Coinbase, which responds:

> *"Buys Not Supported - Coinbase does not currently support buys in your country."*

The Floe dashboard surfaces Coinbase's rejection screen unchanged - no fallback path, no link to alternative funding instructions, no mention that "100+ countries" is actually constrained by the underlying provider's policies.

**Fix:**
1. Update the docs to clarify country coverage is limited by Coinbase's policies, and link to Coinbase's current supported-country list.
2. When the dashboard detects the user is in an unsupported country, surface a graceful fallback panel: "Direct USDC transfer" with the agent address + supported exchanges that can withdraw to Base.
3. Consider a second onramp provider as fallback (Stripe Onramp, Transak, MoonPay all support more countries than Coinbase Commerce).

**Environment:** Floe dashboard, 2026-05-14


## Finding #18: Agents disappeared from dashboard / API before their expiry - RESOLVED

**Status (2026-06-05):** Confirmed fixed by Floe. The agent I created on 2026-06-05 has been stable across multiple test runs and several days. No more "no agents yet" surprises.

**Severity (original):** High. Blocked multi-day developer workflows. Reproduced twice in 5 days.

**Original issue (kept for history):** Created an agent with 30-day expiry on 2026-05-11 (Borrow Limit 100, Max Rate 15%). On 2026-05-14, awareness probe returned `Error: Unauthorized` on every action and the agent was no longer visible in the dashboard, even though on-chain expiry should have been 2026-06-10. Recreated the same day. On 2026-05-16 the second agent was also gone - created 2026-05-14, expected live until 2026-06-13. Both times connected with the same dashboard wallet (`0x4b2E…677c`), dashboard showed "No agents yet," API key returned `Error: Unauthorized`, and on-chain expiry timestamps were still in the future.

**Environment:** Dashboard wallet `0x4b2E…677c`, both agents created via `dev-dashboard.floelabs.xyz/agents` UI with 30-day expiry, observed 2026-05-14 and 2026-05-16. Stable since 2026-05-23.


## Finding #19: Auto-borrow took longer than the docs suggested

**Severity:** High. It blocked my paid x402 testing both times I ran into it.

The dashboard banner mentions working capital lines opening in "usually a few seconds." In my testing the wait was longer:

- First time I created an agent and ran circuit-1, the loan sat in `pending_match` for a while. I was sick and only came back to it ~2 days later - by then it had matched.
- After circuit-1 used up the $0.02 of credit Floe had extended, my next x402 call triggered a fresh auto-borrow. That one is still in `pending_match` after several minutes today.

I think this depends on solver bots finding a matching lender intent on-chain, which can take some time. It would be really helpful if the docs reflected this - even a note like "matches typically resolve in seconds, but can take longer if no lender intent is available" would have set expectations.

One small thing that also confused me: each new x402 call that exceeds my `Available` balance seems to trigger its own match (rather than re-using a larger pre-borrow). So if my agent does many small calls, each one waits separately. Pre-borrowing a bigger chunk up front would probably be smoother.

Also, when I ran into this, the error message was `Insufficient credit - your credit line is fully utilized`. The same probe also showed `Headroom to Auto-Borrow: 99.98 USDC`, which read as contradictory. A message like "loan match pending - please retry in 60s" might be clearer.

**Possible improvements:**
1. Update the "a few seconds" copy to reflect a realistic range, or expose a "match latency" expectation per market.
2. Make the error messaging consistent with the headroom values - if there's pending credit being borrowed, it'd help to say so.
3. Maybe consider pre-borrowing a larger chunk once an agent is funded, so smaller calls don't each trigger a new match.

**Environment:** Floe `credit-api`, agent `0xca89a98d…`, observed across 2026-06-05 to 2026-06-08.


## Finding #20: Two parallel x402 calls on one agent got into a race with each other

**Severity:** High for the "shared credit line" mental model - it might just need clearer guidance.

In circuit 3 I started by dispatching 3 workers in parallel from one Floe agent, each calling a different x402 endpoint at the same time. The simulated worker finished fine, but both real ones came back with either `Facilitator error: auto_borrow_in_progress` or `Insufficient credit - your credit line is fully utilized`.

It looks like Floe's auto-borrow can only handle one in-flight call at a time per agent - which makes sense once you know it, but the natural mental model is "one credit line, multiple workers can share it." So I tried switching to sequential dispatch instead. That still hit "fully utilized" sometimes because each fresh call needs its own lender match (overlap with Finding #19).

I think the cleanest fix on the developer side is one Floe agent per worker, so each has its own credit line. That feels worth a callout in the docs because right now nothing suggests this constraint exists.

**Possible improvements:**
1. Maybe the facilitator could queue concurrent x402 calls internally and serialize the borrows behind one outstanding loan - that way the developer doesn't have to think about it.
2. Or, a short note in the docs: "each agent supports one in-flight x402 call at a time; for parallel workloads, create one agent per worker."
3. The error message could also say something like "concurrent borrow in progress on this agent" - that would have saved me a debug round.

**Environment:** Floe `credit-api`, 1 agent + 3 workers dispatched via `Promise.all`, 2026-06-08.


## Finding #21: Header naming for hand-rolling an x402 server

**Severity:** Medium. Probably hits anyone building the merchant side from scratch instead of using the `@x402/*` middleware.

I built a small x402 server in Hono so I could test the protocol end-to-end. Two header things tripped me up:

1. **Floe sends the signed payment on the retry in a `PAYMENT-SIGNATURE` header**, not `X-PAYMENT`. I had assumed `X-PAYMENT` because that's the convention in a lot of payment APIs (and some earlier x402 examples I read). My server didn't recognize Floe's header and kept returning 402, which surfaced as "Payment was not accepted by resource server" on the client side.
2. **The server has to return a `PAYMENT-RESPONSE` header on success** - a plain 200 with body isn't enough. Floe interprets a 200 without `PAYMENT-RESPONSE` as "payment not accepted," same error string as above.

Both header names are mentioned in Coinbase's x402 docs, but the Floe docs focus on the facilitator (payer) side and the merchant side is more implicit. If you use `@x402/*` middleware it handles this for you, but I wanted to hand-roll it for the demo and that's where I bumped into it.

**Possible improvements:**
1. A short docs page covering "building an x402 server from scratch - exact headers in, exact headers out, response shape." This would also be useful as a self-test reference even for SDK users.
2. The error `Payment was not accepted by resource server` could include a hint - "server returned 402 again" vs "server returned 200 without PAYMENT-RESPONSE" - so the developer knows which half to debug.

**Environment:** Floe `credit-api`, custom Hono server (see `x402-image-stub/`), 2026-06-08.


