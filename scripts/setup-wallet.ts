import { CdpEvmWalletProvider } from "@coinbase/agentkit";
import { config } from "../shared/config.js";
import { Logger } from "../shared/utils.js";

const logger = new Logger("Setup");

async function setupWallet() {
  try {
    logger.info("Setting up CDP wallet...");

    const walletProvider = await CdpEvmWalletProvider.configureWithWallet({
      apiKeyId: config.cdp.apiKeyId,
      apiKeySecret: config.cdp.apiKeySecret,
      walletSecret: config.cdp.walletSecret,
      networkId: config.network.id,
    });

    const address = walletProvider.getAddress();
    logger.success(`Wallet created: ${address}`);

    logger.info("Requesting testnet USDC from faucet...");
    
    // Request faucet (works on Base Sepolia)
    if (config.network.id === "base-sepolia") {
      logger.info("Note: Use Circle USDC faucet at https://faucet.circle.com");
      logger.info(`Send testnet USDC to: ${address}`);
    } else {
      logger.warn("Mainnet detected - you'll need real USDC");
    }

    logger.success("Setup complete!");
    console.log("\nNext steps:");
    console.log("1. Fund wallet with testnet USDC");
    console.log("2. Run: npm run circuit-1");
  } catch (error) {
    logger.error("Setup failed", error);
    process.exit(1);
  }
}

setupWallet();