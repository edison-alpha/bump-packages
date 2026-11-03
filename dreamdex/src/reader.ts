import { isPerpMarket, SomniaMarkets } from "@somnia-chain/markets-sdk";
import type { MarketId } from "@bump/shared";
import { bumpMarkets, HIDEKI, type PerpGrid } from "./config.ts";

/** A position update that realized PnL, trimmed to what the trade log needs. Raw units. */
export type PositionClose = {
  txHash: string;
  /** Null for a liquidation takeover, ADL or wind-down: no order behind it. */
  orderId: bigint | null;
  closedSize: bigint;
  realizedPnl: bigint;
  exitPrice: bigint | null;
  timestamp: bigint;
};

/**
 * Server-side indexer reads for Hideki. It never opens a WebSocket (no chain watches, no signer), so it is safe in a
 * request path. Market rows are cached: grids and pools change only when dreamDEX lists or retires a market.
 */
export function createReader(indexerUrl: string = HIDEKI.indexerUrl) {
  const exchange = new SomniaMarkets({ indexerUrl, chain: HIDEKI.chain, addresses: HIDEKI.addresses });
  let markets: { at: number; value: Promise<Record<MarketId, PerpGrid>> } | undefined;
  return {
    markets(ttlMs = 10 * 60_000): Promise<Record<MarketId, PerpGrid>> {
      if (!markets || Date.now() - markets.at > ttlMs) {
        const value = exchange.client.listMarkets({ marketType: "PERP", limit: 100 }).then((rows) => bumpMarkets(rows.filter(isPerpMarket)));
        // a failed read is not cached
        value.catch(() => (markets = undefined));
        markets = { at: Date.now(), value };
      }
      return markets.value;
    },
    async closes(account: string, pool: string, fromSec: number): Promise<PositionClose[]> {
      const rows = await exchange.client.listPerpPositionChanges({ account, pool, kinds: ["REDUCE", "CLOSE", "FLIP"], from: Math.max(0, Math.floor(fromSec)) });
      return rows.map((r) => ({ txHash: r.txHash, orderId: r.orderId, closedSize: r.closedSize, realizedPnl: r.realizedPnl, exitPrice: r.exitPrice, timestamp: r.timestamp }));
    },
    close: () => exchange.close(),
  };
}

export type Reader = ReturnType<typeof createReader>;
