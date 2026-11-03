import { describe, expect, it } from "bun:test";
import { MARKETS, orderLogs } from "@bump/testkit";
import { averagePrice, closePnlRaw, humanPrice, ownFills, rawPrice } from "../src/index.ts";

const pool = MARKETS.btc.poolAddress;
const alice = "0x00000000000000000000000000000000000a11ce";
const bob = "0x0000000000000000000000000000000000000b0b";
const usd = (n: number) => rawPrice(n, MARKETS.btc);

describe("ownFills", () => {
  it("sums one owner's fills across book levels into a volume-weighted price", () => {
    const logs = orderLogs({ pool, owner: alice, orderId: 7n, isBid: true, fills: [{ quantity: 100_000n, price: usd(68_000) }, { quantity: 47_000n, price: usd(68_010) }] });
    const f = ownFills(logs, pool, alice.toUpperCase().replace("0X", "0x"));
    expect(f).toMatchObject({ isBid: true, quantity: 147_000n });
    // (100k × 68,000 + 47k × 68,010) / 147k = 68,003.197…
    expect(humanPrice(averagePrice(f!), MARKETS.btc)).toBeCloseTo(68_003.197, 3);
  });

  it("ignores other owners, other pools and unrelated logs", () => {
    const logs = [
      ...orderLogs({ pool, owner: bob, orderId: 1n, isBid: false, fills: [{ quantity: 5_000n, price: usd(68_000) }] }),
      ...orderLogs({ pool: MARKETS.eth.poolAddress, owner: alice, orderId: 2n, isBid: true, fills: [{ quantity: 5_000n, price: usd(3_000) }] }),
      { address: pool, topics: ["0x" + "ab".repeat(32)] as `0x${string}`[], data: "0x" as const },
    ];
    expect(ownFills(logs, pool, alice)).toBeNull();
    expect(ownFills(logs, pool, bob)).toMatchObject({ isBid: false, quantity: 5_000n });
  });
});

describe("closePnlRaw", () => {
  it("is price PnL in raw quote units for either side", () => {
    // 0.00147 BTC, +$680 move = +$0.9996
    expect(humanPrice(closePnlRaw("long", usd(68_000), usd(68_680), 147_000n, 8), MARKETS.btc)).toBeCloseTo(0.9996, 6);
    expect(humanPrice(closePnlRaw("short", usd(68_000), usd(68_680), 147_000n, 8), MARKETS.btc)).toBeCloseTo(-0.9996, 6);
  });
});
