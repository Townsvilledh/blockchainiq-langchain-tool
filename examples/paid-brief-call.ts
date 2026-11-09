/**
 * Proof script: one real paid $0.01 call to the Blockchain IQ `brief`
 * resource, made through the LangChain tool — not a raw fetch.
 *
 * Run:
 *   npm run build
 *   AGENT_PRIVATE_KEY=0x... npm run example:brief
 *
 * The wallet behind AGENT_PRIVATE_KEY needs at least $0.01 USDC on Base.
 * Settlement is gasless for the payer. The script prints the brief data
 * and the on-chain settlement proof (transaction hash + BaseScan link).
 *
 * Cost: exactly $0.01 USDC per run. Nothing else is spent.
 */

import { createBlockchainIQTools, baseScanTxUrl } from "../src/index.js";

const privateKey = process.env.AGENT_PRIVATE_KEY;
if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  console.error(
    "Set AGENT_PRIVATE_KEY to the 0x-prefixed hex private key of a wallet holding at least $0.01 USDC on Base.",
  );
  process.exit(1);
}

const [briefTool] = createBlockchainIQTools({
  privateKey: privateKey as `0x${string}`,
});

console.log("Calling blockchain_iq_brief ($0.01 USDC on Base via x402)…");
const raw = await briefTool.invoke({});
const result = JSON.parse(raw) as {
  resource: string;
  priceUsd: number;
  data: unknown;
  settlement: { txHash: string; network: string; payer: string; success: boolean } | null;
};

console.log("\n--- brief data ---");
console.log(JSON.stringify(result.data, null, 2).slice(0, 3000));

console.log("\n--- settlement proof ---");
console.log(`resource : ${result.resource}`);
console.log(`price    : $${result.priceUsd.toFixed(2)} USDC`);
if (result.settlement) {
  console.log(`success  : ${result.settlement.success}`);
  console.log(`network  : ${result.settlement.network}`);
  console.log(`payer    : ${result.settlement.payer}`);
  console.log(`tx hash  : ${result.settlement.txHash}`);
  console.log(`BaseScan : ${baseScanTxUrl(result.settlement.txHash)}`);
} else {
  console.log("No PAYMENT-RESPONSE header was returned — the call was not charged.");
  process.exit(1);
}
