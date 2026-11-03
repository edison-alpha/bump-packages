import type { Address } from "viem";
import { HIDEKI, type PerpGrid } from "./config.ts";
import { humanPrice } from "./units.ts";

type Candle = { bucketStart: string; openPrice: string; closePrice: string };
type Sources = {
  markets: () => Promise<Record<string, PerpGrid>>;
  feed: (pool: Address) => Promise<{ markPrice: bigint; markPriceOk: boolean }>;
  candles: (pool: Address, bucket: number, limit: number) => Promise<Candle[]>;
  now?: () => number;
};
export type MarketQuote = {
  id: string;
  symbol: string;
  price: number | null;
  status: "live" | "stale" | "unavailable";
  updatedAt: number | null;
  change24h: number | null;
};
export type MarketPrices = { source: "dreamdex"; chainId: number; generatedAt: number; prices: MarketQuote[] };
export type MarketCandles = { source: "dreamdex"; marketId: string; bucket: number; samples: { at: number; price: number }[] };

const valid = (price: number) => Number.isFinite(price) && price > 0;
const BUCKETS = [60, 300, 900, 3600, 14400, 86400];

/** Shared, single-flight market reads. Only successful mark observations may update a price or its timestamp. */
export function createPriceReader(sources: Sources) {
  const now = sources.now ?? Date.now;
  const previous = new Map<string, { pool: Address; price: number; at: number }>();
  let cached: { expires: number; value: Promise<MarketPrices> } | undefined;
  let references: { expires: number; value: Promise<Record<string, number>> } | undefined;
  const charts = new Map<string, { expires: number; value: Promise<MarketCandles> }>();

  function dayReferences(rows: Record<string, PerpGrid>) {
    if (!references || now() >= references.expires) {
      const value = Promise.all(Object.entries(rows).map(async ([id, row]): Promise<[string, number]> => {
        try {
          const target = now() - 86_400_000;
          const candles = await sources.candles(row.poolAddress, 3600, 25);
          const candle = candles.filter((c) => Number(c.bucketStart) * 1000 <= target && Number(c.bucketStart) * 1000 > target - 3_600_000)
            .sort((a, b) => Number(b.bucketStart) - Number(a.bucketStart))[0];
          return [id, candle ? humanPrice(candle.openPrice, row) : NaN];
        } catch {
          return [id, NaN];
        }
      })).then(Object.fromEntries);
      references = { expires: now() + 300_000, value };
    }
    return references.value;
  }

  async function load(): Promise<MarketPrices> {
    const rows = await sources.markets();
    const [marks, base] = await Promise.all([
      Promise.all(Object.entries(rows).map(async ([id, row]) => {
        const old = previous.get(id);
        const last = old?.pool === row.poolAddress ? old : undefined;
        try {
          const feed = await sources.feed(row.poolAddress);
          const price = humanPrice(feed.markPrice, row);
          if (feed.markPriceOk && valid(price)) {
            const at = now();
            previous.set(id, { pool: row.poolAddress, price, at });
            return { id, symbol: row.baseSymbol ?? id.toUpperCase(), price, updatedAt: at, status: "live" as const };
          }
        } catch {
          // Retain a previous verified observation with its original timestamp, never a last-fill substitute.
        }
        return { id, symbol: row.baseSymbol ?? id.toUpperCase(), price: last?.price ?? null, updatedAt: last?.at ?? null, status: last ? "stale" as const : "unavailable" as const };
      })),
      dayReferences(rows),
    ]);
    return {
      source: "dreamdex", chainId: HIDEKI.chainId, generatedAt: now(),
      prices: marks.map((quote) => ({ ...quote, change24h: quote.price !== null && valid(base[quote.id] ?? NaN) ? (quote.price / base[quote.id]! - 1) * 100 : null })),
    };
  }

  function prices(): Promise<MarketPrices> {
    if (cached && now() < cached.expires) return cached.value;
    const entry = { expires: Infinity, value: load() };
    cached = entry;
    entry.value.then(() => { entry.expires = now() + 4000; }, () => { if (cached === entry) cached = undefined; });
    return entry.value;
  }

  async function candles(id: string, bucket: number, limit = 60): Promise<MarketCandles> {
    if (!BUCKETS.includes(bucket) || !Number.isInteger(limit) || limit < 1 || limit > 120) throw new Error("Invalid candle range.");
    const rows = await sources.markets();
    const row = rows[id];
    if (!row) throw new Error("Unknown dreamDEX market.");
    const key = `${row.poolAddress}:${bucket}:${limit}`;
    const hit = charts.get(key);
    if (hit && now() < hit.expires) return hit.value;
    const value = sources.candles(row.poolAddress, bucket, limit).then((found): MarketCandles => {
      const samples = new Map<number, number>();
      for (const candle of found) {
        try {
          const at = Number(candle.bucketStart) * 1000;
          const price = humanPrice(candle.closePrice, row);
          if (Number.isFinite(at) && at > 0 && at <= now() && valid(price)) samples.set(at, price);
        } catch {
          // Skip a malformed candle without fabricating a replacement.
        }
      }
      return { source: "dreamdex", marketId: id, bucket, samples: [...samples].sort(([a], [b]) => a - b).map(([at, price]) => ({ at, price })) };
    });
    const entry = { expires: Infinity, value };
    charts.set(key, entry);
    value.then(() => { entry.expires = now() + 30_000; }, () => charts.delete(key));
    // The range and limit are bounded; also bound retained entries across all users.
    if (charts.size > 256) charts.delete(charts.keys().next().value!);
    return value;
  }

  return { prices, candles };
}
