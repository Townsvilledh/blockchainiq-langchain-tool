/**
 * x402 paid-fetch client for the Blockchain IQ API.
 *
 * Blockchain IQ sells crypto market data and research one call at a time.
 * There is no account and no API key: an unpaid request returns HTTP 402
 * with a PAYMENT-REQUIRED header, the client signs a USDC payment on Base
 * (x402 v2) and retries, and the paid response carries a PAYMENT-RESPONSE
 * header with the settlement transaction hash. Settlement is gasless for
 * the payer.
 *
 * @see https://www.blockchainiq.co/agents
 */

import { privateKeyToAccount } from "viem/accounts";
import {
  wrapFetchWithPayment,
  x402Client,
  decodePaymentResponseHeader,
} from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";

/** Base URL of the Blockchain IQ x402 API (v1). */
export const BLOCKCHAIN_IQ_BASE_URL = "https://www.blockchainiq.co/api/x402/v1";

/** CAIP-2 network id for Base, the only chain the API settles on. */
export const BLOCKCHAIN_IQ_NETWORK = "eip155:8453";

/** The API is priced and settled in USDC. */
export const BLOCKCHAIN_IQ_ASSET = "USDC";

export interface BlockchainIQClientOptions {
  /**
   * Hex private key of a wallet holding a little USDC on Base.
   * Use a dedicated wallet with a small balance, never a main wallet.
   * Prefer passing it via the AGENT_PRIVATE_KEY environment variable.
   */
  privateKey: `0x${string}`;
  /**
   * Spend control: refuse any single call above this many dollars.
   * Default 0.10 — covers the dearest tool in this package (event-risk,
   * $0.05) with margin, and refuses everything else the API sells.
   */
  maxUsdPerCall?: number;
  /** Override the API base URL (defaults to BLOCKCHAIN_IQ_BASE_URL). */
  baseUrl?: string;
}

export interface Settlement {
  /** On-chain settlement transaction hash (Base). */
  txHash: string;
  /** CAIP-2 network id, e.g. "eip155:8453". */
  network: string;
  /** Address that paid. */
  payer: string;
  /** Whether the facilitator reports the payment as settled. */
  success: boolean;
}

export interface BlockchainIQClient {
  /** The viem account derived from the private key. */
  account: ReturnType<typeof privateKeyToAccount>;
  /** The underlying x402 client (for advanced use). */
  client: ReturnType<typeof x402Client.fromConfig>;
  /** fetch() wrapped with x402 payment handling: 402 -> pay -> retry. */
  payFetch: typeof fetch;
  /** Effective per-call spend cap in dollars. */
  maxUsdPerCall: number;
  /** Effective API base URL. */
  baseUrl: string;
}

/**
 * Build an x402 client for Blockchain IQ from a private key.
 *
 * The spend control is the safety rail: any single call priced above
 * `maxUsdPerCall` dollars is refused before anything is signed.
 */
export function createBlockchainIQClient(
  options: BlockchainIQClientOptions,
): BlockchainIQClient {
  const account = privateKeyToAccount(options.privateKey);
  const maxUsdPerCall = options.maxUsdPerCall ?? 0.1;
  const baseUrl = options.baseUrl ?? BLOCKCHAIN_IQ_BASE_URL;
  const client = x402Client.fromConfig({
    schemes: [
      { network: "eip155:*", client: new ExactEvmScheme(account) },
    ],
    spendControls: { maxAmountPerPayment: maxUsdPerCall },
  });
  const payFetch = wrapFetchWithPayment(fetch, client);
  return { account, client, payFetch, maxUsdPerCall, baseUrl };
}

/**
 * Decode the PAYMENT-RESPONSE header of a paid response into a
 * {@link Settlement}. Returns null when the response carries no
 * payment header (e.g. a free resource, or an unpaid 402).
 */
export function decodeSettlement(res: Response): Settlement | null {
  const header = res.headers.get("payment-response");
  if (!header) return null;
  const decoded = decodePaymentResponseHeader(header);
  if (!decoded.transaction) {
    throw new Error("PAYMENT-RESPONSE header has no transaction hash.");
  }
  return {
    txHash: decoded.transaction,
    network: decoded.network ?? BLOCKCHAIN_IQ_NETWORK,
    payer: decoded.payer ?? "",
    success: decoded.success,
  };
}

/** BaseScan link for a settlement transaction hash. */
export function baseScanTxUrl(txHash: string): string {
  return `https://basescan.org/tx/${txHash}`;
}
