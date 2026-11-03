import { SOMNIA_HIDEKI_TESTNET_ADDRESSES, type PerpMarket } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import { isMarketId, marketIdFromSymbol, type MarketId } from "@bump/shared";

/**
 * Somnia Hideki testnet, where dreamDEX perps run. Endpoints come from the SDK's chain definition: Hideki was
 * regenesised on 2026-09-17 under the same chain id, and a hand-written copy would keep the dead v1 hosts.
 */
export const HIDEKI = {
  chain: hidekiTestnet,
  chainId: hidekiTestnet.id,
  rpcUrl: hidekiTestnet.rpcUrls.default.http[0],
  wsUrl: hidekiTestnet.rpcUrls.default.webSocket[0],
  /** Development-grade indexer: no alerting, so a stall can go unnoticed. */
  indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql",
  addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
} as const;

/** The fields of a perp market row that order building reads. Tests build these by hand (see @bump/testkit). */
export type PerpGrid = Pick<
  PerpMarket,
  "poolAddress" | "baseSymbol" | "baseDecimals" | "quoteDecimals" | "tickSize" | "lotSize" | "minQuantity" | "marginBank" | "stopRegistry" | "initialMarginBps"
>;

/** bump's id for a perp row (its base symbol, lowercased), or null for a row with no usable symbol. */
export function marketIdOf(row: Pick<PerpMarket, "baseSymbol">): MarketId | null {
  const id = marketIdFromSymbol(row.baseSymbol ?? "");
  return isMarketId(id) ? id : null;
}

/**
 * Every perp on dreamDEX keyed by bump id, from `listMarkets` rows. When a base has several pools, the first row wins,
 * so pass rows already filtered to tradeable pools.
 */
export function bumpMarkets<T extends { marketType: string; baseSymbol: string | null }>(rows: readonly T[]): Record<MarketId, T> {
  const out: Record<MarketId, T> = {};
  for (const row of rows) {
    if (row.marketType !== "PERP") continue;
    const id = marketIdOf(row);
    if (id && !out[id]) out[id] = row;
  }
  return out;
}
