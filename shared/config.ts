import dotenv from "dotenv";
dotenv.config();

export const config = {
  // CDP Configuration
  cdp: {
    apiKeyId: process.env.CDP_API_KEY_ID!,
    apiKeySecret: process.env.CDP_API_KEY_SECRET!,
    walletSecret: process.env.CDP_WALLET_SECRET!,
  },

  // Network Configuration
  network: {
    id: process.env.NETWORK_ID || "base-sepolia",
    chainId: process.env.NETWORK_ID === "base-mainnet" ? 8453 : 84532,
    rpcUrl:
      process.env.NETWORK_ID === "base-mainnet"
        ? "https://mainnet.base.org"
        : "https://sepolia.base.org",
  },

  // Floe Configuration
  floe: {
    contract: process.env.FLOE_CONTRACT || "0xF351eDF229ded7E2e2b23E44c70e9964CbA91B2E",
    defaultMaxRate: 1200, // 12% APR in basis points
    defaultDuration: 2592000, // 30 days in seconds
  },

  // x402 API Endpoints
  x402: {
    firecrawl: "https://api.firecrawl.dev/v1",
    exa: "https://api.exa.ai",
    minifetch: "https://minifetch.xyz",
  },
};

// Validation
if (!config.cdp.apiKeyId || !config.cdp.apiKeySecret) {
  throw new Error("CDP credentials not found in .env file");
}