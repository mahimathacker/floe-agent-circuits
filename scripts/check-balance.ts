import { formatEther } from "viem";
import { Logger } from "../shared/utils.js";
import { CIRCUITS, getWalletProvider, parseCircuitArg } from "../shared/wallet.js";

const logger = new Logger("Balance");

const WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as const;

const WETH_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

async function checkBalance(circuit: (typeof CIRCUITS)[number]) {
  const walletProvider = await getWalletProvider(circuit);
  const address = walletProvider.getAddress() as `0x${string}`;

  const [ethBalance, wethBalance] = await Promise.all([
    walletProvider.getBalance(),
    walletProvider.readContract({
      address: WETH_ADDRESS,
      abi: WETH_ABI,
      functionName: "balanceOf",
      args: [address],
    }),
  ]);

  logger.info(`${circuit} (${address})`);
  logger.info(`  ETH:  ${formatEther(ethBalance)}`);
  logger.info(`  WETH: ${formatEther(wethBalance)}`);
}

async function main() {
  const arg = process.argv[2];
  const targets = arg === "all" || arg === undefined ? [...CIRCUITS] : [parseCircuitArg(arg)];
  for (const circuit of targets) {
    await checkBalance(circuit);
  }
}

main().catch((err) => {
  logger.error("Balance check failed", err);
  process.exit(1);
});
