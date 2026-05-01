import { getWalletProvider, type CircuitId } from "./wallet.js";

export async function getFloeAuthHeaders(circuit: CircuitId) {
  const walletProvider = await getWalletProvider(circuit);
  const address = walletProvider.getAddress();

  const timestamp = Math.floor(Date.now() / 1000);
  const message = `Floe Credit API\nTimestamp: ${timestamp}`;
  const signature = await walletProvider.signMessage(message);

  return {
    "X-Wallet-Address": address,
    "X-Signature": signature,
    "X-Timestamp": timestamp.toString(),
  };
}
