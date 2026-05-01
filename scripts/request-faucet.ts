import { formatEther, parseEther } from "viem";
import { config } from "../shared/config.js";
import { Logger } from "../shared/utils.js";
import { getWalletProvider, parseCircuitArg } from "../shared/wallet.js";

const logger = new Logger("Faucet");

const VALID_TOKENS = ["eth", "usdc", "eurc", "cbbtc"] as const;
type FaucetToken = (typeof VALID_TOKENS)[number];

const MAX_ETH_CALLS = 1100; // ~daily cap of 0.11 ETH at 0.0001 per drip
const BALANCE_REFRESH_EVERY = 25;
const DELAY_BETWEEN_CALLS_MS = 1500;
const RATE_LIMIT_BACKOFF_MS = 30_000;
const MAX_CONSECUTIVE_BACKOFFS = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function requestFaucet() {
  if (config.network.id !== "base-sepolia") {
    logger.error(`Faucet only available on base-sepolia (current: ${config.network.id})`);
    process.exit(1);
  }

  const circuit = parseCircuitArg(process.argv[2]);
  const tokenArg = process.argv[3] as FaucetToken | undefined;
  const targetArg = process.argv[4];

  if (tokenArg && !VALID_TOKENS.includes(tokenArg)) {
    logger.error(`Unknown token: ${tokenArg}. Allowed: ${VALID_TOKENS.join(", ")}`);
    process.exit(1);
  }

  const walletProvider = await getWalletProvider(circuit);
  const address = walletProvider.getAddress() as `0x${string}`;
  logger.info(`${circuit} wallet: ${address}`);

  const cdp = walletProvider.getClient();
  const account = await cdp.evm.getAccount({ address });

  const dripEth = async (token: "eth", targetWei: bigint) => {
    let balance = await walletProvider.getBalance();
    logger.info(`ETH balance: ${formatEther(balance)} → target: ${formatEther(targetWei)}`);
    if (balance >= targetWei) {
      logger.success("Target already met");
      return;
    }

    let calls = 0;
    let lastTx: `0x${string}` | undefined;
    let consecutiveBackoffs = 0;

    while (balance < targetWei && calls < MAX_ETH_CALLS) {
      try {
        const { transactionHash } = await account.requestFaucet({
          network: "base-sepolia",
          token,
        });
        lastTx = transactionHash;
        calls++;
        consecutiveBackoffs = 0;
        await sleep(DELAY_BETWEEN_CALLS_MS);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isRateLimited = msg.toLowerCase().includes("rate limit");

        if (isRateLimited && consecutiveBackoffs < MAX_CONSECUTIVE_BACKOFFS) {
          consecutiveBackoffs++;
          logger.warn(
            `Rate limited at call ${calls}. Backoff ${consecutiveBackoffs}/${MAX_CONSECUTIVE_BACKOFFS} — sleeping ${RATE_LIMIT_BACKOFF_MS / 1000}s...`,
          );
          await sleep(RATE_LIMIT_BACKOFF_MS);
          continue;
        }

        logger.warn(
          `Faucet stopped after ${calls} calls${isRateLimited ? " (likely daily cap reached)" : ""}: ${msg}`,
        );
        break;
      }

      if (calls % BALANCE_REFRESH_EVERY === 0) {
        if (lastTx) await walletProvider.waitForTransactionReceipt(lastTx);
        balance = await walletProvider.getBalance();
        logger.info(`  ${calls} calls — balance: ${formatEther(balance)}`);
      }
    }

    if (lastTx) await walletProvider.waitForTransactionReceipt(lastTx);
    balance = await walletProvider.getBalance();
    logger.success(`Final ETH balance: ${formatEther(balance)} after ${calls} calls`);

    if (balance < targetWei) {
      logger.warn(
        `Target ${formatEther(targetWei)} not reached. Try again later or lower the target.`,
      );
    }
  };

  if (tokenArg === "eth" && targetArg) {
    await dripEth("eth", parseEther(targetArg));
  } else {
    const tokens: FaucetToken[] = tokenArg ? [tokenArg] : ["eth", "usdc"];
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
  }

  logger.success("Faucet requests complete");
}

requestFaucet().catch((err) => {
  logger.error("Faucet failed", err);
  process.exit(1);
});
