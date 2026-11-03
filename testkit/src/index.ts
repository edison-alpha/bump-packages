import type { PerpGrid } from "@bump/dreamdex";

export * from "./logs.ts";

/**
 * Perp market rows for unit tests. The grids are made up but shaped like the testnet's: 18-decimal USDso collateral,
 * and base decimals from 6 (XRP) to 24 (NEAR), the range order building has to get right.
 */
export function perpMarket(overrides: Partial<PerpGrid> = {}): PerpGrid {
  return {
    poolAddress: "0x00000000000000000000000000000000000000b1",
    baseSymbol: "WBTC",
    baseDecimals: 8,
    quoteDecimals: 18,
    // $0.10 tick, 0.00001 BTC lot and minimum
    tickSize: (10n ** 17n).toString(),
    lotSize: "1000",
    minQuantity: "1000",
    marginBank: "0x00000000000000000000000000000000000000ba",
    stopRegistry: "0x00000000000000000000000000000000000000c1",
    initialMarginBps: 500,
    ...overrides,
  };
}

export const MARKETS = {
  btc: perpMarket(),
  eth: perpMarket({ poolAddress: "0x00000000000000000000000000000000000000e1", baseSymbol: "WETH", baseDecimals: 18, tickSize: (10n ** 16n).toString(), lotSize: (10n ** 14n).toString(), minQuantity: (10n ** 15n).toString() }),
  /** 10x cap: 1000 bps initial margin. */
  bnb: perpMarket({ poolAddress: "0x00000000000000000000000000000000000000b2", baseSymbol: "BNB", baseDecimals: 18, tickSize: (10n ** 16n).toString(), lotSize: (10n ** 15n).toString(), minQuantity: (10n ** 16n).toString(), initialMarginBps: 1000 }),
  /** 6 base decimals, sub-dollar price: $0.0001 tick, 0.1 XRP lot, 1 XRP minimum. */
  xrp: perpMarket({ poolAddress: "0x00000000000000000000000000000000000000a1", baseSymbol: "XRP", baseDecimals: 6, tickSize: (10n ** 14n).toString(), lotSize: "100000", minQuantity: "1000000" }),
  /** 24 base decimals: $0.001 tick, 0.001 NEAR lot, 0.01 NEAR minimum. */
  near: perpMarket({ poolAddress: "0x00000000000000000000000000000000000000d1", baseSymbol: "NEAR", baseDecimals: 24, tickSize: (10n ** 15n).toString(), lotSize: (10n ** 21n).toString(), minQuantity: (10n ** 22n).toString() }),
} satisfies Record<string, PerpGrid>;
