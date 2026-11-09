# Blockchain IQ tools for LangChain

LangChain tools for the [Blockchain IQ](https://www.blockchainiq.co) x402
crypto-data API — pay-per-call market data in USDC on Base, with no account
and no API key. A wallet holding a little USDC is the only credential.

Built for the [Blockchain IQ x402 build bounties](https://www.blockchainiq.co/blog/x402-build-bounties)
(LangChain tool slot).

## What it does

Two LangChain tools, created by `createBlockchainIQTools()`:

| Tool | Resource | Price | What it returns |
| --- | --- | --- | --- |
| `blockchain_iq_brief` | `GET /api/x402/v1/brief` | $0.01 | BTC, ETH, SOL, XRP prices with 24h/7d/30d moves, events in the next 48h, risk flags |
| `blockchain_iq_event_risk` | `GET /api/x402/v1/event-risk` | $0.05 | Scheduled market-moving events for the next 7 days (`days` 1–90, `minImportance` 1–3) |

Every tool result is JSON with the data **plus the on-chain settlement
proof** (`txHash`, `network`, `payer`, `success`).

## Install

```bash
npm install blockchainiq-langchain-tool
```

Requires Node 18+. Peer runtime dependencies (`@langchain/core`, `@x402/fetch`,
`@x402/evm`, `viem`, `zod`) are installed automatically.

## Use in a LangChain agent

```ts
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/classic/agents";
import { createBlockchainIQTools } from "blockchainiq-langchain-tool";

const tools = createBlockchainIQTools({
  privateKey: process.env.AGENT_PRIVATE_KEY as `0x${string}`,
  // maxUsdPerCall defaults to 0.10 — any single call priced above that
  // is refused before anything is signed.
});

const agent = await createReactAgent({
  llm: new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 }),
  tools,
});

await agent.invoke({
  input: "Get the latest crypto market brief and summarise BTC's 24h move.",
});
```

Use a dedicated wallet with a small balance, never a main wallet. The tools
also work standalone — `tools[0].invoke({})` calls `brief` directly.

## How the paid call works

Blockchain IQ speaks x402 v2. The flow, handled by `@x402/fetch`:

1. The tool calls the resource with a plain GET — no headers, no key.
2. The API answers HTTP 402 with a `PAYMENT-REQUIRED` header naming the
   price, the asset (USDC) and the network (Base, `eip155:8453`).
3. The x402 client signs a USDC payment for exactly that amount and retries
   with it. Settlement is gasless for the payer.
4. The API answers HTTP 200 with JSON, plus a `PAYMENT-RESPONSE` header
   carrying the settlement transaction hash. A 404 or an error response is
   never charged.

The spend control (`maxUsdPerCall`, default $0.10) refuses any single call
above the amount you set — the dearest tool here is $0.05.

## Proof of settlement

A runnable example makes one real paid `$0.01` call to `brief` through the
LangChain tool and prints the settlement hash:

```bash
npm run build
AGENT_PRIVATE_KEY=0x... npm run example:brief
```

Verified run (2026-11-09, paid from `0xD2B222F811cc328bcD85F1Ef00533AaC7Ce394Ce`
via the `blockchain_iq_brief` LangChain tool, `examples/paid-brief-call.ts`):

- Settlement tx hash: `0xe0b911afa05228a33580f1d2953a9c204219efc8b1e6b7dd43f6425b8c29703a`
- BaseScan: `https://basescan.org/tx/0xe0b911afa05228a33580f1d2953a9c204219efc8b1e6b7dd43f6425b8c29703a`
- On-chain: 0.01 USDC from the paying wallet to Blockchain IQ's `payTo`
  `0x617dA9383fbA67e86137BC4924b8b7E400fB7C9e`, block 55115537, status success
- Cost: $0.01 USDC (gasless for the payer — the facilitator submits the settlement)

The free catalogue (`GET https://www.blockchainiq.co/api/x402/v1`) lists every
resource, price and response shape — read it before spending anything.

## Development

```bash
npm install
npm run build        # tsc -> dist/
npm run example:brief   # one real $0.01 paid call (needs AGENT_PRIVATE_KEY)
npm run example:agent   # ReAct agent demo (needs AGENT_PRIVATE_KEY + OPENAI_API_KEY)
```

## Licence

MIT. Market data is not investment advice — see
[Blockchain IQ terms](https://www.blockchainiq.co/terms).
