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

