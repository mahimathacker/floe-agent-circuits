// shared/auth.ts
import { CdpEvmWalletProvider } from "@coinbase/agentkit";
import { config } from "./config.js";

export async function getFloeAuthHeaders() {
  // 1. Create wallet
  const walletProvider = await CdpEvmWalletProvider.configureWithWallet({
    apiKeyId: config.cdp.apiKeyId,
    apiKeySecret: config.cdp.apiKeySecret,
    walletSecret: config.cdp.walletSecret,
    networkId: config.network.id,
  });

  const address = await walletProvider.getAddress();
  
  // 2. Create timestamp
  const timestamp = Math.floor(Date.now() / 1000);
  
  // 3. Create message to sign
  const message = `Floe Credit API\nTimestamp: ${timestamp}`;
  
  // 4. Sign the message (EIP-191)
  const signature = await walletProvider.signMessage(message);
  
  return {
    "X-Wallet-Address": address,
    "X-Signature": signature,
    "X-Timestamp": timestamp.toString(),
  };
}