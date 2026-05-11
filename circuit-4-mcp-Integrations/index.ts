import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const client = new Client({ name: "my-defi-agent", version: "1.0.0" });
// @ts-expect-error MCP SDK types don't satisfy exactOptionalPropertyTypes
await client.connect(new StreamableHTTPClientTransport(
  new URL("https://mcp.floelabs.xyz/mcp"),
  { requestInit: { headers: { "Authorization": "Bearer " + process.env.FLOE_API_KEY } } }
));
const markets = await client.callTool({ name: "get_markets", arguments: {} });
console.log(markets);