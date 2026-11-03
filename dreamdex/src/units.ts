import { fromHuman, toHuman } from "@somnia-chain/markets-sdk";
import type { PerpGrid } from "./config.ts";

/**
 * Perp prices are raw quote (collateral) units per whole base, at `quoteDecimals`; quantities are raw base units at
 * `baseDecimals`. Both vary per market (6 to 24 decimals), so every conversion takes the market row.
 */

type Scales = Pick<PerpGrid, "baseDecimals" | "quoteDecimals">;

export const rawPrice = (human: number, m: Scales) => fromHuman(human, m.quoteDecimals);
export const humanPrice = (raw: bigint | string, m: Scales) => toHuman(raw, m.quoteDecimals);
export const rawQty = (human: number, m: Scales) => fromHuman(human, m.baseDecimals);
export const humanQty = (raw: bigint | string, m: Scales) => toHuman(raw, m.baseDecimals);
export const rawUsd = (human: number, m: Scales) => fromHuman(human, m.quoteDecimals);

/** Largest multiple of `step` at or below `raw` (both non-negative). */
export const floorTo = (raw: bigint, step: bigint) => (step > 0n ? (raw / step) * step : raw);

/** Smallest multiple of `step` at or above `raw` (both non-negative). */
export const ceilTo = (raw: bigint, step: bigint) => (step > 0n ? ((raw + step - 1n) / step) * step : raw);

/** Base quantity worth `notionalRaw` collateral at `priceRaw`, floored to the lot grid. Exact: no floats. */
export function qtyForNotional(notionalRaw: bigint, priceRaw: bigint, m: PerpGrid): bigint {
  if (priceRaw <= 0n) return 0n;
  return floorTo((notionalRaw * 10n ** BigInt(m.baseDecimals)) / priceRaw, BigInt(m.lotSize));
}
