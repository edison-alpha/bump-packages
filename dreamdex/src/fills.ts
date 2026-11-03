import { orderBookEventsAbi } from "@somnia-chain/markets-sdk";
import { decodeEventLog, type Hex } from "viem";
import type { Side } from "@bump/shared";

type Log = { address: string; topics: readonly Hex[]; data: Hex };

/** One owner's fills in one transaction on one pool, as raw sums. */
export type OwnFills = {
  isBid: boolean;
  /** Base filled, raw. */
  quantity: bigint;
  /** Σ quantity × price, raw quote × raw base. Divide by `quantity` for the average price. */
  quoteVolume: bigint;
};

/**
 * What `owner` traded on `pool` in a transaction, read from its receipt logs. The pool's OrderPlaced names the order's
 * owner; OrderFilled links fills to the taker order. This covers the owner's own order and an order the stop registry
 * placed for them, and proves the fill belongs to them whoever sent the transaction. Null when they filled nothing.
 */
export function ownFills(logs: readonly Log[], pool: string, owner: string): OwnFills | null {
  const ours = new Map<bigint, boolean>();
  const fills: { taker: bigint; quantity: bigint; price: bigint }[] = [];
  for (const log of logs) {
    if (log.address.toLowerCase() !== pool.toLowerCase() || log.topics.length === 0) continue;
    let event;
    try {
      event = decodeEventLog({ abi: orderBookEventsAbi, topics: log.topics as [Hex, ...Hex[]], data: log.data });
    } catch {
      continue;
    }
    if (event.eventName === "OrderPlaced") {
      const placed = (event.args as { placedOrder: { orderId: bigint; isBid: boolean; owner: string } }).placedOrder;
      if (placed.owner.toLowerCase() === owner.toLowerCase()) ours.set(placed.orderId, placed.isBid);
    } else if (event.eventName === "OrderFilled") {
      const a = event.args as { takerOrderId: bigint; quantityFilled: bigint; fillPrice: bigint };
      fills.push({ taker: a.takerOrderId, quantity: a.quantityFilled, price: a.fillPrice });
    }
  }
  let result: OwnFills | null = null;
  for (const f of fills) {
    const isBid = ours.get(f.taker);
    if (isBid === undefined || f.quantity === 0n) continue;
    result ??= { isBid, quantity: 0n, quoteVolume: 0n };
    // one transaction places one order per owner and pool, so the side never mixes
    if (result.isBid !== isBid) continue;
    result.quantity += f.quantity;
    result.quoteVolume += f.quantity * f.price;
  }
  return result;
}

/** Volume-weighted fill price, raw quote per whole base. */
export const averagePrice = (f: OwnFills) => f.quoteVolume / f.quantity;

/** Price PnL of closing `quantity` opened at `entryRaw` and closed at `exitRaw`, raw quote units (truncated). */
export function closePnlRaw(side: Side, entryRaw: bigint, exitRaw: bigint, quantity: bigint, baseDecimals: number): bigint {
  const move = side === "long" ? exitRaw - entryRaw : entryRaw - exitRaw;
  return (move * quantity) / 10n ** BigInt(baseDecimals);
}
