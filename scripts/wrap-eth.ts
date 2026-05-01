import { encodeFunctionData, formatEther, parseEther } from "viem";
import { Logger } from "../shared/utils.js";
import { getWalletProvider, parseCircuitArg } from "../shared/wallet.js";

const logger = new Logger("WrapETH");

const WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as const;

const WETH_ABI = [
  { name: "deposit", type: "function", stateMutability: "payable", inputs: [], outputs: [] },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

async function wrapEth() {
  const circuit = parseCircuitArg(process.argv[2]);
  const amountArg = process.argv[3];
  if (!amountArg) {
    logger.error("Usage: npm run wrap-eth -- <circuit-id> <amount-in-eth>  (e.g. circuit-1 0.05)");
    process.exit(1);
  }
  const value = parseEther(amountArg);

  const walletProvider = await getWalletProvider(circuit);
  const address = walletProvider.getAddress() as `0x${string}`;
  logger.info(`${circuit} wallet: ${address}`);

  const ethBalance = await walletProvider.getBalance();
  logger.info(`ETH balance: ${formatEther(ethBalance)}`);
  if (ethBalance < value) {
    logger.error(
      `Insufficient ETH. Need ${amountArg}, have ${formatEther(ethBalance)}. Run: npm run faucet -- ${circuit} eth`,
    );
    process.exit(1);
  }

  logger.info(`Wrapping ${amountArg} ETH → WETH at ${WETH_ADDRESS}...`);
  const txHash = await walletProvider.sendTransaction({
    to: WETH_ADDRESS,
    value,
    data: encodeFunctionData({ abi: WETH_ABI, functionName: "deposit" }),
  });
  logger.info(`  tx: ${txHash}`);
  await walletProvider.waitForTransactionReceipt(txHash);

  let wethBalance = 0n;
  for (let attempt = 0; attempt < 5; attempt++) {
    wethBalance = await walletProvider.readContract({
      address: WETH_ADDRESS,
      abi: WETH_ABI,
      functionName: "balanceOf",
      args: [address],
    });
    if (wethBalance > 0n) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  logger.success(`WETH balance: ${formatEther(wethBalance)}`);
}

wrapEth().catch((err) => {
  logger.error("Wrap failed", err);
  process.exit(1);
});
