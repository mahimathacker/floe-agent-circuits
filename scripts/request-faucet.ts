import { config } from "../shared/config.js";
import { Logger } from "../shared/utils.js";
import { getWalletProvider, parseCircuitArg } from "../shared/wallet.js";

const logger = new Logger("Faucet");

const VALID_TOKENS = ["eth", "usdc", "eurc", "cbbtc"] as const;
type FaucetToken = (typeof VALID_TOKENS)[number];

async function requestFaucet() {
  if (config.network.id !== "base-sepolia") {
    logger.error(`Faucet only available on base-sepolia (current: ${config.network.id})`);
    process.exit(1);
  }

  const circuit = parseCircuitArg(process.argv[2]);
  const tokensArg = process.argv.slice(3);
  const tokens: FaucetToken[] = tokensArg.length
    ? (tokensArg as FaucetToken[])
    : ["eth", "usdc"];

  const invalid = tokens.filter((t) => !VALID_TOKENS.includes(t));
  if (invalid.length) {
    logger.error(`Unknown token(s): ${invalid.join(", ")}. Allowed: ${VALID_TOKENS.join(", ")}`);
    process.exit(1);
  }

  const walletProvider = await getWalletProvider(circuit);
  const address = walletProvider.getAddress() as `0x${string}`;
  logger.info(`${circuit} wallet: ${address}`);

  const cdp = walletProvider.getClient();
  const account = await cdp.evm.getAccount({ address });

  for (const token of tokens) {
    logger.info(`Requesting ${token.toUpperCase()}...`);
    const { transactionHash } = await account.requestFaucet({
      network: "base-sepolia",
      token,
    });
    logger.info(`  tx: ${transactionHash} — waiting for confirmation`);
    await walletProvider.waitForTransactionReceipt(transactionHash);
    logger.success(`  ${token.toUpperCase()} received`);
  }

  logger.success("Faucet requests complete");
}

requestFaucet().catch((err) => {
  logger.error("Faucet failed", err);
  process.exit(1);
});
