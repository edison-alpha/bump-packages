import { ORDER_TYPE, type PlacePerpOrderParams, type PlacePerpStopOrderParams, type PerpStopOrderLeg } from "@somnia-chain/markets-sdk";
import type { Draft, Side } from "@bump/shared";
import type { PerpGrid } from "./config.ts";
import { OrderError } from "./errors.ts";
import { ceilTo, floorTo, qtyForNotional, rawPrice, rawUsd } from "./units.ts";

/** How far past the mark a market order may fill. It also bounds the margin the pool locks. */
export const DEFAULT_SLIPPAGE_BPS = 50;

export type OrderPlan = Required<Pick<PlacePerpOrderParams, "pool" | "isBid" | "price" | "quantity" | "orderType">>;

export type StopPlan = Required<Pick<PlacePerpStopOrderParams, "registry" | "pool" | "pair">> & PerpStopOrderLeg;

/** The most leverage the market's initial margin allows: 500 bps is 20x. Vouchers can be capped lower (getPerpLeverage). */
export const maxLeverageX = (m: Pick<PerpGrid, "initialMarginBps">) => Math.floor(10_000 / m.initialMarginBps);

/** `raw` moved by `pct` percent (negative moves down), in integer math so 0.52 × 0.995 is exactly 0.5174. */
const movedBy = (raw: bigint, pct: number) => (raw * (1_000_000n + BigInt(Math.round(pct * 10_000)))) / 1_000_000n;

/**
 * A crossing limit price for an immediate-or-cancel order: the mark moved `slippageBps` against the taker, aligned
 * outward to the tick so the bound is never tighter than asked.
 */
function crossingPrice(mark: number, isBid: boolean, slippageBps: number, m: PerpGrid): bigint {
  if (!(mark > 0)) throw new OrderError("bad-price", "No price yet, try again");
  const raw = movedBy(rawPrice(mark, m), ((isBid ? 1 : -1) * slippageBps) / 100);
  const tick = BigInt(m.tickSize);
  const aligned = isBid ? ceilTo(raw, tick) : floorTo(raw, tick);
  if (aligned <= 0n) throw new OrderError("bad-price", "No price yet, try again");
  return aligned;
}

/**
 * The opening order for a draft. dreamDEX has no leverage parameter on orders: the size is stake × leverage at the
 * mark, floored to the lot grid, and the pool locks margin for it from the MarginBank.
 */
export function draftToOrder(draft: Pick<Draft, "side" | "margin" | "leverage">, m: PerpGrid, mark: number, slippageBps = DEFAULT_SLIPPAGE_BPS): OrderPlan {
  if (draft.leverage > maxLeverageX(m)) throw new OrderError("leverage", `Max ${maxLeverageX(m)}x here`);
  const isBid = draft.side === "long";
  const price = crossingPrice(mark, isBid, slippageBps, m);
  const quantity = qtyForNotional(rawUsd(draft.margin * draft.leverage, m), rawPrice(mark, m), m);
  if (quantity < BigInt(m.minQuantity)) throw new OrderError("too-small", "Stake too small here");
  return { pool: m.poolAddress, isBid, price, quantity, orderType: ORDER_TYPE.MARKET };
}

/**
 * A closing order for `percent` of an open position (`sizeRaw` signed: negative is short). It trades the opposite side,
 * so it nets against the position instead of opening a new one. 100% closes everything the lot grid allows; a
 * remainder below one lot stays open.
 */
export function closeToOrder(position: { side: Side; sizeRaw: bigint }, percent: number, m: PerpGrid, mark: number, slippageBps = DEFAULT_SLIPPAGE_BPS): OrderPlan {
  const size = position.sizeRaw < 0n ? -position.sizeRaw : position.sizeRaw;
  const share = percent >= 100 ? size : (size * BigInt(Math.round(percent * 100))) / 10_000n;
  const quantity = floorTo(share, BigInt(m.lotSize));
  if (quantity === 0n || quantity < BigInt(m.minQuantity)) {
    throw new OrderError("close-too-small", percent >= 100 ? "Position too small to close" : "Close more of it");
  }
  const isBid = position.side === "short";
  return { pool: m.poolAddress, isBid, price: crossingPrice(mark, isBid, slippageBps, m), quantity, orderType: ORDER_TYPE.MARKET };
}

/**
 * Take-profit and stop-loss as one linked pair (one transaction, one-cancels-other). Both legs are reduce-only market
 * stops sized 0 = "the whole position when it fires". Each trigger is aligned toward the entry, so it fires a hair
 * early rather than late; a tick so coarse that a trigger lands on the entry is refused.
 */
export function limitsToStops(side: Side, entry: number, targetPct: number, stopPct: number, m: PerpGrid): StopPlan {
  if (!m.stopRegistry) throw new OrderError("no-stops", "TP/SL not offered here");
  const long = side === "long";
  const tick = BigInt(m.tickSize);
  const entryRaw = rawPrice(entry, m);
  const up = (pct: number) => floorTo(movedBy(entryRaw, pct), tick);
  const down = (pct: number) => ceilTo(movedBy(entryRaw, -pct), tick);
  const target = long ? up(targetPct) : down(targetPct);
  const stop = long ? down(stopPct) : up(stopPct);
  if (long ? !(target > entryRaw && stop < entryRaw && stop > 0n) : !(target < entryRaw && target > 0n && stop > entryRaw)) {
    throw new OrderError("stops-too-tight", "TP/SL too close to price");
  }
  // GTE = 0 fires at or above the trigger, LTE = 1 at or below. The pair must use opposite operators.
  const leg = (triggerPrice: bigint, above: boolean): PerpStopOrderLeg => ({ isBid: !long, quantity: 0n, triggerPrice, triggerOperator: above ? 0 : 1, stopOrderType: 1 });
  return { registry: m.stopRegistry, pool: m.poolAddress, ...leg(target, long), pair: leg(stop, !long) };
}
