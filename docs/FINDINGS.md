## FINDING #1: floe-agent package has broken dependencies — RESOLVED in 0.3.0
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

## Finding #2: Developer Dashboard UI Bug - API Key Label Input Loses Focus
**Severity:** Medium - Reduces UX quality

**Description:**
When creating an API key in the Developer Dashboard, the "Label (optional)" 
input field loses focus after typing a single character.

**Steps to Reproduce:**
1. Navigate to Developer Dashboard (dev-dashboard.floelabs.xyz)
2. Click "Create API Key" or equivalent button
3. Click into the "Label (optional)" text field
4. Type one character (e.g., "f")
5. Observe: cursor/focus disappears from the input field
6. Must click back into the field to type the next character

**Expected Behavior:**
Input should retain focus until user explicitly moves away (Tab key, click 
elsewhere, etc.)

**Actual Behavior:**
Focus is lost after every keystroke, requiring repeated clicks to type a 
multi-character label.

**Impact:**
- Frustrating user experience
- Slows down API key creation workflow
- May cause users to skip labeling keys entirely

**Likely Root Cause:**
React component re-rendering on every onChange event, causing input to 
lose controlled state. Common pattern:

```jsx
// Problematic code (example):
const [label, setLabel] = useState('');

// This causes re-render and focus loss:
<input value={label} onChange={(e) => setLabel(e.target.value)} />
```

**Suggested Fix:**
- Use useRef or uncontrolled component for the input
- OR ensure the parent component doesn't re-render on state change
- OR use React.memo() on the input component

**Environment:**
- Browser: Brave;
- OS: macOS
- Dashboard URL: dev-dashboard.floelabs.xyz
- Date: April 30, 2026

**Screenshot:**

![API Key Input Bug](images/api-key-focus-bug.png)


## Finding #3: API Error Messages Could Be More Specific

**Status:** Resolved as of 2026-05-11. The error response now includes `primaryReason`, `suggestion`, `rejectionsByCode`, and richer `closestOffers` (with `maxLtvBps`, `minDuration`, `maxDuration`, `minFillAmount`). Original finding kept below as historical record.

**Issue:** NoLiquidityError doesn't indicate why matching failed

**Context:**
Attempted to borrow $10 USDC for 7 days, received:
```json
{
  "error": "NoLiquidityError",
  "message": "No matching lend intents for 10000000...",
  "closestOffers": [...]
}
```

**Root Cause Analysis:**
After querying `/v1/credit/offers`, discovered available liquidity exists 
($990 USDC available), but the request failed because:
- Requested duration: 7 days (604800 seconds)
- Required minimum: 21 days (1814400 seconds)

**The Issue:**
The error message says "no matching lend intents" but doesn't specify 
WHY they don't match. The developer must:
1. Query /v1/credit/offers separately
2. Manually compare their parameters against offer constraints
3. Identify which constraint caused the mismatch

**Impact:**
- Increases debugging time
- Could cause developers to think there's no liquidity at all
- Requires extra API call to diagnose

**Recommendation:**
Enhance error response to include constraint violations:

```json
{
  "error": "NoLiquidityError",
  "message": "No matching lend intents",
  "violations": [
    {
      "constraint": "minDuration",
      "requested": "604800",
      "required": "1814400",
      "message": "Duration too short. Available lenders require minimum 21 days."
    }
  ],
  "closestOffers": [...]
}
```

**Workaround:**
Always query `/v1/credit/offers` first to check available terms before 
calling `/v1/credit/instant-borrow`.

**Severity:** Medium - Impacts developer experience but has workaround

**Environment:**
- Network: Base Sepolia testnet
- MarketId: 0xfe92656527bae8e6d37a9e0bb785383fbb33f1f0c7e29fdd733f5af7390c2930
- API: credit-api.floelabs.xyz


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
- Network: Base Sepolia
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


