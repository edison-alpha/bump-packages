import { orderBookEventsAbi } from "@somnia-chain/markets-sdk";
import { encodeAbiParameters, encodeEventTopics, type AbiEvent, type Address, type Hex } from "viem";

export type ReceiptLog = { address: Address; topics: Hex[]; data: Hex };

function encode(pool: Address, name: "OrderPlaced" | "OrderFilled", args: Record<string, unknown>): ReceiptLog {
  const event = orderBookEventsAbi.find((e) => e.type === "event" && e.name === name) as AbiEvent;
  const topics = encodeEventTopics({ abi: [event], eventName: name, args } as never) as Hex[];
  const unindexed = event.inputs.filter((i) => !i.indexed);
  const data = encodeAbiParameters(unindexed, unindexed.map((i) => args[i.name as string]) as never);
  return { address: pool, topics, data };
}

/**
 * Receipt logs of one order by `owner` on `pool`, taking liquidity at each `fills` level: one OrderPlaced, then one
 * OrderFilled per level against made-up maker orders. Raw quantities and prices.
 */
export function orderLogs(o: { pool: Address; owner: Address; orderId: bigint; isBid: boolean; fills: { quantity: bigint; price: bigint }[] }): ReceiptLog[] {
  const full = o.fills.reduce((s, f) => s + f.quantity, 0n);
  const placed = encode(o.pool, "OrderPlaced", {
    orderId: o.orderId,
    placedOrder: { orderId: o.orderId, isBid: o.isBid, owner: o.owner, userData: 0n, price: o.fills[0]?.price ?? 0n, fullQuantity: full, quantityRemaining: full, expireTimestampNs: 0n },
  });
  let remaining = full;
  const filled = o.fills.map((f, i) => {
    remaining -= f.quantity;
    return encode(o.pool, "OrderFilled", { takerOrderId: o.orderId, makerOrderId: 1_000_000n + BigInt(i), quantityFilled: f.quantity, takerRemainingQuantity: remaining, makerRemainingQuantity: 0n, fillPrice: f.price });
  });
  return [placed, ...filled];
}
