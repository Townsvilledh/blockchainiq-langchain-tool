/**
 * LangChain tools for the Blockchain IQ x402 API.
 *
 * Each tool is a pay-per-call resource: invoking it spends a few cents of
 * USDC on Base from the wallet configured in {@link BlockchainIQClientOptions}
 * and returns the data together with the on-chain settlement proof.
 *
 * Prices (from the free catalogue at https://www.blockchainiq.co/api/x402/v1):
 * - brief:      $0.01 per call, parameter-free
 * - event-risk: $0.05 per call, ?days= (1-90, default 7), ?minImportance= (1-3)
 *
 * A 404 or an error response is never charged.
 */

import { tool, type DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import {
  createBlockchainIQClient,
  decodeSettlement,
  type BlockchainIQClientOptions,
  type Settlement,
} from "./client.js";

export type { BlockchainIQClientOptions, Settlement };

/** Prices in US dollars, as published in the Blockchain IQ catalogue. */
export const BLOCKCHAIN_IQ_PRICES = {
  brief: 0.01,
  eventRisk: 0.05,
} as const;

export interface ToolResult<T = unknown> {
  /** The resource id that was called. */
  resource: string;
  /** Price paid for this call, in US dollars. */
  priceUsd: number;
  /** The JSON data returned by the API. */
  data: T;
  /** On-chain settlement proof (null only if the call was not charged). */
  settlement: Settlement | null;
}

async function paidGet<T>(
  payFetch: typeof fetch,
  baseUrl: string,
  path: string,
  resource: string,
  priceUsd: number,
): Promise<ToolResult<T>> {
  const res = await payFetch(`${baseUrl}${path}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Blockchain IQ ${resource} failed: HTTP ${res.status}` +
        (body ? ` — ${body.slice(0, 500)}` : ""),
    );
  }
  const settlement = decodeSettlement(res);
  const body = (await res.json()) as { data?: T };
  // Paid resources return an envelope { ..., data: {...} }; fall back to
  // the whole body if a resource ever returns its payload bare.
  const data = (body.data ?? body) as T;
  return { resource, priceUsd, data, settlement };
}

const briefSchema = z.object({});

const eventRiskSchema = z.object({
  days: z
    .number()
    .int()
    .min(1)
    .max(90)
    .optional()
    .describe("How many days ahead to look (1-90, default 7)."),
  minImportance: z
    .number()
    .int()
    .min(1)
    .max(3)
    .optional()
    .describe(
      "Minimum event importance 1-3 (default 1 = everything). 3 is the most market-moving only.",
    ),
});

/**
 * Build the Blockchain IQ LangChain tools.
 *
 * @example
 * ```ts
 * import { createBlockchainIQTools } from "blockchainiq-langchain-tool";
 *
 * const tools = createBlockchainIQTools({
 *   privateKey: process.env.AGENT_PRIVATE_KEY as `0x${string}`,
 * });
 * // tools[0] is blockchain_iq_brief, tools[1] is blockchain_iq_event_risk
 * const result = await tools[0].invoke({});
 * ```
 *
 * Pass the tools to any LangChain agent, e.g. `createReactAgent({ llm, tools })`.
 * The wallet behind `privateKey` pays per call in USDC on Base; the default
 * spend cap refuses any single call above $0.10.
 */
export function createBlockchainIQTools(
  options: BlockchainIQClientOptions,
): [DynamicStructuredTool, DynamicStructuredTool] {
  const { payFetch, baseUrl } = createBlockchainIQClient(options);

  const briefTool = tool(
    async () => {
      const result = await paidGet(
        payFetch,
        baseUrl,
        "/brief",
        "brief",
        BLOCKCHAIN_IQ_PRICES.brief,
      );
      return JSON.stringify(result);
    },
    {
      name: "blockchain_iq_brief",
      description:
        "Crypto market brief in one call ($0.01, paid in USDC on Base via x402). " +
        "BTC, ETH, SOL and XRP prices with 24h, 7d and 30d moves and rank, " +
        "scheduled macro and crypto events in the next 48 hours, and short risk flags. " +
        "Use as the opening call of a trading, portfolio or research agent loop. " +
        "Returns the brief data plus the on-chain settlement proof (tx hash). No parameters.",
      schema: briefSchema,
    },
  );

  const eventRiskTool = tool(
    async ({ days, minImportance }) => {
      const params = new URLSearchParams();
      if (days !== undefined) params.set("days", String(days));
      if (minImportance !== undefined) {
        params.set("minImportance", String(minImportance));
      }
      const query = params.toString();
      const result = await paidGet(
        payFetch,
        baseUrl,
        `/event-risk${query ? `?${query}` : ""}`,
        "event-risk",
        BLOCKCHAIN_IQ_PRICES.eventRisk,
      );
      return JSON.stringify(result);
    },
    {
      name: "blockchain_iq_event_risk",
      description:
        "Scheduled market-moving events for the next 7 days by default ($0.05, paid in USDC on Base via x402). " +
        "US data releases with release times (CPI, jobs, GDP, PCE, PPI), FOMC, ECB and Bank of Japan decisions, " +
        "Treasury auctions and dated crypto and regulatory milestones, each with importance 1-3 and official source. " +
        "Use before any trade or scheduled action to know what is on the calendar. " +
        "Returns the events plus the on-chain settlement proof (tx hash).",
      schema: eventRiskSchema,
    },
  );

  return [briefTool, eventRiskTool];
}
