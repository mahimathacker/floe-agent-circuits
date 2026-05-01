import { CIRCUITS, getWalletProvider, parseCircuitArg } from "../shared/wallet.js";
import { Logger } from "../shared/utils.js";

const logger = new Logger("Setup");

async function setupWallet() {
  const arg = process.argv[2];
  const targets = arg === "all" || arg === undefined ? [...CIRCUITS] : [parseCircuitArg(arg)];

  for (const circuit of targets) {
    const walletProvider = await getWalletProvider(circuit);
    const address = walletProvider.getAddress();
    logger.success(`${circuit}: ${address}`);
  }

  console.log("\nNext steps:");
  console.log("1. npm run faucet -- circuit-1   (and circuit-2, circuit-3)");
  console.log("2. npm run wrap-eth -- circuit-1 0.05");
  console.log("3. npm run circuit-1");
}

setupWallet().catch((err) => {
  logger.error("Setup failed", err);
  process.exit(1);
});
