/**
 * Agent example: a minimal LangChain tool-calling loop with the Blockchain IQ
 * tools — the model decides when to call `blockchain_iq_brief`.
 *
 * Run:
 *   npm run build
 *   AGENT_PRIVATE_KEY=0x... OPENAI_API_KEY=sk-... npm run example:agent
 *
 * The model calls `blockchain_iq_brief`, which costs exactly $0.01 USDC on
 * Base (paid via x402 from the AGENT_PRIVATE_KEY wallet). The tool returns
 * the settlement transaction hash with the data, so the answer is grounded
 * in a paid, on-chain-settled call.
 *
 * Needs an OpenAI API key for the chat model; swap ChatOpenAI for any other
 * LangChain chat model. Cost: $0.01 USDC per brief call, plus the model's
 * own API usage.
 */

import { ChatOpenAI } from "@langchain/openai";
import {
  HumanMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { createBlockchainIQTools } from "../src/index.js";

const privateKey = process.env.AGENT_PRIVATE_KEY;
if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  console.error(
    "Set AGENT_PRIVATE_KEY to the 0x-prefixed hex private key of a wallet holding at least $0.01 USDC on Base.",
  );
  process.exit(1);
}
if (!process.env.OPENAI_API_KEY) {
  console.error("Set OPENAI_API_KEY to run this agent example.");
  process.exit(1);
}

const tools = createBlockchainIQTools({
  privateKey: privateKey as `0x${string}`,
});
const toolsByName = new Map(tools.map((t) => [t.name, t]));

const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
const llmWithTools = llm.bindTools(tools);

const messages: BaseMessage[] = [
  new HumanMessage(
    "Get the latest crypto market brief and tell me how BTC moved in the last 24h, " +
      "plus the most important event in the next 48 hours. Include the settlement transaction hash.",
  ),
];

for (let step = 0; step < 5; step++) {
  const response = await llmWithTools.invoke(messages);
  messages.push(response);
  const toolCalls = response.tool_calls ?? [];
  if (toolCalls.length === 0) {
    console.log(response.content);
    break;
  }
  for (const call of toolCalls) {
    const tool = toolsByName.get(call.name);
    if (!tool) throw new Error(`Unknown tool called by model: ${call.name}`);
    console.log(`[tool] ${call.name} ${JSON.stringify(call.args)}`);
    const output = await tool.invoke(call.args);
    messages.push(
      new ToolMessage({ content: String(output), tool_call_id: call.id ?? "" }),
    );
  }
  if (step === 4) console.log(messages.at(-1)?.content);
}
