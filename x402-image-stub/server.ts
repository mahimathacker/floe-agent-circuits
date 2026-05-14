// x402 image stub — EXPERIMENTAL body-based 402 format.
//
// Floe's facilitator rejects @x402/hono's standard output (payment
// requirements in a base64-encoded `payment-required` HTTP header) with
// `Failed to parse PAYMENT-REQUIRED header`. This version puts the
// requirements in the response BODY as plain JSON — the older / more
// common x402 convention — to see if Floe accepts that instead.
//
// All requests are logged so we can see exactly what Floe sends and
// whether it ever returns with an X-PAYMENT header on the retry.

import { Hono } from "hono";
import { serve } from "@hono/node-server";

const PAY_TO = process.env.X402_PAY_TO as `0x${string}` | undefined;
if (!PAY_TO) {
  throw new Error("X402_PAY_TO env var missing");
}

const PORT = Number(process.env.PORT ?? "8787");
const USDC_BASE_MAINNET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const app = new Hono();

// Log every incoming request — we want to see Floe's request shape.
app.use("*", async (c, next) => {
  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((v, k) => {
    headers[k] = v;
  });
  console.log(`\n──── INCOMING ${c.req.method} ${c.req.path} ────`);
  console.log("Headers:", JSON.stringify(headers, null, 2));
  const bodyText = await c.req.text().catch(() => "");
  if (bodyText) console.log("Body:", bodyText);
  console.log("─────────────────────────────────────");
  await next();
});

app.get("/health", (c) => c.text("ok"));

app.post("/image", async (c) => {
  // Check for X-PAYMENT header (sent by Floe on the retry after signing).
  // We accept any non-empty value as "valid" for the experiment — the
  // goal is to verify Floe can parse our 402, sign, and return.
  const paymentHeader =
    c.req.header("x-payment") ?? c.req.header("X-PAYMENT") ?? "";

  if (!paymentHeader) {
    // Try variant 2: raw JSON in `payment-required` header (no base64).
    const requirements = {
      x402Version: 2,
      error: "Payment required",
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453",
          amount: "20000",
          asset: USDC_BASE_MAINNET,
          payTo: PAY_TO,
          maxTimeoutSeconds: 300,
          extra: { name: "USD Coin", version: "2" },
        },
      ],
    };
    console.log("→ No X-PAYMENT yet — returning 402 with URL-ENCODED JSON header");
    return new Response(JSON.stringify(requirements), {
      status: 402,
      headers: {
        "content-type": "application/json",
        "payment-required": encodeURIComponent(JSON.stringify(requirements)),
      },
    });
  }

  // X-PAYMENT header present — Floe signed and is retrying.
  // In a production server we'd validate the EIP-3009 signature here.
  // For the experiment we just log and return success.
  console.log(
    "→ X-PAYMENT received (first 80 chars):",
    paymentHeader.slice(0, 80),
  );
  let body: { prompt?: string } = {};
  try {
    body = (await c.req.json()) ?? {};
  } catch {
    /* ignore */
  }
  const prompt = body.prompt ?? "unspecified";
  return c.json({
    prompt,
    imageUrl: `https://picsum.photos/seed/${encodeURIComponent(prompt)}/512/512`,
    generatedAt: new Date().toISOString(),
  });
});

serve({ fetch: app.fetch, port: PORT });
console.log(
  `x402-image-stub (experimental body-based 402) listening on http://localhost:${PORT}`,
);
console.log(`POST /image → $0.02 USDC payable to ${PAY_TO} (Base mainnet)`);
console.log("Returning 402 with requirements in BODY (no payment-required header)");
