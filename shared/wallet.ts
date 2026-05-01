import { CdpEvmWalletProvider } from "@coinbase/agentkit";
import { CdpClient } from "@coinbase/cdp-sdk";
import { config } from "./config.js";

export const CIRCUITS = ["circuit-1", "circuit-2", "circuit-3"] as const;
export type CircuitId = (typeof CIRCUITS)[number];

const WALLET_NAME_PREFIX = "floe-";

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

export async function getWalletProvider(circuit: CircuitId) {
  const cdp = getCdpClient();
  const account = await cdp.evm.getOrCreateAccount({
    name: WALLET_NAME_PREFIX + circuit,
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
