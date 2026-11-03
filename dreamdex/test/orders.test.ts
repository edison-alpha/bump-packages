import { describe, expect, it } from "bun:test";
import { ORDER_TYPE } from "@somnia-chain/markets-sdk";
import { capLeverage, leverageChoices, STYLES, stepLeverage } from "@bump/shared";
import { MARKETS, perpMarket } from "@bump/testkit";
import { bumpMarkets, closeToOrder, draftToOrder, humanPrice, humanQty, limitsToStops, marketIdOf, maxLeverageX, OrderError, qtyForNotional, rawPrice, shortError } from "../src/index.ts";

const chill = STYLES[0];

describe("units", () => {
  it("round-trips prices at 18 decimals and sizes at 6, 8 and 24", () => {
    expect(rawPrice(68240.5, MARKETS.btc)).toBe(68_240_500_000_000_000_000_000n);
    expect(humanPrice(rawPrice(0.5213, MARKETS.xrp), MARKETS.xrp)).toBe(0.5213);
    // $100 of NEAR at $5 = 20 NEAR = 20e24 raw
    expect(qtyForNotional(rawPrice(100, MARKETS.near), rawPrice(5, MARKETS.near), MARKETS.near)).toBe(20n * 10n ** 24n);
    // $100 of XRP at $0.52 = 192.307… XRP, floored to the 0.1 lot
    expect(humanQty(qtyForNotional(rawPrice(100, MARKETS.xrp), rawPrice(0.52, MARKETS.xrp), MARKETS.xrp), MARKETS.xrp)).toBe(192.3);
  });
});

describe("draftToOrder", () => {
  it("sizes a Chill $50 BTC long as stake × leverage at the mark, on the lot grid", () => {
    const order = draftToOrder({ side: "long", margin: 50, leverage: chill.leverage }, MARKETS.btc, 68_000);
    // $100 / $68,000 = 0.00147058… BTC → 0.00147 (lot 0.00001)
    expect(order.quantity).toBe(147_000n);
    expect(order.isBid).toBe(true);
    expect(order.orderType).toBe(ORDER_TYPE.MARKET);
    // +0.5% crossing bound, rounded up to the $0.10 tick
    expect(humanPrice(order.price, MARKETS.btc)).toBe(68_340);
    expect(order.price % BigInt(MARKETS.btc.tickSize)).toBe(0n);
  });

  it("bounds a short below the mark and keeps sub-dollar ticks", () => {
    const order = draftToOrder({ side: "short", margin: 50, leverage: 2 }, MARKETS.xrp, 0.52);
    expect(order.isBid).toBe(false);
    expect(humanPrice(order.price, MARKETS.xrp)).toBe(0.5174);
    expect(order.quantity % BigInt(MARKETS.xrp.lotSize)).toBe(0n);
  });

  it("refuses leverage over the market cap and stakes under the minimum", () => {
    expect(maxLeverageX(MARKETS.bnb)).toBe(10);
    expect(() => draftToOrder({ side: "long", margin: 50, leverage: 20 }, MARKETS.bnb, 600)).toThrow(OrderError);
    expect(() => draftToOrder({ side: "long", margin: 0.5, leverage: 1 }, MARKETS.btc, 68_000)).toThrow("Stake too small here");
    expect(() => draftToOrder({ side: "long", margin: 50, leverage: 2 }, MARKETS.btc, 0)).toThrow("No price yet");
  });
});

describe("closeToOrder", () => {
  const long = { side: "long" as const, sizeRaw: 147_000n };

  it("closes a share on the opposite side, floored to the lot", () => {
    const half = closeToOrder(long, 50, MARKETS.btc, 68_500);
    expect(half.isBid).toBe(false);
    expect(half.quantity).toBe(73_000n);
    expect(closeToOrder({ side: "short", sizeRaw: -147_000n }, 100, MARKETS.btc, 68_500)).toMatchObject({ isBid: true, quantity: 147_000n });
  });

  it("refuses a share below the minimum", () => {
    expect(() => closeToOrder({ side: "long", sizeRaw: 1_500n }, 5, MARKETS.btc, 68_500)).toThrow("Close more of it");
  });
});

