import { AgentKit } from "@coinbase/agentkit";
import { floeActionProvider } from "floe-agent";
import { getWalletProvider } from "../shared/wallet.js";
import { invokeAction } from "../shared/utils.js";

const wallet = await getWalletProvider("circuit-1");
const agentkit = await AgentKit.from({
  walletProvider: wallet,
  actionProviders: [floeActionProvider({ rpcUrl: "https://mainnet.base.org" })],
});

console.log("--- get_markets (SDK view) ---");
const markets = await invokeAction<string>(agentkit, "get_markets", {});
console.log(markets);
