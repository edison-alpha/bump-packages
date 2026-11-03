import { describe, expect, it } from "bun:test";
import { MARKETS } from "@bump/testkit";
import { createPriceReader, rawPrice } from "../src/index.ts";

const START = 1_800_000_000_000;

function setup() {
  let time = START;
  let fail = false;
  let paused = false;
  let reads = 0;
  const btc = MARKETS.btc;
  const pepe = { ...MARKETS.eth, baseSymbol: "1000PEPE", quoteDecimals: 6 };
  const reader = createPriceReader({
    now: () => time,
    markets: async () => ({ btc, "1000pepe": pepe }),
    feed: async (pool) => {
      reads++;
      if (pool === btc.poolAddress && fail) throw new Error("RPC down");
      return { markPrice: pool === btc.poolAddress ? rawPrice(71234.567891, btc) : rawPrice(0.004941, pepe), markPriceOk: !paused };
    },
    candles: async () => [],
  });
  return { reader, reads: () => reads, advance: (ms: number) => { time += ms; }, fail: () => { fail = true; }, pause: () => { paused = true; } };
}

describe("dreamDEX market prices", () => {
  it("converts each market's quote decimals without rounding tiny prices or scaling 1000PEPE twice", async () => {
    const { reader } = setup();
    const result = await reader.prices();
    expect(result.prices[0]?.price).toBe(71234.567891);
    expect(result.prices[1]?.price).toBe(0.004941);
    expect(result.prices.every((p) => p.status === "live")).toBe(true);
    expect(result.prices.every((p) => p.change24h === null)).toBe(true);
  });

  it("deduplicates concurrent readers and expires the shared cache", async () => {
    const s = setup();
    await Promise.all([s.reader.prices(), s.reader.prices(), s.reader.prices()]);
    expect(s.reads()).toBe(2);
    await s.reader.prices();
    expect(s.reads()).toBe(2);
    s.advance(4001);
    await s.reader.prices();
    expect(s.reads()).toBe(4);
  });

  it("keeps a failed market stale without refreshing its timestamp or stopping other markets", async () => {
    const s = setup();
    const first = await s.reader.prices();
    s.advance(4001); s.fail();
    const next = await s.reader.prices();
    expect(next.prices[0]).toEqual({ ...first.prices[0]!, status: "stale" });
    expect(next.prices[1]?.status).toBe("live");
    expect(next.prices[1]?.updatedAt).toBeGreaterThan(first.prices[1]!.updatedAt!);
  });

  it("never invents a price when the feed is paused before the first successful read", async () => {
    const s = setup(); s.pause();
    const result = await s.reader.prices();
    expect(result.prices.every((p) => p.status === "unavailable" && p.price === null && p.updatedAt === null)).toBe(true);
  });

  it("serves only valid chronological candle observations without filling gaps", async () => {
    const btc = MARKETS.btc;
    const reader = createPriceReader({
      now: () => START,
      markets: async () => ({ btc }),
      feed: async () => ({ markPrice: 0n, markPriceOk: false }),
      candles: async () => [
        { bucketStart: String(START / 1000 - 60), openPrice: "0", closePrice: String(rawPrice(71200, btc)) },
        { bucketStart: String(START / 1000 - 600), openPrice: "0", closePrice: String(rawPrice(71000, btc)) },
        { bucketStart: String(START / 1000 - 120), openPrice: "0", closePrice: "0" },
        { bucketStart: String(START / 1000 - 180), openPrice: "0", closePrice: "invalid" },
      ],
    });
    const chart = await reader.candles("btc", 60);
    expect(chart.samples).toEqual([{ at: START - 600_000, price: 71000 }, { at: START - 60_000, price: 71200 }]);
    await expect(reader.candles("btc", 1)).rejects.toThrow("Invalid candle range");
    await expect(reader.candles("missing", 60)).rejects.toThrow("Unknown dreamDEX market");
  });
});