describe("limitsToStops", () => {
  it("arms a long's TP above and SL below as one linked pair, aligned toward the entry", () => {
    const stops = limitsToStops("long", 68_000, chill.targetPct, chill.stopPct, MARKETS.btc);
    expect(stops.registry).toBe(MARKETS.btc.stopRegistry as `0x${string}`);
    expect(stops).toMatchObject({ isBid: false, quantity: 0n, triggerOperator: 0, stopOrderType: 1 });
    expect(humanPrice(stops.triggerPrice, MARKETS.btc)).toBe(68_680);
    expect(stops.pair).toMatchObject({ isBid: false, quantity: 0n, triggerOperator: 1 });
    expect(humanPrice(stops.pair.triggerPrice, MARKETS.btc)).toBe(67_660);
  });

  it("mirrors the operators for a short", () => {
    const stops = limitsToStops("short", 0.52, 1, 0.5, MARKETS.xrp);
    expect(stops.isBid).toBe(true);
    expect(stops.triggerOperator).toBe(1);
    expect(humanPrice(stops.triggerPrice, MARKETS.xrp)).toBe(0.5148);
    expect(stops.pair.triggerOperator).toBe(0);
    expect(humanPrice(stops.pair.triggerPrice, MARKETS.xrp)).toBe(0.5226);
  });

  it("refuses a tick too coarse for the stop and a pool without a registry", () => {
    const coarse = perpMarket({ tickSize: (10n ** 21n).toString() }); // $1,000 tick
    expect(() => limitsToStops("long", 68_000, 1, 0.5, coarse)).toThrow("TP/SL too close to price");
    expect(() => limitsToStops("long", 68_000, 1, 0.5, perpMarket({ stopRegistry: null }))).toThrow("TP/SL not offered here");
  });
});

describe("market mapping", () => {
  it("keys every perp by its lowercased base symbol and keeps the first row per symbol", () => {
    expect(marketIdOf({ baseSymbol: "BTC" })).toBe("btc");
    expect(marketIdOf({ baseSymbol: "1000PEPE" })).toBe("1000pepe");
    expect(marketIdOf({ baseSymbol: null })).toBeNull();
    const rows = [
      { marketType: "PERP" as const, baseSymbol: "BTC", id: "a" },
      { marketType: "PERP" as const, baseSymbol: "BTC", id: "b" },
      { marketType: "PERP" as const, baseSymbol: "WLD", id: "c" },
      { marketType: "SPOT" as const, baseSymbol: "ETH", id: "d" },
    ];
    const markets = bumpMarkets(rows);
    expect(Object.keys(markets).sort()).toEqual(["btc", "wld"]);
    expect(markets.btc?.id).toBe("a");
  });

  it("derives each market's leverage cap from its initial margin (5x, 10x, 20x)", () => {
    expect([200, 500, 1000, 2000].map((bps) => maxLeverageX({ initialMarginBps: bps }))).toEqual([50, 20, 10, 5]);
    expect(leverageChoices(5)).toEqual([1, 2, 3, 5]);
    expect(leverageChoices(10)).toEqual([1, 2, 3, 5, 10]);
    expect(leverageChoices(20)).toEqual([1, 2, 3, 5, 10, 15, 20]);
    expect(leverageChoices(7)).toEqual([1, 2, 3, 5, 7]);
    expect(capLeverage(10, 5)).toBe(5);
    expect(stepLeverage(19, 1, 20)).toBe(20);
    expect(stepLeverage(20, 1, 20)).toBe(20);
    expect(stepLeverage(1, -1, 20)).toBe(1);
  });
});

describe("shortError", () => {
  it("reads revert names through wrapped causes, wallet rejections and order refusals", () => {
    expect(shortError(new Error("outer", { cause: Object.assign(new Error("revert"), { errorName: "InsufficientMarginForOrder" }) }))).toBe("Not enough margin");
    expect(shortError(Object.assign(new Error("no"), { name: "UserRejectedRequestError" }))).toBe("Cancelled");
    expect(shortError(new OrderError("too-small", "Stake too small here"))).toBe("Stake too small here");
    expect(shortError(new Error("socket hang up"))).toBe("Trade failed, try again");
  });
});