## Finding #7: There is no public REST API for Base Sepolia

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
3. Make error messages name the missing field — `Cannot convert undefined to a BigInt` plus a stack trace pointing to user code would have saved an hour.

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

It doesn't say where `FLOE_AGENT_API_KEY` comes from. A reasonable assumption is that it's the same key you got from the "API Keys" page in the dashboard — the one used for MCP. It isn't.

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

**Validation after fix:** After creating an agent with Borrow Limit 100 USDC, Max Rate 15%, Expiry 30 days, the same smoke test (`npm run circuit-1:awareness`) returns real data — see [circuit-1-research-agent/results/awareness-2026-05-11.json](../circuit-1-research-agent/results/awareness-2026-05-11.json).

**Environment:**
- Package: `floe-agent@0.3.0` + `@coinbase/agentkit@0.10.4`
- Dashboard: `dev-dashboard.floelabs.xyz`
- Date: 2026-05-11


## Finding #12: Docs don't say Floe's facilitator URL is payer-only

**Severity:** Low.

`https://credit-api.floelabs.xyz` works for *paying* (Bearer-auth via `FLOE_AGENT_API_KEY`), but `@x402/hono`'s `HTTPFacilitatorClient` can't use it on the server side — gets `401 Missing required auth headers`. Server-side x402 verification needs a different facilitator (e.g. `https://facilitator.openx402.ai`).

