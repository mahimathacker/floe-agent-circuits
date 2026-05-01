## FINDING #1: floe-agent package has broken dependencies
**Severity:** Critical - Blocks AgentKit integration
**What's broken:**
- `floe-agent` imports `@floe/credit-sdk` which doesn't exist on npm
- This makes `floe-agent` unusable out of the box

**Error:**
Cannot find package '@floe/credit-sdk' imported from
/node_modules/floe-agent/dist/creditClientAdapter.js

**Impact:**
- Developers cannot install and use floe-agent
- Blocks all AgentKit integration workflows

**Suggested fix:**
- Publish `@floe/credit-sdk` to npm
- OR bundle it within `floe-agent`
- OR update floe-agent to not require it

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


## Finding #4: `minLtvBps` semantics are inverted from intuition; default 8000 silently rejects over-collateralized borrows

**Severity:** High — affects the most natural first-time borrow attempt

**Issue:** `minLtvBps` is a **borrower-side floor on the LTV the matcher will fill at** — meaning *"I want at least this much leverage."* Setting it *low* (e.g. `0`) is the most permissive; setting it *high* (e.g. `8000` = 80%) is the most restrictive. The default is `8000`, which silently rejects every offer for any borrower who over-collateralizes — the most natural first attempt.

The naming + default combination produces the worst possible UX:
- The intuitive read of "minLtvBps" is "minimum LTV I'm willing to *accept on the lender side*" (i.e. a safety check). It is not — it is "minimum LTV I want my own loan to be filled at."
- The default (80%) is restrictive, not permissive — a developer assumes "if I don't set it, anything works."
- The error you get when it triggers is `NoLiquidityError`, which blames supply rather than your own request.

**Reproduction:**
```json
POST /v1/credit/instant-borrow
{
  "marketId": "0xfe92...2930",
  "borrowAmount":     "10000000",          // $10 USDC
  "collateralAmount": "20000000000000000", // 0.02 WETH ≈ $50 → 20% LTV
  "maxInterestRateBps": "600",
  "duration": "2592000"
  // minLtvBps omitted → defaults to 8000 (80%)
}
```

**Response:**
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

The 990 USDC offer in the same market easily satisfies the 10 USDC ask at a rate well below the 6% cap — and the offer's `maxLtvBps` (8500) is fine with 20% LTV. But the borrower's **own** `minLtvBps` default of 80% rejects it.

**Where the default comes from:** `node_modules/floe-agent/dist/schemas.js`
```js
minLtvBps: z.string().default("8000")
  .describe("Minimum LTV in basis points (default: 8000 = 80%).")
```

**Why this is a UX problem:**
1. **Inverted intuition.** "Minimum LTV" reads as "I won't accept loans riskier than X" — a safety setting. The actual meaning is the opposite: "I won't accept loans more conservative than X." A reader cannot guess this from the field name.
2. **Restrictive default.** Defaulting to `8000` (the *most* leveraged setting) means every default request requires the borrower to be borrowing 80%+ against their collateral. New users naturally over-collateralize for safety; the default punishes this.
3. **Error message blames liquidity, not the borrower's own filter.** `NoLiquidityError` plus a `closestOffers` array implies "supply is thin." A developer wastes time investigating the offer book when the issue is the borrower's own knob.
4. **Undocumented in the public Credit API docs.** The 8000 default is in the SDK schema (`node_modules/floe-agent/dist/schemas.js`) but not surfaced in the gitbook docs at `/v1/credit/instant-borrow`. Discovery requires grepping `node_modules` or filing a support ticket.

**Workaround (applied in [circuit-1-research-agent/index.ts](circuit-1-research-agent/index.ts:101-107)):**
```json
"minLtvBps": "0"   // floor of 0 = accept any LTV the offer side allows
```

**Recommendations for Floe:**
1. **Change the default to `"0"`.** Most permissive, least surprising. Borrowers who want a leverage floor can opt in.
2. **Rename the field** to something self-explanatory: `minLeverageBps`, `minUtilizationBps`, or `requireMinLtvBps`. The current name actively misleads — multiple developers (us included) inferred the opposite meaning from it.
3. **Document the field in the public Credit API docs** with a worked example showing both a leverage-seeking borrow (`minLtvBps: "7000"`) and a safety-first borrow (`minLtvBps: "0"`).
4. **Distinguish the failure mode in `NoLiquidityError`.** When offers exist that satisfy size+rate+duration but fail the borrower's `minLtvBps` (or the lender's `maxLtvBps`), return a distinct violation:
   ```json
   {
     "error": "NoLiquidityError",
     "reason": "borrower_min_ltv_not_met",
     "computed_ltv_bps": 2000,
     "borrower_min_ltv_bps": 8000
   }
   ```

**Environment:**
- Network: Base Sepolia
- Wallet: 0x8F669B63B3111C8C680Ddd87ea75518cEb860593 (`floe-circuit-1`)
- floe-agent version: 0.2.0
- Date: 2026-05-01

