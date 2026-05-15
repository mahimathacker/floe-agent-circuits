// x402 image stub — hand-rolled 402 response with base64-encoded
// `PAYMENT-REQUIRED` header, matching the canonical x402 spec per
// Coinbase's docs:
//   https://docs.cdp.coinbase.com/x402/support/faq
//   "Parse the PAYMENT-REQUIRED header (base64-encoded payment requirements)."
//
// We bypass @x402/hono's middleware because its current output is
// URL-encoded (non-spec), which Floe's facilitator correctly rejects.
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
    const requirementsJson = JSON.stringify(requirements);
    const requirementsB64 = Buffer.from(requirementsJson, "utf8").toString("base64");
    console.log(
      "→ No X-PAYMENT yet — returning 402 with BASE64-encoded PAYMENT-REQUIRED header",
    );
    return new Response(requirementsJson, {
      status: 402,
      headers: {
        "content-type": "application/json",
        "PAYMENT-REQUIRED": requirementsB64,
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
console.log(`x402-image-stub listening on http://localhost:${PORT}`);
console.log(`POST /image → $0.02 USDC payable to ${PAY_TO} (Base mainnet)`);
console.log("PAYMENT-REQUIRED header is base64-encoded JSON (per Coinbase x402 spec)");
