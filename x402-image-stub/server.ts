// Minimal x402-paywalled image-generation stub for circuit 2.
//
// Hono + @x402/hono middleware wrap one POST route with the x402
// payment-required dance. The agent in circuit 2 calls this URL via
// `x402_fetch`; Floe's facilitator settles the USDC payment to our
// own CDP wallet (we pay ourselves — net cost is just gas).
//
// For Wednesday's demo:
//   1. `npm run x402-server`     — starts server on localhost:8787
//   2. `ngrok http 8787`         — exposes a public URL
//   3. Put the ngrok URL into IMAGE_URLS in circuit-2/index.ts
//   4. `npm run circuit-2`       — agent borrows + pays + "generates"

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

const PAY_TO = process.env.X402_PAY_TO as `0x${string}` | undefined;
if (!PAY_TO) {
  throw new Error(
    "X402_PAY_TO env var missing — set it to your shared CDP wallet address (0x2cEC5e69…)",
  );
}

const PORT = Number(process.env.PORT ?? "8787");
// Server-side facilitator: just needs to verify payments landed on-chain.
// OpenX402's public facilitator is live on Base mainnet, no key/KYC needed.
// The agent side separately uses Floe's facilitator to pay — two different
// facilitators is fine as long as the underlying USDC transfer is real.
const FACILITATOR_URL =
  process.env.X402_FACILITATOR_URL ?? "https://facilitator.openx402.ai";

const app = new Hono();

const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitator).register(
  "eip155:8453", // Base mainnet
  new ExactEvmScheme(),
);

app.use(
  paymentMiddleware(
    {
      "POST /image": {
        accepts: {
          scheme: "exact",
          price: "$0.02",
          network: "eip155:8453",
          payTo: PAY_TO,
        },
        description: "Generate an image (paid via x402, $0.02 USDC)",
      },
    },
    resourceServer,
  ),
);

app.get("/health", (c) => c.text("ok"));

app.post("/image", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { prompt?: string };
  const prompt = body.prompt ?? "unspecified";

  // Deterministic placeholder so the demo is reproducible.
  // A production server would call an actual image model here.
  return c.json({
    prompt,
    imageUrl: `https://picsum.photos/seed/${encodeURIComponent(prompt)}/512/512`,
    generatedAt: new Date().toISOString(),
  });
});

serve({ fetch: app.fetch, port: PORT });
console.log(`x402-image-stub listening on http://localhost:${PORT}`);
console.log(`POST /image → $0.02 USDC payable to ${PAY_TO} (Base mainnet)`);
console.log(`Facilitator: ${FACILITATOR_URL}`);
