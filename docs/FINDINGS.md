## FINDING #1: floe-agent package has broken dependencies

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
