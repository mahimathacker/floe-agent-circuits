import { CdpEvmWalletProvider } from "@coinbase/agentkit";
import { CdpClient } from "@coinbase/cdp-sdk";
import { config } from "./config.js";

export const CIRCUITS = ["circuit-1", "circuit-2", "circuit-3"] as const;
export type CircuitId = (typeof CIRCUITS)[number];

// One CDP wallet across all circuits. The user is a single signing
// identity that owns and delegates to multiple Floe Agents — same shape
// as a real product. Fund this one address; every circuit uses it.
const SHARED_WALLET_NAME = "floe-main";

let cachedClient: CdpClient | undefined;

function getCdpClient(): CdpClient {
  if (!cachedClient) {
    cachedClient = new CdpClient({
      apiKeyId: config.cdp.apiKeyId,
      apiKeySecret: config.cdp.apiKeySecret,
      walletSecret: config.cdp.walletSecret,
    });
  }
  return cachedClient;
}

export async function getWalletProvider(_circuit: CircuitId) {
  const cdp = getCdpClient();
  const account = await cdp.evm.getOrCreateAccount({
    name: SHARED_WALLET_NAME,
  });
  return CdpEvmWalletProvider.configureWithWallet({
    apiKeyId: config.cdp.apiKeyId,
    apiKeySecret: config.cdp.apiKeySecret,
    walletSecret: config.cdp.walletSecret,
    networkId: config.network.id,
    address: account.address,
  });
}

export function parseCircuitArg(arg: string | undefined): CircuitId {
  if (CIRCUITS.includes(arg as CircuitId)) return arg as CircuitId;
  throw new Error(
    `Invalid or missing circuit name: '${arg ?? ""}'. Use one of: ${CIRCUITS.join(", ")}`,
  );
}