This is fine as architecture (Floe layers credit on top of vanilla x402, doesn't compete with merchant-side facilitators), but the x402 docs page doesn't say it. A developer building both sides wastes time trying the same URL on both.

**Fix:** One line on the x402 component page: *"Floe is the payer-side facilitator. Server-side x402 verification uses any standard facilitator (e.g. OpenX402)."*

**Environment:** `@x402/hono@2.11.0`, `floe-agent@0.3.0`, 2026-05-12


## Finding #13: Floe's "x402 directory" advertises endpoints that don't work

**Severity:** Critical. The headline x402 flow can't be completed with any endpoint Floe themselves list as compatible.

Probed 9 endpoints from across the directory (media gen, web search, scraping). **0 of 9** actually return HTTP 402:
- **DNS doesn't resolve:** `api.spraay.ai`, `api.imference.com`
- **TLS broken:** `api.genbase.ai`, `api.kodo.ai`
- **Wrong path / 404 on POST:** `api.firecrawl.dev/v1/x402/scrape`, `api.exa.ai/x402/search`, `api.soundside.ai/v1/generate`
- **Reachable but not x402, returns own 401:** `api.freepik.com/v1/x402/generate`, `api.firecrawl.dev/v1/x402/search`

A developer trusting the "Floe compatible: Yes" badge hits a wall on their first paid call.

The SDK error makes it worse — `x402_fetch` returns just `Facilitator error: blocked_destination` even though `/v1/proxy/check` has the underlying `reason` (dns_failure, tls_error, status_code). The detail isn't piped through.

**Fix:** (1) Audit the directory in CI against `/v1/proxy/check`; flag broken entries. (2) Pipe the real reason through to `x402_fetch` errors. (3) Link `/v1/proxy/check` from the docs as a debugging tool.

**Environment:** `floe-agent@0.3.0`, 2026-05-14


## Finding #14: Floe's facilitator can't parse any standard x402 402-response format; expected wire format is undocumented

**Severity:** Critical. The official x402-foundation server reference libraries are incompatible with Floe, and we can't even reverse-engineer the format without internal docs.

**Method:** Stood up a custom x402 server (this repo's `x402-image-stub/`), exposed it via `ngrok`, logged every incoming request, and tried four reasonable 402-response formats against Floe's `/v1/proxy/fetch`. Confirmed via server logs that Floe reaches the server every time and returns a parse error.

| Attempt | Format of 402 response | Floe's reply to the agent |
|---|---|---|
| 1 | `@x402/hono` default — base64 JSON in `payment-required` header | `Failed to parse PAYMENT-REQUIRED header` |
| 2 | No header — JSON requirements in response body only | `402 response missing PAYMENT-REQUIRED header` |
| 3 | Raw `JSON.stringify(...)` literal in `payment-required` header | `Failed to parse PAYMENT-REQUIRED header` |
| 4 | URL-encoded JSON in `payment-required` header | `Failed to parse PAYMENT-REQUIRED header` |

**Conclusions:**
- Floe absolutely requires a `payment-required` header (attempt 2 proves it).
- None of the three obvious JSON encodings work (1, 3, 4).
- The exact encoding/schema Floe expects isn't documented on the [x402 facilitator page](https://floe-labs.gitbook.io/docs/components/x402) or any of the developer pages I could find.
- The error message itself doesn't say which part failed (header name? encoding? schema?) — so trial-and-error has no signal beyond "still wrong."

This means any developer trying to build a Floe-compatible x402 server faces an undocumented black-box format. The official `@x402/*` libraries (Coinbase's reference impl) don't work.

**Fix, in priority order:**
1. **Document the exact 402-response wire format** Floe expects: header name (`payment-required` capitalization), encoding (base64? URL-encoded? raw? structured-fields?), schema (field names, scheme values).
2. **Make the error message actionable** — `Failed to parse PAYMENT-REQUIRED header` should at least say *what* failed (e.g. *"Expected base64-encoded JSON conforming to schema X; got base64 decode error"* or *"Unknown scheme: exact"*).
3. **Publish a minimal reference x402 server** in Floe's GitHub that demonstrates the correct format. Even 30 lines of Hono/Express that Floe testers verify works.
4. **Contribute to `@x402/*` upstream** if Floe's format is the canonical one, or accept the `@x402/*` format if not.

**Environment:** `@x402/hono@2.11.0`, `floe-agent@0.3.0`, 2026-05-14. Server logs and the four stub variants are committed under `x402-image-stub/` for repro.


## Finding #15: `/v1/proxy/check` only sends GET, can't verify POST-only x402 endpoints

**Severity:** Medium. The documented debugging endpoint can't validate the majority of real x402 APIs.

Almost every paid x402 endpoint in the wild requires POST (image gen, search, scraping, data submission). Floe's `/v1/proxy/check` probes the URL with GET — POST-only endpoints return 404 or 405, and the probe wrongly reports `"x402": false`.

Repro:
```bash
# Our own stub returns proper 402 on POST, 404 on GET — yet:
curl "https://credit-api.floelabs.xyz/v1/proxy/check?url=https://<ngrok-url>/image"
# → {"x402":false,"status":404,"message":"This URL does not require x402 payment"}
```

**Fix:** Accept a `method` query param on `/v1/proxy/check` (default GET), or run an OPTIONS probe to discover allowed methods first.

**Environment:** Floe Credit API, 2026-05-14


## Finding #16: Docs use `FLOE_API_KEY` for examples that actually require the agent runtime key

**Severity:** Low (naming/docs). High confusion factor.

Two distinct keys exist with different scopes:
- `floe_live_*` — developer / dashboard-level key, used for managing agents
- `floe_*` — per-agent runtime key, used for x402 calls

The docs' curl examples (e.g. on the Media Generation directory page) show:
```
curl -X POST https://credit-api.floelabs.xyz/v1/proxy/fetch \
  -H "Authorization: Bearer $FLOE_API_KEY" ...
```

But `floe_live_*` fails on `/v1/proxy/fetch` with `Missing or invalid Authorization header`. Only `floe_*` (the runtime key) works. The variable name `$FLOE_API_KEY` suggests "the API key" — most developers will plug in the obvious one from the dashboard's API Keys page and hit confusion.

**Fix:** Rename the variable in docs to `$FLOE_AGENT_API_KEY` (or `$FLOE_RUNTIME_KEY`), and add a one-line note distinguishing the two key types on the API Keys docs page.

**Environment:** Floe docs (`developers/x402-directory/*` and similar), 2026-05-14


